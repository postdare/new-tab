import { createClient } from 'webdav';

const LOCK_KEY = 'syncLock';
const LOCK_TTL_MS = 60 * 1000;
const GIST_RETRY = 3;
const GIST_RETRY_BASE_MS = 300;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function blobToArrayBuffer(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

function gistHeaders(token) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

function basename(path) {
  return String(path || '').split('/').pop();
}

async function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result || {}));
  });
}

async function storageSet(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, () => resolve());
  });
}

async function storageRemove(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, () => resolve());
  });
}

async function acquireLock(holder, op) {
  const now = Date.now();
  const { [LOCK_KEY]: lock } = await storageGet([LOCK_KEY]);
  if (lock && lock.expiresAt > now && lock.holder !== holder) {
    return { ok: false, reason: 'busy', lock };
  }
  const next = {
    holder,
    op: op || 'sync',
    since: now,
    expiresAt: now + LOCK_TTL_MS,
  };
  await storageSet({ [LOCK_KEY]: next });
  // 写后回读，降低并发抢锁时双写成功的概率
  const { [LOCK_KEY]: after } = await storageGet([LOCK_KEY]);
  if (!after || after.holder !== holder) {
    return { ok: false, reason: 'busy', lock: after };
  }
  return { ok: true, lock: after };
}

async function releaseLock(holder) {
  const { [LOCK_KEY]: lock } = await storageGet([LOCK_KEY]);
  if (!lock || lock.holder === holder) {
    await storageRemove([LOCK_KEY]);
  }
  return { ok: true };
}

async function touchLock(holder) {
  const now = Date.now();
  const { [LOCK_KEY]: lock } = await storageGet([LOCK_KEY]);
  if (!lock || lock.holder !== holder) return { ok: false };
  await storageSet({
    [LOCK_KEY]: {
      ...lock,
      expiresAt: now + LOCK_TTL_MS,
    },
  });
  return { ok: true };
}

async function gistFetch(url, options, retries = GIST_RETRY) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, options);
    if (res.status !== 409 || i === retries - 1) {
      return res;
    }
    lastError = res;
    await sleep(GIST_RETRY_BASE_MS * Math.pow(2, i));
  }
  return lastError;
}

async function gistReadFile({ token, gistId, path }) {
  if (!gistId) throw new Error('404 No Gist ID configured');
  const filename = basename(path);
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: gistHeaders(token),
  });
  if (!res.ok) throw new Error(`${res.status} Failed to read gist`);
  const data = await res.json();
  const file = data.files?.[filename];
  if (!file) throw new Error('404 File not found in gist');
  if (file.truncated) {
    const rawRes = await fetch(file.raw_url, {
      headers: { Authorization: `token ${token}` },
    });
    if (!rawRes.ok) throw new Error(`${rawRes.status} Failed to read gist raw`);
    return rawRes.text();
  }
  return file.content;
}

async function gistWriteFiles({ token, gistId, files }) {
  if (!gistId) throw new Error('未配置 Gist ID，请先完成 GitHub Gist 设置流程');
  const bodyFiles = {};
  for (const [path, content] of Object.entries(files)) {
    const filename = basename(path);
    if (content === null) {
      bodyFiles[filename] = null;
    } else {
      bodyFiles[filename] = { content: String(content) };
    }
  }
  const res = await gistFetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: gistHeaders(token),
    body: JSON.stringify({ files: bodyFiles }),
  });
  if (!res.ok) throw new Error(`写入 Gist 失败: ${res.status}`);
  return res.json();
}

async function gistDeleteFile({ token, gistId, path }) {
  if (!gistId || !path) return;
  const filename = basename(path);
  if (!filename) return;
  const res = await gistFetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: gistHeaders(token),
    body: JSON.stringify({ files: { [filename]: null } }),
  });
  if (!res.ok && res.status !== 404) {
    console.warn(`[GitHubGist] deleteFile failed: ${res.status} ${filename}`);
  }
}

function createWebDavClient(config) {
  return createClient(config.webDavURL, {
    username: config.webDavUsername,
    password: config.webDavPassword,
  });
}

async function webdavReadFile(config, path) {
  const client = createWebDavClient(config);
  return client.getFileContents(path, { format: 'text' });
}

async function webdavWriteFile(config, path, content) {
  const client = createWebDavClient(config);
  const blob = new Blob([content], { type: 'text/plain' });
  const buffer = await blobToArrayBuffer(blob);
  return client.putFileContents(path, buffer, { overwrite: true });
}

async function webdavWriteFiles(config, files) {
  for (const [path, content] of Object.entries(files)) {
    if (content === null) {
      await createWebDavClient(config).deleteFile(path).catch(() => {});
    } else {
      await webdavWriteFile(config, path, content);
    }
  }
}

async function webdavDeleteFile(config, path) {
  const client = createWebDavClient(config);
  return client.deleteFile(path).catch(() => {});
}

let writeChain = Promise.resolve();

function enqueueWrite(task) {
  const run = writeChain.then(task, task);
  writeChain = run.catch(() => {});
  return run;
}

export async function handleSyncMessage(request, sender) {
  const type = request?.type;
  const data = request?.data || {};
  const holder = data.holder || `tab-${sender?.tab?.id || 'unknown'}`;

  switch (type) {
    case 'SYNC_ACQUIRE_LOCK': {
      return acquireLock(holder, data.op);
    }
    case 'SYNC_RELEASE_LOCK': {
      return releaseLock(holder);
    }
    case 'SYNC_TOUCH_LOCK': {
      return touchLock(holder);
    }
    case 'SYNC_READ_FILE': {
      const { config, path } = data;
      await touchLock(holder);
      if (config?.syncType === 'github_gist') {
        const content = await gistReadFile({
          token: config.githubToken,
          gistId: config.githubGistId,
          path,
        });
        return { ok: true, content };
      }
      const content = await webdavReadFile(config, path);
      return { ok: true, content };
    }
    case 'SYNC_WRITE_FILE': {
      return enqueueWrite(async () => {
        const { config, path, content } = data;
        await touchLock(holder);
        if (config?.syncType === 'github_gist') {
          await gistWriteFiles({
            token: config.githubToken,
            gistId: config.githubGistId,
            files: { [path]: content },
          });
        } else {
          await webdavWriteFile(config, path, content);
        }
        return { ok: true };
      });
    }
    case 'SYNC_WRITE_FILES': {
      return enqueueWrite(async () => {
        const { config, files } = data;
        await touchLock(holder);
        if (config?.syncType === 'github_gist') {
          await gistWriteFiles({
            token: config.githubToken,
            gistId: config.githubGistId,
            files,
          });
        } else {
          await webdavWriteFiles(config, files);
        }
        return { ok: true };
      });
    }
    case 'SYNC_DELETE_FILE': {
      return enqueueWrite(async () => {
        const { config, path } = data;
        await touchLock(holder);
        if (config?.syncType === 'github_gist') {
          await gistDeleteFile({
            token: config.githubToken,
            gistId: config.githubGistId,
            path,
          });
        } else {
          await webdavDeleteFile(config, path);
        }
        return { ok: true };
      });
    }
    default:
      return null;
  }
}
