import { defineProvider } from "./aiProviderCore";
import { normalizeBigmodelUsage } from "./bigmodelUsageNormalizer";

/* 智谱 BigModel（GLM）Coding Plan 用量接口。官方未作为稳定 OpenAPI 发布，
   端点与字段来自实测（官方代码在调用，字段兼容性不保证长期稳定）：
     GET https://open.bigmodel.cn/api/monitor/usage/quota/limit
   鉴权是 Authorization: <Coding Plan API Key>，**不加 Bearer 前缀**（实测验证，
   加 Bearer 会 401「令牌已过期或验证不正确」）。defineProvider 在传 headers 时
   不走 Bearer、而是把 key 拼进模板值——所以这里用 { Authorization: "" } 得到
   `Authorization: <key>`，与 Antix 的 { Cookie: "antix_session=" } 同一模式。
   2026 新套餐按积分（Credits）计量，响应 type 为 CREDIT_LIMIT（旧版 TOKENS_LIMIT）。 */

export const BIGMODEL_CONSOLE_URL = "https://bigmodel.cn/usercenter/proj-mgmt/apikeys";

export const bigmodelQuota = defineProvider({
  cacheKey: "aiBalance:bigmodel",
  url: "https://open.bigmodel.cn/api/monitor/usage/quota/limit",
  normalize: normalizeBigmodelUsage,
  headers: { Authorization: "" },
});
