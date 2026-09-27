# 慧购分析助手

独立个人商品比价工具，公开官网使用 GitHub Pages，云端搜索后端使用 Cloudflare Workers 免费服务。

- 官网：https://qq2301796536-spec.github.io/huigou-shopping/
- 云端状态：https://huigou-ddk-api.qq2301796536.workers.dev/api/health
- 当前进度：手动比价和云端后端已上线。Client ID、Client Secret 已保存于 Cloudflare Secrets；多多进宝账号已由用户确认绑定，但真实搜索仍需已授权备案的推广位 PID，暂时不能提供真实商品查询结果。

## 技术实现

- `index.html`、`search.css`、`search.js`：手机端官网、手动比价、待启用的多多客商品搜索及价格展示。
- `api-config.js`：仅存放公开 Worker HTTPS 地址，不得存放任何凭据。
- `server/worker.mjs`：在服务端完成签名、商品搜索、优惠券价格估算及可选推广链接生成。
- `server/wrangler.toml`：Workers 部署配置；`server/worker.test.mjs`：模拟平台响应的离线测试。
- `privacy.html`：隐私说明；`callback.html`：**静态占位页，无法处理 OAuth 授权回调。**

## 目前需要完成：推广位 PID 授权备案

用户完成「多多进宝账号绑定 Client ID」后，2026-09-27 再次实测 `pdd.ddk.goods.search`，拼多多返回 `error_code=50001`、`sub_code=60001`；相关接口说明将其解释为**未提供已经授权备案的推广位 PID / 自定义标识**。这与账号绑定是两个不同的步骤。仅凭 `/api/health` 的 `configured:true`，不能认定商品接口已可使用。

1. 由账号本人登录 [多多进宝官方后台](https://jinbao.pinduoduo.com/)，找到推广位管理，确认自己已拥有推广位 PID。如尚无推广位，请按实际页面操作创建。
2. 阅读 [多多进宝官方推广位备案说明](https://jinbao.pinduoduo.com/qa-system?questionId=204)，对将用于商品搜索的 PID 完成官方要求的授权备案。若实际页面要求本人登录、短信验证或点击授权，需本人完成；不应假称已经备案。
3. 双击本机 `C:\Users\qq230\AgentDock\huigou-configure-pid.cmd`，按提示将**推广位 PID** 输入到本机终端。脚本执行 `wrangler secret put PDD_PID`；**不要误填应用 Client ID，也不用重新输入 Client Secret。** PID 会保存到 Cloudflare Secrets，而非公开 GitHub 仓库。
4. 再次检查 `/api/health` 的 `links:true`，然后进行一次“豆腐猫砂”真实搜索。若仍返回 `PDD_PID_AUTH_REQUIRED`，核对备案 PID 与已设置的 PID 是否一致、是否已授权生效；必要时以平台官网要求为准。

## 安全与能力边界

Cloudflare Worker 中的 Client Secret 不得复制到聊天、前端 JS、GitHub 或日志。公开网站只会拿到经服务端整理过的可推广商品数据；**商品搜索不是拼多多全站搜索**，参考券后价不等于用户结算页最终付款金额。目前不提供完整买家评价和追评；推广位未备案前不展示伪造商品结果。

项目根目录可运行 `node --test server/worker.test.mjs` 和 `node --check search.js`；`server` 目录运行 `node node_modules/wrangler/bin/wrangler.js deploy` 更新 Worker。Cloudflare 内存限流为尽力保护，正式面向较大访问量时还应设置云平台限流规则。部分中国大陆网络对 GitHub Pages / workers.dev 的访问可能不稳定。
