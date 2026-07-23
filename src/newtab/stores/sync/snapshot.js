import { db, DB_NAME } from "~/db";
import _ from "lodash";
import { stripSyncConfigRows } from "../syncConfig";

const progressCallback = () => {};

const IMPORT_OPTIONS = {
  noTransaction: false,
  clearTables: true,
  acceptVersionDiff: true,
  progressCallback,
};

/**
 * 导出本地数据快照（用于推送与拉取前备份）。
 * option 表中的本地展示项与凭据兜底字段会被抹空。
 */
export function exportSnapshot() {
  return db.export({
    prettyJson: true,
    progressCallback,
    skipTables: ['cache', 'favicon'],
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

  if (json.data.tables) {
    const tableKeys = Object.keys(json.data.tables);
    if (tableKeys.length === 0) {
      throw new Error('远端数据表为空，拒绝导入以避免数据丢失');
    }
    const requiredTables = ['option', 'link'];
    const hasRequiredTable = requiredTables.some((table) =>
      tableKeys.includes(table)
    );
    if (!hasRequiredTable) {
      console.warn('远端数据缺少基本表，但继续导入');
    }
  } else {
    console.warn('远端数据缺少 tables 字段，尝试继续导入');
  }

  return { json, databaseVersion };
}

/**
 * 清库并导入快照，随后剔除凭据残留行并做导入后验证。
 */
export async function importSnapshot(blob) {
  await db.delete();

  if (!db.isOpen()) {
    await db.open();
  }

  await db.import(blob, IMPORT_OPTIONS);

  // 旧版本远端数据可能带有同步凭据行（含空 token），导入后立刻剔除，
  // 防止其回流覆盖 chrome.storage.local 中的真实配置
  await stripSyncConfigRows(db);

  const importedData = await exportSnapshot();
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
}

/**
 * 导入失败时用备份快照回滚本地数据。
 */
export async function restoreBackup(backupBlob) {
  if (db.isOpen()) {
    await db.close();
  }
  await db.delete();
  if (!db.isOpen()) {
    await db.open();
  }
  await db.import(backupBlob, IMPORT_OPTIONS);

  const restoredData = await exportSnapshot();
  if (!restoredData || restoredData.size === 0) {
    throw new Error('恢复后的数据验证失败：数据为空');
  }
}
