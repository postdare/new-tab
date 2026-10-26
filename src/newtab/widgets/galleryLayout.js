import { widgetSize } from "./sizes";

/**
 * 管理页画廊的版式常量。单独成纯模块:间距、宽度是数学命题,
 * 测试(gallery.model.test.mjs 的 overflow 段)必须和组件算同一组数才作数 ——
 * 藏在 styled-components 模板字符串里的常量是导不出来的。
 *
 * 版式是行内紧凑填充(flex-wrap):缩略图按真实尺寸渲染 —— 预览就是首屏上
 * 那张卡的原大(所见即所得,不再有独立的预览缩放层),块宽 = 卡宽,
 * 一行从左到右塞满才换行。设置面(Back)固定用 BLOCK_MIN —— 大卡宽 +
 * 两侧留白推导,改 sizes.js 的 SCALE 时整页自动跟着走,不拍数字。
 *
 *   为什么管理页不做成 Mac 桌面那种自由排布:挑选页的职责是整排扫读 + 挑档位,
 *   自由摆放会互相遮挡;自由排布属于首屏(WidgetLayer 的拖拽摆放),不是这一页。
 */

/** 版式常量:页面的 styled-components 从这里取值,测试按同一组数核对 */
export const GALLERY = {
  /** 块两侧的最小留白:块宽下限由它推导 */
  cardPadding: 14,
  titleFontSize: 13,
  titleLineHeight: 1.4,
  sizesMarginTop: 8,
  sizeBtnFontSize: 12,
  /** 同一行里块与块的横向间距 */
  columnGap: 18,
  /** 行与行的纵向间距 */
  cardGap: 20,
  /** 缩略图与上下文字的呼吸距离 */
  previewMarginTop: 2,
  previewMarginBottom: 12,
  /** 分组段标题(12px muted)与段间纵向间距 */
  sectionTitleFontSize: 12,
  sectionGap: 32,
  /** 已添加状态常驻文案:标题下方、档位行上方 */
  addedFontSize: 11,
  addedMarginTop: 4,
  /** 状态行/档位行/操作行的固定行高:内容缺席时也占位,三行才横向对齐 */
  statusRowHeight: 16,
  sizesRowHeight: 18,
  actionRowHeight: 22,
  /** 卡片内常驻操作行:弱化到 0.6,hover / 聚焦提到 1 */
  actionGap: 12,
  actionFontSize: 11,
  actionOpacity: 0.6,
};

/** 块宽下限:大卡真实宽 + 两侧留白,由卡盒推导。
    设置面(Back)固定用这个宽,比任何一档卡片都宽,表单读得舒服。 */
export const BLOCK_MIN = widgetSize("large").width + GALLERY.cardPadding * 2;

/**
 * 预览统一槽位:每张卡都占同样大小的槽,预览在槽内居中;
 * 超过槽位的档位按比例缩小(不放大),行高因此一致。
 * 240 宽按 1600 视口的内容宽 1304 反推:5 张卡 + 4 个列距
 * (5×240 + 4×18 = 1272)能排成一行,不再把 OpenCode Go 挤到第二行。
 */
export const PREVIEW_BOX = { width: 240, height: 240 };
