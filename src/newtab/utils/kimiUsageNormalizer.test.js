import test from "node:test";
import assert from "node:assert/strict";
import { normalizeKimiUsage } from "./kimiUsageNormalizer.js";

test("用 remaining 计算重置后的 Kimi 用量", () => {
  const result = normalizeKimiUsage({
    usage: {
      limit: "100",
      remaining: "100",
      resetTime: "2026-10-05T00:00:00Z",
    },
    limits: [
      {
        window: { duration: 300, timeUnit: "TIME_UNIT_MINUTE" },
        detail: {
          limit: "100",
          used: null,
          remaining: "100",
          resetTime: "2026-09-28T12:00:00Z",
        },
      },
    ],
  });

  assert.equal(result.windowPercent, 0);
  assert.equal(result.weeklyPercent, 0);
  assert.equal(result.windowReset, "2026-09-28T12:00:00Z");
});

test("按窗口描述选择 300 分钟额度，而不是依赖数组顺序", () => {
  const result = normalizeKimiUsage({
    usage: { limit: "100", used: "20" },
    limits: [
      {
        window: { duration: 60, timeUnit: "TIME_UNIT_MINUTE" },
        detail: { limit: "100", used: "80" },
      },
      {
        window: { duration: 300, timeUnit: "TIME_UNIT_MINUTE" },
        detail: { limit: "100", used: "25" },
      },
    ],
  });

  assert.equal(result.windowPercent, 25);
});
