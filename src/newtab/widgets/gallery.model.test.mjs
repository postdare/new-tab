import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

/* 小组件管理页的契约测试。
   instances / galleryModel / galleryLayout 的依赖链里有 ~/(新tab)别名与
   React 之外的存储侧依赖,裸 node 跑不了,照 aiProviders.format.test.mjs
   的先例:esbuild 打包 + stub 掉 ~ 别名的三个边界模块,再从 data: URL 导入。

     ~/utils            getID → 自增序号,断言可预测
     ~/widgets/registry 注册表 → 测试自己塞假定义,isValidInstance 认它们
     ~/widgets/storage  dropWidgetData → 录制调用,断言被丢实例的数据被清

   段名取 argv[2](single-list / single-instance / dedup / overflow / regression),
   无参跑全部;verify.sh 的分支各跑一段,互不牵连。 */

const STUBS = {
  utils: `
    let seq = 0;
    export const getID = () => \`id-\${++seq}\`;
  `,
  registry: `
    const defs = new Map();
    export const WIDGETS = [];
    export function __setRegistry(list) {
      defs.clear();
      for (const d of list) defs.set(d.type, d);
    }
    export function getWidget(type) {
      return defs.get(type) || null;
    }
  `,
  storage: `
    const dropped = [];
    export function __dropped() { return [...dropped]; }
    export function __resetDropped() { dropped.length = 0; }
    export async function dropWidgetData(option, instanceId) { dropped.push(instanceId); }
    export function useWidgetData() { return [{}, () => {}]; }
  `,
};

/* 按「解析后的绝对路径」打桩:别名与相对导入殊途同归,
   不然 instances.js → ./registry(真) 会把全部 React 组件拉进 bundle,
   galleryModel → ./storage(真) 会把 dexie/ahooks 拉进来。 */
const NEWTAB = path.resolve(fileURLToPath(import.meta.url), "../..");
const PATH_STUBS = new Map([
  [path.join(NEWTAB, "utils", "index.js"), STUBS.utils],
  [path.join(NEWTAB, "widgets", "registry.js"), STUBS.registry],
  [path.join(NEWTAB, "widgets", "storage.js"), STUBS.storage],
]);

/** 常规扩展名/目录 index 的解析;找不到返回 null 交回 esbuild 报错 */
function resolveReal(base) {
  for (const c of [
    base,
    `${base}.js`,
    `${base}.jsx`,
    path.join(base, "index.js"),
    path.join(base, "index.jsx"),
  ]) {
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch {}
  }
  return null;
}

const result = await build({
  stdin: {
    contents: `
      export {
        WIDGETS_KEY, listInstances, listInstancesWithDedup, createInstance,
        updateInstance, updateInstanceConfig, removeInstance,
        addInstance, dedupeInstances,
      } from "~/widgets/instances";
      export { galleryCards, groupCards, applyDedupe, DEFAULT_GROUP } from "~/widgets/galleryModel";
      export {
        GALLERY, BACK_WIDTH, PREVIEW_BOX,
      } from "~/widgets/galleryLayout";
      export { WIDGET_SIZES, SIZE_ORDER, orderedSizes } from "~/widgets/sizes";
      export { __setRegistry } from "~/widgets/registry";
      export { __dropped, __resetDropped } from "~/widgets/storage";
    `,
    resolveDir: new URL(".", import.meta.url).pathname,
    sourcefile: "gallery.model.entries.js",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  plugins: [
    {
      name: "gallery-model-test-stubs",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, (args) => {
          if (args.namespace === "stub") return; // 已打桩的不再解析
          let abs;
          if (args.path.startsWith("~/")) {
            abs = resolveReal(path.join(NEWTAB, args.path.slice(2)));
            if (!abs) return; // 交给 esbuild 报正常错
          } else if (args.path.startsWith(".")) {
            abs = resolveReal(path.resolve(path.dirname(args.importer), args.path));
            if (!abs) return;
          } else {
            return; // bare module(node_modules),默认解析
          }
          const stub = PATH_STUBS.get(abs);
          return stub ? { path: abs, namespace: "stub" } : { path: abs };
        });
        builder.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({
          contents: PATH_STUBS.get(args.path),
        }));
      },
    },
  ],
});

const m = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);

