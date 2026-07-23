/** 远端同步文件名与时间参数（WebDAV 用完整路径，Gist 只取 basename） */
export const SYNC_JSON_NAME = '/newtab-data.json';
export const SYNC_VERSION_NAME = '/newtab-version.txt';
export const SYNC_INIT_NAME = '/newtab-init.txt';
export const SYNC_README_NAME = 'newtab-readme.txt';
export const SYNC_VERSION_BASENAME = 'newtab-version.txt';

/** 本地锁心跳间隔：需小于 background LOCK_TTL_MS（60s） */
export const LOCK_HEARTBEAT_MS = 20 * 1000;
export const PUSH_BUSY_RETRY_BASE_MS = 100;
export const PUSH_BUSY_RETRY_MAX_MS = 2000;
export const PUSH_ERROR_RETRY_BASE_MS = 1000;
export const PUSH_ERROR_RETRY_LIMIT = 3;
export const GIST_SEED_BUSY_RETRY_LIMIT = 6;
/** 页面重新可见时自动拉取的最小间隔 */
export const PULL_MIN_INTERVAL_MS = 60 * 1000;
/** 距上次拉取超过该时长后，推送前先校验远端版本，防止长期开着的旧标签页覆盖新数据 */
export const PUSH_STALE_CHECK_MS = 5 * 60 * 1000;

/** 导出时被抹空、拉取导入后需要恢复的本地展示项（同步凭据已不入 db，无需在此恢复） */
export const LOCAL_RESTORE_KEYS = ['bgType', 'bg2Type', 'bgBase64', 'bg2Base64'];

/**
 * 扩展消息通道瞬时错误（MV3 SW 休眠、页面刷新等），不应弹 tips 打扰用户
 */
export function isEphemeralExtensionMessageError(error) {
  const msg = error?.message || String(error || '');
  return (
    /message channel closed/i.test(msg) ||
    /asynchronous response by returning true/i.test(msg) ||
    /Extension context invalidated/i.test(msg) ||
    /The message port closed/i.test(msg)
  );
}
