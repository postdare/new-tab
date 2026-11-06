/* 智谱 BigModel（GLM）Coding Plan 用量响应的收敛层。独立成文件、不 import 任何
   带 ~/ 别名或带 fetch 的模块，是为了能像 kimiUsageNormalizer 一样被裸 node 直接测。

   接口官方未公开（官方代码在调用，但未作为稳定 OpenAPI 发布），字段兼容性
   不保证长期稳定。2026 新套餐按积分（Credits）计量，type 是 CREDIT_LIMIT；
   旧版是 TOKENS_LIMIT，这里两种都认，同 unit 出现两种 type 时优先 CREDIT_LIMIT。 */

/** 5 小时窗口的 unit=3，每周的 unit=6 */
const FIVE_HOUR_UNIT = 3;
const WEEKLY_UNIT = 6;

/** type 的优先级：CREDIT_LIMIT（新套餐积分）优先于 TOKENS_LIMIT（旧版 token） */
const TYPE_PRIORITY = { CREDIT_LIMIT: 2, TOKENS_LIMIT: 1 };

function toPercent(limit) {
  const percent = Number(limit?.percentage);
  return Number.isFinite(percent) ? percent : null;
}

/** nextResetTime 是 Unix 毫秒时间戳，转成 ISO 字符串供 formatCountdown 用 */
function toResetIso(limit) {
  const ms = Number(limit?.nextResetTime);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;
}

/** 从 limits[] 里挑出某个窗口（unit）的档位。同 unit 出现多种 type 时按优先级取。 */
function pickLimit(limits, unit) {
  const candidates = limits.filter((limit) => limit?.unit === unit);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, cur) =>
    (TYPE_PRIORITY[cur?.type] || 0) > (TYPE_PRIORITY[best?.type] || 0) ? cur : best
  );
}

/** 把 /api/monitor/usage/quota/limit 的响应收敛成组件要用的字段 */
export function normalizeBigmodelUsage(raw) {
  const limits = Array.isArray(raw?.data?.limits) ? raw.data.limits : [];

  const fiveHour = pickLimit(limits, FIVE_HOUR_UNIT);
  const weekly = pickLimit(limits, WEEKLY_UNIT);

  const fiveHourPercent = toPercent(fiveHour);
  const weeklyPercent = toPercent(weekly);

  if (fiveHourPercent === null && weeklyPercent === null) {
    throw new Error("额度数据为空");
  }

  return {
    fiveHourPercent,
    fiveHourReset: toResetIso(fiveHour),
    weeklyPercent,
    weeklyReset: toResetIso(weekly),
    level: raw?.data?.level || null,
  };
}
