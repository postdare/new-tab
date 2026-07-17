import {
  observable,
  action,
  makeObservable,
} from "mobx";
import { db, DB_NAME } from "~/db";
import { handleError } from "~/utils/errorHandler";
import _ from "lodash";
import BackgroundSyncProvider from "./providers/BackgroundSyncProvider";

const SYNC_JSON_NAME = '/newtab-data.json';
const SYNC_VERSION_NAME = '/newtab-version.txt';
const SYNC_INIT_NAME = '/newtab-init.txt';
const SYNC_README_NAME = 'newtab-readme.txt';
const SYNC_VERSION_BASENAME = 'newtab-version.txt';

/** 本地锁心跳间隔：需小于 background LOCK_TTL_MS（60s） */
const LOCK_HEARTBEAT_MS = 20 * 1000;

const localStorageKeys = ['bgType', 'bg2Type', 'bgBase64', 'bg2Base64', 'webdavVersion', 'githubToken', 'githubGistId'];

const progressCallback = () => {}

export default class DataStores {
  provider = null;
  dir = '';
  lock = false;
  waitType = '';
  cache = {};
  _heartbeatTimer = null;

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
  }

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
      this.rootStore.tools.error(`同步异常: ${error.message || '未知错误'}`);
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
  test = (url, username, password, dir) => {
    this.provider = new BackgroundSyncProvider({
      syncType: 'webdav',
      webDavURL: url,
      webDavUsername: username,
      webDavPassword: password,
    });
    this.dir = dir;

    const blob = new Blob(['1'], { type: 'text/plain' });

    return new Promise((resolve, reject) => {
      this.writeFile(dir + SYNC_INIT_NAME, blob).then(() => {
        this.provider.deleteFile(dir + SYNC_INIT_NAME);
        this.readFile(dir + SYNC_VERSION_NAME).then((data) => {
          resolve(data ? 1 : 0);
        }).catch(() => resolve(0));
      }).catch((error) => {
        handleError(error, "DataStores.test");
        this.provider = null;
        reject(error);
      });
    });
  }

  // GitHub Gist 连接测试（供 githubGist.jsx 调用）
  // 返回 { status: 0|1, gistId: string }
  testGithubGist = async (token, gistId) => {
    const headers = {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };

    if (gistId) {
      const res = await fetch(`https://api.github.com/gists/${gistId}`, { headers });
      if (!res.ok) throw new Error(`验证 Gist 失败: ${res.status} ${res.statusText}`);
      const data = await res.json();
      const hasData = data.files?.[SYNC_VERSION_BASENAME] ? 1 : 0;
      return { status: hasData, gistId };
    }

    // 无 gistId 时自动创建私密 Gist
    const res = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        description: 'NewTab 数据备份',
        public: false,
        files: {
          [SYNC_README_NAME]: {
            content: 'NewTab 同步数据，请勿手动修改此 Gist 中的文件。',
          },
        },
      }),
    });
    if (!res.ok) throw new Error(`创建 Gist 失败: ${res.status} ${res.statusText}`);
    const data = await res.json();
    return { status: 0, gistId: data.id };
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
        this._update = _.debounce(() => { this.push(); }, 1000 * webdavTime);
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
        this._update = _.debounce(() => { this.push(); }, 1000 * webdavTime);
        this.provider = new BackgroundSyncProvider(this._buildSyncConfig({ syncType: 'webdav' }));
      }
    }

    this.pull();
  }

  pull = async () => {
    const started = await this._beginSync('pull');
    if (started !== 'ok') return;

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
      this.rootStore.tools.error(`同步拉取异常: ${error.message || '未知错误'}`);
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

    const { option, link, note, tools } = this.rootStore;

    let backupBlob = null;
    try {
      backupBlob = await this.get_dbData();
    } catch (error) {
      console.error('备份数据失败:', error);
    }

    try {
      localStorageKeys.forEach((key) => {
        const value = option.item[key];
        if (value) {
          this.cache[key] = value;
        }
      });

      const data = await this.readFile(this.dir + SYNC_JSON_NAME);

      if (!data || data.trim() === '') {
        throw new Error('远端数据文件为空');
      }

      const blob = new Blob([data], { type: 'application/json' });
      const text = await blob.text();
      if (!text || text.trim() === '') {
        throw new Error('远端数据内容为空');
      }

      let json;
      try {
        json = JSON.parse(text);
      } catch (parseError) {
        throw new Error(`远端数据格式错误: ${parseError.message}`);
      }

      if (!json || !json.data) {
        throw new Error('远端数据格式不完整：缺少 data 字段');
      }

      if (json.data.databaseName && json.data.databaseName !== DB_NAME) {
        throw new Error(`数据库名称不匹配: 期望 ${DB_NAME}，实际 ${json.data.databaseName}`);
      }

      let databaseVersion = json.data.databaseVersion;
      if (!databaseVersion) {
        console.warn('远端数据缺少 databaseVersion 字段，使用默认版本 1.5');
        databaseVersion = 1.5;
      }

      if (json.data.tables) {
        const tableKeys = Object.keys(json.data.tables);
        if (tableKeys.length === 0) {
          throw new Error('远端数据表为空，拒绝导入以避免数据丢失');
        }
        const requiredTables = ['option', 'link', 'note'];
        const hasRequiredTable = requiredTables.some(table => tableKeys.includes(table));
        if (!hasRequiredTable) {
          console.warn('远端数据缺少基本表，但继续导入');
        }
      } else {
        console.warn('远端数据缺少 tables 字段，尝试继续导入');
      }

      await db.delete();

      if (!db.isOpen()) {
        await db.open();
      }

      await db.import(blob, {
        noTransaction: false,
        clearTables: true,
        acceptVersionDiff: true,
        progressCallback
      });

      const importedData = await this.get_dbData();
      if (!importedData || importedData.size === 0) {
        throw new Error('导入后数据验证失败：数据为空或大小为0');
      }

      try {
        const importedText = await importedData.text();
        const importedJson = JSON.parse(importedText);
        if (!importedJson.data) {
          throw new Error('导入后数据验证失败：缺少 data 字段');
        }
        if (importedJson.data.tables && Object.keys(importedJson.data.tables).length === 0) {
          throw new Error('导入后数据验证失败：数据表为空');
        }
        if (!importedJson.data.tables) {
          console.warn('导入的数据缺少 tables 字段，但数据已成功导入');
        }
      } catch (verifyError) {
        if (verifyError.message.includes('tables')) {
          console.warn('数据验证警告:', verifyError.message);
        } else {
          throw new Error(`导入后数据验证失败: ${verifyError.message}`);
        }
      }

      option.setItem('webdavVersion', parseInt(webdavVersion));
      localStorageKeys.forEach((key) => {
        if (key !== 'webdavVersion') {
          const value = this.cache[key];
          option.setItem(key, value);
        }
      });

      try {
        await option.resetChromeSaveOption();
      } catch (error) {
        console.error(error);
        tools.error(`同步数据错误: ${error.message}`);
      }

      link.restart();
      note.init();

      if (db.verno !== databaseVersion) {
        db.__upgrade(db);
      }
    } catch (error) {
      handleError(error, "DataStores._pullBody");

      if (backupBlob && backupBlob.size > 0) {
        try {
          console.log('尝试恢复备份数据...');
          if (db.isOpen()) {
            await db.close();
          }
          await db.delete();
          if (!db.isOpen()) {
            await db.open();
          }
          await db.import(backupBlob, {
            noTransaction: false,
            clearTables: true,
            acceptVersionDiff: true,
            progressCallback
          });

          const restoredData = await this.get_dbData();
          if (!restoredData || restoredData.size === 0) {
            throw new Error('恢复后的数据验证失败：数据为空');
          }

          console.log('备份数据恢复成功');
          tools.error(`同步失败，已恢复本地数据: ${error.message}`);
        } catch (restoreError) {
          handleError(restoreError, "DataStores._pullBody.restoreBackup");
          try {
            if (!db.isOpen()) {
              await db.open();
            }
          } catch (openError) {
            handleError(openError, "DataStores._pullBody.reopenDb");
          }
          tools.error(`同步失败且无法恢复数据: ${error.message}。恢复备份失败: ${restoreError.message}。请手动重新加载页面。`);
        }
      } else {
        tools.error(`同步拉取失败: ${error.message}。无法恢复数据，请检查远端数据是否正常。`);
      }
    }
  };

  /**
   * 已持有锁的前提下推送本地数据到远端。
   */
  _pushBody = async () => {
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
    await this.provider.writeFiles({
      [this.dir + SYNC_JSON_NAME]: dataText,
      [this.dir + SYNC_VERSION_NAME]: num.toString(),
    });

    console.log('数据推送成功，版本号:', num);
  }

  push = async () => {
    const started = await this._beginSync('push');
    if (started !== 'ok') return;

    try {
      await this._pushBody();
    } catch (error) {
      console.error('写入数据文件失败:', error);
      this.rootStore.tools.error(`同步数据错误: ${error.message}`);
    } finally {
      await this._endSync();
    }
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

    if (!isSyncEnabled || this.lock || !this.provider) {
      return;
    }

    const currentVersion = parseInt(webdavVersion);
    if (isNaN(currentVersion)) {
      console.error('当前版本号无效，重置为时间戳:', webdavVersion);
      const newVersion = new Date().getTime();
      this.rootStore.option.setItem('webdavVersion', newVersion);
      this.waitType = 'push';
      this._update();
      return;
    }

    this.waitType = 'push';

    const newVersion = currentVersion + 1;
    if (isNaN(newVersion) || newVersion <= currentVersion) {
      console.error('版本号计算错误，使用时间戳:', currentVersion, newVersion);
      this.rootStore.option.setItem('webdavVersion', new Date().getTime());
    } else {
      this.rootStore.option.setItem('webdavVersion', newVersion);
    }
    this._update();
  }

  get_dbData = () => {
    return new Promise((resolve, reject) => {
      try {
        db.export({
          prettyJson: true,
          progressCallback: () => {},
          skipTables: ['cache', 'favicon'],
          transform: (table, value, key) => {
            if (table === 'option') {
              switch (value.key) {
                case 'bgType':
                case 'bg2Type':
                  let type_value = _.cloneDeep(value);
                  if (type_value.value === 'file') {
                    type_value.value = value.key == 'bgType' ? 'bing' : '';
                  }
                  return { value: type_value, key };

                case 'bgBase64':
                case 'bg2Base64':
                case 'githubToken': {
                  let _value = _.cloneDeep(value);
                  _value.value = '';
                  return { value: _value, key };
                }
              }
            }
            return { value, key };
          }
        }).then(resolve).catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  readFile = (filePath) => {
    return new Promise(async (resolve, reject) => {
      try {
        const content = await this.provider.readFile(filePath);
        resolve(content);
      } catch (error) {
        reject(error);
      }
    });
  };

  writeFile = (filePath, blob) => {
    return new Promise(async (resolve, reject) => {
      try {
        const result = await this.provider.writeFile(filePath, blob);
        resolve(result);
      } catch (error) {
        handleError(error, "DataStores.writeFile");
        reject(error);
      }
    });
  };
}