/** 测试用的组件定义与实例 */
const def = (type, over = {}) => ({
  type,
  title: `组件${type}`,
  summary: "测试用组件",
  sizes: ["small", "medium"],
  settings: [],
  configSchema: [],
  defaultConfig: {},
  ...over,
});
const inst = (type, id, over = {}) => ({
  id,
  type,
  size: "small",
  position: { right: 0, top: 0 },
  config: {},
  ...over,
});

/** AC1:统一单列表模型 —— 每种组件恰好一张卡,不再有已添加/组件库分栏 */
function singleList() {
  const A = def("a");
  const defs = [A, def("b"), def("c")];
  const cards = m.galleryCards(
    defs,
    [inst("a", "1"), inst("b", "2"), inst("b", "3"), inst("ghost", "4")],
    {},
  );

  // 每种类型恰好一张,按定义顺序
  assert.deepEqual(
    cards.map((c) => c.definition.type),
    ["a", "b", "c"],
  );
  const [ca, cb, cc] = cards;

  // 已添加卡挂「最早一张」实例
  assert.equal(ca.added, true);
  assert.equal(ca.instance.id, "1");
  assert.equal(cb.added, true);
  assert.equal(cb.instance.id, "2");

  // 未添加卡没有实例,可添加
  assert.equal(cc.added, false);
  assert.equal(cc.instance, null);
  assert.equal(cc.canAdd, true);
  assert.equal(cc.addReason, "添加到首屏");

  // 已添加卡:添加入口关闭,理由「已添加」
  assert.equal(ca.canAdd, false);
  assert.equal(ca.addReason, "已添加");

  // 未知 type 的实例不崩也不出卡
  assert.ok(!cards.some((c) => c.definition.type === "ghost"));

  // 缺 required 类型设置 → 未添加卡不可加,理由说明缺什么
  const gated = def("g", {
    settings: [{ key: "apiKey", label: "API Key", required: true }],
  });
  const [cg] = m.galleryCards([gated], [], {});
  assert.equal(cg.canAdd, false);
  assert.match(cg.addReason, /需先填写/);
  assert.equal(cg.attention, true);

  // 源码断言:统一列表模型 + 按 group 分段渲染,分组逻辑只在模型层
  const src = fs.readFileSync(
    new URL("../scenes/widgets/WidgetGallery.jsx", import.meta.url).pathname,
    "utf8",
  );
  assert.ok(src.includes("galleryCards("), "页面应消费统一列表模型");
  assert.ok(src.includes("groupCards(cards)"), "分组应由模型层产出");
  assert.ok(src.includes("<SectionTitle>"), "每段应渲染分组小标题");
  assert.ok(!src.includes("GROUPS"), "页面不应自己定义分组表");
  assert.equal((src.match(/<Grid>/g) || []).length, 1, "栅格只定义一次,按段复用");
}

/** AC2:一种组件只能添加一个实例 —— 数据层拦截 + 模型标记 */
function singleInstance() {
  const A = def("a");
  m.__setRegistry([A]);

  // 空列表:正常创建
  const added = m.addInstance([], A, "medium", { right: 10, top: 20 });
  assert.equal(added.length, 1);
  assert.equal(added[0].type, "a");
  assert.equal(added[0].size, "medium");
  assert.deepEqual(added[0].position, { right: 10, top: 20 });
  assert.ok(added[0].id);

  // defaultConfig 克隆进实例
  const withDefault = def("d", { defaultConfig: { city: "西安" } });
  const [d0] = m.addInstance([], withDefault, "small", { right: 0, top: 0 });
  assert.deepEqual(d0.config, { city: "西安" });

  // 同类型再加:原样返回(同一引用,长度与内容不变)
  const again = m.addInstance(added, A, "small", { right: 99, top: 99 });
  assert.strictEqual(again, added);
  assert.equal(again.length, 1);

  // 模型层:已添加卡无添加动作,理由「已添加」
  const [card] = m.galleryCards([A], added, {});
  assert.equal(card.canAdd, false);
  assert.equal(card.addReason, "已添加");
}

