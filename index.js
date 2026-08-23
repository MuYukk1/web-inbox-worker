// Web Inbox Worker — 油猴脚本与 PC 归档脚本的共享后端
// KV 结构:
//   settings      → { api_base, api_key, model }
//   item:<id>     → { id, url, title, site, type, content, created_at,
//                     summary?, summarized_at?, status, archive? }
// 鉴权:请求头 x-token === 环境变量 TOKEN(部署前在 wrangler.toml 里修改)

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type,x-token",
  "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
};

const SUMMARY_PROMPT = [
  "你是一个信息整理助手。用户会给你一篇网页正文,请用中文输出结构化总结,格式为:",
  "## 核心结论\n(1-3 句话说清这个内容讲什么、价值在哪)",
  "## 要点\n(- 按逻辑顺序列出 3-8 个关键要点,保留具体数据/结论/方法名,不要空泛)",
  "## 值得记住的细节\n(可选,最多 3 条,如金句、工具名、引用来源)",
  "只输出总结本身,不要复述原文。",
].join("\n");

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function bad(msg, status = 400) {
  return json({ error: msg }, status);
}

function maskKey(key) {
  if (!key) return "";
  return key.length <= 6 ? "***" : key.slice(0, 3) + "***" + key.slice(-4);
}

function newId() {
  return crypto.randomUUID().replace(/-/g, "");
}

async function getSettings(KV) {
  const s = await KV.get("settings", "json");
  return s || { api_base: "", api_key: "", model: "" };
}

async function callLLM(settings, system, user) {
  const base = settings.api_base.replace(/\/+$/, "");
  const resp = await fetch(base + "/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + settings.api_key,
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
    }),
  });
  if (!resp.ok) {
    throw new Error(`LLM 接口返回 ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("LLM 返回了空内容");
  return content;
}

async function listItems(KV) {
  const out = [];
  let cursor;
  do {
    const page = await KV.list({ prefix: "item:", cursor });
    out.push(...page.keys.map((k) => k.name.slice(5)));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: JSON_HEADERS });
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const KV = env.KV;

    if (path === "/") {
      return json({ app: "web-inbox", ok: true, hint: "服务正常,请通过油猴脚本或 PC 脚本访问" });
    }

    // 鉴权
    const token = request.headers.get("x-token") || url.searchParams.get("token");
    if (!env.TOKEN || token !== env.TOKEN) return bad("token 无效", 401);

    // ---- 保存 ----
    if (path === "/api/save" && request.method === "POST") {
      const body = await request.json();
      const urlStr = String(body.url || "").trim();
      if (!/^https?:\/\//.test(urlStr)) return bad("url 不合法");
      const item = {
        id: newId(),
        url: urlStr,
        title: String(body.title || urlStr).slice(0, 500),
        site: String(body.site || new URL(urlStr).hostname),
        type: body.type === "bilibili" ? "bilibili" : "web",
        content: String(body.content || ""),
        created_at: Date.now(),
        summary: "",
        summarized_at: 0,
        status: "pending",
        archive: null,
      };
      await KV.put("item:" + item.id, JSON.stringify(item));
      // 返回完整条目:客户端本地合并进列表,规避 KV 最终一致性(最长约60s)带来的显示延迟
      return json(item);
    }

    // ---- 列表 ----
    if (path === "/api/items" && request.method === "GET") {
      const ids = await listItems(KV);
      const items = [];
      for (const id of ids) {
        const it = await KV.get("item:" + id, "json");
        if (!it) continue;
        const full = url.searchParams.get("full") === "1";
        items.push(
          full
            ? it
            : {
                id: it.id,
                url: it.url,
                title: it.title,
                site: it.site,
                type: it.type,
                created_at: it.created_at,
                has_summary: !!it.summary,
                has_content: !!it.content,
                status: it.status,
                archive: it.archive,
              },
        );
      }
      items.sort((a, b) => b.created_at - a.created_at);
      return json({ items });
    }

    // ---- 单条 ----
    const mItem = path.match(/^\/api\/item\/([a-f0-9]+)$/);
    if (mItem) {
      const it = await KV.get("item:" + mItem[1], "json");
      if (!it) return bad("条目不存在", 404);
      if (request.method === "GET") return json(it);
      if (request.method === "DELETE") {
        await KV.delete("item:" + mItem[1]);
        return json({ ok: true });
      }
    }

    // ---- 手动生成总结 ----
    if (path === "/api/summarize" && request.method === "POST") {
      try {
        const { id } = await request.json();
        const it = await KV.get("item:" + id, "json");
        if (!it) return bad("条目不存在", 404);
        if (!it.content) return bad("该条目没有正文(B站视频请等 PC 归档时生成字幕总结)");
        const settings = await getSettings(KV);
        if (!settings.api_base || !settings.api_key || !settings.model)
          return bad("请先在设置中配置 api_base / api_key / model");
        const summary = await callLLM(settings, SUMMARY_PROMPT, `标题:${it.title}\n\n${it.content}`);
        it.summary = summary;
        it.summarized_at = Date.now();
        await KV.put("item:" + id, JSON.stringify(it));
        return json({ summary });
      } catch (e) {
        return bad("总结生成失败: " + e.message, 502);
      }
    }

    // ---- PC 归档回写状态(可附带总结) ----
    if (path === "/api/status" && request.method === "POST") {
      const body = await request.json();
      const it = await KV.get("item:" + body.id, "json");
      if (!it) return bad("条目不存在", 404);
      it.status = body.status === "pending" ? "pending" : "archived";
      it.archive = body.archive || null;
      if (body.summary) {
        it.summary = body.summary;
        it.summarized_at = Date.now();
      }
      await KV.put("item:" + body.id, JSON.stringify(it));
      return json({ ok: true });
    }

    // ---- LLM 设置 ----
    if (path === "/api/settings") {
      const settings = await getSettings(KV);
      if (request.method === "GET") {
        return json({
          api_base: settings.api_base,
          model: settings.model,
          api_key_masked: maskKey(settings.api_key),
          configured: !!(settings.api_base && settings.api_key && settings.model),
        });
      }
      if (request.method === "POST") {
        const body = await request.json();
        const next = {
          api_base: String(body.api_base ?? settings.api_base).trim(),
          // key 传空/掩码/未变时保留原值
          api_key:
            !body.api_key || body.api_key.includes("***") ? settings.api_key : String(body.api_key).trim(),
          model: String(body.model ?? settings.model).trim(),
        };
        await KV.put("settings", JSON.stringify(next));
        return json({ ok: true, api_key_masked: maskKey(next.api_key) });
      }
    }

    // ---- 拉取模型列表(Worker 代理,避免浏览器 CORS) ----
    if (path === "/api/models" && request.method === "POST") {
      const settings = await getSettings(KV);
      if (!settings.api_base || !settings.api_key) return bad("请先保存 api_base 和 api_key");
      try {
        const base = settings.api_base.replace(/\/+$/, "");
        const resp = await fetch(base + "/models", {
          headers: { authorization: "Bearer " + settings.api_key },
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        const models = (data.data || []).map((x) => x.id).filter(Boolean).sort();
        return json({ models, current: settings.model });
      } catch (e) {
        return bad("拉取模型列表失败: " + e.message + "(可直接手动输入模型名)");
      }
    }

    return bad("接口不存在: " + path, 404);
  },
};
