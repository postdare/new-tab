import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { build } from "esbuild";
import Dexie from "dexie";

// dexie-export-import 依赖的浏览器全局：顶层读取 self，读 Blob 用 FileReader
globalThis.self ??= globalThis;
globalThis.FileReader ??= class {
  readAsText(blob) {
    this._read(blob.text());
  }
  readAsArrayBuffer(blob) {
    this._read(blob.arrayBuffer());
  }
  _read(promise) {
    promise.then(
      (result) => this.onload({ target: { result } }),
      (error) => this.onerror({ target: { error } })
    );
  }
};

const srcDir = new URL("../../..", import.meta.url).pathname;

const result = await build({
  stdin: {
    contents: `
      export * from "./snapshot.js";
      export { db } from "~/db";
    `,
    resolveDir: new URL(".", import.meta.url).pathname,
  },
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  plugins: [
    {
      name: "snapshot-test-alias",
      setup(builder) {
        // ~ / @ 别名按 vite.config.js 映射到真实文件
        builder.onResolve({ filter: /^[~@]\// }, (args) =>
          builder.resolve(
            srcDir + (args.path.startsWith("~") ? "newtab" : "") + args.path.slice(1),
            { kind: args.kind, resolveDir: args.resolveDir }
          )
        );
      },
    },
  ],
});

const bundledSource = Buffer.from(result.outputFiles[0].text).toString("base64");
const { db, exportSnapshot, parseSnapshot, importSnapshot } = await import(
  `data:text/javascript;base64,${bundledSource}`
);

const linksOf = async () =>
  (await db.link.toArray()).map((link) => link.title).sort();

// ---- 准备：远端快照 = A 状态，本地随后改成 B 状态 ----
await db.open();
await db.option.bulkAdd([
  { key: "homeId", value: "home" },
  { key: "theme", value: "dark" },
]);
await db.link.bulkAdd(
  Array.from({ length: 200 }, (_, i) => ({
    title: `remote-${i}`,
    timeKey: `remote-${i}`,
    parentId: "home",
  }))
);
const remoteText = await (await exportSnapshot()).text();

await db.link.clear();
await db.link.bulkAdd([{ title: "local-only", timeKey: "local-only", parentId: "home" }]);
await db.cache.add({ key: "bgBase64_blob", value: "image-bytes" });
// 旧版本快照可能带回的凭据行
await db.option.add({ key: "githubToken", value: "" });

// ---- parseSnapshot：真实导出能通过，缺表的快照被拒绝 ----
parseSnapshot(remoteText);
const withoutLink = JSON.parse(remoteText);
withoutLink.data.tables = withoutLink.data.tables.filter((t) => t.name !== "link");
assert.throws(
  () => parseSnapshot(JSON.stringify(withoutLink)),
  /缺少 link 表/
);

// ---- 导入期间，另一个标签页（独立连接）不应读到空书签，也不应被关闭 ----
const otherTab = new Dexie("new-tab");
otherTab.version(4).stores({
  link: "++linkId,title,url,&timeKey,sort,parentId,hide",
  option: "++id,&key,value",
  cache: "++id,&key,value",
  favicon: "&domain,iconUrl,iconUrlDark,size,lastUpdate",
});
await otherTab.open();

const observedCounts = [];
let importing = true;
const watcher = (async () => {
  while (importing) {
    observedCounts.push(await otherTab.link.count());
    await new Promise((resolve) => setImmediate(resolve));
  }
})();

await importSnapshot(new Blob([remoteText], { type: "application/json" }));
importing = false;
await watcher;

assert.ok(observedCounts.length > 0, "观察者没有读到任何数据");
assert.ok(
  observedCounts.every((count) => count === 1 || count === 200),
  `其它标签页读到了中间状态: ${[...new Set(observedCounts)].join(", ")}`
);
assert.ok(otherTab.isOpen(), "导入不应关闭其它标签页的数据库连接");

// ---- 导入结果 ----
assert.equal((await linksOf()).length, 200);
assert.ok(!(await linksOf()).includes("local-only"));
assert.equal((await db.option.where("key").equals("theme").first())?.value, "dark");
assert.equal(
  await db.option.where("key").equals("githubToken").count(),
  0,
  "凭据行应在导入事务内被剔除"
);
assert.equal(
  (await db.cache.where("key").equals("bgBase64_blob").first())?.value,
  "image-bytes",
  "cache 表（本地背景图）不应被导入清掉"
);

// ---- 导入失败时事务回滚，本地数据保持原样 ----
const broken = JSON.parse(remoteText);
const linkRows = broken.data.data.find((t) => t.tableName === "link").rows;
linkRows.push({ ...linkRows[0], linkId: 99999 }); // 触发 &timeKey 唯一约束
await assert.rejects(() =>
  importSnapshot(new Blob([JSON.stringify(broken)], { type: "application/json" }))
);
assert.equal((await linksOf()).length, 200, "失败的导入不应改动本地数据");

otherTab.close();
db.close();
console.log("snapshot tests passed");
