import { defineProvider } from "./aiProviderCore";
import { normalizeKimiUsage } from "./kimiUsageNormalizer";

/* Kimi Code（Coding Plan）用量接口。官方未公开文档，端点与字段来自实测：
   GET https://api.kimi.com/coding/v1/usages，Bearer 用 Coding Plan 的 sk-kimi-* 密钥
   （platform.kimi.com 的 sk-* 是另一套，会 401）。实测不校验 User-Agent，
   所以浏览器里发得出去——fetch 改不了 UA。
   响应中的数值通常是字符串；部分响应只有 remaining，没有 used。 */
export const KIMI_CONSOLE_URL = "https://www.kimi.com/code";

export const kimiQuota = defineProvider({
  cacheKey: "aiBalance:kimi",
  url: "https://api.kimi.com/coding/v1/usages",
  normalize: normalizeKimiUsage,
});
