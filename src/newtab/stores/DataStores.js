import {
  observable,
  action,
  makeObservable,
} from "mobx";
import { db } from "~/db";
import Storage from "~/utils/storage";
import { handleError } from "~/utils/errorHandler";
import _ from "lodash";
import BackgroundSyncProvider from "./providers/BackgroundSyncProvider";
import {
  SYNC_JSON_NAME,
  SYNC_VERSION_NAME,
  SYNC_INIT_NAME,
  LOCK_HEARTBEAT_MS,
  PUSH_BUSY_RETRY_BASE_MS,
  PUSH_BUSY_RETRY_MAX_MS,
  GIST_SEED_BUSY_RETRY_LIMIT,
  PULL_MIN_INTERVAL_MS,
  PUSH_STALE_CHECK_MS,
  LOCAL_RESTORE_KEYS,
  isEphemeralExtensionMessageError,
} from "./sync/constants";
import PushQueue from "./sync/PushQueue";
import {
  exportSnapshot,
  parseSnapshot,
  importSnapshot,
  restoreBackup,
} from "./sync/snapshot";
import { testGithubGist } from "./sync/gistApi";

/**
 * 同步门面：负责 provider 构造、跨标签锁、拉取/推送编排。
 * 队列与重试见 sync/PushQueue，数据快照的导出/导入/回滚见 sync/snapshot。
 */
export default class DataStores {
  provider = null;
  dir = '';
  lock = false;
  waitType = '';
  cache = {};
  _heartbeatTimer = null;
  _lastPullAt = 0;
  _visibilityHandler = null;

  constructor(rootStore) {
    makeObservable(this, {
      waitType: observable,
      test: action,
      init: action,
      pull: action,
      push: action,
      readFile: action,
      writeFile: action,
      get_dbData: action,
      update: action,
    });
    this.rootStore = rootStore;
    this._pushQueue = new PushQueue({
      push: () => this.push(),
      isLocked: () => this.lock,
      hasProvider: () => !!this.provider,
    });
  }

  /** 同步失败提示：通道类误报只打日志，其它仍 toast */
  _reportSyncError = (label, error) => {
    if (isEphemeralExtensionMessageError(error)) {
      console.warn(`[sync] ${label}（已抑制 tips）:`, error?.message || error);
      return;
    }
    const detail = error?.message || String(error || '未知错误');
    this.rootStore.tools.error(`${label}: ${detail}`);
  };

  _buildSyncConfig = (overrides = {}) => {
    const item = this.rootStore.option.item;
    const syncType = overrides.syncType || item.syncType || 'webdav';
    if (syncType === 'github_gist') {
      return {
        syncType: 'github_gist',
        githubToken: overrides.githubToken ?? item.githubToken ?? '',
        githubGistId: overrides.githubGistId ?? item.githubGistId ?? '',
      };
    }
    return {
      syncType: 'webdav',
      webDavURL: overrides.webDavURL ?? item.webDavURL ?? '',
      webDavUsername: overrides.webDavUsername ?? item.webDavUsername ?? '',
      webDavPassword: overrides.webDavPassword ?? item.webDavPassword ?? '',
    };
  }

  _startLockHeartbeat = () => {
    this._stopLockHeartbeat();
    if (!this.provider?.touchLock) return;
    this._heartbeatTimer = setInterval(() => {
      this.provider.touchLock().catch(() => {});
    }, LOCK_HEARTBEAT_MS);
  }

