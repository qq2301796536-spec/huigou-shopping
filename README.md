# 慧购分析助手

独立个人商品比价工具，已上线公开官网，后端部署在独立的 Cloudflare Worker 免费服务上。

- 官网：https://qq2301796536-spec.github.io/huigou-shopping/
- 后端健康检查：https://huigou-ddk-api.qq2301796536.workers.dev/api/health
- 当前进度：手动单价比较已可使用，实时商品搜索界面和后端已部署。**真正的多多客商品查询尚需安全配置 API 凭据、验证接口权限，配置完成前前端搜索按钮保持禁用。**

## 技术实现

- `index.html`、`search.css`、`search.js`：手机端自适应的手动比价与待启用实时商品搜索界面。
- `api-config.js`：只存放公开的 Worker URL，绝不放任何密钥。
- `server/worker.mjs`：服务器端 API 请求签名、搜索、参考券后价、可选推广链接、请求校验和限流。
- `server/wrangler.toml`：免费 Worker 发布配置，包含兼容 Node Crypto 的标志。
- `server/worker.test.mjs`：不使用真实凭据的单元测试。
- `privacy.html`：输入数据和托管服务说明；`callback.html` 是静态占位页，**不是可用的 OAuth 授权回调处理器**。

## 下一步：由账户本人在电脑上配置密钥

电脑的 AgentDock 文件夹内准备有私有的 `huigou-configure-secrets.cmd`，没有上传到公开 GitHub。双击后根据提示，在**电脑本地终端**依次输入自己拼多多开放平台应用的 Client ID 和 Client Secret；切勿把密钥发到聊天或提交到代码仓库。脚本调用 Wrangler 将两项凭据写入 Cloudflare Secrets。

如果在其他电脑上操作，进入 `server` 目录先运行 `npm.cmd ci --include=optional --no-audit --no-fund`，再逐一运行 `node node_modules/wrangler/bin/wrangler.js secret put PDD_CLIENT_ID` 和 `node node_modules/wrangler/bin/wrangler.js secret put PDD_CLIENT_SECRET`。Linux/macOS 则用 `npm` 而非 `npm.cmd`。若 Cloudflare 需要登录，可先运行 `node node_modules/wrangler/bin/wrangler.js login`。

配置完成后，通过 Worker 的 `/api/health` 核查 `configured:true`。注意这**仅代表凭据已配置**，不保证平台授予实际搜索权限；须在官网执行一次真实商品查询才能确认。

推广链接还需要在有推广位的前提下设置 `PDD_PID` Secret。买家完整评论/追评以及个人结算页最终付款金额不是目前已验证的多多客接口能力。

## 维护与安全

所有请求在 Worker 服务器端签名；公开 GitHub Pages 不存储 Client Secret、Access Token、密码或 Cookie。当前仅有尽力的内存限流，公开规模较大时要额外配置 Cloudflare 限流和反滥用规则。GitHub Pages 或 workers.dev 在部分中国大陆网络下的访问可能不稳定。

项目根目录运行 `node --test server/worker.test.mjs`、`node --check search.js`。在 `server` 目录运行 `node node_modules/wrangler/bin/wrangler.js deploy` 更新后端。