/** AC3:一次性去重 —— 保留最早，落地清数据，无重复零写入 */
async function dedup() {
  // 有重复:每种类型保留最早一张,顺序不变
  const r = m.dedupeInstances([
    inst("a", "1"),
    inst("x", "2"),
    inst("a", "3"),
    inst("a", "4"),
    inst("x", "5"),
  ]);
  assert.deepEqual(
    r.instances.map((i) => i.id),
    ["1", "2"],
  );
  assert.equal(r.changed, true);
  assert.deepEqual(r.droppedIds, ["3", "4", "5"]);

  // 无重复:changed=false,内容不变
  const clean = [inst("a", "1"), inst("x", "2")];
  const r0 = m.dedupeInstances(clean);
  assert.equal(r0.changed, false);
  assert.deepEqual(r0.droppedIds, []);
  assert.deepEqual(r0.instances, clean);

  // 落地:no-op 时不写存储、不删数据
  const writes = [];
  const option = {
    setItem: async (key, value, flag) => {
      writes.push([key, value, flag]);
    },
  };
  m.__resetDropped();
  assert.equal(await m.applyDedupe(option, r0), false);
  assert.equal(writes.length, 0);
  assert.deepEqual(m.__dropped(), []);

  // 落地:有重复写恰好一次,被丢实例逐个清数据
  assert.equal(await m.applyDedupe(option, r), true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], m.WIDGETS_KEY);
  assert.deepEqual(
    writes[0][1].map((i) => i.id),
    ["1", "2"],
  );
  assert.deepEqual(m.__dropped(), ["3", "4", "5"]);
}

/** AC6:按 group 分段 —— 段顺序 = group 首次出现的顺序,段内保持定义顺序 */
function groups() {
  const cards = m.galleryCards(
    [
      def("a1", { group: "AI 额度" }),
      def("b1", { group: "效率" }),
      def("a2", { group: "AI 额度" }),
      def("c1", { group: "生活" }),
      def("b2", { group: "效率" }),
      def("nogroup"),
    ],
    [],
    {},
  );
  const sections = m.groupCards(cards);

  // 段顺序按 group 首次出现,同组卡片聚合且保持原相对顺序
  assert.deepEqual(
    sections.map((s) => s.group),
    ["AI 额度", "效率", "生活", m.DEFAULT_GROUP],
  );
  assert.deepEqual(
    sections.map((s) => s.cards.map((c) => c.definition.type)),
    [["a1", "a2"], ["b1", "b2"], ["c1"], ["nogroup"]],
  );

  // 每张卡恰好出现一次
  assert.equal(
    sections.flatMap((s) => s.cards).length,
    cards.length,
  );

  // 空列表 → 空段
  assert.deepEqual(m.groupCards([]), []);
}

/** AC7:档位展示顺序统一 —— 规范顺序固定为 small → medium → large,
    定义里的数组顺序(默认档在前)不受影响。 */
function sizeOrder() {
  assert.deepEqual(m.SIZE_ORDER, ["small", "medium", "large"]);

  // 乱序定义按规范顺序展示
  assert.deepEqual(m.orderedSizes(["medium", "small"]), ["small", "medium"]);
  assert.deepEqual(m.orderedSizes(["medium", "small", "large"]), ["small", "medium", "large"]);
  assert.deepEqual(m.orderedSizes(["large", "small"]), ["small", "large"]);

  // 不改入参数组:第一项仍是定义里的默认档
  const declared = ["medium", "small"];
  m.orderedSizes(declared);
  assert.deepEqual(declared, ["medium", "small"]);

  // 未知档位不丢,排在末尾且保持相对顺序
  assert.deepEqual(m.orderedSizes(["huge", "medium", "tiny"]), ["medium", "huge", "tiny"]);
}

