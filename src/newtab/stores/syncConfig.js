/**
 * 同步连接配置（凭据与本地同步状态）的定义。
 * 这些键存放在 chrome.storage.local（见 syncConfigStorage.js），
 * 不写入 IndexedDB option 表，因此不会随数据导出/同步到远端。
 *
 * 本模块保持无浏览器 API 依赖，便于在 Node 测试环境中打包。
 */
export const SYNC_CONFIG_KEYS = [
  'syncType',
  'githubToken',
  'githubGistId',
  'webDavURL',
  'webDavUsername',
  'webDavPassword',
  'webDavDir',
  'webdavVersion',
];

/**
 * 清除 option 表中的同步配置残留行。
 * 旧版本的远端数据 / 导出文件里仍带有这些行，导入后必须剔除，
 * 避免旧凭据（含空值）回流覆盖本地配置。
 */
export async function stripSyncConfigRows(db) {
  const rows = await db.option.where('key').anyOf(SYNC_CONFIG_KEYS).toArray();
  if (rows.length > 0) {
    await db.option.bulkDelete(rows.map((row) => row.id));
  }
  return rows.length;
}
