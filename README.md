# 慧购分析助手

独立个人商品比价工具。官网由 GitHub Pages 免费托管，目前手动单价比较已可使用；实时搜索的前端与安全后端已经编写，但需要独立完成云端部署和接口权限验证才能启用。商品搜索只覆盖多多客允许查询的可推广商品，不能宣称全平台最低价、完整买家评价或个人实际结算价格。

## 文件与功能

- `index.html`、`search.css`、`search.js`：响应式官网、手动比价、待激活的商品搜索与结果展示。
- `api-config.js`：只填写公开的 Worker 地址；**禁止填入任何 API 凭据**。
- `server/worker.mjs`：服务端签名、商品查询、参考券后价、可选推广链接生成、输入校验、错误处理和轻量限流。
- `server/worker.test.mjs`：使用模拟平台响应的离线自动化测试，不读取真实凭据。
- `server/wrangler.toml`：Cloudflare Worker 配置；不含应用密钥。
- `privacy.html`：隐私及数据处理说明。
- `callback.html`：仅为静态开发占位页，**不能处理 OAuth 授权回调**。
- `app-icon.png`：260×260 应用图标。

## 部署步骤（需要本人登录 Cloudflare）

1. 从项目根目录运行 `npx wrangler@latest login`，在浏览器里授权本人 Cloudflare 账户。
2. 运行 `npx wrangler@latest deploy --config server/wrangler.toml`，记录得到的 HTTPS `*.workers.dev` 地址。
3. 在**本机终端**运行以下命令，按提示直接输入凭据，避免将凭据交给聊天或公开仓库：`npx wrangler@latest secret put PDD_CLIENT_ID --config server/wrangler.toml` 和 `npx wrangler@latest secret put PDD_CLIENT_SECRET --config server/wrangler.toml`。生成推广链接还需要可用的推广位 PID：`npx wrangler@latest secret put PDD_PID --config server/wrangler.toml`。
4. 如果平台接口要求授权令牌，可在确认授权流程及权限范围后另行配置 `PDD_ACCESS_TOKEN`；当前静态 callback 页面无法取得或刷新令牌，须部署真实服务端回调。
5. 访问 Worker 的 `/api/health`，`configured: true` 只表示必要密钥已设置，**不等于真实接口调用通过**。使用浏览器官网完成一次商品关键词真实查询，检查接口权限与结果。
6. 真实查询成功后，把 Worker 的 HTTPS 根网址写入公开 `api-config.js` 的 `HUIGOU_API_BASE` 值，提交并推送 `main`。GitHub Pages 会自动部署前端。不得在公共文件写入应用密钥、Cookie 或 Access Token。

## 安全和限制

后端只应保留在有秘密存储功能的平台；密钥通过 Cloudflare Secrets 管理。开发时不得上传 `.dev.vars`、`.env` 或包含凭据的截图。内存 IP 限流只是尽力防滥用；正式公开流量较大时，需要在云平台配置持久化限速和防机器人策略。官网只允许本域跨域访问，但 HTTP Origin 并不是身份认证。

商品搜索参考价取自接口返回，预估券后价只有满足已知优惠券门槛、时间与余量时才展示。平台实际可用权限、搜索范围、推广位绑定和令牌要求，必须通过本人后台及真实接口确认。买家追评与个人结算价不是本项目目前已验证的能力。

测试：项目根目录执行 `node --test server/worker.test.mjs`；前端脚本可用 `node --check search.js` 检查语法。
