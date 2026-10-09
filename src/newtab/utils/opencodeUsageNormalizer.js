/* OpenCode Go 用量响应的收敛层。独立成文件、不 import 任何带 ~/ 别名或带
   fetch 的模块，是为了能像 kimiUsageNormalizer 一样被裸 node 直接测。 */

/** 每个窗口给 percent（服务器已取整到 0-100）与 resetsAt（ISO） */
function toPercent(window) {
  const percent = Number(window?.percent);
  return Number.isFinite(percent) ? percent : null;
}

/** 把 /zen/go/v1/usage 的响应收敛成组件要用的字段 */
export function normalizeOpencodeUsage(raw) {
  const rolling = raw?.usage?.rolling;
  const weekly = raw?.usage?.weekly;
  const monthly = raw?.usage?.monthly;

  const rollingPercent = toPercent(rolling);
  const weeklyPercent = toPercent(weekly);
  const monthlyPercent = toPercent(monthly);

  if (rollingPercent === null && weeklyPercent === null && monthlyPercent === null) {
    throw new Error("额度数据为空");
  }

  return {
    rollingPercent,
    rollingReset: rolling?.resetsAt || null,
    weeklyPercent,
    weeklyReset: weekly?.resetsAt || null,
    monthlyPercent,
    monthlyReset: monthly?.resetsAt || null,
  };
}

/**
 * 403 有两种病因：密钥不对，和工作区没有 Go 订阅。后者重试多少次都一样，
 * 不能也报「密钥失效」，得把话说清楚。short 是卡片状态行上的短标签。
 */
export function opencodeStatusReason(status, body) {
  if (body?.error?.type === "EntitlementError") {
    return { message: "需要 OpenCode Go 订阅", short: "未订阅" };
  }
  return null;
}
