# web-inbox-worker

[Web Inbox](../bili-inbox) 收集箱的 Cloudflare Worker 后端:存储网页/B站链接、管理 LLM 配置(存 KV,key 前端只回显掩码)、转发 AI 总结请求、接收 PC 归档脚本的状态回写。

客户端:双端 Edge 的 Tampermonkey 油猴脚本(`userscript/web-inbox.user.js`,本仓库也提供自动更新源)+ PC 归档脚本(本地项目 `bili-inbox/`)。

## 安装油猴脚本

脚本由 **Worker 自己托管**(路由 `/userscript.user.js`,公开访问),**部署即最新**,不依赖任何第三方 CDN——安装地址就是你自己 Worker 的地址,更新不再有 CDN 缓存延迟:

```
https://<你的Worker域名>/userscript.user.js
```

推荐统一用「**从 URL 安装**」,安装和更新走同一条路:

1. 浏览器安装 [Tampermonkey](https://www.tampermonkey.net/) 扩展(桌面 Edge/Chrome 的应用商店;安卓 Edge 商店同样上架了 Tampermonkey,双端用同一份脚本)
2. 点击浏览器工具栏的 Tampermonkey 图标 → **管理面板**
3. 切到「**实用工具**」标签 → 找到「**从 URL 安装**」→ 粘贴上面的安装地址(先把 `<你的Worker域名>` 换成第 4 步部署得到的地址)→ 点「安装」
4. 首次使用:任意网页点右下角 📥 悬浮按钮 → 「设置」→ 填 **Worker 地址**(部署后得到的 `https://<name>.<account>.workers.dev`)和 **Token**(部署时的 `WORKER_TOKEN`)→ 保存

**更新方式**(任选其一):

- **自动**:Tampermonkey 会定期按安装地址后台检查并提示更新(Worker 部署完成即最新,无缓存等待)
- **手动检查**:管理面板 → 已安装脚本里选中本脚本 → 「实用工具」→「检查更新」
- **直接覆盖**:重复上面的「从 URL 安装」,同名同 namespace 原地覆盖,本地设置不丢

> 收集箱面板底部会显示当前版本号,有新版时可直接点击打开安装页。

## 部署 Cloudflare Worker(完整步骤)

后端跑在 Cloudflare 免费额度上,零常驻服务,不需要本地环境,全程约 10 分钟。

### 1. Fork 本仓库

点右上角 Fork。Fork 后到仓库 **Actions** 标签页确认工作流已启用(若提示则点 "I understand my workflows, go ahead and enable them")。

### 2. 创建 KV 命名空间

[Cloudflare Dashboard](https://dash.cloudflare.com) → 左侧 **Storage & Databases → KV**(旧版界面在 **Workers & Pages → KV**)→ **Create namespace**,名字随意(如 `web-inbox`)→ 进入详情**复制 Namespace ID**(32 位十六进制串)。

也可以用 CLI:`npx wrangler kv namespace create KV`,取输出中的 `id`。

### 3. 记下 Account ID

Dashboard 首页右侧栏(或任意域名 Overview 页右下角)的 **Account ID**,复制。

### 4. 创建 API Token

[Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token** → 选 **"Edit Cloudflare Workers"** 模板(已包含部署 Worker 与操作 KV 所需权限)→ Create Token → **复制生成的 token**(只显示一次)。

### 5. 配置仓库 Secrets

Fork 的仓库 → **Settings → Secrets and variables → Actions** → **New repository secret**,逐个添加:

| Secret | 值 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 第 4 步生成的 token |
| `CLOUDFLARE_ACCOUNT_ID` | 第 3 步的 Account ID |
| `KV_NAMESPACE_ID` | 第 2 步的命名空间 ID |
| `WORKER_TOKEN` | 自己生成的一串随机字符(≥32 位),作为客户端访问口令;油猴脚本设置页与 PC 脚本配置里填同一个值 |

### 6. (可选)改 Worker 名字

`wrangler.toml` 中 `name = "web-inbox"` 可改成自己的名字,它决定访问域名 `https://<name>.<account-subdomain>.workers.dev`。

### 7. 部署与验证

推送到 main(或在 **Actions → Test & Deploy → Run workflow** 手动触发)→ 等所有任务变绿 → 浏览器打开 `https://<name>.<account-subdomain>.workers.dev/`,看到:

```json
{"app": "web-inbox", "ok": true, "hint": "服务正常,请通过油猴脚本或 PC 脚本访问"}
```

即部署成功。回到油猴脚本「设置」页填入 Worker 地址和 Token 即可使用。

> `wrangler.toml` 里的 `__KV_ID__` / `__WORKER_TOKEN__` 是占位符,部署时由 Action 从 Secrets 注入,真实值不会进仓库。

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
