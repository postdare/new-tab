import { AI_PROVIDERS } from "~/utils/aiProviders";
import { tint, lightTint } from "../tints";
import { providerSettings } from "./settings";
import QuotaWidget from "./QuotaWidget";

/**
 * AI 卡片的外观。数据侧在 utils/aiProviders.js，这里只管长什么样。
 * sizes 的第一项是默认档。
 */
const APPEARANCE = {
  deepseek: {
    sizes: ["small", "medium"],
    tint: tint(
      "linear-gradient(158deg, rgba(77, 107, 254, 0.74) 0%, rgba(63, 92, 236, 0.68) 52%, rgba(79, 112, 220, 0.72) 100%)"
    ),
  },
  kimi: {
    /* Kimi 官网是暖白 #fbfaf9 配墨黑 #121212，黑白灰识别体系、没有饱和主色，
       所以用墨灰而不是编一个假的品牌色。偏暖（r>g>b）：一来贴合它那个暖白，
       二来和 Factory 的中性近黑分得开——两张都是深色卡，靠冷暖区分。 */
    sizes: ["small", "medium"],
    tint: tint(
      "linear-gradient(158deg, rgba(48, 43, 38, 0.7) 0%, rgba(36, 32, 28, 0.64) 52%, rgba(43, 38, 34, 0.68) 100%)"
    ),
  },
  factory: {
    /* Factory 是「黑白 + 橙色强调」，且官网 <html data-theme="light">，
       CSS 里 light 规则 83 条、dark 只有 7 条——默认就是亮色。
       底色取 --surface-raised #fff / --surface-page #f5f5f5 / --light-base-primary #eee，
       橙色 --accent-100 #ef6f2e 只做强调（这里落在三条进度条上），从不做底色。 */
    /* 三个滚动窗口各占一条进度条，中卡的横向空间才用在了信息量上；
       缩到小卡就只剩主指标，见 QuotaWidget 的 showsBars */
    sizes: ["medium", "small"],
    scheme: "light",
    tint: lightTint(
      "linear-gradient(158deg, rgba(255, 255, 255, 0.82) 0%, rgba(238, 238, 238, 0.74) 52%, rgba(245, 245, 245, 0.78) 100%)"
    ),
    accent: "#ef6f2e",
  },
  antix: {
    /* Antix 官网（antigma.ai）是深色底，没有明确的单一品牌色；
       余额卡延续 DeepSeek 的冷色深底，但色相偏青，和 DeepSeek 的纯蓝分开。 */
    sizes: ["small"],
    tint: tint(
      "linear-gradient(158deg, rgba(34, 84, 88, 0.74) 0%, rgba(26, 66, 70, 0.68) 52%, rgba(38, 94, 98, 0.72) 100%)"
    ),
  },
  opencode: {
    /* opencode 是「暖白 + 近黑 + 电光黄」：页面 --color-background-strong
       hsl(0, 5%, 12%)、深色模式底 hsl(0, 9%, 7%)，Go 用量图的 --bar-go #f7ff00。
       底色取它的近黑（中性偏暖，比 Kimi 那张更冷更沉），强调色就交给三条进度条：
       全项目唯一一张黄色条的卡，摆在一起一眼认得出。 */
    sizes: ["medium", "small"],
    tint: tint(
      "linear-gradient(158deg, rgba(32, 30, 30, 0.76) 0%, rgba(18, 17, 17, 0.7) 52%, rgba(26, 25, 25, 0.74) 100%)"
    ),
    accent: "#f7ff00",
  },
};

/**
 * AI 额度组件：服务商目录里每一条就是一种组件，
 * 新增服务商 = 在 utils/aiProviders.js 加一条 + 在上面给它一套外观。
 */
export const AI_WIDGETS = AI_PROVIDERS.map((provider) => ({
  type: `ai.${provider.id}`,
  title: provider.title,
  summary: provider.summary,
  group: "AI 额度",
  ...APPEARANCE[provider.id],
  Component: QuotaWidget,
  // 没密钥就取不到数，卡片只会是一张空壳；checkAvailable 据此拦住添加
  settings: providerSettings(provider),
  /** 组件自己的私有数据，只有它的 Component 认识 */
  provider,
}));
