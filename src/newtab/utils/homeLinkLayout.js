/** 首屏分组自由布局：坐标估算与默认排布（纯函数） */

export const SNAP = 10;
export const ICON_SLOT = 58;
export const GAP = 15;
export const CARD_PAD = 32;
export const TITLE_H = 22;
export const DRAG_ID_PREFIX = "home-link-group_";

export function snap(n) {
  return Math.round(n / SNAP) * SNAP;
}

export function estimateSize(linkCount, showTitle) {
  const cols = Math.min(Math.max(linkCount, 1), 4);
  const rows = Math.ceil(Math.max(linkCount, 1) / cols);
  const w = cols * ICON_SLOT + (cols - 1) * GAP + CARD_PAD;
  const h =
    rows * ICON_SLOT + (rows - 1) * GAP + CARD_PAD + (showTitle ? TITLE_H : 8);
  return { w, h };
}

/** 无已存坐标时，用 3 列瀑布流生成默认绝对坐标（相对视口） */
export function computeDefaultPositions(groups, showGroupTitle, isSoBarDown) {
  if (!groups.length) return {};
  const items = groups.map((g) => ({
    timeKey: g.timeKey,
    ...estimateSize(g.links?.length || 1, showGroupTitle),
  }));
  const colCount = Math.min(3, items.length);
  const cols = Array.from({ length: colCount }, () => ({
    items: [],
    height: 0,
    width: 0,
  }));
  items.forEach((item) => {
    let target = cols[0];
    for (const c of cols) {
      if (c.height < target.height) target = c;
    }
    target.items.push(item);
    target.height += item.h + GAP;
    target.width = Math.max(target.width, item.w);
  });

  const totalW =
    cols.reduce((s, c) => s + c.width, 0) + Math.max(0, colCount - 1) * GAP;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const startX = Math.max(16, (vw - totalW) / 2);
  const startY = isSoBarDown
    ? Math.max(24, vh * 0.12)
    : Math.max(80, vh * 0.3 + 60);

  const positions = {};
  let x = startX;
  cols.forEach((col) => {
    let y = startY;
    col.items.forEach((item) => {
      positions[item.timeKey] = {
        left: snap(x),
        top: snap(y),
      };
      y += item.h + GAP;
    });
    x += col.width + GAP;
  });
  return positions;
}

/** 已有部分坐标时，给新分组找不重叠的起点 */
export function placeNewGroups(groups, existing, isSoBarDown) {
  if (!groups.length) return {};
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  let anchorLeft = Math.max(24, vw / 2 - 80);
  let anchorTop = isSoBarDown
    ? Math.max(24, vh * 0.12)
    : Math.max(80, vh * 0.3 + 60);

  const existingEntries = Object.values(existing || {});
  if (existingEntries.length > 0) {
    let maxRight = 0;
    let minTop = Infinity;
    existingEntries.forEach((p) => {
      if (typeof p?.left === "number") maxRight = Math.max(maxRight, p.left + 120);
      if (typeof p?.top === "number") minTop = Math.min(minTop, p.top);
    });
    if (minTop !== Infinity) anchorTop = minTop;
    anchorLeft = Math.min(maxRight + GAP, vw - 160);
  }

  const positions = {};
  groups.forEach((g, i) => {
    positions[g.timeKey] = {
      left: snap(anchorLeft + i * 24),
      top: snap(anchorTop + i * 24),
    };
  });
  return positions;
}

/** 规范化/清洗坐标表，过滤非法项 */
export function toPlainPositions(raw) {
  if (!raw || typeof raw !== "object") return {};
  const plain = {};
  Object.keys(raw).forEach((k) => {
    const p = raw[k];
    if (p && typeof p.left === "number" && typeof p.top === "number") {
      plain[k] = { left: p.left, top: p.top };
    }
  });
  return plain;
}

/**
 * 一次扫描 link.list，建立首屏分组 timeKey → title 映射
 * @param {Array} linkList
 * @param {string[]} timeKeys
 */
export function buildTitleMap(linkList, timeKeys) {
  if (!timeKeys?.length || !linkList?.length) return {};
  const want = new Set(timeKeys);
  const map = {};
  for (const item of linkList) {
    if (item?.timeKey && want.has(item.timeKey) && item.title != null) {
      map[item.timeKey] = item.title;
      if (Object.keys(map).length === want.size) break;
    }
  }
  return map;
}
