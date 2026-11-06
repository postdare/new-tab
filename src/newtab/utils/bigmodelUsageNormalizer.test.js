import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBigmodelUsage } from "./bigmodelUsageNormalizer.js";

/** 造一份真实形状的响应：两个 CREDIT_LIMIT（5 小时 + 每周），level lite */
function realResponse(overrides = {}) {
  return {
    code: 200,
    msg: "操作成功",
    data: {
      limits: [
        {
          type: "CREDIT_LIMIT",
          unit: 3,
          number: 5,
          usage: 2000,
          currentValue: 625,
          remaining: 1374,
          percentage: 31,
          nextResetTime: 1793613056990,
        },
        {
          type: "CREDIT_LIMIT",
          unit: 6,
          number: 1,
          usage: 10000,
          currentValue: 7033,
          remaining: 2966,
          percentage: 70,
          nextResetTime: 1794062142999,
        },
      ],
      level: "lite",
    },
    success: true,
    ...overrides,
  };
}

test("5 小时与每周的百分比、重置时间、套餐等级都落到组件字段上", () => {
  const result = normalizeBigmodelUsage(realResponse());

  assert.equal(result.fiveHourPercent, 31);
  // 1793613056990 ms → ISO；断言前缀即可，避免跨运行窗口漂移
  assert.match(result.fiveHourReset, /^2026-1[01]-/);
  assert.equal(result.weeklyPercent, 70);
  assert.match(result.weeklyReset, /^2026-1[01]-/);
  assert.equal(result.level, "lite");
});

test("百分比为 0 是有效数据，不能当成缺失", () => {
  const result = normalizeBigmodelUsage(
    realResponse({
      data: {
        limits: [
          { type: "CREDIT_LIMIT", unit: 3, percentage: 0, nextResetTime: 1793613056990 },
          { type: "CREDIT_LIMIT", unit: 6, percentage: 0, nextResetTime: 1794062142999 },
        ],
        level: "lite",
      },
    })
  );

  assert.equal(result.fiveHourPercent, 0);
  assert.equal(result.weeklyPercent, 0);
});

test("缺 5 小时档只保留每周档，缺失的置空", () => {
  const result = normalizeBigmodelUsage(
    realResponse({
      data: {
        limits: [
          { type: "CREDIT_LIMIT", unit: 6, percentage: 8, nextResetTime: 1794062142999 },
        ],
        level: "lite",
      },
    })
  );

  assert.equal(result.fiveHourPercent, null);
  assert.equal(result.fiveHourReset, null);
  assert.equal(result.weeklyPercent, 8);
  assert.match(result.weeklyReset, /^2026-1[01]-/);
});

test("兼容旧版 TOKENS_LIMIT 类型", () => {
  const result = normalizeBigmodelUsage(
    realResponse({
      data: {
        limits: [
          { type: "TOKENS_LIMIT", unit: 3, percentage: 45, nextResetTime: 1793613056990 },
          { type: "TOKENS_LIMIT", unit: 6, percentage: 60, nextResetTime: 1794062142999 },
        ],
        level: "lite",
      },
    })
  );

  assert.equal(result.fiveHourPercent, 45);
  assert.equal(result.weeklyPercent, 60);
});

test("同 unit 出现 CREDIT_LIMIT 与 TOKENS_LIMIT 时优先 CREDIT_LIMIT", () => {
  const result = normalizeBigmodelUsage(
    realResponse({
      data: {
        limits: [
          { type: "TOKENS_LIMIT", unit: 3, percentage: 99, nextResetTime: 1793613056990 },
          { type: "CREDIT_LIMIT", unit: 3, percentage: 20, nextResetTime: 1793613056990 },
          { type: "CREDIT_LIMIT", unit: 6, percentage: 70, nextResetTime: 1794062142999 },
        ],
        level: "lite",
      },
    })
  );

  assert.equal(result.fiveHourPercent, 20);
});

test("形状不认识时抛错，交给缓存层保留上一次的数据", () => {
  assert.throws(() => normalizeBigmodelUsage({ data: { limits: [] } }), /额度数据为空/);
  assert.throws(() => normalizeBigmodelUsage(null), /额度数据为空/);
  assert.throws(() => normalizeBigmodelUsage({}), /额度数据为空/);
});