/** AC8:本轮版式修复的接线 —— 左对齐栅格、段标题/段距、档位规范顺序、已添加常驻标识 */
function layout() {
  const src = fs.readFileSync(
    new URL("../scenes/widgets/WidgetGallery.jsx", import.meta.url).pathname,
    "utf8",
  );

  // 2) 多行时行首左对齐
  assert.ok(src.includes("justify-content: flex-start"), "栅格应左对齐,不再居中");

  // 1) 段标题与段距走 galleryLayout 常量
  assert.ok(src.includes("GALLERY.sectionGap"), "段间距离应取 GALLERY.sectionGap");
  assert.ok(src.includes("GALLERY.sectionTitleFontSize"), "段标题字号应取 GALLERY.sectionTitleFontSize");
  assert.equal(m.GALLERY.sectionGap, 32, "段与段之间 32px");
  assert.equal(m.GALLERY.sectionTitleFontSize, 13, "段标题 13px");

  // 3) 档位按钮按规范顺序渲染(定义数组顺序不动)
  assert.ok(src.includes("orderedSizes(definition.sizes)"), "档位按钮应走 orderedSizes");

  // 4) 已添加状态常驻:文案 + 缩略图描边
  assert.ok(src.includes("已在首屏"), "已添加(首屏)应有常驻文案");
  assert.ok(src.includes("已在副屏"), "已添加(副屏)应有常驻文案");
  assert.ok(src.includes("$added={added}"), "已添加缩略图应带描边标记");
  assert.equal(m.GALLERY.statusFontSize, 11, "已添加徽标 11px");
  assert.ok(src.includes("<StatusBadge>"), "已添加状态应并入标题行的徽标");
  assert.ok(!src.includes("StatusRow"), "状态行应已移除,不再单独占一行");

  // 第三波 1) 槽位缩到 240:1600 视口(内容宽 1304)下 AI 五卡一行排满
  assert.equal(m.PREVIEW_BOX.width, 240, "槽位宽 240");
  assert.equal(m.PREVIEW_BOX.height, 240, "槽位高 240");
  assert.ok(
    5 * m.PREVIEW_BOX.width + 4 * m.GALLERY.columnGap <= 1304,
    "5 张卡 + 4 个列距应放进 1600 视口的内容宽 1304",
  );
  assert.ok(m.PREVIEW_BOX.width >= m.WIDGET_SIZES.small.width, "槽位至少容得下小卡原大");
  assert.ok(m.PREVIEW_BOX.width <= m.BACK_WIDTH, "槽位应放进设置浮层宽内");
  assert.ok(src.includes("width: ${PREVIEW_BOX.width}px"), "Front 宽应取槽位宽");
  assert.ok(src.includes("Math.min(1"), "预览缩放不应放大");
  assert.ok(src.includes("transform: scale("), "预览应按比例缩放适配槽位");
  assert.ok(src.includes("<PreviewScaled"), "原大档位盒应由内层缩放,外层按缩放后尺寸占位");

  // 中卡 282×136 缩到 240×116;小卡保持 136 原大(不放大)
  const fit = (box) =>
    Math.min(
      1,
      m.PREVIEW_BOX.width / box.width,
      m.PREVIEW_BOX.height / box.height,
    );
  const mediumScale = fit(m.WIDGET_SIZES.medium);
  assert.equal(Math.round(m.WIDGET_SIZES.medium.width * mediumScale), 240);
  assert.equal(Math.round(m.WIDGET_SIZES.medium.height * mediumScale), 116);
  assert.equal(fit(m.WIDGET_SIZES.small), 1, "小卡不放大");
  assert.ok(fit(m.WIDGET_SIZES.large) < 1, "大卡应缩进槽位");

  // 预览贴槽位底部:预览与标题的间距恒定,档位高度差由槽位上方留白吸收
  const tileStyle = src.slice(src.indexOf("const Tile"), src.indexOf("const PreviewFit"));
  assert.ok(tileStyle.includes("align-items: flex-end"), "预览应在槽位内贴底,不居中悬空");

  // 第二波 2) 操作从 hover 角标移到常驻操作行
  assert.ok(src.includes("<ActionRow>"), "应有常驻操作行");
  assert.ok(src.includes("添加到首屏"), "未添加卡应有添加文案");
  assert.ok(src.includes("移除"), "已添加卡应有移除文案");
  assert.ok(src.includes("移到副屏") && src.includes("移到首屏"), "已添加卡应有换屏文案");
  assert.ok(!src.includes("hoverOnly"), "不应再有 hover 才显示的操作");
  assert.ok(!src.includes("$reveal"), "不应再有 hover 角标那套");
  assert.ok(!("actionOpacity" in m.GALLERY), "操作行不再整行弱化(muted 色已弱化,叠加会把 11px 文字糊掉)");
  assert.ok(!src.includes("GALLERY.actionOpacity"), "操作行样式不应再引用整行弱化");
  assert.ok(!("statusRowHeight" in m.GALLERY), "状态行已并入标题行");
  assert.ok(m.GALLERY.sizesRowHeight > 0, "单档组件也应占档位行高");
}

/** AC4:行内紧凑填充版式契约 —— 预览即实物(真实卡盒),设置浮层宽由槽位推导。
    断言真实渲染路径(widgetSize/BACK_WIDTH),不是某个已废弃的预览缩放语义。 */
