# 慧购分析助手

一个独立的个人商品搜索与比价工具。官网使用 GitHub Pages，云端 API 使用 Cloudflare Workers。

- 官网：https://qq2301796536-spec.github.io/huigou-shopping/
- 云端健康检查：https://huigou-ddk-api.qq2301796536.workers.dev/api/health
- 当前状态：Client ID、Client Secret 和推广位 PID 安全保存在 Cloudflare Secrets；多多进宝授权已经完成，已通过真实多多客商品搜索和推广链接生成验证。

## 已验证的功能

2026 年 9 月 27 日授权完成后，实时调用 `pdd.ddk.goods.search`：
- 搜索“豆腐猫砂”：HTTP 200，当前页 20 件可推广商品；本页发现 1 件符合已知优惠条件的商品，团购参考价 48.70 元、优惠券 20.00 元，预估券后价 28.70 元。注意价格和优惠券随时变化。
- 搜索“抽纸”：HTTP 200，当前页 20 件可推广商品。本次查询当前页未发现可用优惠券。
- 使用返回的一个商品 `goods_sign` 生成推广短链接：HTTP 200，域名属于拼多多。

搜索仅覆盖多多客授权查询的可推广商品，不代表拼多多全平台，也不保证最低价格。最终应付金额以实际结算页面为准；当前不具备完整买家评价、追评或用户登录后结算价获取能力。

## 技术结构

- `index.html`、`search.css`、`search.js`：响应式商品搜索、价格及优惠券参考展示、手动单价比较。
- `api-config.js`：仅存放公开的 Worker HTTPS 地址，不得放入任何凭据。
- `server/worker.mjs`：服务器端签名、搜索、券后价估算、推广链接及请求校验。
- `server/wrangler.toml`：Workers 发布配置，`server/worker.test.mjs`：离线模拟测试。
- `privacy.html`：隐私说明；`callback.html`：仅为静态开发占位页，**不能处理 OAuth 授权回调**。

## 部署与安全

Cloudflare Secrets 保存 `PDD_CLIENT_ID`、`PDD_CLIENT_SECRET`、`PDD_PID`，不能把它们写入前端、公开 GitHub、访问日志或聊天。云端健康检查的配置布尔值只反映凭据是否存在；是否真正可用，须通过真实商品请求验证。

本机项目根目录可运行 `node --test server/worker.test.mjs`、`node --check search.js`。在 `server` 目录执行 `node node_modules/wrangler/bin/wrangler.js deploy` 更新后端。流量增大后应在 Cloudflare 另行配置边缘限流及防滥用规则。部分中国大陆网络可能无法稳定访问 GitHub Pages 或 workers.dev。
