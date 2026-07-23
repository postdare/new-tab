/** 首屏分组自由布局：坐标估算与默认排布（纯函数） */

export const SNAP = 10;
export const ICON_SLOT = 58;
export const GAP = 15;
export const CARD_PAD = 32;
export const TITLE_H = 22;
export const DRAG_ID_PREFIX = "home-link-group_";
const MAX_COLUMNS = 3;
const HORIZONTAL_MARGIN = 16;
const VIEW_MARGIN = 8;
const CANONICAL_VIEWPORT = { width: 1920, height: 1080 };

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

export function getViewportSize(viewport) {
  const fallbackWidth =
    typeof window !== "undefined" ? window.innerWidth : 1200;
  const fallbackHeight =
    typeof window !== "undefined" ? window.innerHeight : 800;
  return {
    width: Number.isFinite(viewport?.width) ? viewport.width : fallbackWidth,
    height: Number.isFinite(viewport?.height) ? viewport.height : fallbackHeight,
  };
}

export function getLayoutAnchor(isSoBarDown, viewport) {
  const { width, height } = getViewportSize(viewport);
  return {
    left: width / 2,
    top: isSoBarDown
      ? Math.max(24, height * 0.12)
      : Math.max(80, height * 0.3 + 60),
  };
}

function mapPositions(positions, transform) {
  const mapped = {};
  const plain = toPlainPositions(positions);
  Object.keys(plain).forEach((key) => {
    mapped[key] = transform(plain[key]);
  });
  return mapped;
}

/** 将视口绝对坐标转换为相对布局锚点的坐标。 */
export function toAnchoredPositions(positions, isSoBarDown, viewport) {
  const anchor = getLayoutAnchor(isSoBarDown, viewport);
  return mapPositions(positions, (position) => {
    return {
      left: position.left - anchor.left,
      top: position.top - anchor.top,
    };
  });
}

/** 将相对布局锚点的坐标转换为当前视口坐标。 */
export function fromAnchoredPositions(positions, isSoBarDown, viewport) {
  const anchor = getLayoutAnchor(isSoBarDown, viewport);
  return mapPositions(positions, (position) => {
    return {
      left: position.left + anchor.left,
      top: position.top + anchor.top,
    };
  });
}

/** 过滤无法在首屏渲染的空分组。 */
export function filterRenderableGroups(groups) {
  if (!Array.isArray(groups)) return [];
  return groups.filter(
    (group) =>
      group?.timeKey && Array.isArray(group.links) && group.links.length > 0
  );
}

function buildSizeByKey(groups, showGroupTitle) {
  const sizeByKey = {};
  (groups || []).forEach((group) => {
    if (group?.timeKey) {
      sizeByKey[group.timeKey] = estimateSize(
        group.links?.length || 1,
        showGroupTitle
      );
    }
  });
  return sizeByKey;
}

function getPositionBounds(positions, sizeByKey) {
  const plain = toPlainPositions(positions);
  let minLeft = Infinity;
  let minTop = Infinity;
  let maxRight = -Infinity;
  let maxBottom = -Infinity;

  Object.keys(plain).forEach((key) => {
    const { left, top } = plain[key];
    const { w, h } = sizeByKey[key] || { w: 120, h: 100 };
    minLeft = Math.min(minLeft, left);
    minTop = Math.min(minTop, top);
    maxRight = Math.max(maxRight, left + w);
    maxBottom = Math.max(maxBottom, top + h);
  });

  return { positions: plain, minLeft, minTop, maxRight, maxBottom };
}

function buildColumns(items, colCount) {
  const cols = Array.from({ length: colCount }, () => ({
    items: [],
    height: 0,
    width: 0,
  }));

  items.forEach((item) => {
    let target = cols[0];
    for (const col of cols) {
      if (col.height < target.height) target = col;
    }
    if (target.items.length > 0) target.height += GAP;
    target.items.push(item);
    target.height += item.h;
    target.width = Math.max(target.width, item.w);
  });

  const totalWidth =
    cols.reduce((sum, col) => sum + col.width, 0) +
    Math.max(0, colCount - 1) * GAP;
  const maxHeight = Math.max(0, ...cols.map((col) => col.height));

  return { cols, totalWidth, maxHeight };
}

/**
 * 生成默认瀑布流布局：宽屏最多 3 列，窄屏自动降列。
 * 返回 overflow 供交互层提示“当前窗口无法完全容纳”。
 */
