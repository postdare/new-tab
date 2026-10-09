import Storage from "~/utils/storage";

/* AI 额度类 provider 的公共部分：带超时的请求、TTL 缓存、provider 工厂。 */

/** 新标签页生命周期只有几秒，超时后直接落到缓存值，不重试 */
const TIMEOUT_MS = 8000;
/** 缓存有效期：期内打开新标签页直接读缓存，不发请求 */
const CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * 带超时的 JSON GET。失败时抛出带 type 的错误：
 * unauthorized | timeout | http | network
 * headers 可覆盖默认鉴权头：Antix 一类走 cookie 的 provider 传
 * { Cookie: "antix_session=" }，值会自动拼上密钥；此时 apiKey 本身不进 Bearer。
 * statusReason(status, body) 把 401/403 的响应体翻成人话（返回
 * { message, short? }）：同一个状态码背后可能是不同的病因——opencode 的
 * 403 就是「工作区没有 Go 订阅」，报「密钥失效」会把人引去换密钥。
 */
export async function requestJson(url, apiKey, headers, statusReason) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        ...headers,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } catch (err) {
    const error = new Error(
      err?.name === "AbortError" ? "请求超时" : "网络请求失败"
    );
    error.type = err?.name === "AbortError" ? "timeout" : "network";
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    const reason = statusReason
      ? statusReason(
          response.status,
          await response.json().catch(() => null)
        )
      : null;
    const error = new Error(reason?.message || "密钥失效");
    error.type = "unauthorized";
    /* 卡片上的短标签：状态行塞不下整句话 */
    error.short = reason?.short || null;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(`接口返回 ${response.status}`);
    error.type = "http";
    throw error;
  }

  return response.json();
}

/* 缓存写在 db.cache 表，该表已在 exportSnapshot 的 skipTables 中，不会外流 */
async function readCache(cacheKey) {
  try {
    const row = await Storage.get(cacheKey);
    return row?.value || null;
  } catch (err) {
    console.error("读取额度缓存失败:", err);
    return null;
  }
}

export function clearProviderCache(cacheKey) {
  return Storage.remove(cacheKey).catch(() => {});
}

/**
 * 组件读取额度的统一入口，返回 { data, updatedAt, error }：
 * - 缓存未过期且非强制刷新时不发请求；
 * - 请求失败但有缓存时，返回旧数据 + error，由组件呈现「陈旧」；
 * - 401 无论有没有缓存都要冒泡，因为那是必须动手修的状态。
 */
export async function loadWithCache(cacheKey, fetcher, { force = false } = {}) {
  const cached = await readCache(cacheKey);
  const fresh =
    cached?.updatedAt && Date.now() - cached.updatedAt < CACHE_TTL_MS;

  if (!force && fresh) {
    return { data: cached.data, updatedAt: cached.updatedAt, error: null };
  }

  try {
    const data = await fetcher();
    const updatedAt = Date.now();
    try {
      await Storage.set(cacheKey, { value: { data, updatedAt } });
    } catch (err) {
      console.error("写入额度缓存失败:", err);
    }
    return { data, updatedAt, error: null };
  } catch (err) {
    const error = {
      type: err?.type || "network",
      message: err?.message || "请求失败",
      /* 卡片状态行上的短标签，由 provider 的 statusReason 给出 */
      short: err?.short || null,
    };
    if (error.type === "unauthorized") {
      return { data: null, updatedAt: null, error };
    }
    return {
      data: cached?.data || null,
      updatedAt: cached?.updatedAt || null,
      error,
    };
  }
}


/**
 * 一个额度 provider 的取数三件套。各 provider 只需提供端点与 normalize，
 * 请求、超时、错误分型、缓存策略全部落在这里。
 */
export function defineProvider({ cacheKey, url, normalize, headers, statusReason }) {
  const verify = async (apiKey) =>
    normalize(
      await requestJson(
        url,
        // cookie 型鉴权把凭据放进 headers 模板，不走 Bearer
        headers ? null : apiKey,
        headers
          ? Object.fromEntries(
              Object.entries(headers).map(([k, v]) => [k, `${v}${apiKey}`])
            )
          : undefined,
        statusReason
      )
    );
  return {
    /** 跳过缓存直接请求，用于首选项里的「测试并保存」 */
    verify,
    load: (apiKey, options) => loadWithCache(cacheKey, () => verify(apiKey), options),
    clearCache: () => clearProviderCache(cacheKey),
  };
}
