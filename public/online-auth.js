const BUILD = '20260914.2';
const MIGRATION_MARKER = 'qu-server-sync-migrated-20260914-v2';
export const MANAGED_KEYS = new Set([
  'ai-ceo-preset-channels', 'ai-ceo-custom-channels', 'ai-ceo-risk-register',
  'ai-ceo-monthly-metrics', 'ai-ceo-calendar-events', 'ai-ceo-calendar-reminders-sent',
  'ai-ceo-os:business-operations:v1', 'ai-ceo-workspace-platform'
]);

const APP_SCRIPTS = [
  'app.js', 'business-operations.js', 'workspace-platform.js',
  'workspace-router.js', 'executive-os-v3.js', 'date-picker-only.js'
];

function safeJSON(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizedState(input) {
  const result = {};
  if (!input || typeof input !== 'object') return result;
  for (const [key, value] of Object.entries(input)) {
    if (MANAGED_KEYS.has(key) && typeof value === 'string') result[key] = value;
  }
  return result;
}

function itemIdentity(item, fallback) {
  if (item && item.id !== undefined && item.id !== null && String(item.id)) return `id:${item.id}`;
  return fallback(item);
}

function mergeArrayValues(localValue, remoteValue, identity) {
  const local = safeJSON(localValue, []);
  const remote = safeJSON(remoteValue, []);
  const merged = new Map();
  if (Array.isArray(remote)) remote.forEach((item) => merged.set(itemIdentity(item, identity), item));
  if (Array.isArray(local)) local.forEach((item) => {
    const key = itemIdentity(item, identity);
    if (!merged.has(key)) merged.set(key, item);
  });
  return JSON.stringify([...merged.values()]);
}

function calendarSignature(item) {
  return ['event', item?.date, item?.time, item?.title, item?.business].map((value) => String(value ?? '').trim()).join('|');
}

function legacyScheduleToEvent(schedule) {
  const date = String(schedule?.scheduleDate ?? '');
  const time = String(schedule?.startTime ?? '09:00');
  return {
    id: `server-schedule-${schedule.id}`,
    date,
    endDate: date,
    time,
    title: String(schedule?.title ?? '').trim(),
    business: String(schedule?.business ?? '老板总控'),
    duration: schedule?.endTime ? `${time}–${schedule.endTime}` : '',
    repeat: ['daily', 'weekly'].includes(schedule?.repeatRule) ? schedule.repeatRule : 'none',
    reminder: Number.isFinite(Number(schedule?.reminderMinutes)) ? String(schedule.reminderMinutes) : 'none',
    note: String(schedule?.description ?? ''),
    completedDates: schedule?.status === 'done' ? [date] : []
  };
}

function mergeCalendarValues(localValue, remoteValue, legacySchedules = []) {
  const remote = safeJSON(remoteValue, []);
  const local = safeJSON(localValue, []);
  const output = [];
  const ids = new Set();
  const signatures = new Set();

  const add = (item) => {
    if (!item || typeof item !== 'object' || !item.date || !item.title) return;
    const id = item.id === undefined || item.id === null ? '' : String(item.id);
    const signature = calendarSignature(item);
    if ((id && ids.has(id)) || signatures.has(signature)) return;
    output.push({ ...item, endDate: item.endDate && item.endDate >= item.date ? item.endDate : item.date });
    if (id) ids.add(id);
    signatures.add(signature);
  };

  if (Array.isArray(remote)) remote.forEach(add);
  if (Array.isArray(local)) local.forEach(add);
  if (Array.isArray(legacySchedules)) legacySchedules.map(legacyScheduleToEvent).forEach(add);
  return JSON.stringify(output);
}

function mergePresetChannels(localValue, remoteValue) {
  const local = safeJSON(localValue, {});
  const remote = safeJSON(remoteValue, {});
  return JSON.stringify({
    ...(local && typeof local === 'object' && !Array.isArray(local) ? local : {}),
    ...(remote && typeof remote === 'object' && !Array.isArray(remote) ? remote : {})
  });
}

function mergeBusinessOperations(localValue, remoteValue) {
  const local = safeJSON(localValue, {});
  const remote = safeJSON(remoteValue, {});
  if (!local || typeof local !== 'object') return remoteValue;
  if (!remote || typeof remote !== 'object') return localValue;
  const businesses = {};
  const ids = new Set([...Object.keys(local.businesses || {}), ...Object.keys(remote.businesses || {})]);
  ids.forEach((id) => {
    const localBusiness = local.businesses?.[id] || {};
    const remoteBusiness = remote.businesses?.[id] || {};
    const localDate = String(localBusiness.updatedAt || '');
    const remoteDate = String(remoteBusiness.updatedAt || '');
    const newer = localDate > remoteDate ? localBusiness : remoteBusiness;
    const older = newer === localBusiness ? remoteBusiness : localBusiness;
    const records = new Map();
    [...(older.records || []), ...(newer.records || [])].forEach((item, index) => {
      records.set(itemIdentity(item, (value) => `record:${value?.date || ''}:${value?.title || ''}:${index}`), item);
    });
    businesses[id] = {
      ...older,
      ...newer,
      metrics: { ...(older.metrics || {}), ...(newer.metrics || {}) },
      records: [...records.values()]
    };
  });
  return JSON.stringify({ ...local, ...remote, businesses });
}

function mergePlatform(localValue, remoteValue) {
  const local = safeJSON(localValue, {});
  const remote = safeJSON(remoteValue, {});
  const history = mergeArrayValues(
    JSON.stringify(local?.reportHistory || []),
    JSON.stringify(remote?.reportHistory || []),
    (item) => `report:${item?.id || item?.generatedAt || item?.date || JSON.stringify(item)}`
  );
  return JSON.stringify({
    ...(local && typeof local === 'object' ? local : {}),
    ...(remote && typeof remote === 'object' ? remote : {}),
    reportHistory: safeJSON(history, [])
  });
}

export function mergeInitialState(localInput, remoteInput, legacySchedules = []) {
  const local = normalizedState(localInput);
  const remote = normalizedState(remoteInput);
  const merged = { ...local, ...remote };

  if (local['ai-ceo-calendar-events'] !== undefined || remote['ai-ceo-calendar-events'] !== undefined || legacySchedules.length) {
    merged['ai-ceo-calendar-events'] = mergeCalendarValues(local['ai-ceo-calendar-events'], remote['ai-ceo-calendar-events'], legacySchedules);
  }
  if (local['ai-ceo-custom-channels'] !== undefined || remote['ai-ceo-custom-channels'] !== undefined) {
    merged['ai-ceo-custom-channels'] = mergeArrayValues(local['ai-ceo-custom-channels'], remote['ai-ceo-custom-channels'], (item) => `channel:${item?.business || ''}:${item?.name || ''}`);
  }
  if (local['ai-ceo-risk-register'] !== undefined || remote['ai-ceo-risk-register'] !== undefined) {
    merged['ai-ceo-risk-register'] = mergeArrayValues(local['ai-ceo-risk-register'], remote['ai-ceo-risk-register'], (item) => `risk:${item?.business || ''}:${item?.title || ''}`);
  }
  if (local['ai-ceo-monthly-metrics'] !== undefined || remote['ai-ceo-monthly-metrics'] !== undefined) {
    merged['ai-ceo-monthly-metrics'] = mergeArrayValues(local['ai-ceo-monthly-metrics'], remote['ai-ceo-monthly-metrics'], (item) => `month:${item?.month || ''}`);
  }
  if (local['ai-ceo-calendar-reminders-sent'] !== undefined || remote['ai-ceo-calendar-reminders-sent'] !== undefined) {
    merged['ai-ceo-calendar-reminders-sent'] = mergeArrayValues(local['ai-ceo-calendar-reminders-sent'], remote['ai-ceo-calendar-reminders-sent'], (item) => `reminder:${item}`);
  }
  if (local['ai-ceo-preset-channels'] !== undefined || remote['ai-ceo-preset-channels'] !== undefined) {
    merged['ai-ceo-preset-channels'] = mergePresetChannels(local['ai-ceo-preset-channels'], remote['ai-ceo-preset-channels']);
  }
  if (local['ai-ceo-os:business-operations:v1'] !== undefined && remote['ai-ceo-os:business-operations:v1'] !== undefined) {
    merged['ai-ceo-os:business-operations:v1'] = mergeBusinessOperations(local['ai-ceo-os:business-operations:v1'], remote['ai-ceo-os:business-operations:v1']);
  }
  if (local['ai-ceo-workspace-platform'] !== undefined && remote['ai-ceo-workspace-platform'] !== undefined) {
    merged['ai-ceo-workspace-platform'] = mergePlatform(local['ai-ceo-workspace-platform'], remote['ai-ceo-workspace-platform']);
  }
  return merged;
}

if (typeof document !== 'undefined') {
  const auth = document.getElementById('onlineAuth');
  const form = document.getElementById('onlineAuthForm');
  const username = document.getElementById('onlineUsername');
  const password = document.getElementById('onlinePassword');
  const submit = document.getElementById('onlineAuthSubmit');
  const message = document.getElementById('onlineAuthMessage');
  let setupRequired = false;
  let syncTimer = null;
  let syncing = false;
  let applyingRemote = false;
  let lastServerUpdatedAt = '';
  let lastSnapshot = '';

  function setMessage(text = '', isError = true) {
    if (!message) return;
    message.textContent = text;
    message.style.color = isError ? '#ff8075' : '#62d8ad';
  }

  function setSyncState(text, state = '') {
    const node = document.getElementById('onlineSyncState');
    if (node) {
      node.textContent = text;
      node.className = `online-sync-state ${state}`.trim();
    }
    const top = document.querySelector('.os-sync');
    if (top) top.lastChild.textContent = ` ${text}`;
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      cache: 'no-store', credentials: 'same-origin', ...options,
      headers: { 'content-type': 'application/json', ...(options.headers || {}) }
    });
    let body = {};
    try { body = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(body.error || `请求失败（${response.status}）`);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  function snapshot() {
    const state = {};
    MANAGED_KEYS.forEach((key) => {
      const value = localStorage.getItem(key);
      if (value !== null) state[key] = value;
    });
    return state;
  }

  function fingerprint(state) {
    const ordered = {};
    Object.keys(state).sort().forEach((key) => { ordered[key] = state[key]; });
    return JSON.stringify(ordered);
  }

  function applyState(state, removeMissing = false) {
    applyingRemote = true;
    try {
      MANAGED_KEYS.forEach((key) => {
        if (typeof state?.[key] === 'string') localStorage.setItem(key, state[key]);
        else if (removeMissing) localStorage.removeItem(key);
      });
    } finally { applyingRemote = false; }
  }

  async function fetchLegacySchedules() {
    try {
      const result = await api('/api/schedules?from=2000-01-01&to=2100-12-31');
      return Array.isArray(result.schedules) ? result.schedules : [];
    } catch { return []; }
  }

  async function saveServerState(state, baseUpdatedAt = lastServerUpdatedAt) {
    return api('/api/workspace-state', {
      method: 'PUT',
      body: JSON.stringify({ state, baseUpdatedAt })
    });
  }

  async function pushState(force = false) {
    if (syncing) return;
    const state = snapshot();
    const current = fingerprint(state);
    if (!force && current === lastSnapshot) return;
    syncing = true;
    setSyncState('正在同步…', 'syncing');
    try {
      const result = await saveServerState(state);
      lastSnapshot = current;
      lastServerUpdatedAt = result.updatedAt || lastServerUpdatedAt;
      setSyncState('已同步至服务器');
    } catch (error) {
      if (error.status === 409) {
        const latest = await api('/api/workspace-state');
        const reconciled = mergeInitialState(state, latest.state || {}, []);
        applyState(reconciled);
        const saved = await saveServerState(reconciled, latest.updatedAt || '');
        lastSnapshot = fingerprint(reconciled);
        lastServerUpdatedAt = saved.updatedAt || latest.updatedAt || '';
        setSyncState('冲突已合并并同步');
      } else {
        setSyncState(error.status === 401 ? '登录已过期' : '离线保存，等待同步', 'error');
      }
    } finally { syncing = false; }
  }

  function queueSync() {
    if (applyingRemote) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => pushState(), 450);
  }

  function installSyncBridge() {
    const originalSet = Storage.prototype.setItem;
    const originalRemove = Storage.prototype.removeItem;
    const originalClear = Storage.prototype.clear;
    Storage.prototype.setItem = function setItem(key, value) {
      originalSet.call(this, key, value);
      if (this === localStorage && MANAGED_KEYS.has(String(key))) queueSync();
    };
    Storage.prototype.removeItem = function removeItem(key) {
      originalRemove.call(this, key);
      if (this === localStorage && MANAGED_KEYS.has(String(key))) queueSync();
    };
    Storage.prototype.clear = function clear() {
      originalClear.call(this);
      if (this === localStorage) queueSync();
    };
    window.addEventListener('beforeunload', () => {
      const state = snapshot();
      if (fingerprint(state) === lastSnapshot) return;
      fetch('/api/workspace-state', {
        method: 'PUT', credentials: 'same-origin', keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state, baseUpdatedAt: lastServerUpdatedAt })
      }).catch(() => {});
    });
  }

  async function pullLatest() {
    if (document.hidden || syncing || document.querySelector('.modal.show') || document.activeElement?.matches('input,textarea,select')) return;
    try {
      const result = await api('/api/workspace-state');
      const remote = result.state || {};
      const remotePrint = fingerprint(remote);
      if (result.updatedAt && result.updatedAt !== lastServerUpdatedAt && remotePrint !== lastSnapshot) {
        applyState(remote, true);
        lastServerUpdatedAt = result.updatedAt;
        lastSnapshot = remotePrint;
        setSyncState('已接收另一设备更新');
        location.reload();
      } else {
        setSyncState('已同步至服务器');
      }
    } catch (error) {
      setSyncState(error.status === 401 ? '登录已过期' : '离线，稍后自动重试', 'error');
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${src}?v=${encodeURIComponent(BUILD)}`;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`无法加载 ${src}`));
      document.body.appendChild(script);
    });
  }

  async function initializeState() {
    const local = snapshot();
    let remoteResult = await api('/api/workspace-state');
    if (!localStorage.getItem(MIGRATION_MARKER)) {
      const legacySchedules = await fetchLegacySchedules();
      let merged = mergeInitialState(local, remoteResult.state || {}, legacySchedules);
      applyState(merged);
      try {
        const saved = await saveServerState(merged, remoteResult.updatedAt || '');
        lastServerUpdatedAt = saved.updatedAt || '';
      } catch (error) {
        if (error.status !== 409) throw error;
        remoteResult = await api('/api/workspace-state');
        merged = mergeInitialState(local, remoteResult.state || {}, legacySchedules);
        applyState(merged);
        const saved = await saveServerState(merged, remoteResult.updatedAt || '');
        lastServerUpdatedAt = saved.updatedAt || '';
      }
      localStorage.setItem(MIGRATION_MARKER, '1');
      lastSnapshot = fingerprint(merged);
      return;
    }
    applyState(remoteResult.state || {}, true);
    lastServerUpdatedAt = remoteResult.updatedAt || '';
    lastSnapshot = fingerprint(snapshot());
  }

  async function enterWorkspace() {
    setMessage('正在连接并合并您的经营数据…', false);
    await initializeState();
    installSyncBridge();
    auth.hidden = true;
    document.body.classList.remove('online-locked');
    for (const script of APP_SCRIPTS) await loadScript(script);
    await pushState();
    setSyncState('已同步至服务器');
    document.getElementById('onlineLogout')?.addEventListener('click', logout);
    window.addEventListener('focus', () => setTimeout(pullLatest, 300));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pullLatest(); });
    setInterval(pullLatest, 5000);
  }

  async function logout() {
    await pushState();
    try { await api('/api/logout', { method: 'POST', body: '{}' }); } catch {}
    location.reload();
  }

  async function start() {
    try {
      const status = await api('/api/status');
      setupRequired = Boolean(status.setupRequired);
      if (status.authenticated) return enterWorkspace();
      submit.textContent = setupRequired ? '创建老板账号并进入' : '登录工作台';
      password.autocomplete = setupRequired ? 'new-password' : 'current-password';
      setMessage('');
      password.focus();
    } catch {
      setMessage('暂时无法连接服务器，请稍后刷新页面。');
      submit.disabled = true;
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    setMessage(setupRequired ? '正在创建老板账号…' : '正在安全登录…', false);
    try {
      await api(setupRequired ? '/api/setup' : '/api/login', {
        method: 'POST', body: JSON.stringify({ username: username.value.trim(), password: password.value })
      });
      await enterWorkspace();
    } catch (error) {
      setMessage(error.message || '登录失败，请检查账号和密码。');
      password.select();
    } finally { submit.disabled = false; }
  });

  start();
}