export function computeDefaultLayout(
  groups,
  showGroupTitle,
  isSoBarDown,
  viewport
) {
  if (!groups.length) {
    return { positions: {}, columnCount: 0, overflow: false };
  }

  const items = groups.map((g) => ({
    timeKey: g.timeKey,
    ...estimateSize(g.links?.length || 1, showGroupTitle),
  }));

  const { width: vw, height: vh } = getViewportSize(viewport);
  const availableWidth = Math.max(0, vw - HORIZONTAL_MARGIN * 2);
  const maxColumns = Math.min(MAX_COLUMNS, items.length);
  let layout = buildColumns(items, 1);
  let columnCount = 1;

  for (let count = maxColumns; count >= 1; count -= 1) {
    const candidate = buildColumns(items, count);
    if (candidate.totalWidth <= availableWidth || count === 1) {
      layout = candidate;
      columnCount = count;
      break;
    }
  }

  const startX = Math.max(HORIZONTAL_MARGIN, (vw - layout.totalWidth) / 2);
  const startY = getLayoutAnchor(isSoBarDown, { width: vw, height: vh }).top;

  const positions = {};
  let x = startX;
  layout.cols.forEach((col) => {
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

  const overflow =
    layout.totalWidth > availableWidth ||
    snap(startY) + layout.maxHeight > vh - VIEW_MARGIN;

  return { positions, columnCount, overflow };
}

/**
 * 在固定逻辑画布上整理，输出与真实显示器分辨率无关的锚点相对坐标。
 */
export function computeAnchoredDefaultLayout(
  groups,
  showGroupTitle,
  isSoBarDown,
  viewport
) {
  const canonical = computeDefaultLayout(
    groups,
    showGroupTitle,
    isSoBarDown,
    CANONICAL_VIEWPORT
  );
  const positions = toAnchoredPositions(
    canonical.positions,
    isSoBarDown,
    CANONICAL_VIEWPORT
  );
  const visible = fromAnchoredPositions(positions, isSoBarDown, viewport);
  const fitted = fitAllPositions(visible, groups, showGroupTitle, viewport);
  return {
    positions,
    columnCount: canonical.columnCount,
    overflow: fitted.overflow,
  };
}

/** 已有部分坐标时，给新分组找不重叠的起点 */
export function placeNewGroups(groups, existing) {
  if (!groups.length) return {};
  let anchorLeft = -80;
  let anchorTop = 0;

  const existingEntries = Object.values(existing || {});
  if (existingEntries.length > 0) {
    let maxRight = 0;
    let minTop = Infinity;
    existingEntries.forEach((p) => {
      if (typeof p?.left === "number") maxRight = Math.max(maxRight, p.left + 120);
      if (typeof p?.top === "number") minTop = Math.min(minTop, p.top);
    });
    if (minTop !== Infinity) anchorTop = minTop;
    anchorLeft = maxRight + GAP;
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

/** 将单个坐标限制在视口内（卡片超出视口时贴边，尽量完整可见） */
export function clampPosition(left, top, cardW = 120, cardH = 100) {
  const { width, height } = getViewportSize();
  const maxLeft = Math.max(VIEW_MARGIN, width - cardW - VIEW_MARGIN);
  const maxTop = Math.max(VIEW_MARGIN, height - cardH - VIEW_MARGIN);
  return {
    left: snap(Math.min(Math.max(left, VIEW_MARGIN), maxLeft)),
    top: snap(Math.min(Math.max(top, VIEW_MARGIN), maxTop)),
  };
}

function getAxisShift(min, max, viewportSize) {
  const lowerBound = VIEW_MARGIN;
  const upperBound = viewportSize - VIEW_MARGIN;
  const span = max - min;
  const available = Math.max(0, upperBound - lowerBound);

  if (span <= available) {
    if (min < lowerBound) return lowerBound - min;
    if (max > upperBound) return upperBound - max;
    return 0;
  }

  // 内容本身比视口大时只校正单侧越界，保留所有分组的相对位置。
  if (min > lowerBound) return lowerBound - min;
  if (max < upperBound) return upperBound - max;
  return 0;
}

/**
 * 将整个分组簇等量平移到当前视口内，不改变分组之间的相对位置。
 * 只用于渲染临时视口，不能覆盖用户保存的坐标。
 * @returns {{ next: object, changed: boolean, overflow: boolean }}
 */
export function fitAllPositions(
  positions,
  groups,
  showGroupTitle,
  viewport
) {
  if (!positions || typeof positions !== "object") {
    return { next: {}, changed: false, overflow: false };
  }

  const bounds = getPositionBounds(
    positions,
    buildSizeByKey(groups, showGroupTitle)
  );
  const {
    positions: next,
    minLeft,
    minTop,
    maxRight,
    maxBottom,
  } = bounds;

  if (minLeft === Infinity) {
    return { next, changed: false, overflow: false };
  }

  const { width, height } = getViewportSize(viewport);
  const dx = Math.round(getAxisShift(minLeft, maxRight, width));
  const dy = Math.round(getAxisShift(minTop, maxBottom, height));

  if (dx !== 0 || dy !== 0) {
    Object.keys(next).forEach((key) => {
      next[key] = {
        left: next[key].left + dx,
        top: next[key].top + dy,
      };
    });
  }

  return {
    next,
    changed: dx !== 0 || dy !== 0,
    overflow:
      maxRight - minLeft > width - VIEW_MARGIN * 2 ||
      maxBottom - minTop > height - VIEW_MARGIN * 2,
  };
}
