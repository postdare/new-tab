import Dexie from "dexie";
// 副作用导入：为 db 实例注册 export/import 能力
import "dexie-export-import";

export const DB_NAME = "new-tab";

export const db = new Dexie(DB_NAME);

// 说明：
// - favicon 表按域名（origin）存储站点图标，仅在链接真正被保存到抽屉时写入。
// - 字段：
//   - domain: 站点域名（new URL(url).origin），作为主键，避免重复存储同一站点的 favicon；
//   - iconUrl: 选中的 favicon 绝对地址或 dataURL（正常模式）；
//   - iconUrlDark: 暗黑模式的 favicon 绝对地址或 dataURL（可选）；
//   - size: 图标实际尺寸（如 naturalWidth，通常接近 128）；
//   - lastUpdate: 更新时间戳，后续若需要可做刷新策略。

// 保留 1.5 版本定义，确保旧数据能正确升级
db.version(1.5).stores({
  link: "++linkId,title,url,&timeKey,sort,parentId,hide",
  option: "++id,&key,value",
  note: "++id,content,createTime,updateTime,fromUrl,sort,state",
  cache: "++id,&key,value",
}).upgrade((transaction) => {
  return db.__upgrade(transaction);
});

// 版本 2：新增 favicon 表
db.version(2).stores({
  link: "++linkId,title,url,&timeKey,sort,parentId,hide",
  option: "++id,&key,value",
  note: "++id,content,createTime,updateTime,fromUrl,sort,state",
  cache: "++id,&key,value",
  favicon: "&domain,iconUrl,size,lastUpdate",
}).upgrade((transaction) => {
  // favicon 表为新表，无需迁移数据
  return Promise.resolve(true);
});

// 版本 3：favicon 表新增 iconUrlDark 字段（暗黑模式图标）
db.version(3).stores({
  link: "++linkId,title,url,&timeKey,sort,parentId,hide",
  option: "++id,&key,value",
  note: "++id,content,createTime,updateTime,fromUrl,sort,state",
  cache: "++id,&key,value",
  favicon: "&domain,iconUrl,iconUrlDark,size,lastUpdate",
}).upgrade((transaction) => {
  // 升级现有数据：为已有记录添加 iconUrlDark 字段（设为 null）
  const faviconTable = transaction.table("favicon");
  return faviconTable.toCollection().modify((favicon) => {
    if (typeof favicon.iconUrlDark === "undefined") {
      favicon.iconUrlDark = null;
    }
  });
});

// 版本 4：移除便签功能，删除 note 表
db.version(4).stores({
  link: "++linkId,title,url,&timeKey,sort,parentId,hide",
  option: "++id,&key,value",
  note: null,
  cache: "++id,&key,value",
  favicon: "&domain,iconUrl,iconUrlDark,size,lastUpdate",
});

// 更新旧数据（1.5 升级路径）
db.__upgrade = (t) => {
  try {
    const oldNoteTable = t.table("note");
    if (oldNoteTable) {
      oldNoteTable.toCollection().modify((note) => {
        if (typeof note.state === "undefined") {
          note.state = 1;
        }
      });
    }
  } catch (_) {
    // note 表已删除时忽略
  }
  return true;
};

// favicon 工具函数
export const getFavicon = async (domain) => {
  if (!domain) return Promise.resolve(undefined);
  try {
    // 确保数据库已打开
    if (!db.isOpen()) {
      await db.open();
    }
    return await db.favicon.get(domain);
  } catch (e) {
    console.error("[favicon] getFavicon error", e);
    return undefined;
  }
};

export const saveFavicon = async ({ domain, iconUrl, iconUrlDark = null, size }) => {
  if (!domain || !iconUrl) {
    console.warn("[favicon] saveFavicon: missing domain or iconUrl", { domain, iconUrl });
    return Promise.resolve(undefined);
  }
  try {
    // 确保数据库已打开
    if (!db.isOpen()) {
      await db.open();
    }
    
    // 不存储 chrome-extension:// 这种扩展内部 API URL
    // Chrome 的 _favicon API 只在显示时动态生成，不存储到数据库
    let finalIconUrlDark = iconUrlDark;
    if (finalIconUrlDark && typeof finalIconUrlDark === "string" && finalIconUrlDark.startsWith("chrome-extension://")) {
      console.warn("[favicon] saveFavicon: rejecting chrome-extension:// URL for iconUrlDark", finalIconUrlDark);
      finalIconUrlDark = null;
    }
    
    const result = await db.favicon.put({
      domain,
      iconUrl,
      iconUrlDark: finalIconUrlDark || null,
      size: size || null,
      lastUpdate: Date.now(),
    });
    console.log("[favicon] saveFavicon: saved", domain, iconUrl, finalIconUrlDark, result);
    return result;
  } catch (e) {
    console.error("[favicon] saveFavicon error", e, { domain, iconUrl, iconUrlDark, size });
    throw e;
  }
};
