import http from "node:http";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createPasswordHash, createSessionToken, verifyPassword } from "./auth.mjs";
import { WorkbenchStore } from "./store.mjs";

const sessionCookie = "workbench_session";

export function createWorkbenchServer({ store, dataDir = fileURLToPath(new URL("../data", import.meta.url)) }) {
  mkdirSync(dataDir, { recursive: true });
  return http.createServer(async (request, response) => {
    try {
      await route(request, response, store, dataDir);
    } catch (error) {
      console.error(error);
      json(response, 500, { error: "服务器处理失败" });
    }
  });
}

async function route(request, response, store, dataDir) {
  const url = new URL(request.url, "http://localhost");
  if (request.method === "GET" && url.pathname === "/api/status") {
    return json(response, 200, { setupRequired: !store.ownerExists(), authenticated: Boolean(currentUser(request, store)) });
  }
  if (request.method === "POST" && url.pathname === "/api/setup") {
    if (store.ownerExists()) return json(response, 409, { error: "老板账号已创建" });
    const body = await readJson(request);
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    if (!username || password.length < 8) return json(response, 400, { error: "用户名不能为空，密码至少8位" });
    const owner = await store.createOwner(username, await createPasswordHash(password));
    return establishSession(response, store, owner, 201);
  }
  if (request.method === "POST" && url.pathname === "/api/login") {
    const body = await readJson(request);
    const user = store.findUserByUsername(String(body.username ?? "").trim());
    if (!user || !(await verifyPassword(String(body.password ?? ""), user.passwordHash))) {
      return json(response, 401, { error: "账号或密码不正确" });
    }
    return establishSession(response, store, user, 200);
  }
  if (request.method === "POST" && url.pathname === "/api/logout") {
    store.deleteSession(readCookie(request, sessionCookie));
    response.setHeader("set-cookie", `${sessionCookie}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
    return json(response, 200, { ok: true });
  }

  const user = currentUser(request, store);
  if (url.pathname.startsWith("/api/") && !user) return json(response, 401, { error: "请先登录" });
  if (request.method === "GET" && url.pathname === "/api/workspace-state") {
    return json(response, 200, readWorkspaceState(dataDir, user.id));
  }
  if (request.method === "PUT" && url.pathname === "/api/workspace-state") {
    const body = await readJson(request);
    const current = readWorkspaceState(dataDir, user.id);
    if (body.baseUpdatedAt !== undefined && current.updatedAt && String(body.baseUpdatedAt) !== current.updatedAt) {
      return json(response, 409, { error: "另一设备已有较新的数据，请先合并", updatedAt: current.updatedAt });
    }
    const state = validateWorkspaceState(body.state);
    const saved = writeWorkspaceState(dataDir, user.id, state);
    return json(response, 200, saved);
  }
  if (request.method === "GET" && url.pathname === "/api/records") {
    return json(response, 200, { records: store.listRecords(user.id, url.searchParams.get("type")) });
  }
  if (request.method === "POST" && url.pathname === "/api/records") {
    const record = store.createRecord(user.id, await readJson(request));
    return json(response, 201, { record });
  }
  const match = url.pathname.match(/^\/api\/records\/(\d+)$/);
  if (match && request.method === "PATCH") {
    const record = store.updateRecord(user.id, Number(match[1]), await readJson(request));
    return record ? json(response, 200, { record }) : json(response, 404, { error: "记录不存在" });
  }
  if (match && request.method === "DELETE") {
    return store.deleteRecord(user.id, Number(match[1])) ? json(response, 200, { ok: true }) : json(response, 404, { error: "记录不存在" });
  }
  if (request.method === "GET" && url.pathname === "/api/schedules") {
    return json(response, 200, { schedules: store.listSchedules(user.id, url.searchParams.get("from"), url.searchParams.get("to")) });
  }
  if (request.method === "POST" && url.pathname === "/api/schedules") {
    return json(response, 201, { schedule: store.createSchedule(user.id, await readJson(request)) });
  }
  const scheduleMatch = url.pathname.match(/^\/api\/schedules\/(\d+)$/);
  if (scheduleMatch && request.method === "PATCH") {
    const schedule = store.updateSchedule(user.id, Number(scheduleMatch[1]), await readJson(request));
    return schedule ? json(response, 200, { schedule }) : json(response, 404, { error: "日程不存在" });
  }
  if (scheduleMatch && request.method === "DELETE") {
    return store.deleteSchedule(user.id, Number(scheduleMatch[1])) ? json(response, 200, { ok: true }) : json(response, 404, { error: "日程不存在" });
  }
  if (request.method === "GET" && staticFiles[url.pathname]) {
    const headers = { "content-type": staticFiles[url.pathname].type, "cache-control": url.pathname === "/" ? "no-store" : "private, max-age=3600" };
    if (staticFiles[url.pathname].disposition) headers["content-disposition"] = staticFiles[url.pathname].disposition;
    response.writeHead(200, headers);
    response.end(readFileSync(new URL(staticFiles[url.pathname].file, import.meta.url)));
    return;
  }
  if (request.method === "GET" && servePublicFile(url.pathname, response)) return;
  return json(response, 404, { error: "页面不存在" });
}

const staticFiles = {
  "/": { file: "../public/index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "../public/app.js", type: "text/javascript; charset=utf-8" },
  "/styles.css": { file: "../public/styles.css", type: "text/css; charset=utf-8" },
  "/ai-ceo-os-logo.svg": { file: "../public/assets/ai-ceo-os-logo.svg", type: "image/svg+xml" },
};

const managedWorkspaceKeys = new Set([
  "ai-ceo-preset-channels", "ai-ceo-custom-channels", "ai-ceo-risk-register",
  "ai-ceo-monthly-metrics", "ai-ceo-calendar-events", "ai-ceo-calendar-reminders-sent",
  "ai-ceo-os:business-operations:v1", "ai-ceo-workspace-platform"
]);

function workspaceStateFile(dataDir, userId) {
  return resolve(dataDir, `workspace-state-${Number(userId)}.json`);
}

function readWorkspaceState(dataDir, userId) {
  const file = workspaceStateFile(dataDir, userId);
  if (!existsSync(file)) return { state: {}, updatedAt: "" };
  try {
    const saved = JSON.parse(readFileSync(file, "utf8"));
    return { state: validateWorkspaceState(saved.state), updatedAt: String(saved.updatedAt || "") };
  } catch (error) {
    console.error("Unable to read workspace state", error);
    return { state: {}, updatedAt: "" };
  }
}

function validateWorkspaceState(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const state = {};
  let total = 0;
  for (const [key, value] of Object.entries(input)) {
    if (!managedWorkspaceKeys.has(key) || typeof value !== "string") continue;
    total += Buffer.byteLength(key) + Buffer.byteLength(value);
    if (total > 900_000) throw new Error("workspace state too large");
    state[key] = value;
  }
  return state;
}

function writeWorkspaceState(dataDir, userId, state) {
  const file = workspaceStateFile(dataDir, userId);
  const temporary = `${file}.tmp`;
  const updatedAt = new Date().toISOString();
  writeFileSync(temporary, JSON.stringify({ state, updatedAt }), { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, file);
  return { ok: true, updatedAt };
}

const publicDir = resolve(fileURLToPath(new URL("../public/", import.meta.url)));
const mimeTypes = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".webp": "image/webp", ".json": "application/json; charset=utf-8"
};

function servePublicFile(pathname, response) {
  let relativePath;
  try { relativePath = decodeURIComponent(pathname).replace(/^\/+/, ""); }
  catch { return false; }
  if (!relativePath || relativePath.includes("\0")) return false;
  const file = resolve(publicDir, relativePath);
  if (file !== publicDir && !file.startsWith(`${publicDir}${sep}`)) return false;
  if (!existsSync(file) || !statSync(file).isFile()) return false;
  const type = mimeTypes[extname(file).toLowerCase()] || "application/octet-stream";
  const noCache = relativePath === "service-worker.js";
  response.writeHead(200, {
    "content-type": type,
    "cache-control": noCache ? "no-store" : "private, max-age=300",
    "x-content-type-options": "nosniff"
  });
  response.end(readFileSync(file));
  return true;
}

function establishSession(response, store, user, status) {
  const token = createSessionToken();
  const { maxAgeSeconds } = store.createSession(user.id, token);
  response.setHeader("set-cookie", `${sessionCookie}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}`);
  return json(response, status, { user: { id: user.id, username: user.username, role: user.role } });
}

function currentUser(request, store) {
  return store.findUserBySession(readCookie(request, sessionCookie));
}

function readCookie(request, name) {
  const cookies = String(request.headers.cookie ?? "").split(";");
  for (const cookie of cookies) {
    const [key, ...value] = cookie.trim().split("=");
    if (key === name) return value.join("=");
  }
  return "";
}

async function readJson(request) {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 1_000_000) throw new Error("request too large");
  }
  return text ? JSON.parse(text) : {};
}

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dataDir = process.env.WORKBENCH_DATA_DIR || fileURLToPath(new URL("../data", import.meta.url));
  mkdirSync(dataDir, { recursive: true });
  const store = new WorkbenchStore(`${dataDir}/workbench.sqlite`);
  const port = Number(process.env.PORT || 3000);
  createWorkbenchServer({ store, dataDir }).listen(port, "127.0.0.1", () => console.log(`Workbench listening on ${port}`));
}