function overflow() {
  // 设置浮层宽是推导值:槽位 + 两侧各 20px,不许拍一个与槽位无关的数
  assert.equal(
    m.BACK_WIDTH,
    m.PREVIEW_BOX.width + 40,
    "BACK_WIDTH 应 = 槽位宽 + 2×20px 探出",
  );
  assert.ok(
    (m.BACK_WIDTH - m.PREVIEW_BOX.width) / 2 < 28,
    "浮层两侧探出应小于页边距 28px,翻最边上的卡也不产生横向滚动",
  );

  // 缩略图按真实尺寸渲染:WidgetPreview 直接用真实卡盒与 M 度量,不再有独立缩放层
  const prevSrc = fs.readFileSync(
    new URL("../widgets/WidgetPreview.jsx", import.meta.url).pathname,
    "utf8",
  );
  assert.ok(prevSrc.includes("widgetSize(size)"), "预览应由 widgetSize(档位) 取真实卡盒");
  assert.ok(!prevSrc.includes("scale"), "预览不许再有独立缩放系数,要实物原大");

  // 页面接线:行内紧凑填充(flex-wrap),块宽/间距消费这里的数据
  const src = fs.readFileSync(
    new URL("../scenes/widgets/WidgetGallery.jsx", import.meta.url).pathname,
    "utf8",
  );
  assert.ok(src.includes("flex-wrap"), "页面应改为 flex-wrap 行内紧凑填充");
  assert.ok(!src.includes("column-width"), "不许回到多列瀑布(column-width)");
  assert.ok(src.includes("BACK_WIDTH"), "设置浮层宽度应由 BACK_WIDTH 推导,不再写死");
  assert.ok(src.includes("widgetSize(size)"), "正面块宽应取 widgetSize(档位)");
  assert.ok(src.includes("GALLERY.columnGap"), "块间距应取 GALLERY.columnGap");

  // 第二波:预览放进固定槽位,只缩不放;操作不再挂在预览角上
  const tile = src.slice(src.indexOf("<Tile>"), src.indexOf("</Tile>"));
  assert.ok(tile.includes("WidgetPreview"), "Tile 内应渲染预览缩略图");
  assert.ok(tile.includes("<PreviewFit"), "预览应由 PreviewFit 缩放适配槽位");
  assert.ok(!tile.includes("<Corner"), "预览槽位里不应再有角标按钮");
}

/** AC5:既有实例函数行为锁定为回归基线 */
function regression() {
  assert.equal(m.WIDGETS_KEY, "widgets");

  const A = def("a");
  const B = def("b");
  m.__setRegistry([A, B]);

  // 读取:非数组与空输入;未知 type 过滤(现状)
  assert.deepEqual(m.listInstances(undefined), []);
  assert.deepEqual(m.listInstances({}), []);
  const item = { widgets: [inst("a", "1"), inst("ghost", "2"), inst("b", "3")] };
  assert.deepEqual(
    m.listInstances(item).map((i) => i.id),
    ["1", "3"],
  );

  // createInstance 的档位回落:不在 sizes 里就用第一档
  const weird = def("w", { sizes: ["large"] });
  const [w] = m.addInstance([], weird, "nope", { right: 0, top: 0 });
  assert.equal(w.size, "large");

  // updateInstance:patch 生效、其余字段(含 config)保持
  const base = [inst("a", "1", { config: { title: "工作" } }), inst("b", "2")];
  const moved = m.updateInstance(base, "1", { size: "large" });
  assert.equal(moved[0].size, "large");
  assert.deepEqual(moved[0].config, { title: "工作" });
  assert.deepEqual(moved[1], base[1]);

  // updateInstanceConfig:只动指定的键
  const configured = m.updateInstanceConfig(base, "1", "title", "生活");
  assert.equal(configured[0].config.title, "生活");

  // removeInstance:按 id 过滤
  const removed = m.removeInstance(base, "1");
  assert.deepEqual(
    removed.map((i) => i.id),
    ["2"],
  );

  // 去重是读取行为的一部分:重复实例读出来就只剩最早一张
  const dupItem = { widgets: [inst("a", "1"), inst("a", "9"), inst("b", "2")] };
  assert.deepEqual(
    m.listInstances(dupItem).map((i) => i.id),
    ["1", "2"],
  );
}

const sections = {
  "single-list": singleList,
  "single-instance": singleInstance,
  dedup,
  groups,
  "size-order": sizeOrder,
  layout,
  overflow,
  regression,
};

const requested = process.argv[2];
if (requested && !sections[requested]) {
  console.error(`unknown section: ${requested}`);
  process.exit(2);
}
for (const [name, run] of Object.entries(sections)) {
  if (requested && name !== requested) continue;
  await run();
  console.log(`ok - ${name}`);
}
