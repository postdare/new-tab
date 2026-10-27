/**
 * 管理页画廊的版式常量。单独成纯模块:间距、宽度是数学命题,
 * 测试(gallery.model.test.mjs 的 overflow 段)必须和组件算同一组数才作数 ——
 * 藏在 styled-components 模板字符串里的常量是导不出来的。
 *
 * 版式是行内紧凑填充(flex-wrap):缩略图按真实尺寸渲染 —— 预览就是首屏上
 * 那张卡的原大(所见即所得,不再有独立的预览缩放层),块宽 = 统一槽位宽,
 * 一行从左到右塞满才换行。预览在槽位里贴底坐:预览到标题的距离因此恒定,
 * 档位高度差被槽位上方的留白吸收(居中时矮卡上下各悬 50~60px,页面松散)。
 * 设置面(Back)是锚在本卡槽位上的浮层卡片,不参与占位 —— 翻面前后块宽
 * 都是 240,整行不重排。
 *
 *   为什么管理页不做成 Mac 桌面那种自由排布:挑选页的职责是整排扫读 + 挑档位,
 *   自由摆放会互相遮挡;自由排布属于首屏(WidgetLayer 的拖拽摆放),不是这一页。
 */

/** 版式常量:页面的 styled-components 从这里取值,测试按同一组数核对 */
export const GALLERY = {
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
  /** 分组段标题与段间纵向间距 */
  sectionTitleFontSize: 13,
  sectionGap: 32,
  /** 已添加状态徽标(已在首屏/已在副屏):与标题同行,不再单独占一行 */
  statusFontSize: 11,
  /** 档位行/操作行的固定行高:内容缺席时也占位,两行才横向对齐 */
  sizesRowHeight: 18,
  actionRowHeight: 22,
  /** 卡片内常驻操作行:按钮自身用 muted 色,hover 提亮交给按钮;
      不做整行弱化 —— 那会和 muted 色叠成双重弱化,11px 文字直接糊掉 */
  actionGap: 12,
  actionFontSize: 11,
};

/**
 * 预览统一槽位:每张卡都占同样大小的槽,预览在槽内贴底;
 * 超过槽位的档位按比例缩小(不放大),行高因此一致。
 * 240 宽按 1600 视口的内容宽 1304 反推:5 张卡 + 4 个列距
 * (5×240 + 4×18 = 1272)能排成一行,不再把 OpenCode Go 挤到第二行。
 */
export const PREVIEW_BOX = { width: 240, height: 240 };

/** 设置浮层(Back)宽:槽位 + 两侧各探出 20px。浮层绝对定位在本卡槽位上、
 *  不参与占位;20px 小于页边距 28,翻最边上的卡也不会顶出横向滚动。 */
export const BACK_WIDTH = PREVIEW_BOX.width + 20 * 2;
