import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import worker, { signParams, normalizeGoods } from "./worker.mjs";

const SITE = "https://qq2301796536-spec.github.io";
const testEnv = { PDD_CLIENT_ID: "unit_test_id", PDD_CLIENT_SECRET: "unit_test_secret", PDD_PID: "unit_pid" };
let counter = 0;
function request(path, init = {}) {
  return new Request("https://huigou.example" + path, { headers: {
    Origin: SITE, "CF-Connecting-IP": "unit-test-" + (++counter), ...init.headers
  }, method: init.method || "GET" });
}
test("signed parameters use upper-case MD5 and sorted key/value concatenation", () => {
  const params = { z: "中文", a: "12" };
  const expected = createHash("md5")
    .update("secret" + "a12" + "z中文" + "secret", "utf8").digest("hex").toUpperCase();
  assert.equal(signParams(params, "secret"), expected);
  assert.match(signParams(params, "secret"), /^[0-9A-F]{32}$/);
});
test("normalize quoted prices from fen and apply only eligible coupons", () => {
  const sample = { goods_sign:"abc123abc123", goods_name:"测试商品", min_group_price:2999,
    min_normal_price:3599, coupon_discount:500, coupon_min_order_amount:2900,
    coupon_remain_quantity:3, coupon_start_time:100, coupon_end_time:2000, mall_name:"测试商家" };
  const item = normalizeGoods(sample, 1000);

  assert.equal(item.estimated_after_coupon_cents, 2499);
  assert.equal(item.coupon_eligible, true);
  assert.equal(normalizeGoods({...sample, coupon_min_order_amount:3000}, 1000).coupon_eligible, false);
  assert.equal(normalizeGoods({...sample, coupon_remain_quantity:0}, 1000).coupon_eligible, false);
  assert.equal(normalizeGoods({...sample, coupon_end_time:900}, 1000).coupon_eligible, false);
  assert.equal(normalizeGoods({...sample, coupon_start_time:1200}, 1000).coupon_eligible, false);
  assert.equal(normalizeGoods({...sample, has_coupon:false}, 1000).coupon_eligible, false);
});
test("health does not expose application credentials", async () => {
  const response = await worker.fetch(request("/api/health"), testEnv);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.equal(JSON.parse(body).service, "huigou-ddk-api");
  assert.equal(JSON.parse(body).links, true);
  assert.ok(!body.includes(testEnv.PDD_CLIENT_SECRET));
});
test("disallowed origin cannot trigger product search", async () => {
  const response = await worker.fetch(request("/api/search?q=豆腐猫砂",
    {headers:{Origin:"https://attacker.example"}}), testEnv);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
});
test("missing secrets block search and short queries are rejected", async () => {
  assert.equal((await worker.fetch(request("/api/search?q=猫砂"), {})).status, 503);
  assert.equal((await worker.fetch(request("/api/search?q=x"), testEnv)).status, 400);
});
test("mocked DDK search: normalized response, signature and safe public result", async () => {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, "https://gw-api.pinduoduo.com/api/router");
    assert.equal(options.method, "POST");
    const args = Object.fromEntries(new URLSearchParams(options.body));
    assert.equal(args.keyword, "豆腐猫砂");
    assert.equal(args.page, "1");
    assert.equal(args.page_size, "20");
    assert.equal(args.type, "pdd.ddk.goods.search");
    const sign = args.sign; delete args.sign;
    assert.equal(sign, signParams(args, testEnv.PDD_CLIENT_SECRET));
    return new Response(JSON.stringify({ goods_search_response: {
      goods_list:[{goods_sign:"goodsSIGN123456", goods_name:"测试猫砂", min_group_price:2599,
        coupon_discount:300,coupon_min_order_amount:0,mall_name:"测试店铺"}],
      total_count:1,list_id:"test_list_id"
    }}), {status:200, headers:{"Content-Type":"application/json"}});
  };
  try {
    const q = "/api/search?q=" + encodeURIComponent("豆腐猫砂");
    const response = await worker.fetch(request(q), testEnv);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), SITE);
    const body = await response.json();
    assert.equal(body.total, 1);
    assert.equal(body.items[0].estimated_after_coupon_cents, 2299);
    assert.equal(body.list_id,"test_list_id");
    assert.ok(!JSON.stringify(body).includes(testEnv.PDD_CLIENT_SECRET));
    const cached = await worker.fetch(request(q), testEnv);
    assert.equal(cached.status, 200);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
test("missing PID blocks promotion URL generation", async () => {
  const env = {...testEnv}; delete env.PDD_PID;
  const response = await worker.fetch(request("/api/link?goods_sign=abcdefgh123"), env);
  assert.equal(response.status, 501);
});
test("mocked link generation returns only approved HTTPS domains", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const args = Object.fromEntries(new URLSearchParams(options.body));
    assert.equal(args.type,"pdd.ddk.goods.promotion.url.generate");
    assert.equal(args.goods_sign_list,'["abcdefgh123"]');
    assert.equal(args.p_id,"unit_pid");
    return new Response(JSON.stringify({goods_promotion_url_generate_response:{
      goods_promotion_url_list:[{short_url:"https://p.pinduoduo.com/mockpromo"}]
    }}),{status:200});
  };
  try {
    const response = await worker.fetch(request("/api/link?goods_sign=abcdefgh123"), testEnv);
    assert.equal(response.status,200);
    assert.equal((await response.json()).url,"https://p.pinduoduo.com/mockpromo");
  } finally { globalThis.fetch = original; }
});
test("upstream errors are sanitized and no secret is returned", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    error_response:{error_code:80001,error_msg:testEnv.PDD_CLIENT_SECRET}
  }), {status:200});
  try {
    const response = await worker.fetch(request("/api/search?q=安全测试"), testEnv);
    assert.equal(response.status,502);
    const body = await response.text();
    assert.equal(JSON.parse(body).error,"PDD_API_80001");
    assert.ok(!body.includes(testEnv.PDD_CLIENT_SECRET));
  } finally { globalThis.fetch = original; }
});
test("reject off-platform promotion links", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    goods_promotion_url_generate_response:{
      goods_promotion_url_list:[{short_url:"https://phishing.example/offer"}]
    }}), {status:200});
  try {
    const response = await worker.fetch(request("/api/link?goods_sign=abcdefgh123"), testEnv);
    assert.equal(response.status,502);
    assert.equal((await response.json()).error,"UPSTREAM_UNAVAILABLE");
  } finally { globalThis.fetch = original; }
});
