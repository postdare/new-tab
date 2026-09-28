function toNumber(value) {
  if (value === null || value === undefined || value === "") return NaN;
  return Number(value);
}

function toPercent(quota) {
  const limit = toNumber(quota?.limit);
  const explicitUsed = toNumber(quota?.used);
  const remaining = toNumber(quota?.remaining);
  const used = Number.isFinite(explicitUsed)
    ? explicitUsed
    : Number.isFinite(remaining)
      ? limit - remaining
      : NaN;
  if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(used)) {
    return null;
  }
  return (used / limit) * 100;
}

function isFiveHourWindow(limit) {
  const duration = toNumber(limit?.window?.duration);
  const unit = limit?.window?.timeUnit;
  return (
    (unit === "TIME_UNIT_MINUTE" && duration === 300) ||
    (unit === "TIME_UNIT_HOUR" && duration === 5)
  );
}

export function normalizeKimiUsage(raw) {
  // 用窗口描述定位 5 小时额度；旧响应只有一项时仍回退到第一项。
  const limits = Array.isArray(raw?.limits) ? raw.limits : [];
  const windowQuota = (limits.find(isFiveHourWindow) || limits[0])?.detail;
  const windowPercent = toPercent(windowQuota);
  const weeklyPercent = toPercent(raw?.usage);

  if (windowPercent === null && weeklyPercent === null) {
    throw new Error("额度数据为空");
  }

  return {
    windowPercent,
    windowReset: windowQuota?.resetTime || null,
    weeklyPercent,
  };
}
