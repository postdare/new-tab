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
        GALLERY, BLOCK_MIN,
      } from "~/widgets/galleryLayout";
      export { WIDGET_SIZES } from "~/widgets/sizes";
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

  // 源码断言:单一栅格,不再有已添加/组件库/分组标题
  const src = fs.readFileSync(
    new URL("../scenes/widgets/WidgetGallery.jsx", import.meta.url).pathname,
    "utf8",
  );
  assert.ok(!src.includes("GROUPS"), "不应再有分组聚合");
  assert.ok(!/<Section[\s>/]|<Group[\s>/]/.test(src), "不应再有已添加/组件库/分组标题渲染");
  assert.equal((src.match(/<Grid>/g) || []).length, 1, "整页应只有一个栅格");
  assert.ok(src.includes("galleryCards("), "页面应消费统一列表模型");
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

/** AC4:行内紧凑填充版式契约 —— 预览即实物(真实卡盒),块宽由卡盒推导、角标锚预览角。
    断言真实渲染路径(widgetSize/BLOCK_MIN),不是某个已废弃的预览缩放语义。 */
function overflow() {
  // 块宽下限是推导值:大卡真实宽 + 两侧留白,不许再拍一个固定数
  assert.equal(
    m.BLOCK_MIN,
    m.WIDGET_SIZES.large.width + m.GALLERY.cardPadding * 2,
    "BLOCK_MIN 应 = 大卡宽 + 2×cardPadding(改 SCALE 自动跟随)",
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
  assert.ok(src.includes("BLOCK_MIN"), "设置面宽度应由 BLOCK_MIN 推导,不再写死");
  assert.ok(src.includes("widgetSize(size)"), "正面块宽应取 widgetSize(档位)");
  assert.ok(src.includes("GALLERY.columnGap"), "块间距应取 GALLERY.columnGap");

  // 删除/设置角标:放进 Tile 锚预览右上角,随块 hover 显现;背面返回钮常驻
  const tile = src.slice(src.indexOf("<Tile>"), src.indexOf("</Tile>"));
  assert.ok(tile.includes("WidgetPreview"), "Tile 内应渲染预览缩略图");
  assert.ok(tile.includes("<Corner $reveal"), "角标应放进 Tile(锚预览右上角)且带 $reveal");
  assert.ok(src.includes("&:hover ${Corner}"), "角标应随块 hover 显现");
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
