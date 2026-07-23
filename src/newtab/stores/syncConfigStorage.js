import { browserApi, getLastError } from "@/utils/browser";
import { SYNC_CONFIG_KEYS, stripSyncConfigRows } from "./syncConfig";

const MIGRATED_FLAG = 'syncConfigMigrated';

function storageGet(keys) {
  return new Promise((resolve) => {
    if (!browserApi?.storage?.local) {
      resolve({});
      return;
    }
    browserApi.storage.local.get(keys, (result) => {
      void getLastError();
      resolve(result || {});
    });
  });
}

function storageSet(data) {
  return new Promise((resolve) => {
    if (!browserApi?.storage?.local) {
      resolve();
      return;
    }
    browserApi.storage.local.set(data, () => {
      void getLastError();
      resolve();
    });
  });
}

/** 清空全部同步配置（设置重置时使用） */
export function clearSyncConfig() {
  return new Promise((resolve) => {
    if (!browserApi?.storage?.local) {
      resolve();
      return;
    }
    browserApi.storage.local.remove(SYNC_CONFIG_KEYS, () => {
      void getLastError();
      resolve();
    });
  });
}

/** 读取全部同步配置（仅返回已存在的键） */
export async function loadSyncConfig() {
  const result = await storageGet(SYNC_CONFIG_KEYS);
  const config = {};
  SYNC_CONFIG_KEYS.forEach((key) => {
    if (result[key] !== undefined) {
      config[key] = result[key];
    }
  });
  return config;
}

export function saveSyncConfigValue(key, value) {
  return storageSet({ [key]: value });
}

/**
 * 启动时执行：
 * 1. 首次运行把 db.option 里的同步配置迁移到 chrome.storage.local
 *    （chrome.storage.local 已有非空值时以本地为准，防止旧数据覆盖）；
 * 2. 之后每次启动仅清除 db 里的残留行（远端拉取/文件导入可能带回旧行）。
 */
export async function migrateSyncConfigFromDb(db) {
  const rows = await db.option.where('key').anyOf(SYNC_CONFIG_KEYS).toArray();
  const { [MIGRATED_FLAG]: migrated } = await storageGet([MIGRATED_FLAG]);

  if (!migrated) {
    const existing = await storageGet(SYNC_CONFIG_KEYS);
    const data = { [MIGRATED_FLAG]: true };
    rows.forEach((row) => {
      const hasLocal = existing[row.key] !== undefined && existing[row.key] !== '';
      if (!hasLocal && row.value !== undefined) {
        data[row.key] = row.value;
      }
    });
    await storageSet(data);
  }

  await stripSyncConfigRows(db);
}
