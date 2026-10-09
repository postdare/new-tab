import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOpencodeUsage, opencodeStatusReason } from "./opencodeUsageNormalizer.js";

test("三个窗口的百分比与重置时间都落到组件字段上", () => {
  const result = normalizeOpencodeUsage({
    usage: {
      rolling: { status: "ok", percent: 12, resetsAt: "2026-10-09T12:00:00Z" },
      weekly: { status: "ok", percent: 34, resetsAt: "2026-10-13T00:00:00Z" },
      monthly: { status: "rate-limited", percent: 100, resetsAt: "2026-10-31T00:00:00Z" },
    },
  });

  assert.deepEqual(result, {
    rollingPercent: 12,
    rollingReset: "2026-10-09T12:00:00Z",
    weeklyPercent: 34,
    weeklyReset: "2026-10-13T00:00:00Z",
    monthlyPercent: 100,
    monthlyReset: "2026-10-31T00:00:00Z",
  });
});

test("窗口没用过（percent 为 0）是有效数据，不能当成缺失", () => {
  const result = normalizeOpencodeUsage({
    usage: {
      rolling: { status: "ok", percent: 0, resetsAt: "2026-10-09T12:00:00Z" },
      weekly: { status: "ok", percent: 0, resetsAt: "2026-10-13T00:00:00Z" },
      monthly: { status: "ok", percent: 0, resetsAt: "2026-10-31T00:00:00Z" },
    },
  });

  assert.equal(result.rollingPercent, 0);
  assert.equal(result.weeklyPercent, 0);
  assert.equal(result.monthlyPercent, 0);
});

test("缺窗口的响应只保留拿到的档位，缺的置空", () => {
  const result = normalizeOpencodeUsage({
    usage: { weekly: { percent: 8 } },
  });

  assert.equal(result.rollingPercent, null);
  assert.equal(result.rollingReset, null);
  assert.equal(result.weeklyPercent, 8);
  assert.equal(result.monthlyPercent, null);
});

test("形状不认识时抛错，交给缓存层保留上一次的数据", () => {
  assert.throws(() => normalizeOpencodeUsage({ usage: {} }), /额度数据为空/);
  assert.throws(() => normalizeOpencodeUsage(null), /额度数据为空/);
});

test("403 的 EntitlementError 说成订阅问题，而不是密钥失效", () => {
  assert.deepEqual(
    opencodeStatusReason(403, {
      type: "error",
      error: {
        type: "EntitlementError",
        message: "OpenCode Go subscription required.",
      },
    }),
    { message: "需要 OpenCode Go 订阅", short: "未订阅" },
  );

  // 密钥本身不对（401 的 AuthError）沿用 requestJson 的默认文案
  assert.equal(
    opencodeStatusReason(401, {
      type: "error",
      error: { type: "AuthError", message: "Unauthorized" },
    }),
    null,
  );
  assert.equal(opencodeStatusReason(401, null), null);
});
