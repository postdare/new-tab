/**
 * 组件尺寸档，沿用苹果那套栅格比例：
 * 小卡是正方形的一个格；中卡横向两格；大卡两格见方。
 * 宽高固定（不再 fit-content），卡片才不会因为文案长短而参差。
 *
 * 内容按「标题贴顶、数值锚在标题下固定偏移、更新时间贴底」排布，
 * 于是不同档位的卡片放在一起时，各行自成一线。
 *
 * 整体大小只由 SCALE 一个数控制，盒子、留白、字号、进度条一起等比走。
 */
const BASE_UNIT = 158;
const SCALE = 0.86;

/** 中文小字号的可读下限：再等比缩下去就糊了，所以次要文字到 10px 打住 */
const MIN_TEXT = 10;

const px = (n) => Math.round(n * SCALE);
const text = (n) => Math.max(MIN_TEXT, Math.round(n * SCALE));

const UNIT = px(BASE_UNIT);
export const WIDGET_GAP = px(12);

const span = (cols, rows) => ({
  width: cols * UNIT + (cols - 1) * WIDGET_GAP,
  height: rows * UNIT + (rows - 1) * WIDGET_GAP,
});

export const WIDGET_SIZES = {
  small: { ...span(1, 1), valueFontSize: px(30), unitFontSize: px(18) },
  medium: { ...span(2, 1), valueFontSize: px(32), unitFontSize: px(19) },
  large: { ...span(2, 2), valueFontSize: px(40), unitFontSize: px(24) },
};

/** 与档位无关的通用尺度，供卡片直接消费 */
export const WIDGET_METRICS = {
  padding: px(16),
  radius: px(22),
  headFontSize: text(11),
  /** 数值行距标题的固定偏移：各卡靠它对齐 */
  valueOffset: px(18),
  metaFontSize: text(11),
  metaLineHeight: 1.4,
  metaGap: px(9),
  ageFontSize: text(11),
  ageGap: px(6),
  barGap: px(6),
  barFontSize: text(11),
  /** 轨道厚度不等比缩：再细就看不见了 */
  barTrackHeight: 4,
  barLabelWidth: px(38),
  barValueWidth: px(30),
  barRowGap: px(8),
  columnGap: px(16),
};

export const DEFAULT_SIZE = "small";

/** 档位按钮的规范展示顺序:小 → 中 → 大。
    定义里的 sizes 数组顺序仍是「默认档在前」,页面展示时只按这里排序。 */
export const SIZE_ORDER = ["small", "medium", "large"];

/** 按规范顺序返回档位副本,不改入参数组;未知档位保持原相对顺序排在末尾 */
export function orderedSizes(sizes) {
  const rank = new Map(SIZE_ORDER.map((name, index) => [name, index]));
  const of = (name) => (rank.has(name) ? rank.get(name) : SIZE_ORDER.length);
  return [...sizes].sort((a, b) => of(a) - of(b));
}

/** 组件库里给尺寸档的中文标签 */
export const SIZE_LABELS = {
  small: "小",
  medium: "中",
  large: "大",
};

export function widgetSize(name) {
  return WIDGET_SIZES[name] || WIDGET_SIZES[DEFAULT_SIZE];
}
