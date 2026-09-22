import test from "node:test";
import assert from "node:assert/strict";
import { createPasswordHash, createSessionToken, verifyPassword } from "../src/auth.mjs";

test("password hashes verify only the original password", async () => {
  const encoded = await createPasswordHash("correct-horse-battery-staple");
  assert.equal(await verifyPassword("correct-horse-battery-staple", encoded), true);
  assert.equal(await verifyPassword("wrong-password", encoded), false);
  assert.equal(encoded.includes("correct-horse-battery-staple"), false);
});

test("short passwords are rejected", async () => {
  await assert.rejects(() => createPasswordHash("short"), /at least 8/);
});

test("session tokens are random and non-trivial", () => {
  const first = createSessionToken();
  const second = createSessionToken();
  assert.notEqual(first, second);
  assert.ok(first.length >= 40);
});

