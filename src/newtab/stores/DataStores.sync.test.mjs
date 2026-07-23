import assert from "node:assert/strict";
import { build } from "esbuild";

const control = {
  blockNextWrite: false,
  busyLocks: 0,
  provider: null,
  resolveWrite: null,
  resolveVersion: null,
  writes: [],
};
globalThis.__dataStoresSyncTest = control;

const result = await build({
  entryPoints: [new URL("./DataStores.js", import.meta.url).pathname],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  plugins: [
    {
      name: "data-stores-sync-test-stubs",
      setup(builder) {
        builder.onResolve({ filter: /^~\/db$/ }, () => ({
          path: "db",
          namespace: "sync-test",
        }));
        builder.onResolve({ filter: /^~\/utils\/errorHandler$/ }, () => ({
          path: "error-handler",
          namespace: "sync-test",
        }));
        builder.onResolve(
          { filter: /^\.\/providers\/BackgroundSyncProvider$/ },
          () => ({ path: "provider", namespace: "sync-test" })
        );
        builder.onLoad({ filter: /.*/, namespace: "sync-test" }, (args) => {
          if (args.path === "db") {
            return {
              contents: `
                export const DB_NAME = "test";
                export const db = {
                  async export() {
                    return new Blob(["test-data"]);
                  },
                };
              `,
            };
          }
          if (args.path === "error-handler") {
            return { contents: "export function handleError() {}" };
          }
          return {
            contents: `
              export default class BackgroundSyncProvider {
                constructor(config) {
                  this.config = config;
                  globalThis.__dataStoresSyncTest.provider = this;
                }
                async acquireLock() {
                  if (globalThis.__dataStoresSyncTest.busyLocks > 0) {
                    globalThis.__dataStoresSyncTest.busyLocks -= 1;
                    throw new Error("SYNC_BUSY");
                  }
                }
                async releaseLock() {}
                async touchLock() {}
                async readFile() {
                  return new Promise((resolve) => {
                    globalThis.__dataStoresSyncTest.resolveVersion = resolve;
                  });
                }
                async writeFiles(files) {
                  globalThis.__dataStoresSyncTest.writes.push(files);
                  if (globalThis.__dataStoresSyncTest.blockNextWrite) {
                    globalThis.__dataStoresSyncTest.blockNextWrite = false;
                    return new Promise((resolve) => {
                      globalThis.__dataStoresSyncTest.resolveWrite = resolve;
                    });
                  }
                }
              }
            `,
          };
        });
      },
    },
  ],
});

const bundledSource = Buffer.from(result.outputFiles[0].text).toString("base64");
const { default: DataStores } = await import(
  `data:text/javascript;base64,${bundledSource}`
);

const rootStore = {
  option: {
    item: {
      syncType: "github_gist",
      githubToken: "test-token",
      githubGistId: "test-gist",
      webdavTime: 0.01,
      webdavVersion: 1,
    },
    async setItem(key, value) {
      this.item[key] = value;
    },
  },
  tools: {
    error(message) {
      throw new Error(message);
    },
  },
};

const data = new DataStores(rootStore);
data.init();

await waitFor(
  () => data.lock && typeof control.resolveVersion === "function",
  "初始拉取未进入持锁状态"
);

data.update();
control.resolveVersion("1");

await waitFor(() => !data.lock, "初始拉取未释放同步锁");
await waitFor(
  () => control.writes.length === 1,
  "持锁期间的数据变更没有在解锁后自动补推"
);

assert.equal(rootStore.option.item.webdavVersion, 2);
assert.equal(control.writes.length, 1);

control.busyLocks = 1;
data.update();
await waitFor(
  () => control.writes.length === 2,
  "跨标签锁忙后没有自动重试推送"
);
assert.equal(rootStore.option.item.webdavVersion, 3);

control.blockNextWrite = true;
data.update();
await waitFor(
  () => typeof control.resolveWrite === "function",
  "测试推送未进入阻塞状态"
);
data.update();
control.resolveWrite();
await waitFor(
  () => control.writes.length === 4,
  "推送过程中发生的后续变更没有继续补推"
);
assert.equal(rootStore.option.item.webdavVersion, 5);

const freshRootStore = {
  option: {
    item: {
      syncType: "github_gist",
      githubToken: "fresh-token",
      githubGistId: "fresh-gist",
      webdavTime: 0.01,
      webdavVersion: 1,
    },
    async setItem(key, value) {
      this.item[key] = value;
    },
  },
  tools: rootStore.tools,
};
const freshData = new DataStores(freshRootStore);
const writesBeforeSeed = control.writes.length;
control.busyLocks = 1;
await freshData.seedGithubGist("fresh-token", "fresh-gist");
assert.equal(control.provider.config.syncType, "github_gist");
assert.equal(control.provider.config.githubToken, "fresh-token");
assert.equal(control.provider.config.githubGistId, "fresh-gist");
assert.equal(
  control.writes.length,
  writesBeforeSeed + 1,
  "新 Gist 设置完成后没有立即写入首轮数据"
);

async function waitFor(predicate, message, timeoutMs = 1000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(message);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
