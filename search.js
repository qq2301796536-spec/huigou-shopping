(() => {
  "use strict";
  const form = document.getElementById("liveSearchForm");
  if (!form) return;
  const query = document.getElementById("liveQuery");
  const submit = document.getElementById("liveSearchButton");
  const status = document.getElementById("liveStatus");
  const results = document.getElementById("liveResults");
  const sort = document.getElementById("liveSort");
  const tools = document.getElementById("liveTools");
  const prev = document.getElementById("livePrev");
  const next = document.getElementById("liveNext");
  const pageText = document.getElementById("livePage");
  const paging = document.getElementById("livePaging");
  const config = (window.HUIGOU_API_BASE || "").replace(/\/+$/, "");
  let api = "", page = 1, currentTerm = "", listId = "";
  let current = [], total = 0, linksAvailable = false, pending = false;
  function msg(message, mode = "") {
    status.className = "search-status " + mode; status.textContent = message;
  }
  function money(cents) {
    return cents == null ? "待核实" : "¥" + (Number(cents) / 100).toFixed(2);
  }
  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = String(text);
    return el;
  }
  function add(parent, tag, className, text) {
    const el = element(tag, className, text); parent.appendChild(el); return el;
  }
  function makeCard(g) {
    const card = element("article", "goods-card");
    if (g.image && /^https:\/\//i.test(g.image)) {
      const image = element("img");
      image.src = g.image; image.alt = g.name || "商品图片";
      image.loading = "lazy"; image.referrerPolicy = "no-referrer";
      card.appendChild(image);
    } else add(card, "div", "goods-image-placeholder", "暂无商品图");
    const body = add(card, "div", "goods-body");
    add(body, "h3", "goods-title", g.name || "商品名称未提供");
    if (g.mall) add(body, "p", "goods-mall", "商家：" + g.mall);
    const price = add(body, "div", "goods-price");
    price.textContent = money(g.estimated_after_coupon_cents);
    add(price, "small", null, g.coupon_eligible ? " 参考券后价" : " 团购参考价");
    if (g.coupon_eligible)
      add(body, "span", "goods-coupon", "符合已知门槛时减" + money(g.coupon_cents));
    if (g.normal_price_cents && g.normal_price_cents > g.group_price_cents)
      add(body, "p", "goods-info", "普通参考价：" + money(g.normal_price_cents));
    if (g.sales_tip) add(body, "p", "goods-info", "平台销量标注：" + g.sales_tip);
    add(body, "p", "goods-note", "实际应付价、运费及优惠适用性请以结算页为准");
    const actions = add(body, "div", "goods-actions");
    const copy = add(actions, "button", null, "复制商品名称");
    copy.type = "button";
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(g.name || ""); copy.textContent = "已复制"; }
      catch { copy.textContent = "请长按商品标题复制"; }
    });
    if (linksAvailable && g.goods_sign) {
      const link = add(actions, "button", null, "获取推广链接");
      link.type = "button";
      link.addEventListener("click", async () => {
        link.disabled = true; link.textContent = "生成中…";
        try {
          const p = new URLSearchParams({ goods_sign: g.goods_sign });
          const response = await fetch(api + "/api/link?" + p, { cache: "no-store" });
          const data = await response.json();
          if (!response.ok || !data.url) throw new Error(data.error || "UNAVAILABLE");
          const url = new URL(data.url);
          if (url.protocol !== "https:") throw new Error("BAD_LINK");
          window.open(url.href, "_blank", "noopener,noreferrer");
          link.textContent = "再次打开推广链接";
        } catch { link.textContent = "链接暂不可用，稍后重试"; }
        finally { link.disabled = false; }
      });
    }
    return card;
  }
  function render() {
    results.replaceChildren();
    if (!current.length) {
      add(results, "div", "goods-empty",
        "当前查询没有可推广商品。可以换个关键词，商品搜索范围并不等于拼多多全站。");
    } else {
      const grid = add(results, "div", "search-grid");
      const items = [...current];
      if (sort.value === "price") items.sort((a, b) =>
        (a.estimated_after_coupon_cents ?? Infinity) -
        (b.estimated_after_coupon_cents ?? Infinity));
      items.forEach(g => grid.appendChild(makeCard(g)));
    }
    tools.hidden = false;
    paging.hidden = !current.length;
    pageText.textContent = "第 " + page + " 页" + (total ? " · 匹配约 " + total + " 件" : "");
    prev.disabled = pending || page <= 1;
    next.disabled = pending || (total > 0 && page * 20 >= total) || current.length < 20;
  }
  async function search(targetPage, term) {
    if (pending || !api) return;
    const text = String(term || "").trim();
    if (text.length < 2 || text.length > 60) {
      msg("请输入 2～60 个字的商品关键词。", "error"); return;
    }
    const same = text === currentTerm;
    if (!same || targetPage === 1) listId = "";
    pending = true; submit.disabled = true; prev.disabled = true; next.disabled = true;
    msg("正在查询平台允许检索的可推广商品…", "ok");
    try {
      const params = new URLSearchParams({ q: text, page: String(targetPage) });
      if (targetPage > 1 && listId) params.set("list_id", listId);
      const response = await fetch(api + "/api/search?" + params, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "UNAVAILABLE");
      page = targetPage; currentTerm = text; current = data.items || [];
      total = Number(data.total) || 0;
      listId = data.list_id || "";
      msg("已查询到多多客可推广商品 · 报价为查询时的参考信息", "ok");
      render();
    } catch (err) {
      const desc = err.message === "TOO_MANY_REQUESTS" ? "操作太频繁，请稍后重试。"
        : /^PDD_API_/.test(err.message) ? "商品接口返回错误 " + err.message + "，需核对平台权限。"
        : "暂时无法查询商品。请核对后端部署、密钥及接口权限。";
      msg(desc, "error");
    } finally {
      pending = false; submit.disabled = false; prev.disabled = page <= 1;
      next.disabled = !current.length || current.length < 20 || (total > 0 && page * 20 >= total);
    }
  }
  form.addEventListener("submit", e => {
    e.preventDefault(); search(1, query.value);
  });
  sort.addEventListener("change", () => { if (current.length) render(); });
  prev.addEventListener("click", () => { if (page > 1) search(page - 1, currentTerm); });
  next.addEventListener("click", () => { if (current.length) search(page + 1, currentTerm); });
  (async function initialize() {
    try {
      if (!config) return msg("实时搜索正在接入：安全后端尚未发布。手动比价已可使用。");
      const parsed = new URL(config);
      if (parsed.protocol !== "https:") throw new Error("INVALID_URL");
      api = parsed.origin;
      const response = await fetch(api + "/api/health", { cache: "no-store" });
      const info = await response.json();
      if (!response.ok || info.service !== "huigou-ddk-api") throw new Error("INVALID_BACKEND");
      if (!info.configured) return msg("后端已经部署，正在等待安全配置 API 凭据。");
      linksAvailable = Boolean(info.links);
      submit.disabled = false;
      msg("搜索后端已连接。实际可用性以平台接口返回为准。", "ok");
    } catch { msg("搜索服务尚未就绪，可先使用下方手动比价。", "error"); }
  })();
})();