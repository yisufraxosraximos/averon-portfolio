/* AVERON portfolio – shared front-end code */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const fine = matchMedia("(hover:hover) and (pointer:fine)").matches;

/* intro counter (once per visit) */
function runLoader() {
  const L = $("#loader"), go = () => document.body.classList.add("ready");
  if (!L || getComputedStyle(L).display === "none") return go();
  let seen = false; try { seen = sessionStorage.getItem("av_seen") === "1"; } catch {}
  if (seen || reduce) { L.remove(); return go(); }
  const pc = $(".pc", L), bar = $(".bar i", L); let n = 0;
  const t = setInterval(() => {
    n = Math.min(100, n + Math.ceil(Math.random() * 9)); pc.textContent = n; bar.style.width = n + "%";
    if (n === 100) { clearInterval(t); setTimeout(() => { L.classList.add("out"); try { sessionStorage.setItem("av_seen", "1"); } catch {} go(); setTimeout(() => L.remove(), 950); }, 260); }
  }, 50);
}
/* hero name: every letter flips up in 3D */
function splitLetters(el) {
  let i = 0;
  $$(".ln", el).forEach(ln => { const t = ln.textContent; ln.setAttribute("aria-label", t); ln.innerHTML = [...t].map(c => `<span class="ch" aria-hidden="true" style="--i:${i++}">${c === " " ? "&nbsp;" : esc(c)}</span>`).join(""); });
}
/* buttons lean toward the pointer */
function magnetic() {
  if (!fine || reduce) return;
  $$(".btn,.links a.cta,.wafab").forEach(b => {
    b.addEventListener("pointermove", e => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .25}px,${(e.clientY - r.top - r.height / 2) * .35}px)`; });
    b.addEventListener("pointerleave", () => { b.style.transform = ""; });
  });
}
/* cards tilt in 3D and catch the light */
function tilt(root = document) {
  if (!fine || reduce) return;
  $$(".card", root).forEach(c => {
    c.addEventListener("pointermove", e => {
      const r = c.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      c.classList.add("tilting"); c.style.transform = `rotateY(${(px - .5) * 14}deg) rotateX(${-(py - .5) * 14}deg) translateY(-8px)`;
      c.style.setProperty("--gx", px * 100 + "%"); c.style.setProperty("--gy", py * 100 + "%");
    });
    c.addEventListener("pointerleave", () => { c.classList.remove("tilting"); c.style.transform = ""; });
  });
}
function spotlight(root = document) {
  $$(".s,.tech", root).forEach(c => c.addEventListener("pointermove", e => { const r = c.getBoundingClientRect(); c.style.setProperty("--mx", e.clientX - r.left + "px"); c.style.setProperty("--my", e.clientY - r.top + "px"); }));
}
function reveal(root = document) {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("shown"); io.unobserve(e.target); } }), { threshold: .12 });
  $$(".rv", root).forEach(el => io.observe(el));
}
function counters() {
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; io.unobserve(e.target);
    const to = Number(e.target.dataset.to) || 0, t0 = performance.now();
    (function f(t) { const k = Math.min(1, (t - t0) / 1500); e.target.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1 && !reduce) requestAnimationFrame(f); else e.target.textContent = to; })(t0);
  }), { threshold: .6 });
  $$("[data-to]").forEach(el => io.observe(el));
}
function clock() {
  const el = $("#clock"); if (!el) return;
  const tick = () => { el.textContent = new Date().toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", second: "2-digit" }); };
  tick(); setInterval(tick, 1000);
}
function nav(s) {
  const b = $(".burger"), l = $(".links");
  if (b && l) b.onclick = () => { const o = l.classList.toggle("open"); b.textContent = o ? "Close" : "Menu"; b.setAttribute("aria-expanded", String(o)); };
  $$(".links a").forEach(a => a.addEventListener("click", () => { l?.classList.remove("open"); if (b) { b.textContent = "Menu"; b.setAttribute("aria-expanded", "false"); } }));
  const wa = (s && s.whatsapp) || "";
  $$("[data-wa]").forEach(a => { a.href = "https://wa.me/" + wa + "?text=" + encodeURIComponent(a.dataset.wa || "Hello AVERON, I saw your portfolio and I'd like a website."); a.target = "_blank"; a.rel = "noopener"; });
  const m = (s && s.email) || ""; $$("[data-mail]").forEach(a => { a.href = "mailto:" + m; a.textContent = m; });
}
/* scroll bar, active nav link, WhatsApp button hides over hero */
function scrollUI() {
  const bar = $("#bar"), fab = $(".wafab"), hero = $(".hero"), links = $$(".links a:not(.cta),.dock a");
  const secs = links.map(a => (a.hash && $(a.hash)) || null);
  const u = () => {
    const h = document.documentElement.scrollHeight - innerHeight; if (bar) bar.style.transform = `scaleX(${h > 0 ? scrollY / h : 0})`;
    if (fab && hero) fab.classList.toggle("hide", scrollY < hero.offsetHeight * .6);
    if (hero) document.body.classList.toggle("at-top", scrollY < hero.offsetHeight * .7);
    let c = -1; secs.forEach((s, i) => { if (s && s.getBoundingClientRect().top < innerHeight * .5) c = i; }); links.forEach((a, i) => a.classList.toggle("on", i === c));
  };
  u(); addEventListener("scroll", u, { passive: true });
}
function mediaOf(p) {
  const v = p.video;
  if (p.poster) return `<img src="${esc(p.poster)}" alt="" loading="lazy">`;
  if (v && v.kind === "file" && v.src.startsWith("/media/")) return `<video muted loop playsinline preload="metadata" src="${esc(v.src)}#t=0.6"></video>`;
  if (p.link) return `<img src="${esc(shot(p.link))}" alt="" loading="lazy" onerror="this.outerHTML='<div class=&quot;ph&quot;>${esc(p.title.charAt(0))}</div>'">`;
  return `<div class="ph">${esc(p.title.charAt(0))}</div>`;
}
/* automatic picture of a live website (used when no image or video was uploaded) */
function shot(u) { const url = /^https?:/.test(u) ? u : "https://" + u; return "https://s.wordpress.com/mshots/v1/" + encodeURIComponent(url) + "?w=1200&h=760"; }
function hostOf(u) { try { return new URL(/^https?:/.test(u) ? u : "https://" + u).host.replace(/^www\./, ""); } catch { return ""; } }
function cardHTML(p, i) {
  const v = p.video, file = v && v.kind === "file" && v.src.startsWith("/media/"), host = hostOf(p.link);
  return `<article class="card rv" data-cat="${esc(p.category)}" style="transition-delay:${(i % 3) * 80}ms">
    <a class="stretch" href="/project/${esc(p.slug)}" aria-label="${esc(p.title)} - open full details"></a>
    <div class="frame"><div class="chrome"><i></i><i></i><i></i><span>${esc(host || p.title)}</span></div>
    <div class="media">${mediaOf(p)}${file && p.poster ? `<video muted loop playsinline preload="none" data-src="${esc(v.src)}" style="opacity:0;transition:opacity .4s"></video>` : ""}</div></div>
    <div class="info"><div class="meta"><span class="pill">${esc(p.category || "Website")}</span><span>${esc(p.year)}</span></div>
      <h3>${esc(p.title)}</h3>${p.tagline ? `<p>${esc(p.tagline)}</p>` : ""}
      <div class="acts"><span class="go">View full details <b>→</b></span>${p.link ? `<a class="vis" href="${esc(p.link)}" target="_blank" rel="noopener">Visit live site <b>↗</b></a>` : ""}</div></div></article>`;
}
function hoverVideo(root = document) {
  $$(".card", root).forEach(c => {
    const v = $("video", c); if (!v) return;
    const start = () => { if (v.dataset.src && !v.src) v.src = v.dataset.src; v.style.opacity = 1; v.currentTime = Math.max(0, v.currentTime); v.play().catch(() => {}); };
    const stop = () => { v.pause(); try { v.currentTime = 0.6; } catch {} if (v.dataset.src) v.style.opacity = 0; };
    if (fine) { c.addEventListener("pointerenter", start); c.addEventListener("pointerleave", stop); c.addEventListener("focus", start); c.addEventListener("blur", stop); }
    else { /* phones: the video plays while the card is on screen */
      new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? start() : stop()), { threshold: .65 }).observe(c);
    }
  });
}
/* typewriter that cycles through roles */
function typer(el, words) {
  words = (words || []).filter(w => !/^ui\s*designer$/i.test(w.trim()));
  if (!el || !words.length) return;
  if (reduce || words.length === 1) { el.textContent = words[0]; return; }
  let w = 0, i = 0, del = false;
  (function step() {
    const word = words[w]; el.textContent = word.slice(0, i);
    let t = del ? 38 : 85;
    if (!del && i === word.length) { del = true; t = 1700; }
    else if (del && i === 0) { del = false; w = (w + 1) % words.length; t = 350; }
    else i += del ? -1 : 1;
    setTimeout(step, t);
  })();
}

/* React-Bits-style effects, written in plain JavaScript */
/* dots that light up around the pointer */
function dots() {
  if (!fine || reduce) return;
  const r = document.documentElement; let x = innerWidth / 2, y = innerHeight * .4, t = 0;
  addEventListener("pointermove", e => { x = e.clientX; y = e.clientY; if (!t) t = requestAnimationFrame(() => { t = 0; r.style.setProperty("--cx", x + "px"); r.style.setProperty("--cy", y + "px"); }); }, { passive: true });
}
/* text that decodes itself when it scrolls into view */
function decode(root = document) {
  if (reduce) return;
  const set = "01<>/{}[]=+*#$%&";
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; io.unobserve(e.target);
    const nodes = []; const w = document.createTreeWalker(e.target, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.nodeValue.trim()) nodes.push([n, n.nodeValue]);
    const total = nodes.reduce((s, x) => s + x[1].length, 0), t0 = performance.now(), dur = 900;
    (function f(t) {
      const k = Math.min(1, (t - t0) / dur), done = Math.floor(total * k); let c = 0;
      nodes.forEach(([node, txt]) => { node.nodeValue = [...txt].map(ch => (c++ < done || ch === " " || ch === "/") ? ch : set[Math.floor(Math.random() * set.length)]).join(""); });
      if (k < 1) requestAnimationFrame(f); else nodes.forEach(([node, txt]) => node.nodeValue = txt);
    })(t0);
  }), { threshold: .8 });
  $$(".eyebrow", root).forEach(el => io.observe(el));
}
/* paragraph whose words light up one by one as you scroll */
function scrollWords(el) {
  if (!el) return;
  const words = el.textContent.split(/\s+/).filter(Boolean);
  el.innerHTML = words.map(w => `<span class="w">${esc(w)}</span>`).join(" ");
  if (reduce) { $$(".w", el).forEach(s => s.style.opacity = 1); return; }
  const ws = $$(".w", el);
  const u = () => { const r = el.getBoundingClientRect(), p = Math.min(1, Math.max(0, (innerHeight * .85 - r.top) / (r.height + innerHeight * .35))); const n = p * ws.length; ws.forEach((s, i) => s.style.opacity = Math.min(1, Math.max(.16, n - i + 1))); };
  u(); addEventListener("scroll", u, { passive: true }); addEventListener("resize", u);
}

window.AV = { dots, decode, scrollWords, typer, $, $$, esc, runLoader, splitLetters, magnetic, spotlight, reveal, counters, clock, nav, scrollUI, cardHTML, hoverVideo };
