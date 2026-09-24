import { db, DB_NAME } from "~/db";
import { importInto } from "dexie-export-import";
import _ from "lodash";
import { stripLocalOptionRows } from "../localOptions";

const progressCallback = () => {};

/** 仅本机有效的缓存表：不进快照，导入时也不清空 */
const LOCAL_ONLY_TABLES = ['cache', 'favicon'];
/** 快照必须包含的表，缺失说明远端数据已损坏，导入会清空书签 */
const REQUIRED_TABLES = ['option', 'link'];

/**
 * 导出本地数据快照（用于推送与拉取前备份）。
 * option 表中的本地展示项与凭据兜底字段会被抹空。
 */
export function exportSnapshot() {
  return db.export({
    prettyJson: true,
    progressCallback,
    skipTables: LOCAL_ONLY_TABLES,
    transform: (table, value, key) => {
      if (table === 'option') {
        switch (value.key) {
          case 'bgType':
          case 'bg2Type': {
            const type_value = _.cloneDeep(value);
            if (type_value.value === 'file') {
              type_value.value = value.key == 'bgType' ? 'bing' : '';
            }
            return { value: type_value, key };
          }

          // 凭据已不入 db，这里保留抹空逻辑作为兜底（防手动导入的旧数据残留）
          case 'bgBase64':
          case 'bg2Base64':
          case 'githubToken':
          case 'webDavPassword': {
            const _value = _.cloneDeep(value);
            _value.value = '';
            return { value: _value, key };
          }
        }
      }
      return { value, key };
    }
  });
}

/**
 * 校验远端快照文本，返回 { json, databaseVersion }；不合法时抛错。
 */
export function parseSnapshot(text) {
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

  // dexie-export-import 的 tables 是 [{ name, schema, rowCount }] 数组
  const tableNames = Array.isArray(json.data.tables)
    ? json.data.tables.map((table) => table.name)
    : [];
  const missing = REQUIRED_TABLES.filter((name) => !tableNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`远端数据缺少 ${missing.join('、')} 表，拒绝导入以避免数据丢失`);
  }

  return { json, databaseVersion };
}

/**
 * 只解码快照、不碰数据库：借 importInto 完成流式解析和 TSON 还原，
 * 但把写入目标换成内存收集器，返回 Map<表名, { values, keys }>。
 * importInto 对 db 只用到 name / verno / tables / table(name)，以及
 * table 上的 schema / bulkAdd / bulkPut（noTransaction 下不调用 transaction）。
 */
async function decodeSnapshot(blob) {
  const rowsByTable = new Map();
  const collector = {
    name: db.name,
    verno: db.verno,
    tables: [],
    table(name) {
      const real = db.tables.find((table) => table.name === name);
      if (!real) return undefined;
      const collect = async (values, keys) => {
        const entry = rowsByTable.get(name) || { values: [], keys: keys ? [] : undefined };
        entry.values.push(...values);
        if (keys) entry.keys.push(...keys);
        rowsByTable.set(name, entry);
      };
      return { schema: real.schema, bulkAdd: collect, bulkPut: collect };
    },
  };

  await importInto(collector, blob, {
    noTransaction: true,
    acceptVersionDiff: true,
    skipTables: LOCAL_ONLY_TABLES,
    progressCallback,
  });
  return rowsByTable;
}

/**
 * 用快照整体替换同步表。清空与写入在同一个读写事务里完成：
 * 其它标签页共用这个 IndexedDB，只会看到替换前或替换后的完整数据，
 * 不会读到中途的空库（原先 db.delete() 后重建，别的标签页会读到空书签，
 * 新开的标签页还会把空库当成新安装写入默认数据）。
 */
async function replaceWithSnapshot(blob) {
  const rowsByTable = await decodeSnapshot(blob);
  const tables = db.tables.filter((table) => !LOCAL_ONLY_TABLES.includes(table.name));

  await db.transaction('rw', tables, async () => {
    for (const table of tables) {
      await table.clear();
    }
    for (const [name, { values, keys }] of rowsByTable) {
      await db.table(name).bulkAdd(values, keys);
    }
    // 旧版本远端数据可能带有同步凭据行（含空 token），同一事务内剔除，
    // 防止其回流覆盖 chrome.storage.local 中的真实配置
    await stripLocalOptionRows(db);
  });
}

/**
 * 用远端快照替换本地数据。失败时事务整体回滚，本地数据保持原样。
 */
export function importSnapshot(blob) {
  return replaceWithSnapshot(blob);
}

/**
 * 导入后仍需回退时，用拉取前的备份快照恢复本地数据。
 */
export function restoreBackup(backupBlob) {
  return replaceWithSnapshot(backupBlob);
}
