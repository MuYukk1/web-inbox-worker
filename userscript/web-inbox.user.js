// ==UserScript==
// @name         Web Inbox 收集箱
// @name:en      Web Inbox Saver
// @description  保存网页正文/B站视频到自己的 Cloudflare Worker,双端 Edge 可用;AI 总结、历史查看、下载归档
// @namespace    https://github.com/local/web-inbox
// @version      0.2.2
// @updateURL    https://cdn.jsdelivr.net/gh/MuYukk1/web-inbox-worker@main/userscript/web-inbox.user.js
// @downloadURL  https://cdn.jsdelivr.net/gh/MuYukk1/web-inbox-worker@main/userscript/web-inbox.user.js
// @author       you
// @match        *://*/*
// @noframes
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @connect      *
// @require      https://cdn.jsdelivr.net/npm/@mozilla/readability@0.5.0/Readability.js
// ==/UserScript==

(function () {
  "use strict";

  // ---------- 工具 ----------

  const $storage = {
    get() {
      return {
        worker: GM_getValue("worker", ""),
        token: GM_getValue("token", ""),
        btnX: GM_getValue("btnX", null),
        btnY: GM_getValue("btnY", null),
      };
    },
    set(key, value) {
      GM_setValue(key, value);
    },
  };

  function gmFetch(method, path, body) {
    const { worker, token } = $storage.get();
    if (!worker || !token) return Promise.reject(new Error("请先在设置中填写 Worker 地址和 Token"));
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url: worker.replace(/\/+$/, "") + path,
        headers: { "content-type": "application/json", "x-token": token },
        data: body ? JSON.stringify(body) : undefined,
        timeout: 120000,
        onload: (r) => {
          let data;
          try {
            data = JSON.parse(r.responseText);
          } catch {
            return reject(new Error(`响应不是 JSON(${r.status}): ${r.responseText.slice(0, 120)}`));
          }
          if (r.status >= 400 || data.error) reject(new Error(data.error || `HTTP ${r.status}`));
          else resolve(data);
        },
        onerror: () => reject(new Error("网络错误(检查 Worker 地址是否正确)")),
        ontimeout: () => reject(new Error("请求超时")),
      });
    });
  }

  // CSP 安全的 DOM 构建:样式全部走 CSSOM,不用 innerHTML/style 属性
  function h(tag, styles, ...children) {
    const el = document.createElement(tag);
    if (styles) for (const [k, v] of Object.entries(styles)) el.style.setProperty(k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()), String(v));
    for (const child of children.flat()) {
      if (child == null) continue;
      el.append(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return el;
  }

  const DARK = matchMedia("(prefers-color-scheme: dark)").matches;
  const C = {
    bg: DARK ? "#1e1f24" : "#ffffff",
    bg2: DARK ? "#2a2b31" : "#f3f4f6",
    text: DARK ? "#e8e9ed" : "#1f2328",
    sub: DARK ? "#9aa0ab" : "#6b7280",
    accent: "#3b82f6",
    border: DARK ? "#3a3b41" : "#e5e7eb",
    danger: "#ef4444",
    ok: "#22c55e",
  };

  let toastEl = null;
  // 本次会话内保存的条目:KV 最终一致性(最长约60s)期间合并进列表,保存即所见
  const savedLocal = [];
  function toast(msg, isError) {
    if (toastEl) toastEl.remove();
    toastEl = h("div", {
      position: "fixed", left: "50%", top: "18px", transform: "translateX(-50%)",
      background: isError ? C.danger : "rgba(0,0,0,0.78)", color: "#fff",
      padding: "8px 16px", "border-radius": "8px", "font-size": "13px",
      "z-index": "2147483647", "max-width": "86vw", "box-shadow": "0 4px 16px rgba(0,0,0,0.25)",
    }, msg);
    document.documentElement.append(toastEl);
    setTimeout(() => toastEl && toastEl.remove(), isError ? 4200 : 2400);
  }

  // ---------- 正文提取 ----------

  const BILI_RE = /bilibili\.com\/(video|bangumi\/play)|b23\.tv/;
  function isBiliPage() {
    return BILI_RE.test(location.href);
  }

  function htmlToLines(html) {
    const div = document.createElement("div");
    div.innerHTML = html;
    const lines = [];
    div.querySelectorAll("p,h1,h2,h3,h4,li,pre,blockquote").forEach((n) => {
      const t = (n.textContent || "").trim();
      if (t) lines.push(t);
    });
    // 表格行 → "单元格 | 单元格",保证数据表不被丢弃
    div.querySelectorAll("table tr").forEach((tr) => {
      const cells = [...tr.querySelectorAll("th,td")].map((c) => (c.textContent || "").trim());
      const row = cells.join(" | ").replace(/(\s*\|\s*)+/g, " | ").trim();
      if (row && row !== "|") lines.push(row);
    });
    return lines;
  }

  // Readability 只会选"得分最高的一个容器",标签页/表格等结构常被遗漏;
  // 提取后逐个检查页面单元(p/li/tr/标题),把可见但未被覆盖的内容补进来
  const NOISE_SEL = [
    "nav,footer,header,aside,form,[role=navigation],[aria-hidden=true]",
    "[class*=cookie],[class*=consent],[class*=banner],[class*=sidebar],[class*=comment]",
    "[class*=share],[class*=social],[class*=related],[class*=recommend],[class*=popup]",
    "[class*=modal],[class*=breadcrumb],[class*=pagination],[class*=menu],[class*=nav]",
    "[id*=nav],[data-wi-ui]",
  ].join(",");
  const norm = (s) => (s || "").replace(/\s+/g, "");

  function linkRatio(el) {
    const total = norm(el.innerText).length;
    if (!total) return 1;
    let linkLen = 0;
    for (const a of el.querySelectorAll("a")) linkLen += norm(a.innerText).length;
    return linkLen / total;
  }

  function supplementLines(lines) {
    const included = norm(lines.join("\n"));
    let added = 0;
    for (const unit of document.querySelectorAll("p,li,tr,h1,h2,h3,h4,blockquote,figcaption,dt,dd")) {
      if (unit.closest(NOISE_SEL)) continue;
      let text;
      if (unit.tagName === "TR") {
        text = [...unit.querySelectorAll("th,td")]
          .map((c) => norm(c.innerText)).filter(Boolean).join(" | ");
      } else {
        text = (unit.innerText || "").trim(); // innerText 只含可见文本,天然跳过隐藏标签页
      }
      if (!text || norm(text).length < 4 || norm(text).length > 3000) continue;
      if (included.includes(norm(text))) continue;   // Readability 已覆盖
      if (linkRatio(unit) > 0.7) continue;           // 导航/下载/相关链接
      lines.push(text);
      added++;
    }
    return added;
  }

  // Readability 失败时的降级提取:找 <p> 文本量最大的容器
  function fallbackExtract() {
    const scores = new Map();
    for (const p of document.querySelectorAll("p")) {
      const len = (p.textContent || "").trim().length;
      if (len < 20) continue;
      let node = p.parentElement;
      for (let i = 0; i < 5 && node; i++, node = node.parentElement) {
        scores.set(node, (scores.get(node) || 0) + len);
      }
    }
    let best = null, bestScore = 0;
    for (const [node, score] of scores) if (score > bestScore) { best = node; bestScore = score; }
    if (!best) return { title: document.title.trim(), lines: [] };
    const lines = [];
    best.querySelectorAll("p,h1,h2,h3,h4,li").forEach((n) => {
      const t = (n.textContent || "").trim();
      if (t.length >= 8) lines.push(t);
    });
    return { title: document.title.trim(), lines: lines.slice(0, 800) };
  }

  function extractArticle() {
    let out;
    try {
      if (typeof Readability !== "undefined") {
        const doc = document.cloneNode(true);
        doc.querySelectorAll("script,style,noscript").forEach((n) => n.remove());
        const article = new Readability(doc).parse();
        if (article && article.content) {
          out = { title: article.title || document.title.trim(), lines: htmlToLines(article.content) };
        }
      }
    } catch (e) { /* 走降级 */ }
    if (!out) out = fallbackExtract();
    const base = out.lines.length;
    out.added = supplementLines(out.lines);
    out.base = base;
    return out;
  }

  // ---------- 悬浮按钮 ----------

  let panelEl = null;

  function makeButton() {
    const btn = h("div", {
      position: "fixed", "z-index": "2147483646",
      left: $storage.get().btnX != null ? $storage.get().btnX + "px" : "",
      top: $storage.get().btnY != null ? $storage.get().btnY + "px" : "",
      right: $storage.get().btnX != null ? "" : "16px",
      bottom: $storage.get().btnY != null ? "" : "96px",
      width: "46px", height: "46px", "border-radius": "50%",
      background: "rgba(59,130,246,0.92)", color: "#fff",
      display: "flex", "align-items": "center", "justify-content": "center",
      "font-size": "22px", cursor: "pointer", "user-select": "none",
      "box-shadow": "0 2px 10px rgba(0,0,0,0.3)", "touch-action": "none",
    }, "📥");
    btn.title = "Web Inbox 收集箱";
    btn.setAttribute("data-wi-ui", "1");

    let drag = null;
    btn.addEventListener("pointerdown", (e) => {
      drag = { x: e.clientX, y: e.clientY, moved: false, btnX: btn.offsetLeft, btnY: btn.offsetTop };
      btn.setPointerCapture(e.pointerId);
    });
    btn.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) {
        drag.moved = true;
        btn.style.left = Math.max(0, Math.min(innerWidth - 46, drag.btnX + dx)) + "px";
        btn.style.top = Math.max(0, Math.min(innerHeight - 46, drag.btnY + dy)) + "px";
      }
    });
    btn.addEventListener("pointerup", () => {
      if (!drag) return;
      if (drag.moved) {
        btn.style.right = "auto"; btn.style.bottom = "auto";
        $storage.set("btnX", btn.offsetLeft);
        $storage.set("btnY", btn.offsetTop);
      } else {
        togglePanel();
      }
      drag = null;
    });
    document.documentElement.append(btn);
  }

  // ---------- 面板 ----------

  function togglePanel() {
    if (panelEl) { closePanel(); return; }
    panelEl = buildPanel();
    document.documentElement.append(panelEl);
    switchTab("save");
  }

  function closePanel() {
    if (panelEl) { panelEl.remove(); panelEl = null; }
  }

  let currentTab = null, tabButtons = {}, tabPages = {};

  function buildPanel() {
    const overlay = h("div", {
      position: "fixed", inset: "0", "z-index": "2147483645",
      background: "rgba(0,0,0,0.35)", display: "flex",
      "align-items": "center", "justify-content": "center",
    });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closePanel(); });

    const tabs = h("div", { display: "flex", "border-bottom": `1px solid ${C.border}` });
    const body = h("div", { flex: "1", overflow: "auto", padding: "14px" });
    const panel = h("div", {
      width: "min(94vw, 500px)", height: "min(86vh, 720px)",
      background: C.bg, color: C.text, "border-radius": "14px",
      display: "flex", "flex-direction": "column", overflow: "hidden",
      "font-size": "14px", "line-height": "1.6",
      "font-family": "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
      "box-shadow": "0 12px 48px rgba(0,0,0,0.35)",
    }, tabs, body);
    panel.setAttribute("data-wi-ui", "1");

    for (const [key, label] of [["save", "当前页"], ["list", "已保存"], ["settings", "设置"]]) {
      const b = h("button", {
        flex: "1", padding: "12px 0", background: "none", border: "none",
        color: C.sub, "font-size": "14px", cursor: "pointer", "border-bottom": "2px solid transparent",
      }, label);
      b.addEventListener("click", () => switchTab(key));
      tabButtons[key] = b;
      tabs.append(b);
    }
    tabPages = { save: buildSaveTab, list: buildListTab, settings: buildSettingsTab };

    const state = { panel, body };
    panel._state = state;
    overlay.append(panel);
    return overlay;
  }

  function switchTab(key) {
    const overlay = panelEl;
    if (!overlay) return;
    const panel = overlay.lastChild;
    currentTab = key;
    for (const [k, b] of Object.entries(tabButtons)) {
      b.style.color = k === key ? C.accent : C.sub;
      b.style.borderBottomColor = k === key ? C.accent : "transparent";
    }
    const body = panel.lastChild;
    body.replaceChildren();
    tabPages[key](body);
  }

  // ---- Tab: 当前页 ----

  function buildSaveTab(body) {
    const bili = isBiliPage();
    const titleInput = h("input", {
      width: "100%", "box-sizing": "border-box", padding: "8px 10px",
      "border-radius": "8px", border: `1px solid ${C.border}`,
      background: C.bg2, color: C.text, "font-size": "14px",
    });
    titleInput.value = document.title.trim();

    const preview = h("div", {
      "margin-top": "10px", "max-height": "300px", overflow: "auto",
      padding: "10px", background: C.bg2, "border-radius": "8px",
      "white-space": "pre-wrap", "font-size": "13px", color: C.sub,
    }, "点击「提取正文预览」查看将保存的内容");

    const result = { lines: null, title: null };
    const extractBtn = mkBtn("提取正文预览", () => {
      const r = extractArticle();
      result.lines = r.lines;
      result.title = r.title;
      titleInput.value = r.title || titleInput.value;
      const stat = r.added > 0
        ? `…(Readability 主体 ${r.base} 段 + 补充遗漏 ${r.added} 条,共 ${r.lines.length} 条)`
        : `…(共 ${r.lines.length} 段)`;
      preview.replaceChildren(
        (r.lines.length ? r.lines.slice(0, 60).join("\n") + stat : "未能提取到正文"),
      );
      preview.style.color = C.text;
    });

    const saveBtn = mkBtn("保存到收集箱", C.accent, true, async () => {
      if (!bili && !result.lines) {
        toast("请先提取正文预览");
        return;
      }
      saveBtn.disabled = true;
      try {
        const saved = await gmFetch("POST", "/api/save", {
          url: location.href.split("#")[0],
          title: titleInput.value.trim() || location.href,
          site: location.hostname,
          type: bili ? "bilibili" : "web",
          content: bili ? "" : (result.lines || []).join("\n\n"),
        });
        savedLocal.unshift(saved);
        toast("已保存 ✓");
      } catch (e) {
        toast("保存失败: " + e.message, true);
      }
      saveBtn.disabled = false;
    });

    const hint = h("div", { "margin-top": "10px", "font-size": "12px", color: C.sub },
      bili
        ? "检测到 B 站视频页:只保存链接,PC 归档脚本会自动下载字幕并生成总结。"
        : "保存的是提取后的正文(Readability),不是整个页面;PC 归档脚本会把它落盘为 markdown。");

    body.append(
      h("div", { "font-weight": "600", "margin-bottom": "8px" }, "标题"),
      titleInput,
      bili ? "" : h("div", { display: "flex", gap: "8px", "margin-top": "10px" }, extractBtn, saveBtn),
      bili ? h("div", { "margin-top": "10px" }, saveBtn) : "",
      preview,
      hint,
    );
  }

  // ---- Tab: 已保存列表 ----

  function buildListTab(body) {
    const loading = h("div", { color: C.sub, padding: "20px", "text-align": "center" }, "加载中…");
    body.append(loading);
    gmFetch("GET", "/api/items")
      .then(({ items }) => {
        body.replaceChildren();
        // 合并本地暂存的新条目(KV 传播延迟期间),已传播到的从暂存中清掉
        const remoteIds = new Set(items.map((x) => x.id));
        for (let i = savedLocal.length - 1; i >= 0; i--) {
          if (remoteIds.has(savedLocal[i].id)) savedLocal.splice(i, 1);
        }
        const localMerged = savedLocal
          .filter((x) => !remoteIds.has(x.id))
          .map((x) => ({ ...x, has_summary: !!x.summary, has_content: !!x.content }));
        items = localMerged.concat(items);
        if (!items.length) {
          body.append(h("div", { color: C.sub, padding: "20px", "text-align": "center" }, "还没有保存过内容"));
          return;
        }
        for (const it of items) body.append(renderListItem(it));
      })
      .catch((e) => {
        loading.textContent = "加载失败: " + e.message;
        loading.style.color = C.danger;
      });
  }

  function renderListItem(it) {
    const date = new Date(it.created_at).toLocaleString("zh-CN", { hour12: false });
    const badges = h("span", { "font-size": "11px" },
      it.type === "bilibili" ? " 📺B站" : "",
      it.has_summary ? " ✨已总结" : "",
      it.status === "archived" ? " ✅已归档" : "");
    const row = h("div", {
      padding: "10px", "border-bottom": `1px solid ${C.border}`, cursor: "pointer",
    },
      h("div", { "font-weight": "600", "overflow": "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }, it.title),
      h("div", { "font-size": "12px", color: C.sub, "margin-top": "2px" }, `${it.site} · ${date}`, badges),
    );
    row.addEventListener("click", () => openDetail(row, it.id));
    return row;
  }

  function openDetail(row, id) {
    const existing = row.nextSibling && row.nextSibling._detail ? row.nextSibling : null;
    if (existing) { existing.remove(); return; }
    const local = savedLocal.find((x) => x.id === id);
    // 本地暂存(KV 传播期间)优先,避免单条读取撞上副本延迟而 404
    Promise.resolve(local ? local : gmFetch("GET", "/api/item/" + id))
      .then((it) => {
        const detail = h("div", { padding: "10px", background: C.bg2, "border-bottom": `1px solid ${C.border}` });
        detail._detail = true;

        const summaryBox = h("div", {
          "white-space": "pre-wrap", "font-size": "13px", padding: "8px",
          background: C.bg, "border-radius": "8px", "margin-top": "8px",
        }, it.summary || "(还没有总结)");

        const sumBtn = mkBtn("生成 AI 总结", async () => {
          sumBtn.disabled = true;
          sumBtn.style.opacity = "0.55";
          sumBtn.textContent = "⏳ 生成中…";
          summaryBox.textContent = "⏳ 正在生成总结,长文可能需要 30~60 秒,请保持面板打开…";
          try {
            const r = await gmFetch("POST", "/api/summarize", { id });
            summaryBox.textContent = r.summary;
            toast("总结完成 ✓");
          } catch (e) {
            toast(e.message, true);
            summaryBox.textContent = "✗ 总结失败: " + e.message;
          }
          sumBtn.disabled = false;
          sumBtn.style.opacity = "";
          sumBtn.textContent = "重新生成总结";
        });

        const dlBtn = mkBtn("下载 .md", () => {
          const md = `# ${it.title}\n\n> 来源: ${it.url}\n> 时间: ${new Date(it.created_at).toLocaleString("zh-CN", { hour12: false })}\n\n## AI 总结\n\n${it.summary || "(无)"}\n\n## 正文\n\n${it.content || "(B站视频,正文见归档文件夹)"}\n`;
          downloadText(it.title.replace(/[\\/:*?"<>|]/g, " ").slice(0, 60) + ".md", md);
        });

        const delBtn = mkBtn("删除", C.danger, false, () => {
          if (!confirm("确定删除这条记录?")) return;
          gmFetch("DELETE", "/api/item/" + id)
            .then(() => { toast("已删除"); switchTab("list"); })
            .catch((e) => toast(e.message, true));
        });

        detail.append(
          h("div", { display: "flex", gap: "8px", "flex-wrap": "wrap" }, sumBtn, dlBtn, delBtn),
          summaryBox,
          it.content ? h("details", { "margin-top": "8px" },
            h("summary", { cursor: "pointer", color: C.sub, "font-size": "12px" }, "查看正文"), "") : "",
        );
        if (it.content) {
          const c = h("div", { "white-space": "pre-wrap", "font-size": "13px", "margin-top": "6px", "max-height": "260px", overflow: "auto" }, it.content);
          detail.lastChild.append(c);
        }
        row.after(detail);
      })
      .catch((e) => toast(e.message, true));
  }

  function downloadText(filename, text) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // ---- Tab: 设置 ----

  function buildSettingsTab(body) {
    const { worker, token } = $storage.get();
    const field = (labelText, input) =>
      h("div", { "margin-bottom": "12px" },
        h("div", { "font-size": "12px", color: C.sub, "margin-bottom": "4px" }, labelText), input);

    // autocomplete 属性抑制浏览器把配置项当成登录表单自动填充
    const noAutofill = (input, kind) => {
      input.setAttribute("autocomplete", kind || "off");
      input.setAttribute("name", "wi-" + Math.random().toString(36).slice(2, 8));
      return input;
    };
    const workerInput = noAutofill(mkInput(worker, "https://web-inbox.xxx.workers.dev"));
    const tokenInput = noAutofill(mkInput(token, "部署 Worker 时在 wrangler.toml 里设置的 TOKEN"));
    const apiBaseInput = noAutofill(mkInput("", "https://api.deepseek.com/v1"));
    const apiKeyInput = noAutofill(mkInput("", "留空/保持掩码则不修改"), "new-password");
    apiKeyInput.type = "password";
    const modelSelect = h("select", {
      width: "100%", padding: "8px 10px", "border-radius": "8px",
      border: `1px solid ${C.border}`, background: C.bg2, color: C.text,
    }, h("option", { value: "" }, "← 点击下方「刷新模型列表」或先手动保存 api_base"));
    const modelInput = noAutofill(mkInput("", "下拉没有时,手动输入模型名"));
    modelSelect.addEventListener("change", () => { if (modelSelect.value) modelInput.value = modelSelect.value; });

    const saveLocal = mkBtn("保存连接信息", () => {
      $storage.set("worker", workerInput.value.trim());
      $storage.set("token", tokenInput.value.trim());
      toast("已保存连接信息 ✓");
    });

    const loadCfg = mkBtn("读取云端 LLM 配置", () => {
      $storage.set("worker", workerInput.value.trim());
      $storage.set("token", tokenInput.value.trim());
      gmFetch("GET", "/api/settings")
        .then((s) => {
          apiBaseInput.value = s.api_base || "";
          modelInput.value = s.model || "";
          apiKeyInput.value = "";
          apiKeyInput.placeholder = s.api_key_masked ? `当前: ${s.api_key_masked}(不改则保留)` : "sk-…";
          toast("已读取云端配置 ✓");
        })
        .catch((e) => toast(e.message, true));
    });

    const saveCfg = mkBtn("保存 LLM 配置到云端", C.accent, true, () => {
      $storage.set("worker", workerInput.value.trim());
      $storage.set("token", tokenInput.value.trim());
      gmFetch("POST", "/api/settings", {
        api_base: apiBaseInput.value.trim(),
        api_key: apiKeyInput.value.trim(),
        model: modelInput.value.trim(),
      })
        .then((s) => {
          apiKeyInput.value = "";
          apiKeyInput.placeholder = s.api_key_masked ? `当前: ${s.api_key_masked}` : "";
          toast("LLM 配置已保存 ✓");
        })
        .catch((e) => toast(e.message, true));
    });

    const refreshModels = mkBtn("刷新模型列表", () => {
      $storage.set("worker", workerInput.value.trim());
      $storage.set("token", tokenInput.value.trim());
      gmFetch("POST", "/api/models", {})
        .then(({ models, current }) => {
          modelSelect.replaceChildren(h("option", { value: "" }, `共 ${models.length} 个模型`));
          for (const m of models) modelSelect.append(h("option", { value: m }, m));
          if (current && models.includes(current)) modelSelect.value = current;
          if (current) modelInput.value = current;
        })
        .catch((e) => toast(e.message, true));
    });

    body.append(
      field("Worker 地址", workerInput),
      field("Token", tokenInput),
      h("div", { display: "flex", gap: "8px", margin: "12px 0" }, saveLocal, loadCfg),
      h("div", { height: "1px", background: C.border, margin: "12px 0" }),
      field("LLM API Base(OpenAI 兼容)", apiBaseInput),
      field("API Key(存服务端 KV,前端只回显掩码)", apiKeyInput),
      field("模型(先保存 api_base/key 后可拉列表)", modelSelect),
      field("或手动输入模型名", modelInput),
      h("div", { display: "flex", gap: "8px", "flex-wrap": "wrap" }, saveCfg, refreshModels),
    );
  }

  // ---------- 小部件 ----------

  function mkBtn(label, color, primary, onClick) {
    if (typeof color === "function") { onClick = color; color = undefined; primary = false; }
    const b = h("button", {
      padding: "8px 14px", "border-radius": "8px", cursor: "pointer",
      "font-size": "13px", border: `1px solid ${color || C.border}`,
      background: primary ? (color || C.accent) : "transparent",
      color: primary ? "#fff" : (color || C.text),
    }, label);
    b.addEventListener("click", onClick);
    return b;
  }

  function mkInput(value, placeholder) {
    const i = h("input", {
      width: "100%", "box-sizing": "border-box", padding: "8px 10px",
      "border-radius": "8px", border: `1px solid ${C.border}`,
      background: C.bg2, color: C.text, "font-size": "14px",
    });
    i.value = value || "";
    i.placeholder = placeholder || "";
    return i;
  }

  // ---------- 启动 ----------

  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand("打开收集箱", togglePanel);
  }
  makeButton();
})();