  _stopLockHeartbeat = () => {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  /**
   * 保存 GitHub Gist 配置后立即完成首轮远端写入。
   * 不再依赖页面刷新后的隐式 init，确保“设置成功”代表数据已经落到 Gist。
   */
  seedGithubGist = async (token, gistId) => {
    const githubToken = String(token || '').trim();
    const githubGistId = String(gistId || '').trim();
    if (!githubToken || !githubGistId) {
      throw new Error('GitHub Token 或 Gist ID 为空');
    }

    const seedProvider = new BackgroundSyncProvider({
      syncType: 'github_gist',
      githubToken,
      githubGistId,
    });

    for (let attempt = 0; attempt <= GIST_SEED_BUSY_RETRY_LIMIT; attempt += 1) {
      try {
        await seedProvider.acquireLock('push');
      } catch (error) {
        if (error?.message !== 'SYNC_BUSY') throw error;
        if (attempt === GIST_SEED_BUSY_RETRY_LIMIT) {
          throw new Error('其它 NewTab 页面正在同步，请稍后重试');
        }
        const delayMs = Math.min(
          PUSH_BUSY_RETRY_MAX_MS,
          PUSH_BUSY_RETRY_BASE_MS * Math.pow(2, attempt)
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      try {
        await this._pushBody(seedProvider, '');
        return;
      } finally {
        await seedProvider.releaseLock();
      }
    }
  }

  /**
   * 获取跨 tab 同步锁 + 本地 lock。
   * @returns {Promise<'ok'|'busy'|'error'>}
   */
  _beginSync = async (op) => {
    if (this.lock) {
      console.log('同步操作进行中，跳过本次', op);
      return 'busy';
    }
    if (!this.provider) return 'error';

    try {
      await this.provider.acquireLock(op);
    } catch (error) {
      if (error.message === 'SYNC_BUSY') {
        console.log('其他标签页正在同步，跳过本次', op);
        return 'busy';
      }
      this._reportSyncError('同步异常', error);
      return 'error';
    }

    this.lock = true;
    this.waitType = op;
    this._startLockHeartbeat();
    return 'ok';
  }

  _endSync = async () => {
    this._stopLockHeartbeat();
    this.lock = false;
    this.waitType = '';
    if (this.provider) {
      await this.provider.releaseLock();
    }
  }

  // WebDAV 连接测试（供 webDAV.jsx 调用）
  test = async (url, username, password, dir) => {
    this.provider = new BackgroundSyncProvider({
      syncType: 'webdav',
      webDavURL: url,
      webDavUsername: username,
      webDavPassword: password,
    });
    this.dir = dir;

    const blob = new Blob(['1'], { type: 'text/plain' });

    try {
      await this.writeFile(dir + SYNC_INIT_NAME, blob);
    } catch (error) {
      handleError(error, "DataStores.test");
      this.provider = null;
      throw error;
    }

    this.provider.deleteFile(dir + SYNC_INIT_NAME);
    try {
      const data = await this.readFile(dir + SYNC_VERSION_NAME);
      return data ? 1 : 0;
    } catch (_) {
      return 0;
    }
  }

  // GitHub Gist 连接测试（供 githubGist.jsx 调用）
  testGithubGist = (token, gistId) => {
    return testGithubGist(token, gistId);
  }

  init = () => {
    const { option } = this.rootStore;
    const syncType = option.item.syncType || 'webdav';
    const { webdavTime = 3 } = option.item;

    if (syncType === 'github_gist') {
      const { githubToken = '' } = option.item;
      if (!githubToken) return;

      if (!this.provider) {
        this.dir = '';
        this._update = _.debounce(
          () => this._pushQueue.drain(),
          1000 * webdavTime
        );
        this.provider = new BackgroundSyncProvider(this._buildSyncConfig({ syncType: 'github_gist' }));
      }
    } else {
      const {
        webDavURL = '',
        webDavUsername = '',
        webDavPassword = '',
        webDavDir = '',
      } = option.item;

      if (!webDavURL || !webDavUsername || !webDavPassword || !webDavDir) return;

      if (!this.provider) {
        this.dir = webDavDir;
        this._update = _.debounce(
          () => this._pushQueue.drain(),
          1000 * webdavTime
        );
        this.provider = new BackgroundSyncProvider(this._buildSyncConfig({ syncType: 'webdav' }));
      }
    }

    this._registerAutoPull();

    this.pull().finally(() => {
      if (this._pushQueue.hasPending()) this._update();
    });
  }

  /**
   * 页面重新可见时自动拉取远端更新（原来只在页面加载时拉取一次，
   * 长开的标签页永远看不到其它设备的改动）。
   */
  _registerAutoPull = () => {
    if (this._visibilityHandler || typeof document === 'undefined') return;
    this._visibilityHandler = () => {
      if (document.visibilityState !== 'visible') return;
      this._pullIfStale();
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);
  }

  _pullIfStale = () => {
    if (!this.provider || this.lock) return;
    // 本地还有未推送的变更时不拉取，避免远端数据覆盖掉本地新改动
    if (this._pushQueue.hasPending()) return;
    if (Date.now() - this._lastPullAt < PULL_MIN_INTERVAL_MS) return;
    this.pull();
  }

  /**
   * 推送前校验：本地基线可能已过期（距上次拉取太久）时，读一次远端版本号。
   * 若远端已追平/超过本地，说明其它设备推送过——把本地版本号抬到远端之上，
   * 确保本次推送产生一个新版本号，其它设备能感知并拉取（避免同号推送被静默忽略）。
   */
  _guardRemoteAhead = async () => {
    if (Date.now() - this._lastPullAt < PUSH_STALE_CHECK_MS) return;

    let remoteRaw;
    try {
      remoteRaw = await this.readFile(this.dir + SYNC_VERSION_NAME);
    } catch (_) {
      // 远端无版本文件（首推）或读取失败：按原流程推送
      return;
    }

    const remote = parseInt(remoteRaw);
    const local = parseInt(this.rootStore.option.item.webdavVersion);
    if (isNaN(remote) || isNaN(local) || remote < local) return;

    const bumped = remote + 1;
    console.warn('[sync] 远端版本已领先/追平本地，推送前抬升版本号:', { remote, local, bumped });
    await this.rootStore.option.setItem('webdavVersion', bumped);
  }

  pull = async () => {
    const started = await this._beginSync('pull');
    if (started !== 'ok') return;

    this._lastPullAt = Date.now();
    const { webdavVersion = 1 } = this.rootStore.option.item;

    try {
      let data;
      try {
        data = await this.readFile(this.dir + SYNC_VERSION_NAME);
      } catch (error) {
        if (error.message && error.message.includes('404')) {
          await this._pushBody();
          return;
        }
        throw error;
      }

      if (!data || data.trim() === '') {
        await this._pushBody();
        return;
      }

      let yunNyum = parseInt(data);
      let num = parseInt(webdavVersion);

      if (isNaN(yunNyum)) {
        const match = String(data).match(/\d+/);
        if (match) {
          yunNyum = parseInt(match[0]);
          console.warn('远端版本号格式异常，已自动修复:', data, '->', yunNyum);
        }
      }

      if (isNaN(num)) {
        const match = String(webdavVersion).match(/\d+/);
        if (match) {
          num = parseInt(match[0]);
          console.warn('本地版本号格式异常，已自动修复:', webdavVersion, '->', num);
        }
      }

      if (isNaN(yunNyum) || isNaN(num)) {
        this.rootStore.tools.error(`同步拉取异常: 版本号格式错误 (远端: ${data}, 本地: ${webdavVersion})`);
        return;
      }

      if (yunNyum === num) {
        return;
      }

      if (yunNyum < num) {
        this.waitType = 'push';
        await this._pushBody();
        return;
      }

      this.waitType = 'pull';
      await this._pullBody(yunNyum);
    } catch (error) {
      this._reportSyncError('同步拉取异常', error);
    } finally {
      await this._endSync();
    }
  }

  /**
   * 已持有锁的前提下执行远端数据拉取与本地导入。
   */
  _pullBody = async (webdavVersion) => {
    let versionNum = parseInt(webdavVersion);
    if (isNaN(versionNum)) {
      const match = String(webdavVersion).match(/\d+/);
      if (match) {
        versionNum = parseInt(match[0]);
        console.warn('版本号格式异常，已自动修复:', webdavVersion, '->', versionNum);
      } else {
        throw new Error(`webdavVersion 不是有效数字: ${webdavVersion}`);
      }
    }
    webdavVersion = versionNum;

    const { option, link } = this.rootStore;

    let backupBlob = null;
    try {
      backupBlob = await this.get_dbData();
    } catch (error) {
      console.error('备份数据失败:', error);
    }

    try {
      this.cache = {};
      LOCAL_RESTORE_KEYS.forEach((key) => {
        const value = option.item[key];
        if (value) {
          this.cache[key] = value;
        }
      });

      // 自定义背景图片存储在 cache 表，而同步快照会跳过 cache。
      // importSnapshot 会清空本地数据库，因此先暂存 Blob，导入后恢复。
      const localBackgroundBlobs = {};
      for (const key of ["bgBase64", "bg2Base64"]) {
        const blob = await Storage.getBlob(`${key}_blob`).catch(() => null);
        if (blob) {
          localBackgroundBlobs[key] = blob;
        }
      }

      const data = await this.readFile(this.dir + SYNC_JSON_NAME);

      if (!data || data.trim() === '') {
        throw new Error('远端数据文件为空');
      }

      const blob = new Blob([data], { type: 'application/json' });
      const text = await blob.text();
      const { databaseVersion } = parseSnapshot(text);

      await importSnapshot(blob);

      // 快照不包含 cache，因此恢复本地自定义背景图片。
      for (const [key, imageBlob] of Object.entries(localBackgroundBlobs)) {
        await Storage.setBlob(`${key}_blob`, imageBlob);
      }

      // 必须等本地保留项写回 db 后再执行 resetChromeSaveOption，避免它读到导入前的旧值
      await option.setItem('webdavVersion', parseInt(webdavVersion));
      for (const key of LOCAL_RESTORE_KEYS) {
        const value = this.cache[key];
        if (value === undefined) continue;
        await option.setItem(key, value);
      }

      try {
        await option.resetChromeSaveOption();
      } catch (error) {
        console.error(error);
        this._reportSyncError('同步数据错误', error);
      }

      link.restart();

      if (db.verno !== databaseVersion) {
        db.__upgrade(db);
      }
    } catch (error) {
      handleError(error, "DataStores._pullBody");

      if (isEphemeralExtensionMessageError(error)) {
        console.warn('[sync] 拉取过程通道中断（已抑制 tips）:', error?.message || error);
        return;
      }

      if (backupBlob && backupBlob.size > 0) {
        try {
          console.log('尝试恢复备份数据...');
          await restoreBackup(backupBlob);
          console.log('备份数据恢复成功');
          this._reportSyncError('同步失败，已恢复本地数据', error);
        } catch (restoreError) {
          handleError(restoreError, "DataStores._pullBody.restoreBackup");
          try {
            if (!db.isOpen()) {
              await db.open();
            }
          } catch (openError) {
            handleError(openError, "DataStores._pullBody.reopenDb");
          }
          if (!isEphemeralExtensionMessageError(restoreError)) {
            this.rootStore.tools.error(
              `同步失败且无法恢复数据: ${error.message}。恢复备份失败: ${restoreError.message}。请手动重新加载页面。`
            );
          }
        }
      } else {
        this._reportSyncError('同步拉取失败', error);
      }
    }
  };

  /**
   * 已持有锁的前提下推送本地数据到远端。
   */
  _pushBody = async (provider = this.provider, dir = this.dir) => {
    const { webdavVersion } = this.rootStore.option.item;

    const blob = await this.get_dbData();
    if (!blob || blob.size === 0) {
      throw new Error('导出的数据为空，无法推送');
    }

    let num = parseInt(webdavVersion);
    if (isNaN(num)) {
      const match = String(webdavVersion).match(/\d+/);
      if (match) {
        num = parseInt(match[0]);
        console.warn('版本号格式异常，已自动修复:', webdavVersion, '->', num);
      } else {
        num = new Date().getTime();
        console.warn('版本号无法修复，使用时间戳:', num);
      }
      this.rootStore.option.setItem('webdavVersion', num);
    }

    const dataText = await blob.text();
    await provider.writeFiles({
      [dir + SYNC_JSON_NAME]: dataText,
      [dir + SYNC_VERSION_NAME]: num.toString(),
    });

    console.log('数据推送成功，版本号:', num);
  }

  push = async () => {
    const started = await this._beginSync('push');
    if (started !== 'ok') return started;

    let result = 'ok';
    try {
      await this._guardRemoteAhead();
      await this._pushBody();
    } catch (error) {
      console.error('写入数据文件失败:', error);
      this._reportSyncError('同步数据错误', error);
      result = 'error';
    } finally {
      await this._endSync();
    }
    return result;
  }

  deleteServeData = () => {
    const { option } = this.rootStore;
    const syncType = option.item.syncType || 'webdav';

    if (syncType === 'github_gist') {
      option.setItem('githubToken', '');
      option.setItem('githubGistId', '');
    } else {
      option.setItem('webDavURL', '');
      option.setItem('webDavUsername', '');
      option.setItem('webDavPassword', '');
      option.setItem('webDavDir', '');
    }

    this._stopLockHeartbeat();
    this._pushQueue.reset();
    this._update.cancel?.();
    this.provider = null;
    this.lock = false;
    this.waitType = '';
    this._update = () => {};
  }

  _update = () => {}

  update = () => {
    const {
      webDavURL,
      githubToken,
      syncType,
      webdavVersion = 0,
    } = this.rootStore.option.item;

    const isSyncEnabled = syncType === 'github_gist' ? !!githubToken : !!webDavURL;

    if (!isSyncEnabled) {
      return;
    }

    this._pushQueue.markDirty();

    const currentVersion = parseInt(webdavVersion);
    if (isNaN(currentVersion)) {
      console.error('当前版本号无效，重置为时间戳:', webdavVersion);
      this.rootStore.option.setItem('webdavVersion', new Date().getTime());
      if (this.provider) this._update();
      return;
    }

    const newVersion = currentVersion + 1;
    if (isNaN(newVersion) || newVersion <= currentVersion) {
      console.error('版本号计算错误，使用时间戳:', currentVersion, newVersion);
      this.rootStore.option.setItem('webdavVersion', new Date().getTime());
    } else {
      this.rootStore.option.setItem('webdavVersion', newVersion);
    }
    if (this.provider) this._update();
  }

  get_dbData = () => {
    return exportSnapshot();
  }

  readFile = (filePath) => {
    return this.provider.readFile(filePath);
  };

  writeFile = async (filePath, blob) => {
    try {
      return await this.provider.writeFile(filePath, blob);
    } catch (error) {
      handleError(error, "DataStores.writeFile");
      throw error;
    }
  };
}
