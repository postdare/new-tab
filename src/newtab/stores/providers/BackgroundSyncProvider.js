import { browserApi, getLastError } from "@/utils/browser";

function sendMessage(type, data) {
  return new Promise((resolve, reject) => {
    if (!browserApi?.runtime?.sendMessage) {
      reject(new Error('浏览器扩展 runtime 不可用'));
      return;
    }
    browserApi.runtime.sendMessage({ type, data }, (response) => {
      const err = getLastError();
      if (err) {
        reject(new Error(err.message || String(err)));
        return;
      }
      if (response?.ok === false && response?.error) {
        reject(new Error(response.error));
        return;
      }
      resolve(response);
    });
  });
}

async function blobToText(blob) {
  if (blob instanceof Blob) return blob.text();
  return String(blob ?? '');
}

export default class BackgroundSyncProvider {
  constructor(config) {
    this.config = config || {};
    this.holder = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  _cfg() {
    return this.config;
  }

  async acquireLock(op = 'sync') {
    const res = await sendMessage('SYNC_ACQUIRE_LOCK', {
      holder: this.holder,
      op,
    });
    if (!res?.ok) {
      throw new Error(res?.reason === 'busy' ? 'SYNC_BUSY' : '获取同步锁失败');
    }
    return res;
  }

  async releaseLock() {
    try {
      await sendMessage('SYNC_RELEASE_LOCK', { holder: this.holder });
    } catch (_) {
      // ignore
    }
  }

  async touchLock() {
    try {
      return await sendMessage('SYNC_TOUCH_LOCK', { holder: this.holder });
    } catch (_) {
      return { ok: false };
    }
  }

  async readFile(path) {
    const res = await sendMessage('SYNC_READ_FILE', {
      holder: this.holder,
      config: this._cfg(),
      path,
    });
    return res?.content;
  }

  async writeFile(path, blob) {
    const content = await blobToText(blob);
    return sendMessage('SYNC_WRITE_FILE', {
      holder: this.holder,
      config: this._cfg(),
      path,
      content,
    });
  }

  async writeFiles(files) {
    const payload = {};
    for (const [path, value] of Object.entries(files)) {
      if (value === null) {
        payload[path] = null;
      } else {
        payload[path] = await blobToText(value);
      }
    }
    return sendMessage('SYNC_WRITE_FILES', {
      holder: this.holder,
      config: this._cfg(),
      files: payload,
    });
  }

  async deleteFile(path) {
    return sendMessage('SYNC_DELETE_FILE', {
      holder: this.holder,
      config: this._cfg(),
      path,
    });
  }
}
