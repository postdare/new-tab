import { defineProvider } from "./aiProviderCore";
import { normalizeOpencodeUsage, opencodeStatusReason } from "./opencodeUsageNormalizer";

/* OpenCode Go（Zen 网关的 $10/月订阅）用量接口。端点与响应形状来自官方 console 的源码
   （packages/console/app/src/routes/zen/go/v1/usage.ts），未写进公开文档：
     GET https://opencode.ai/zen/go/v1/usage，Authorization: Bearer <sk-* 密钥>
   密钥与 Zen 推理用的是同一把（控制台 API Keys）；三个窗口的量是月额度的
   20% / 5 小时、50% / 周、100% / 月，所以接口直接给各窗口已用百分比 + 重置时间。
   鉴权通过但工作区没有 Go 订阅时返回 403 EntitlementError。 */

/** 密钥在控制台里创建，Zen 与 Go 同一把；这里按官方文档给登入入口 */
export const OPENCODE_CONSOLE_URL = "https://opencode.ai/auth";

export const opencodeQuota = defineProvider({
  cacheKey: "aiBalance:opencode",
  url: "https://opencode.ai/zen/go/v1/usage",
  normalize: normalizeOpencodeUsage,
  statusReason: opencodeStatusReason,
});
