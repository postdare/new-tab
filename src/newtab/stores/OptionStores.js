import {
  observable,
  action,
  computed,
  makeObservable,
  autorun
} from "mobx";
import {
  db
} from "~/db";
import _ from "lodash";
import {
  getID
} from "~/utils";
import { SYNC_CONFIG_KEYS } from "./syncConfig";
import {
  loadSyncConfig,
  saveSyncConfigValue,
  migrateSyncConfigFromDb,
  clearSyncConfig,
} from "./syncConfigStorage";
import { browserApi, getLastError } from "@/utils/browser";

const localStorageKeys = ['bgType', 'bg2Type', 'bgBase64', 'bg2Base64', 'webdavVersion'];

/** runtime.sendMessage 的 Promise 封装（忽略无监听方等瞬时错误） */
function sendRuntimeMessage(type, data) {
  return new Promise((resolve) => {
    if (!browserApi?.runtime?.sendMessage) {
      resolve(undefined);
      return;
    }
    browserApi.runtime.sendMessage({ type, data }, (response) => {
      // 读取 lastError 避免 Unchecked runtime.lastError 噪音
      void getLastError();
      resolve(response);
    });
  });
}

const v = 19;
const updateOptions = {
  1: {
    errData: '9527'
  },
  2: {
    homeId: getID(),
    soList: ["Google", "Baidu", "Bing", "DuckDuckGo", 'Bilibili', "Yuanbao", "DeepSeek", "Doubao"],
    activeSo: "Google",
    translateList: ["Google", "Baidu"],
    activeTranslate: "Google",
    bgColor: "#fff",
    bgType: "bing",
    bgUrl: "",
    bgBase64: "",
    bg2Type: "null",
    bg2Url: "",
    bg2Base64: "",
    linkSpan: 4,
    copyClose: false,
    pwKey: ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowLeft', 'ArrowRight', 'ArrowRight', 'b', 'a', 'b', 'a'],
    defaultOpenAdd: false,
  },
  3: {
    soStyleIsRound: true,
  },
  4: {
    soAOpen: false
  },
  5: {
    homeNoteData: [],
  },
  6: {
    defauiltLink: false,
    isSoBarDown: false,
    homeLinkTimeKey: '',
    bgColor: '#e0c7b0',
  },
  7: {
    linkOpenSelf: true,
  },
  8: {
    customkey: []
  },
  9: {
    showLinkNav: false,
  },
  10: {
    systemTheme: 'auto',
    showHomeClock: false,
    homeLinkMaxNum: 14,
    rollingBack: false,
    soHdCenter: false,
    tabTitle: 'NewTab',
  },
  11: {
    webdavVersion: 1,
    webdavTime: 3,
  },
  12: {
    homeImgOpacity: 0.2,
  },
  13: {
    noteTab: [{
      key: `note_1`,
      id: 1,
      title: '便签',
    }],
    addMinNoteTabNum: 2,
    hasNoteTrash: false,
  },
  14: {
    bgImageFit: 'cover',
    bg2ImageFit: 'cover',
  },
  // 15 曾引入 homeGlassEffect，该配置已随 glass-card 功能移除
  15: {},
  16: {
    homeLinkTimeKeys: [],
  },
  17: {
    syncType: 'webdav',
    githubToken: '',
    githubGistId: '',
  },
  18: {
    showHomeGroupTitle: true,
  },
  19: {
    // 首屏分组相对布局锚点的坐标：{ [timeKey]: { left, top } }
    homeLinkPositions: {},
  },
}


export default class OptionStores {
  isInit = false;
  item = {};
  showHide = false;
  isResetOption = false;
  rootStore;

  constructor(rootStore) {
    makeObservable(this, {
      item: observable,
      isInit: observable,
      showHide: observable,
      isResetOption: observable,
      getItem: computed,
      setItem: action,
      update: action,
      init: action,
      resetChromeSaveOption: action,
      resetOption: action,
      getSystemTheme: action,
    });
    this.rootStore = rootStore;
  }

