// Worker 路由逻辑集成测试(stub KV,不跑真实 LLM)
import mod from "../index.js";

const KV = {
  store: new Map(),
  async get(k, t) { const v = this.store.get(k); return v == null ? null : (t === "json" ? JSON.parse(v) : v); },
  async put(k, v) { this.store.set(k, String(v)); },
  async delete(k) { this.store.delete(k); },
  async list({ prefix }) {
    return { keys: [...this.store.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true };
  },
};
const env = { KV, TOKEN: "test-token" };

async function req(method, path, body, token) {
  const r = await mod.fetch(new Request("https://w.dev" + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { "x-token": token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }), env);
  return { status: r.status, data: await r.json() };
}

let pass = 0, fail = 0;
function t(name, cond) { cond ? pass++ : fail++; console.log(cond ? "  ✓" : "  ✗", name); }

t("无 token 返回 401", (await req("GET", "/api/items")).status === 401);
t("根路径健康检查", (await req("GET", "/")).data.ok === true);

const save = await req("POST", "/api/save", { url: "https://example.com/a", title: "测试网页", content: "正文内容", type: "web" }, "test-token");
t("保存返回 32 位 id", /^[a-f0-9]{32}$/.test(save.data.id));
t("保存返回完整条目(供客户端本地合并)", save.data.title === "测试网页" && save.data.status === "pending");

const list = await req("GET", "/api/items", null, "test-token");
t("列表含 1 条且不返回正文", list.data.items.length === 1 && list.data.items[0].has_content === true && !("content" in list.data.items[0]));

await req("POST", "/api/settings", { api_base: "https://invalid.invalid/v1", api_key: "sk-1234567890", model: "m1" }, "test-token");
let s = await req("GET", "/api/settings", null, "test-token");
t("key 掩码正确", s.data.api_key_masked === "sk-***7890");
t("完整 key 不出现在响应里", !JSON.stringify(s.data).includes("1234567890"));

await req("POST", "/api/settings", { api_key: "" }, "test-token");
s = await req("GET", "/api/settings", null, "test-token");
t("空 key 不覆盖已存配置", s.data.configured === true);

const id = save.data.id;
await req("POST", "/api/status", { id, status: "archived", summary: "PC生成的总结" }, "test-token");
const item = await req("GET", "/api/item/" + id, null, "test-token");
t("PC 回写归档状态", item.data.status === "archived");
t("PC 回写总结内容", item.data.summary === "PC生成的总结");

const biliSave = await req("POST", "/api/save", { url: "https://www.bilibili.com/video/BV1xx411c7mD", title: "B站视频", type: "bilibili" }, "test-token");
const sumNoContent = await req("POST", "/api/summarize", { id: biliSave.data.id }, "test-token");
t("无正文条目总结给出清晰提示", sumNoContent.status === 400 && sumNoContent.data.error.includes("正文"));

const sumFail = await req("POST", "/api/summarize", { id }, "test-token");
t("LLM 调用失败返回结构化错误", sumFail.status === 502 && sumFail.data.error.includes("总结生成失败"));
await req("DELETE", "/api/item/" + biliSave.data.id, null, "test-token");
t("删除成功", (await req("DELETE", "/api/item/" + id, null, "test-token")).data.ok === true);
t("删除后列表为空", (await req("GET", "/api/items", null, "test-token")).data.items.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
