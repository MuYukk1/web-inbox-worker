// ==UserScript==
// @name         Web Inbox 收集箱
// @name:en      Web Inbox Saver
// @description  保存网页正文/B站视频到自己的 Cloudflare Worker,双端 Edge 可用;B站视频可抓取字幕/评论,AI 总结、历史查看、下载归档
// @namespace    https://github.com/local/web-inbox
// @version      0.5.0
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
    for (const s of subs.slice(0, 3)) {
      out.push(`    ↳ ${((s.member && s.member.uname) || "?")}: ${((s.content && s.content.message) || "").trim()}`);
    }
    if ((r.rcount || 0) > subs.length) out.push(`    (另有 ${r.rcount - subs.length} 条回复)`);
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

  // 按热度抓主楼评论(含接口附带的楼中楼前几条),最多 100 条
  async function saveBiliComments(vp, maxMain = 100) {
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
    const blocks = uniq.map((r, i) => fmtComment(r, i + 1, r === top));
    const head = biliItemHeader(v, [
      `评论: 按热度,共 ${allCount || "?"} 条,已保存 ${uniq.length} 条(含楼中楼)${legacy ? ",旧接口可能不完整" : ""}`,
    ]);
    return {
      url: head.link, baseTitle: v.title, suffix: "热门评论",
      stat: `已抓取评论 ${uniq.length}/${allCount || "?"} 条(按热度${legacy ? ",旧接口" : ""})`,
      content: head.text + "\n\n" + blocks.join("\n\n"),
    };
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

  // 版本信息:当前版本号 + 对照更新源是否最新(结果缓存 10 分钟)
  const UPDATE_URL = "https://cdn.jsdelivr.net/gh/MuYukk1/web-inbox-worker@main/userscript/web-inbox.user.js";
  const SCRIPT_VERSION =
    (typeof GM_info !== "undefined" && GM_info.script && GM_info.script.version) || "0.5.0";
  let versionCache = null;

  function renderVersionFooter(el, v) {
    el.replaceChildren(`Web Inbox v${SCRIPT_VERSION} · `);
    if (v.mode === "latest") {
      el.append("✓ 已是最新");
    } else if (v.mode === "old") {
      const a = h("span", { color: C.accent, cursor: "pointer", "text-decoration": "underline" },
        `可更新 → v${v.latest}`);
      a.title = "点击打开脚本页安装;也可在油猴菜单 → 管理面板 → 实用工具 → 从 URL 安装";
      a.addEventListener("click", () => window.open(UPDATE_URL, "_blank"));
      el.append(a);
    } else {
      el.append("检查更新失败");
    }
  }

  function initVersionFooter(el) {
    if (versionCache && Date.now() - versionCache.at < 10 * 60 * 1000) {
      renderVersionFooter(el, versionCache);
      return;
    }
    el.textContent = `Web Inbox v${SCRIPT_VERSION} · 检查更新中…`;
    gmRequest(UPDATE_URL)
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
      preview.style.color = C.sub;
      preview.replaceChildren(busy + ",请稍候…");
      try {
        const r = await action();
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
        () => runBiliAction(cmtBtn, "保存评论", "⏳ 抓取评论中", () => saveBiliComments(vp)));
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
    const parts = [`# Web Inbox 批量导出\n\n> 共 ${items.length} 条 · ${when}`];
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