  async init() {
    if (!db.isOpen()) {
      await db.open();
    }
    try {
      // 同步凭据存于 chrome.storage.local：先迁移历史数据并清理 db 残留，再载入内存
      await migrateSyncConfigFromDb(db);
      Object.assign(this.item, await loadSyncConfig());
    } catch (error) {
      console.error('同步配置加载失败:', error);
    }
    setTimeout(() => {
      db.option
        .toArray()
        .then(async (res) => {

          if (res.length === 0) {
            // 检查 Chrome Storage Sync 是否有 WebDAV 配置，尝试恢复数据
            try {
              const syncData = await new Promise((resolve, reject) => {
                if (browserApi?.storage?.sync) {
                  browserApi.storage.sync.get(['webDavURL', 'webDavUsername', 'webDavPassword', 'webDavDir', 'syncType', 'githubToken', 'githubGistId'], (result) => {
                    const err = getLastError();
                    if (err) {
                      reject(err);
                    } else {
                      resolve(result);
                    }
                  });
                } else {
                  resolve({});
                }
              });

              // GitHub Gist 配置恢复
              if (syncData?.syncType === 'github_gist' && syncData?.githubToken && syncData?.githubGistId) {
                console.log('[GitHub Gist恢复] 检测到 Chrome Storage Sync 中有 GitHub Gist 配置，尝试恢复数据...');

                this.update(0);
                await new Promise(resolve => setTimeout(resolve, 300));

                await Promise.all([
                  this.setOption('syncType', 'github_gist'),
                  this.setOption('githubToken', syncData.githubToken),
                  this.setOption('githubGistId', syncData.githubGistId),
                ]);

                this.item.syncType = 'github_gist';
                this.item.githubToken = syncData.githubToken;
                this.item.githubGistId = syncData.githubGistId;

                await this.setOption('webdavVersion', syncData.webdavVersion || 1);
                this.item.webdavVersion = syncData.webdavVersion || 1;

                this.isInit = true;

                setTimeout(() => {
                  this.rootStore.data.init();
                  setTimeout(() => { this.rootStore.home.onLoadBg(); }, 1000);
                }, 500);

                return;
              }

              // WebDAV 配置恢复
              if (syncData?.webDavURL && syncData?.webDavUsername && syncData?.webDavPassword && syncData?.webDavDir) {
                console.log('[WebDAV恢复] 检测到 Chrome Storage Sync 中有 WebDAV 配置，尝试恢复数据...');

                this.update(0);
                await new Promise(resolve => setTimeout(resolve, 300));

                await this.setOption('webDavURL', syncData.webDavURL);
                this.item.webDavURL = syncData.webDavURL;

                await Promise.all([
                  this.setOption('webDavUsername', syncData.webDavUsername),
                  this.setOption('webDavPassword', syncData.webDavPassword),
                  this.setOption('webDavDir', syncData.webDavDir),
                ]);

                this.item.webDavUsername = syncData.webDavUsername;
                this.item.webDavPassword = syncData.webDavPassword;
                this.item.webDavDir = syncData.webDavDir;

                await this.setOption('webdavOpen', true);
                await this.setOption('webdavVersion', syncData.webdavVersion || 1);
                this.item.webdavOpen = true;
                this.item.webdavVersion = syncData.webdavVersion || 1;

                this.isInit = true;

                setTimeout(() => {
                  this.rootStore.data.init();
                  setTimeout(() => { this.rootStore.home.onLoadBg(); }, 1000);
                }, 500);

                return;
              }
            } catch (error) {
              console.error('[WebDAV恢复] 检查 Chrome Storage Sync 失败:', error);
              // 如果检查失败，继续走原有的新安装逻辑
            }
            
            // 没有 WebDAV 配置或检查失败，走原有的新安装逻辑
            this.update(0);
            setTimeout(() => {
              this.rootStore.home.onLoadBg();
            }, 1000);
            return;
          }


          res.forEach((item) => {
            this.item[item.key] = item.value;
          });


          this.isInit = true;

          // 注意：不再用 chrome.storage.sync 的值反向覆盖本地 db——
          // 它仅作为「本地无数据时」的一次性恢复源（见上方 res.length === 0 分支），
          // 常规启动以本地数据为唯一事实源，避免云端脏数据清空本地配置。
          if (this.item["v"] !== v) {
            this.update(this.item["v"] || 0);
          }
          this.rootStore.data.init();
        })
        .catch((err) => {
          if (err.name === "DatabaseClosedError") {
            window.location.reload();
          }
          console.error(err);
        });
    }, 0);
  }


