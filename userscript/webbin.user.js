// ==UserScript==
// @name         Webbin 收集箱
// @name:en      Webbin Saver
// @description  保存网页正文/B站视频到自己的 Cloudflare Worker,双端 Edge 可用;B站视频可抓取字幕/评论,AI 总结、历史查看、下载归档
// @namespace    https://github.com/local/webbin
// @version      0.7.1
// @updateURL    /userscript.user.js
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
// @icon         data:image/png;base64,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
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

  // ---------- B站视频:字幕 / 评论提取 ----------

  // GM_xmlhttpRequest 封装:绕过页面 CORS/ referer 限制,浏览器 cookie 照常携带
  function gmRequest(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET", url, timeout: 30000,
        onload: resolve,
        onerror: () => reject(new Error("网络请求失败")),
        ontimeout: () => reject(new Error("请求超时")),
      });
    });
  }

  /* WI-PURE-BEGIN —— 纯函数区:无 DOM/网络依赖,test-bili.mjs 会抽取这段做单测 */

  // wbi 混淆表(公开算法,来自 bilibili-API-collect)
  const MIXIN_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5,
    49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55,
    40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57,
    62, 11, 36, 20, 34, 44, 52,
  ];
  const MD5_S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const MD5_K = [
    3614090360, 3905402710, 606105819, 3250441966, 4118548399, 1200080426, 2821735955, 4249261313,
    1770035416, 2336552879, 4294925233, 2304563134, 1804603682, 4254626195, 2792965006, 1236535329,
    4129170786, 3225465664, 643717713, 3921069994, 3593408605, 38016083, 3634488961, 3889429448,
    568446438, 3275163606, 4107603335, 1163531501, 2850285829, 4243563512, 1735328473, 2368359562,
    4294588738, 2272392833, 1839030562, 4259657740, 2763975236, 1272893353, 4139469664, 3200236656,
    681279174, 3936430074, 3572445317, 76029189, 3654602809, 3873151461, 530742520, 3299628645,
    4096336452, 1126891415, 2878612391, 4237533241, 1700485571, 2399980690, 4293915773, 2240044497,
    1873313359, 4264355552, 2734768916, 1309151649, 4149444226, 3174756917, 718787259, 3951481745,
  ];

  // 标准 MD5(RFC 1321),hex 输出;crypto.subtle 不支持 MD5,只能手写
  function md5(input) {
    const bytes = new TextEncoder().encode(input);
    const n = bytes.length;
    const padded = new Uint8Array((((n + 8) >> 6) + 1) << 6);
    padded.set(bytes);
    padded[n] = 0x80;
    const dv = new DataView(padded.buffer);
    dv.setUint32(padded.length - 8, (n * 8) >>> 0, true);
    dv.setUint32(padded.length - 4, Math.floor(n / 536870912), true);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    const M = new Int32Array(16);
    for (let off = 0; off < padded.length; off += 64) {
      for (let i = 0; i < 16; i++) M[i] = dv.getInt32(off + i * 4, true);
      let A = a0, B = b0, Cc = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16)      { F = (B & Cc) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & Cc); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ Cc ^ D;          g = (3 * i + 5) % 16; }
        else             { F = Cc ^ (B | ~D);       g = (7 * i) % 16; }
        F = (F + A + MD5_K[i] + M[g]) | 0;
        const rot = (F << MD5_S[i]) | (F >>> (32 - MD5_S[i]));
        A = D; D = Cc; Cc = B;
        B = (B + rot) | 0;
      }
      a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + Cc) | 0; d0 = (d0 + D) | 0;
    }
    let out = "";
    for (const x of [a0, b0, c0, d0]) {
      for (let i = 0; i < 4; i++) out += ((x >>> (i * 8)) & 0xff).toString(16).padStart(2, "0");
    }
    return out;
  }

  // wbi 签名:与 bilibili-API-collect / PC 端 bilibili_api.py 算法一致
  function buildWbiQuery(mixinKey, params, wts) {
    const p = { wts: wts, ...params };
    const query = Object.keys(p).sort()
      .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(String(p[k]).replace(/[!'()*]/g, "")))
      .join("&");
    return query + "&w_rid=" + md5(mixinKey + query);
  }

  // 字幕优先级:人工中文(zh-CN) > AI 中文(ai-zh) > 其他中文 > 任意
  function pickSubtitle(subs) {
    const rank = (s) => {
      const lan = s.lan || "";
      if (lan === "zh-CN") return 0;
      if (lan === "ai-zh") return 1;
      if (lan.startsWith("zh")) return 2;
      return 3;
    };
    return subs.length ? subs.reduce((a, b) => (rank(b) < rank(a) ? b : a)) : null;
  }

  function lanLabel(lan) {
    return { "zh-CN": "中文(人工)", "ai-zh": "中文(AI识别)" }[lan] || lan;
  }

  function fmtClock(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
             : `${m}:${String(ss).padStart(2, "0")}`;
  }

  // json3 字幕 body → 带时间戳的逐行文本;跳过空行和连续重复行(AI 字幕常见)
  function subtitleToLines(body) {
    const lines = [];
    let last = "";
    for (const seg of body) {
      const t = (seg.content || "").replace(/\s+/g, " ").trim();
      if (!t || t === last) continue;
      last = t;
      lines.push(`[${fmtClock(seg.from)}] ${t}`);
    }
    return lines;
  }

  function fmtComment(r, idx, isTop) {
    const uname = (r.member && r.member.uname) || "匿名";
    const when = new Date((r.ctime || 0) * 1000).toLocaleString("zh-CN", { hour12: false });
    const out = [
      `${isTop ? "[置顶] " : ""}#${idx} ${uname} · ${when} · 👍${r.like || 0}`,
      ((r.content && r.content.message) || "").trim(),
    ];
    const subs = r.replies || [];
    // 未整楼抓取时只展示接口内嵌的前几条预览
    const shown = r.fullReplies ? subs : subs.slice(0, 3);
    for (const s of shown) {
      out.push(`    ↳ ${((s.member && s.member.uname) || "?")}: ${((s.content && s.content.message) || "").trim()}`);
    }
    if ((r.rcount || 0) > shown.length) out.push(`    (另有 ${r.rcount - shown.length} 条回复)`);
    return out.filter((x) => x.trim()).join("\n");
  }

  /* WI-PURE-END */

  async function biliApi(path, params) {
    const mixinKey = await getWbiKey();
    const qs = buildWbiQuery(mixinKey, params, Math.floor(Date.now() / 1000));
    const r = await gmRequest("https://api.bilibili.com" + path + "?" + qs);
    let j;
    try { j = JSON.parse(r.responseText); } catch { throw new Error("B站接口返回了非 JSON 内容"); }
    if (j.code === 0) return j.data;
    const e = new Error(
      j.code === -101 ? "B站登录已失效,请先在本页面重新登录"
      : j.code === -352 ? "B站风控拦截(-352),稍后再试"
      : `B站接口[${j.code}]: ${j.message || "未知错误"}`,
    );
    e.code = j.code;
    throw e;
  }

  // nav 接口本身不签名(否则与 biliApi 互相等待造成死锁)
  let wbiKeyPromise = null;
  function getWbiKey() {
    if (!wbiKeyPromise) {
      const p = gmRequest("https://api.bilibili.com/x/web-interface/nav").then((r) => {
        let j;
        try { j = JSON.parse(r.responseText); } catch { throw new Error("B站接口返回了非 JSON 内容"); }
        // 未登录时 nav 返回 -101,但 wbi_img 照常下发,只看数据在不在
        if (!j.data || !j.data.wbi_img) throw new Error(`获取 wbi key 失败[${j.code}]`);
        const stem = (u) => (u || "").split("/").pop().replace(/\.(png|webp)$/, "");
        const raw = stem(j.data.wbi_img.img_url) + stem(j.data.wbi_img.sub_url);
        return MIXIN_TAB.map((i) => raw[i]).join("").slice(0, 32);
      });
      p.catch(() => { wbiKeyPromise = null; }); // 失败后允许重试
      wbiKeyPromise = p;
    }
    return wbiKeyPromise;
  }

  // 普通视频页(www/m.bilibili.com 的 BV、av 链接);番剧、影视等不走字幕/评论抓取
  function getBiliVideoPage() {
    if (!/^(www|m)?\.bilibili\.com$/.test(location.hostname)) return null;
    const m = location.pathname.match(/\/video\/([^/]+)/);
    if (!m) return null;
    const tok = m[1];
    const page = parseInt(new URLSearchParams(location.search).get("p") || "1", 10) || 1;
    if (/^BV[0-9A-Za-z]{10}$/.test(tok)) return { bvid: tok, page };
    if (/^av\d+$/i.test(tok)) return { bvid: tok.toLowerCase(), page };
    return null;
  }

  // 视频信息(aid/cid/标题/UP/分P),同一次面板会话内缓存
  let viewCache = null;
  function getView(vp) {
    const key = vp.bvid + ":" + vp.page;
    if (viewCache && viewCache.key === key) return viewCache.p;
    const params = /^av/.test(vp.bvid) ? { aid: parseInt(vp.bvid.slice(2), 10) } : { bvid: vp.bvid };
    viewCache = {
      key,
      p: biliApi("/x/web-interface/view", params).then((d) => {
        const pages = d.pages || [];
        const idx = Math.min(vp.page, pages.length || 1) - 1;
        const pg = pages[idx] || {};
        return {
          aid: d.aid, bvid: d.bvid, title: d.title,
          owner: (d.owner && d.owner.name) || "",
          cid: pg.cid || d.cid, part: pg.part || "",
          pageIndex: idx + 1, pages: pages.length || 1, duration: d.duration || 0,
        };
      }),
    };
    return viewCache.p;
  }

  function biliItemHeader(v, extra) {
    const link = "https://www.bilibili.com/video/" + v.bvid + (v.pages > 1 ? "/?p=" + v.pageIndex : "");
    const L = [`视频: ${v.title}`, `UP主: ${v.owner || "?"}`];
    if (v.pages > 1) L.push(`分P: ${v.pageIndex}/${v.pages} ${v.part}`.trim());
    if (v.duration) L.push(`时长: ${fmtClock(v.duration)}`);
    if (extra) L.push(...extra);
    L.push(`链接: ${link}`);
    return { text: L.join("\n"), link };
  }

  // 返回 { url, baseTitle, suffix, stat, content } 供面板保存
  async function saveBiliSubtitle(vp) {
    const v = await getView(vp);
    const data = await biliApi("/x/player/wbi/v2", { aid: v.aid, bvid: v.bvid, cid: v.cid });
    const chosen = pickSubtitle((data.subtitle && data.subtitle.subtitles) || []);
    if (!chosen) throw new Error("没有可用字幕(视频无 CC 字幕,或未登录看不到 AI 字幕)");
    const r = await gmRequest(String(chosen.subtitle_url).replace(/^\/\//, "https://"));
    let body;
    try { body = JSON.parse(r.responseText).body || []; } catch { throw new Error("字幕文件解析失败"); }
    const lines = subtitleToLines(body);
    if (!lines.length) throw new Error("字幕内容为空");
    const head = biliItemHeader(v, [`字幕: ${lanLabel(chosen.lan)} · ${lines.length} 段`]);
    return {
      url: head.link, baseTitle: v.title, suffix: "字幕",
      stat: `已抓取字幕 ${lines.length} 段(${lanLabel(chosen.lan)})`,
      content: head.text + "\n\n" + lines.join("\n"),
    };
  }

  // 评论主接口(网页版同款):按热度 + 游标分页;风控(-352)时带着已抓到的返回
  async function fetchCommentsMain(v, maxMain) {
    const main = [];
    let top = null, allCount = 0, offset = "";
    for (let i = 0; i < 10 && main.length < maxMain; i++) {
      let data;
      try {
        data = await biliApi("/x/v2/reply/main", {
          oid: v.aid, type: 1, mode: 3, plat: 1,
          pagination_str: JSON.stringify({ offset }),
        });
      } catch (e) {
        if (e.code === -352) break;
        throw e;
      }
      if (data.cursor && data.cursor.all_count) allCount = data.cursor.all_count;
      if (i === 0 && data.top && data.top.upper) top = data.top.upper;
      const replies = data.replies || [];
      if (!replies.length) break;
      main.push(...replies);
      const next = data.cursor && data.cursor.pagination_reply && data.cursor.pagination_reply.next_offset;
      if (!next) break;
      offset = next;
    }
    return { main, top, allCount, legacy: false };
  }

  // 旧版接口兜底:普通分页;未登录时可能只有部分数据,楼中楼同样内嵌在前几条
  async function fetchCommentsLegacy(v, maxMain) {
    const main = [];
    let allCount = 0;
    for (let pn = 1; pn <= 10 && main.length < maxMain; pn++) {
      const data = await biliApi("/x/v2/reply", { type: 1, oid: v.aid, sort: 2, pn, ps: 20 });
      if (data.page && data.page.count) allCount = data.page.count;
      const replies = data.replies || [];
      if (!replies.length) break;
      main.push(...replies);
    }
    return { main, top: null, allCount, legacy: true };
  }

  // 楼中楼接口:按 root 分页拉取某条主楼下的全部回复
  async function fetchReplies(v, root, onProgress) {
    const all = [];
    for (let pn = 1; pn <= 20; pn++) {
      let data;
      try {
        data = await biliApi("/x/v2/reply/reply", { type: 1, oid: v.aid, root, pn, ps: 20 });
      } catch (e) {
        if (e.code === -352) break;
        throw e;
      }
      const replies = data.replies || [];
      if (!replies.length) break;
      all.push(...replies);
      const count = (data.page && data.page.count) || all.length;
      if (all.length >= count) break;
    }
    onProgress && onProgress(all.length);
    return all;
  }

  // 按热度抓主楼评论(含接口附带的楼中楼前几条),最多 100 条
  async function saveBiliComments(vp, maxMain = 100, onProgress) {
    const v = await getView(vp);
    let { main, top, allCount, legacy } = await fetchCommentsMain(v, maxMain);
    if (!main.length) ({ main, top, allCount, legacy } = await fetchCommentsLegacy(v, maxMain));
    const seen = new Set();
    const uniq = [];
    for (const r of (top ? [top, ...main] : main)) {
      const id = r.rpid_str || String(r.rpid);
      if (seen.has(id)) continue;
      seen.add(id);
      uniq.push(r);
      if (uniq.length >= maxMain) break;
    }
    if (!uniq.length) throw new Error("没有抓到评论(接口返回为空)");
    // 楼中楼整楼抓取:内嵌预览装不下(r.count > 3)的主楼,翻页拉全回复
    let replyTotal = 0;
    const needFull = uniq.filter((r) => (r.rcount || 0) > (r.replies || []).length);
    for (let i = 0; i < needFull.length; i++) {
      const r = needFull[i];
      const full = await fetchReplies(v, r.rpid_str || String(r.rpid));
      if (full.length) {
        // 去掉与内嵌预览重复的,楼中楼按时间正序展示
        const seenSub = new Set(full.map((s) => s.rpid_str || String(s.rpid)));
        const extra = (r.replies || []).filter((s) => !seenSub.has(s.rpid_str || String(s.rpid)));
        r.replies = [...full, ...extra].sort((a, b) => (a.ctime || 0) - (b.ctime || 0));
        r.fullReplies = true;
        replyTotal += r.replies.length;
      }
      if (onProgress) onProgress(`楼中楼 ${i + 1}/${needFull.length}(已取 ${replyTotal} 条回复)`);
    }
    const blocks = uniq.map((r, i) => fmtComment(r, i + 1, r === top));
    const head = biliItemHeader(v, [
      `评论: 按热度,共 ${allCount || "?"} 条,已保存 ${uniq.length} 条` +
        (needFull.length ? `,含楼中楼 ${replyTotal} 条` : "(含楼中楼)") +
        (legacy ? ",旧接口可能不完整" : ""),
    ]);
    return {
      url: head.link, baseTitle: v.title, suffix: "热门评论",
      stat: `已抓取评论 ${uniq.length}/${allCount || "?"} 条` +
        (needFull.length ? ` + 楼中楼 ${replyTotal} 条` : ""),
      content: head.text + "\n\n" + blocks.join("\n\n"),
    };
  }

  // ---------- 悬浮按钮 ----------

  let panelEl = null;

  // 悬浮球圆形图标(项目等距风图标量化后内嵌,免外部请求)
  const FLOAT_ICON = "data:image/png;base64,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";

  const IS_MOBILE = matchMedia("(pointer: coarse)").matches || innerWidth < 700;
  const BTN_SIZE = IS_MOBILE ? 38 : 46;

  function makeButton() {
    const btn = h("div", {
      position: "fixed", "z-index": "2147483646",
      left: $storage.get().btnX != null ? $storage.get().btnX + "px" : "",
      top: $storage.get().btnY != null ? $storage.get().btnY + "px" : "",
      right: $storage.get().btnX != null ? "" : "16px",
      bottom: $storage.get().btnY != null ? "" : "96px",
      width: BTN_SIZE + "px", height: BTN_SIZE + "px", "border-radius": "50%",
      background: `url("${FLOAT_ICON}") center/cover no-repeat, rgba(59,130,246,0.92)`,
      display: "flex", "align-items": "center", "justify-content": "center",
      cursor: "pointer", "user-select": "none",
      "box-shadow": "0 2px 10px rgba(0,0,0,0.3)", "touch-action": "none",
    });
    btn.title = "Webbin 收集箱";
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
        btn.style.left = Math.max(0, Math.min(innerWidth - BTN_SIZE, drag.btnX + dx)) + "px";
        btn.style.top = Math.max(0, Math.min(innerHeight - BTN_SIZE, drag.btnY + dy)) + "px";
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

  // 版本信息:当前版本号 + 对照 Worker 自身的脚本路由是否最新(结果缓存 10 分钟)
  // 更新源 = 已配置的 Worker 地址 + /userscript.user.js(Worker 托管脚本,部署即最新)
  const updateUrl = () => {
    const base = ($storage.get().worker || "").replace(/\/+$/, "");
    return base ? base + "/userscript.user.js" : "";
  };
  const SCRIPT_VERSION =
    (typeof GM_info !== "undefined" && GM_info.script && GM_info.script.version) || "0.7.1";
  let versionCache = null;

  function renderVersionFooter(el, v) {
    el.replaceChildren(`Webbin v${SCRIPT_VERSION} · `);
    if (v.mode === "latest") {
      el.append("✓ 已是最新");
    } else if (v.mode === "old") {
      const a = h("span", { color: C.accent, cursor: "pointer", "text-decoration": "underline" },
        `可更新 → v${v.latest}`);
      a.title = "点击打开脚本页安装;也可在油猴菜单 → 管理面板 → 实用工具 → 从 URL 安装";
      a.addEventListener("click", () => { const u = updateUrl(); if (u) window.open(u, "_blank"); });
      el.append(a);
    } else if (v.mode === "noworker") {
      el.append("未配置 Worker 地址");
    } else {
      el.append("检查更新失败");
    }
  }

  function initVersionFooter(el) {
    if (versionCache && Date.now() - versionCache.at < 10 * 60 * 1000) {
      renderVersionFooter(el, versionCache);
      return;
    }
    const url = updateUrl();
    if (!url) {
      versionCache = { at: Date.now(), mode: "noworker" };
      renderVersionFooter(el, versionCache);
      return;
    }
    el.textContent = `Webbin v${SCRIPT_VERSION} · 检查更新中…`;
    gmRequest(url)
      .then((r) => {
        const m = (r.responseText || "").match(/@version\s+([0-9][0-9.]*)/);
        if (!m) throw new Error("bad version");
        versionCache = {
          at: Date.now(),
          latest: m[1],
          mode: cmpVersion(m[1], SCRIPT_VERSION) > 0 ? "old" : "latest",
        };
      })
      .catch(() => { versionCache = { at: Date.now(), mode: "error" }; })
      .then(() => { if (el.isConnected) renderVersionFooter(el, versionCache); });
  }

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

    const tabs = h("div", { display: "flex", "border-bottom": `1px solid ${C.border}`, "flex-shrink": "0" });
    const body = h("div", { flex: "1", overflow: "auto", padding: "14px" });
    const footer = h("div", {
      display: "flex", "justify-content": "space-between", "align-items": "center",
      padding: "6px 14px", "border-top": `1px solid ${C.border}`,
      "font-size": "11px", color: C.sub, "flex-shrink": "0",
    });
    const panel = h("div", {
      width: "min(94vw, 500px)", height: "min(86vh, 720px)",
      background: C.bg, color: C.text, "border-radius": "14px",
      display: "flex", "flex-direction": "column", overflow: "hidden",
      "font-size": "14px", "line-height": "1.6",
      "font-family": "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
      "box-shadow": "0 12px 48px rgba(0,0,0,0.35)",
    }, tabs, body, footer);
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
    initVersionFooter(footer);
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
    const body = panel._state.body;
    body.replaceChildren();
    tabPages[key](body);
  }

  // ---- Tab: 当前页 ----

  function buildSaveTab(body) {
    const vp = getBiliVideoPage(); // 普通视频页(BV/av):提供字幕/评论抓取
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
    }, vp
      ? "「保存字幕」抓取 CC/AI 字幕,「保存评论」按热度抓前 100 条;抓到后自动保存进收集箱。"
      : "点击「提取正文预览」查看将保存的内容");

    // 视频页动作:抓取 → 直接保存;用户改过标题则沿用,否则用「视频名 · 字幕/热门评论」
    async function runBiliAction(btn, label, busy, action) {
      const edited = titleInput.value.trim() && titleInput.value.trim() !== document.title.trim()
        ? titleInput.value.trim() : null;
      btn.disabled = true;
      btn.style.opacity = "0.55";
      btn.textContent = busy;
      const progress = (msg) => { btn.textContent = busy + " · " + msg; };
      preview.style.color = C.sub;
      preview.replaceChildren(busy + ",请稍候…");
      try {
        const r = await action(progress);
        const title = edited || `${r.baseTitle} · ${r.suffix}`;
        if (!edited) titleInput.value = title;
        const saved = await gmFetch("POST", "/api/save", {
          url: r.url,
          title,
          site: "www.bilibili.com",
          type: "bilibili",
          content: r.content,
        });
        savedLocal.unshift(saved);
        preview.style.color = C.text;
        const lines = r.content.split("\n");
        preview.replaceChildren(
          `${r.stat}\n\n` + lines.slice(0, 50).join("\n") + (lines.length > 50 ? "\n…" : ""),
        );
        toast("已保存 ✓");
      } catch (e) {
        toast(e.message, true);
        preview.replaceChildren("✗ " + e.message);
      }
      btn.disabled = false;
      btn.style.opacity = "";
      btn.textContent = label;
    }

    // 仅存链接(原 B 站行为:PC 归档脚本负责下载字幕并总结)
    const saveLink = async (btn) => {
      btn.disabled = true;
      try {
        const saved = await gmFetch("POST", "/api/save", {
          url: location.href.split("#")[0],
          title: titleInput.value.trim() || location.href,
          site: location.hostname,
          type: "bilibili",
          content: "",
        });
        savedLocal.unshift(saved);
        toast("已保存 ✓");
      } catch (e) {
        toast("保存失败: " + e.message, true);
      }
      btn.disabled = false;
    };

    if (vp) {
      const subBtn = mkBtn("保存字幕", C.accent, true,
        () => runBiliAction(subBtn, "保存字幕", "⏳ 抓取字幕中", () => saveBiliSubtitle(vp)));
      const cmtBtn = mkBtn("保存评论", undefined, false,
        () => runBiliAction(cmtBtn, "保存评论", "⏳ 抓取评论中", (prog) => saveBiliComments(vp, 100, prog)));
      const linkBtn = mkBtn("仅存链接", undefined, false, () => saveLink(linkBtn));
      body.append(
        h("div", { "font-weight": "600", "margin-bottom": "8px" }, "标题"),
        titleInput,
        h("div", { display: "flex", gap: "8px", "margin-top": "10px" }, subBtn, cmtBtn),
        h("div", { "margin-top": "8px" }, linkBtn),
        preview,
        h("div", { "margin-top": "10px", "font-size": "12px", color: C.sub },
          "检测到 B 站视频页:字幕/评论直接抓进收集箱,双端可看、可生成 AI 总结;「仅存链接」保持原行为,由 PC 归档脚本处理。AI 字幕需要在浏览器登录 B 站。"),
      );
      return;
    }

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
      if (bili) {
        await saveLink(saveBtn);
        return;
      }
      if (!result.lines) {
        toast("请先提取正文预览");
        return;
      }
      saveBtn.disabled = true;
      try {
        const saved = await gmFetch("POST", "/api/save", {
          url: location.href.split("#")[0],
          title: titleInput.value.trim() || location.href,
          site: location.hostname,
          type: "web",
          content: (result.lines || []).join("\n\n"),
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
        ? "检测到 B 站页面(番剧/短链等):只保存链接,PC 归档脚本会自动下载字幕并生成总结。"
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

  // 跨面板开关保留选择状态(页面刷新即清空)
  const selectedIds = new Set();

  function buildListTab(body) {
    // 常驻批量栏:未选择时按钮置灰而不是隐藏,避免出现/消失导致列表跳动
    const bar = h("div", {
      display: "flex", position: "sticky", top: "0", "z-index": "2",
      background: C.bg, padding: "8px 0", "border-bottom": `1px solid ${C.border}`,
      "align-items": "center", gap: "8px", "flex-wrap": "wrap",
    });
    const listEl = h("div");
    body.append(bar, listEl);
    let items = [];
    let busy = false;
    const barButtons = {};

    const renderList = () => {
      listEl.replaceChildren();
      if (!items.length) {
        listEl.append(h("div", { color: C.sub, padding: "20px", "text-align": "center" }, "还没有保存过内容"));
        return;
      }
      for (const it of items) listEl.append(renderListItem(it, renderBar));
    };

    function renderBar() {
      bar.replaceChildren();
      const n = selectedIds.size;
      bar.append(h("div", {
        color: n ? C.accent : C.sub, "font-size": "13px", "font-weight": "600",
      }, n ? `已选 ${n} 项` : "批量操作"));

      const allBox = mkCheckbox(items.length > 0 && items.every((it) => selectedIds.has(it.id)));
      allBox.disabled = busy || !items.length;
      allBox.addEventListener("change", () => {
        for (const it of items) {
          if (allBox.checked) selectedIds.add(it.id);
          else selectedIds.delete(it.id);
        }
        renderList();
        renderBar();
      });
      bar.append(h("label", {
        display: "flex", "align-items": "center", gap: "4px",
        "font-size": "12px", color: C.sub, cursor: allBox.disabled ? "default" : "pointer",
      }, allBox, "全选"));

      const defs = [
        ["sum", "AI 总结", undefined, batchSummarize],
        ["dl", "下载 .md", undefined, batchDownload],
        ["del", "删除", C.danger, batchDelete],
        ["cancel", "取消选择", undefined, clearSelection],
      ];
      for (const [key, label, color, fn] of defs) {
        const b = mkBtn(label, color, false, fn);
        b.disabled = busy || n === 0;
        b.style.opacity = b.disabled ? "0.55" : "";
        barButtons[key] = b;
        bar.append(b);
      }
    }

    function clearSelection() {
      if (busy) return;
      selectedIds.clear();
      renderList();
      renderBar();
    }

    async function batchDelete() {
      if (busy || !confirm(`确定删除选中的 ${selectedIds.size} 条?`)) return;
      busy = true;
      renderBar();
      const ids = [...selectedIds];
      let ok = 0, fail = 0;
      for (let i = 0; i < ids.length; i++) {
        barButtons.del.textContent = `删除中 ${i + 1}/${ids.length}…`;
        try {
          await gmFetch("DELETE", "/api/item/" + ids[i]);
          ok++;
          selectedIds.delete(ids[i]);
          const idx = savedLocal.findIndex((x) => x.id === ids[i]);
          if (idx >= 0) savedLocal.splice(idx, 1);
        } catch { fail++; }
      }
      busy = false;
      toast(fail ? `删除完成:成功 ${ok},失败 ${fail}` : `已删除 ${ok} 条 ✓`);
      switchTab("list");
    }

    // 只总结有正文且尚未总结的;无正文(B站链接)与已有总结的跳过
    async function batchSummarize() {
      if (busy) return;
      const targets = items.filter((it) => selectedIds.has(it.id) && it.has_content && !it.has_summary);
      const skipped = selectedIds.size - targets.length;
      if (!targets.length) {
        toast("所选条目都没有可总结的正文(无正文或已有总结)");
        return;
      }
      if (!confirm(
        `为 ${targets.length} 条生成 AI 总结?\n每条约 30~60 秒,期间请保持面板打开` +
        (skipped ? `\n(另有 ${skipped} 条无正文/已有总结,将跳过)` : ""),
      )) return;
      busy = true;
      renderBar();
      let ok = 0, fail = 0;
      for (let i = 0; i < targets.length; i++) {
        barButtons.sum.textContent = `⏳ 总结中 ${i + 1}/${targets.length}`;
        try {
          await gmFetch("POST", "/api/summarize", { id: targets[i].id });
          ok++;
        } catch { fail++; }
      }
      busy = false;
      toast(`总结完成:成功 ${ok},失败 ${fail}` + (skipped ? `,跳过 ${skipped} 条` : ""));
      switchTab("list");
    }

    // 所选合并导出为一个 markdown(多条逐个下载会被浏览器拦截)
    async function batchDownload() {
      if (busy) return;
      busy = true;
      renderBar();
      barButtons.dl.textContent = "打包中…";
      try {
        const { items: fullItems } = await gmFetch("GET", "/api/items?full=1");
        const byId = new Map(fullItems.map((x) => [x.id, x]));
        const chosen = items
          .filter((it) => selectedIds.has(it.id))
          .map((it) => byId.get(it.id) || savedLocal.find((x) => x.id === it.id) || it);
        if (!chosen.length) throw new Error("没有可导出的条目");
        const date = new Date().toISOString().slice(0, 10);
        downloadText(`收集箱导出-${chosen.length}条-${date}.md`, buildExportMd(chosen));
        toast(`已导出 ${chosen.length} 条 ✓`);
      } catch (e) {
        toast("导出失败: " + e.message, true);
      }
      busy = false;
      renderBar();
    }

    renderBar(); // 列表加载期间批量栏先常驻显示
    const loading = h("div", { color: C.sub, padding: "20px", "text-align": "center" }, "加载中…");
    listEl.append(loading);
    gmFetch("GET", "/api/items")
      .then(({ items: remote }) => {
        // 合并本地暂存的新条目(KV 传播延迟期间),已传播到的从暂存中清掉
        const remoteIds = new Set(remote.map((x) => x.id));
        for (let i = savedLocal.length - 1; i >= 0; i--) {
          if (remoteIds.has(savedLocal[i].id)) savedLocal.splice(i, 1);
        }
        const localMerged = savedLocal
          .filter((x) => !remoteIds.has(x.id))
          .map((x) => ({ ...x, has_summary: !!x.summary, has_content: !!x.content }));
        items = localMerged.concat(remote);
        // 列表里已不存在的选择项清掉
        const ids = new Set(items.map((x) => x.id));
        for (const id of [...selectedIds]) if (!ids.has(id)) selectedIds.delete(id);
        renderList();
        renderBar();
      })
      .catch((e) => {
        loading.textContent = "加载失败: " + e.message;
        loading.style.color = C.danger;
      });
  }

  function mkCheckbox(checked) {
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!checked;
    cb.style.setProperty("width", "16px");
    cb.style.setProperty("height", "16px");
    cb.style.setProperty("accent-color", C.accent);
    cb.style.setProperty("cursor", "pointer");
    cb.style.setProperty("flex-shrink", "0");
    return cb;
  }

  function renderListItem(it, onChange) {
    const date = new Date(it.created_at).toLocaleString("zh-CN", { hour12: false });
    const badges = h("span", { "font-size": "11px" },
      it.type === "bilibili" ? " 📺B站" : "",
      it.has_summary ? " ✨已总结" : "",
      it.status === "archived" ? " ✅已归档" : "");
    const cb = mkCheckbox(selectedIds.has(it.id));
    cb.addEventListener("click", (e) => e.stopPropagation());
    cb.addEventListener("change", () => {
      if (cb.checked) selectedIds.add(it.id);
      else selectedIds.delete(it.id);
      onChange();
    });
    const textBlock = h("div", { flex: "1", "min-width": "0" },
      h("div", { "font-weight": "600", overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }, it.title),
      h("div", { "font-size": "12px", color: C.sub, "margin-top": "2px" }, `${it.site} · ${date}`, badges),
    );
    const row = h("div", {
      display: "flex", "align-items": "flex-start",
      padding: "10px", "border-bottom": `1px solid ${C.border}`,
    }, cb, textBlock);
    textBlock.addEventListener("click", () => openDetail(row, it.id));
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

  /* WI-PURE-BEGIN —— 批量导出/版本比较:无 DOM/网络依赖,test-bili.mjs 会抽取做单测 */
  // 语义化版本比较("0.10.0" > "0.9.0"),返回 -1/0/1
  function cmpVersion(a, b) {
    const pa = String(a).split(".").map(Number);
    const pb = String(b).split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] || 0, y = pb[i] || 0;
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  }

  function buildExportMd(items) {
    const when = new Date().toLocaleString("zh-CN", { hour12: false });
    const parts = [`# Webbin 批量导出\n\n> 共 ${items.length} 条 · ${when}`];
    items.forEach((it, i) => {
      parts.push(
        `## ${i + 1}. ${it.title}\n\n` +
        `- 来源: ${it.url}\n- 时间: ${new Date(it.created_at).toLocaleString("zh-CN", { hour12: false })}\n\n` +
        `### AI 总结\n\n${it.summary || "(无)"}\n\n### 正文\n\n${it.content || "(B站视频,正文见归档文件夹)"}`,
      );
    });
    return parts.join("\n\n---\n\n") + "\n";
  }
  /* WI-PURE-END */

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
    const workerInput = noAutofill(mkInput(worker, "https://webbin.xxx.workers.dev"));
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
