import { createHash } from "node:crypto";

const GATEWAY = "https://gw-api.pinduoduo.com/api/router";
const SITE = "https://qq2301796536-spec.github.io";
const recent = new Map();
const cache = new Map();
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store", ...extra }
});
const safeUrl = (value) => {
  try { const u = new URL(value); return u.protocol === "https:" ? u.href : null; }
  catch { return null; }
};
const int = value => Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;
export function signParams(params, secret) {
  const raw = secret + Object.keys(params).sort()
    .map(key => key + String(params[key])).join("") + secret;
  return createHash("md5").update(raw, "utf8").digest("hex").toUpperCase();
}
export function normalizeGoods(g, now = Math.floor(Date.now() / 1000)) {
  const group = int(g.min_group_price);
  const normal = int(g.min_normal_price);
  const discount = int(g.coupon_discount);
  const threshold = int(g.coupon_min_order_amount);
  const stock = g.coupon_remain_quantity == null ? null : int(g.coupon_remain_quantity);
  const starts = int(g.coupon_start_time), ends = int(g.coupon_end_time);
  const eligible = Boolean(g.has_coupon !== false && discount && group && (!threshold || group >= threshold)
    && (stock === null || stock > 0) && (!starts || starts <= now) && (!ends || ends > now));
  return {
    goods_sign: typeof g.goods_sign === "string" ? g.goods_sign.slice(0, 256) : "",
    name: String(g.goods_name || "").slice(0, 240),
    image: safeUrl(g.goods_thumbnail_url || g.goods_image_url),
    mall: String(g.mall_name || "").slice(0, 100),
    group_price_cents: group || null,
    normal_price_cents: normal || null,
    coupon_cents: discount || null,
    coupon_threshold_cents: threshold || null,
    coupon_eligible: eligible,
    estimated_after_coupon_cents: group ? (eligible ? Math.max(0, group - discount) : group) : null,
    sales_tip: String(g.sales_tip || g.sales || "").slice(0, 35)
  };
}
function rateLimit(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now(); const old = (recent.get(ip) || []).filter(t => now - t < 60_000);
  if (old.length >= 12) { recent.set(ip, old); return false; }
  old.push(now); recent.set(ip, old);
  if (recent.size > 3000) recent.clear();
  return true; // best effort only: not a substitute for Cloudflare edge rate limits
}
async function callPdd(type, args, env) {
  const params = { client_id: env.PDD_CLIENT_ID, type, data_type: "JSON",
    timestamp: Math.floor(Date.now() / 1000), ...args };
  if (env.PDD_ACCESS_TOKEN) params.access_token = env.PDD_ACCESS_TOKEN;
  params.sign = signParams(params, env.PDD_CLIENT_SECRET);
  const response = await fetch(GATEWAY, { method: "POST", redirect: "error",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params), signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error("PDD_HTTP_" + response.status);
  const result = await response.json();
  if (result.error_response) {
    const code = int(result.error_response.error_code);
    throw new Error("PDD_API_" + code);
  }
  return result;
}
function cors(origin) {
  return { "Access-Control-Allow-Origin": origin, "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type" };
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url), origin = request.headers.get("Origin");
    const allowed = env.SITE_ORIGIN || SITE;
    if (request.method === "OPTIONS") return origin === allowed
      ? new Response(null, { status: 204, headers: cors(allowed) })
      : json({ error: "ORIGIN_DENIED" }, 403);
    if (request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
    if (url.pathname === "/api/health") return json({
      service: "huigou-ddk-api", configured: Boolean(env.PDD_CLIENT_ID && env.PDD_CLIENT_SECRET),
      links: Boolean(env.PDD_PID), search: "pdd.ddk.goods.search", note: "配置就绪不代表接口权限已经验证"
    }, 200, origin === allowed ? cors(allowed) : {});
    if (origin !== allowed) return json({ error: "ORIGIN_DENIED" }, 403);
    const headers = cors(allowed);
    if (!["/api/search", "/api/link"].includes(url.pathname))
      return json({ error: "NOT_FOUND" }, 404, headers);
    if (!env.PDD_CLIENT_ID || !env.PDD_CLIENT_SECRET)
      return json({ error: "CONFIG_REQUIRED" }, 503, headers);
    if (!rateLimit(request)) return json({ error: "TOO_MANY_REQUESTS" }, 429, headers);
    try {
      if (url.pathname === "/api/search") {
        const keyword = (url.searchParams.get("q") || "").trim();
        const page = Math.min(50, Math.max(1, int(url.searchParams.get("page") || 1)));
        if (keyword.length < 2 || keyword.length > 60)
          return json({ error: "QUERY_LENGTH_INVALID" }, 400, headers);
        const listId = (url.searchParams.get("list_id") || "").trim();
        if (listId.length > 300) return json({ error: "LIST_ID_INVALID" }, 400, headers);
        const key = JSON.stringify([keyword, page, listId]), now = Date.now();
        const cached = cache.get(key);
        if (cached && now - cached.when < 45_000) return json(cached.data, 200, headers);
        const args = { keyword, page, page_size: 20 };
        if (page > 1 && listId) args.list_id = listId;
        const raw = await callPdd("pdd.ddk.goods.search", args, env);
        if (!raw.goods_search_response || !Array.isArray(raw.goods_search_response.goods_list))
          throw new Error("PDD_FORMAT");
        const result = { items: raw.goods_search_response.goods_list.map(g => normalizeGoods(g)),
          total: int(raw.goods_search_response.total_count), page,
          list_id: raw.goods_search_response.list_id || "",
          as_of: new Date().toISOString(), source: "多多客可推广商品（非全平台）" };
        cache.set(key, { when: now, data: result });
        if (cache.size > 300) cache.clear();
        return json(result, 200, headers);
      }
      if (!env.PDD_PID) return json({ error: "PID_REQUIRED" }, 501, headers);
      const goodsSign = (url.searchParams.get("goods_sign") || "").trim();
      if (!/^[a-zA-Z0-9_+/=-]{8,256}$/.test(goodsSign))
        return json({ error: "GOODS_SIGN_INVALID" }, 400, headers);
      const raw = await callPdd("pdd.ddk.goods.promotion.url.generate", {
        p_id: env.PDD_PID, goods_sign_list: JSON.stringify([goodsSign]),
        generate_short_url: "true", generate_we_app: "false"
      }, env);
      const list = raw.goods_promotion_url_generate_response?.goods_promotion_url_list || [];
      const item = list[0] || {};
      const link = safeUrl(item.mobile_short_url || item.short_url || item.mobile_url || item.url);
      if (!link || !["yangkeduo.com", "pinduoduo.com", "pdd.cn"].some(d => {
        const host = new URL(link).hostname; return host === d || host.endsWith("." + d);
      })) throw new Error("PDD_LINK_FORMAT");
      return json({ url: link, disclosure: "推广链接，实际到手价以结算页为准" }, 200, headers);
    } catch (err) {
      const code = /^PDD_(HTTP|API)_[0-9]+$/.test(err.message) ? err.message : "UPSTREAM_UNAVAILABLE";
      return json({ error: code }, 502, headers);
    }
  }
};