  // 递归获取所有初始数据
  getNewOptionToValue(v, _option) {
    let newValue = v + 1;
    let option = {}
    if (updateOptions[newValue]) {
      option = {
        ..._option,
        ...updateOptions[newValue]
      }

      if (updateOptions[newValue + 1]) {
        return this.getNewOptionToValue(newValue, option);
      }
    }
    return option;
  }

  // 更新数据
  update(_v, home_id) {
    try {
      const defaultOption = this.getNewOptionToValue(_v, this.item);

      sendRuntimeMessage("getOption").then((response) => {

        for (const key in response) {
          const v = response[key];
          if (typeof defaultOption[key] !== 'undefined') {
            defaultOption[key] = v
          }
        }

        if (typeof home_id !== 'undefined') {
          defaultOption["homeId"] = home_id
        }

        Object.keys(defaultOption).forEach((key) => {

          if (typeof this.item[key] === "undefined" || home_id && key === 'homeId') {
            this.setItem(key, defaultOption[key]);
          }
        });
        this.setItem("v", v);
        this.isInit = true;
      });

    } catch (error) {
      console.error(error);
      this.rootStore.tools.error('数据更新失败, T101');
    }
  }

  get getItem() {
    return this.item;
  }

  getHomeLinkTimeKeys() {
    const { homeLinkTimeKey, homeLinkTimeKeys } = this.item;
    return homeLinkTimeKeys?.length
      ? homeLinkTimeKeys
      : homeLinkTimeKey
        ? [homeLinkTimeKey]
        : [];
  }

  getHomeId() {
    return new Promise((resolve, reject) => {
      if (this.item["homeId"]) {
        resolve(this.item["homeId"]);
      } else {
        this.getOption("homeId").then((res) => {
          if (res) {
            resolve(res);
          } else {
            let i = 0;
            const t = setInterval(() => {
              i += 1;
              if (i > 10) {
                clearInterval(t);
              }
              this.getOption("homeId").then((res) => {
                if (res) {
                  resolve(res);
                  clearInterval(t);
                }
              })
            }, 50)
          }
        })
      }
    })
  }

  // 基于本地数据库强制更新线上选项
  async resetChromeSaveOption() {
    const res = await db.option.toArray();
    if (res.length === 0) {
      return;
    }
    const data = {};
    res.forEach((item) => {
      this.item[item.key] = item.value;
      data[item.key] = item.value;
    });
    await sendRuntimeMessage("setOptions", data);
  }

  async setItem(key, value, save = true) {
    this.item[key] = value;
    await this.setOption(key, value);
    if (save) {
      sendRuntimeMessage("setOptions", { [key]: value });
    }
  }

  async getOption(key, returnAll = false) {
    const res = await db.option.where("key").anyOf([key]).toArray();
    if (res.length === 0) {
      return null;
    }
    return returnAll ? res[0] : res[0]["value"];
  }

  async setOption(key, value) {
    // 同步凭据/版本号走 chrome.storage.local，不进 db（不随数据导出，也不触发同步推送）
    if (SYNC_CONFIG_KEYS.includes(key)) {
      await saveSyncConfigValue(key, value);
      return;
    }

    const res = await this.getOption(key, true);
    if (res?.id) {
      await db.option.update(res.id, { value });
      if (!localStorageKeys.includes(key)) {
        this.rootStore.data.update();
      }
    } else {
      await db.option.add({ key, value });
      this.rootStore.data.update();
    }
  }

  resetOption() {
    try {
      this.getHomeId().then((homeId) => {
        this.item = {
          homeId,
        };
        clearSyncConfig().catch((err) => console.error('清空同步配置失败:', err));
        db.option.clear().then(() => {
          this.update(0, homeId);
          setTimeout(() => {
            window.location.reload();
          }, 6000);
        }).catch(error => {
          console.error('清空表时发生错误', error);
          this.rootStore.tools.error('设置重置失败—清空表时发生错误');
        });

      });
    } catch (error) {
      console.log('%c [ error ]-297', 'font-size:13px; background:pink; color:#bf2c9f;', error)
      this.rootStore.tools.error('设置重置失败');
    }
  }

  /// -----

  getSystemTheme = () => {
    const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (this.item.systemTheme == 'auto' && isDarkMode || this.item.systemTheme == 'dark') {
      return 'dark';
    }
    return 'white';
  }
}
