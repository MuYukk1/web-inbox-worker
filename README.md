# web-inbox-worker

[Web Inbox](../bili-inbox) 收集箱的 Cloudflare Worker 后端:存储网页/B站链接、管理 LLM 配置(存 KV,key 前端只回显掩码)、转发 AI 总结请求、接收 PC 归档脚本的状态回写。

客户端:双端 Edge 的 Tampermonkey 油猴脚本(`userscript/web-inbox.user.js`,本仓库也提供自动更新源)+ PC 归档脚本(本地项目 `bili-inbox/`)。

## 安装油猴脚本

Tampermonkey(篡改猴)中新建脚本,或直接在**装有 Tampermonkey 的浏览器**打开下面的安装地址:

- 安装/更新地址(CDN 加速):`https://cdn.jsdelivr.net/gh/MuYukk1/web-inbox-worker@main/userscript/web-inbox.user.js`
- 源文件:`userscript/web-inbox.user.js`

脚本头部已配置 `@updateURL` / `@downloadURL`,Tampermonkey 会定期自动检查更新(也可以在 TM 管理面板手动点"检查更新")。注意 jsDelivr CDN 有数小时缓存,刚 push 的新版本可能要等缓存刷新;急着用时从仓库 raw 地址手动安装。

## 通过 GitHub Action 自动部署

推送(或手动触发)即自动测试并部署。需要在仓库 **Settings → Secrets and variables → Actions** 添加 4 个 secrets:

| Secret | 说明 | 获取方式 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | 部署凭证 | [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) → 用 **Edit Cloudflare Workers** 模板创建 |
| `CLOUDFLARE_ACCOUNT_ID` | 账户 ID | Cloudflare Dashboard 首页右侧栏 |
| `KV_NAMESPACE_ID` | KV 命名空间 ID | 本地或 [dashboard](https://dash.cloudflare.com) 创建一次:`npx wrangler kv namespace create KV`,取输出的 `id` |
| `WORKER_TOKEN` | 客户端鉴权 Token | 自己生成一串随机字符(油猴脚本与 PC 脚本设置里填同一个值) |

真实配置不进仓库:`wrangler.toml` 中为占位符,部署时由 Action 注入。

## 本地开发

```bash
npm install -g wrangler
wrangler kv namespace create KV   # 把 id 填入 wrangler.toml,并把 TOKEN 改为随机串
npm test                          # 路由逻辑测试(stub KV,无外部依赖)
wrangler deploy
```

## API 一览

所有 `/api/*` 请求需带 `x-token` 请求头(值 = `WORKER_TOKEN`):

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/save` | 保存条目 `{url, title, site, type, content}` |
| GET | `/api/items` | 列表(摘要,不含正文;`?full=1` 全量) |
| GET/DELETE | `/api/item/:id` | 单条 / 删除 |
| POST | `/api/summarize` | 对条目正文生成 AI 总结 `{id}` |
| POST | `/api/status` | PC 归档脚本回写 `{id, status, archive, summary}` |
| GET/POST | `/api/settings` | LLM 配置(GET 回显掩码 key;POST 留空/掩码不覆盖) |
| POST | `/api/models` | 代理拉取 `{api_base}/models` 模型列表 |

## 说明

仅用于个人收藏同步,数据全在自己账号的 KV 中;`WORKER_TOKEN` 等同访问密码,请勿外传。
