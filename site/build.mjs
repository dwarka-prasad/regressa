// Builds the static docs + landing site into site/dist. Run: node site/build.mjs
import { marked } from "marked";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "site", "dist");
mkdirSync(path.join(out, "docs"), { recursive: true });

const pages = [
  { slug: "architecture", title: "Architecture", file: "ARCHITECTURE.md" },
  { slug: "local-dev", title: "Local development", file: "docs/local-dev.md" },
  { slug: "sdks", title: "SDKs", file: "docs/sdks.md" },
  { slug: "ingest-api", title: "Ingestion API", file: "docs/ingest-api.md" },
  { slug: "public-api", title: "Public REST API", file: "docs/public-api.md" },
  { slug: "evals", title: "Evals", file: "docs/evals.md" },
  { slug: "alerts", title: "Alerts", file: "docs/alerts.md" },
  { slug: "ci-gate", title: "CI regression gate", file: "docs/ci-gate.md" },
  { slug: "governance", title: "Governance, SSO, OTel", file: "docs/governance.md" },
  { slug: "data-model", title: "Data model", file: "docs/data-model.md" },
  { slug: "deployment", title: "Deployment", file: "docs/deployment.md" },
  { slug: "security", title: "Security", file: "docs/security.md" },
  { slug: "contributing", title: "Contributing", file: "CONTRIBUTING.md" },
  { slug: "changelog", title: "Changelog", file: "CHANGELOG.md" },
];

// Render ```mermaid fences as <pre class="mermaid"> so mermaid.js draws them client-side.
const renderer = new marked.Renderer();
const codeBase = renderer.code.bind(renderer);
renderer.code = (token) => (token.lang === "mermaid" ? `<pre class="mermaid">${token.text}</pre>` : codeBase(token));
marked.use({ renderer, gfm: true });

const css = readFileSync(path.join(root, "site", "site.css"), "utf8");
const nav = pages.map((p) => `<a href="/regressa/docs/${p.slug}.html" data-slug="${p.slug}">${p.title}</a>`).join("");

const shell = (title, body, { slug = "", docs = true } = {}) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Regressa</title><meta name="description" content="Catch AI regressions before your users do. LLM observability and prompt-regression monitoring.">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#4f6bff"/><path d="M4 17l6-6 4 4 7-7M14 8h7v7" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>')}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${css}</style>
<script>(function(){try{var t=localStorage.getItem("regressa_theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",t)}catch(e){}})();</script>
</head><body class="${docs ? "docs" : "landing"}">
<header class="top"><a class="brand" href="/regressa/"><span class="logo"></span>Regressa</a>
<nav><a href="/regressa/docs/local-dev.html">Docs</a><a href="/regressa/docs/architecture.html">Architecture</a><a href="/regressa/docs/sdks.html">SDKs</a><a href="https://github.com/dwarka-prasad/regressa">GitHub</a><button id="theme" aria-label="Toggle theme">◐</button></nav></header>
${docs ? `<div class="wrap"><aside class="side">${nav}</aside><main class="content" data-slug="${slug}">${body}</main></div>` : body}
<footer>Regressa · <a href="https://github.com/dwarka-prasad/regressa">Source</a> · docs.regressa.dev</footer>
<script src="https://cdn.jsdelivr.net/npm/lucide@0.469.0/dist/umd/lucide.min.js"></script>
<script type="module">
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
import { animate, inView, stagger } from "https://cdn.jsdelivr.net/npm/motion@11.15.0/+esm";
const dark = document.documentElement.getAttribute("data-theme") === "dark";
mermaid.initialize({ startOnLoad: true, theme: dark ? "dark" : "neutral" });
window.lucide?.createIcons();
document.getElementById("theme").onclick = () => { const n = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"; document.documentElement.setAttribute("data-theme", n); localStorage.setItem("regressa_theme", n); location.reload(); };
const s = document.querySelector("main[data-slug]")?.dataset.slug; if (s) document.querySelector('.side a[data-slug="'+s+'"]')?.classList.add("on");
// header shrink on scroll
const top = document.querySelector(".top"); addEventListener("scroll", () => top.classList.toggle("shrink", scrollY > 24), { passive: true });
// scroll reveal
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
for (const el of document.querySelectorAll("[data-reveal]")) {
  if (reduce) { el.classList.add("in"); continue; }
  inView(el, () => { el.classList.add("in"); }, { margin: "0px 0px -10% 0px" });
}
// hero: stagger the copy, draw the chart, count the numbers
if (document.body.classList.contains("landing") && !reduce) {
  animate(".hero [data-reveal]", { opacity: [0, 1], y: [16, 0] }, { delay: stagger(0.08, { startDelay: 0.05 }), duration: 0.7, easing: [0.22, 1, 0.36, 1] });
  for (const p of document.querySelectorAll(".shot .line, .shot .line2")) { const len = p.getTotalLength(); p.style.strokeDasharray = p.classList.contains("line2") ? "4 4" : String(len); p.style.strokeDashoffset = String(len); animate(p, { strokeDashoffset: [len, 0] }, { duration: 1.6, delay: 0.5, easing: "ease-out" }); }
  animate(".shot .area", { opacity: [0, 1] }, { duration: 1, delay: 1.2 });
}
for (const el of document.querySelectorAll("[data-count]")) {
  const target = Number(el.dataset.count), dec = Number(el.dataset.decimals ?? 0), pre = el.dataset.prefix ?? "", suf = el.dataset.suffix ?? "";
  const fmt = (v) => pre + (dec ? v.toFixed(dec) : Math.round(v).toLocaleString()) + suf;
  if (reduce) { el.textContent = fmt(target); continue; }
  inView(el, () => { animate(0, target, { duration: 1.4, easing: [0.22, 1, 0.36, 1], onUpdate: (v) => { el.textContent = fmt(v); } }); }, { amount: 0.5 });
}
// code tabs
for (const b of document.querySelectorAll(".tabs button")) b.onclick = () => { document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x === b)); document.querySelectorAll(".tabpanes pre").forEach((p) => p.classList.toggle("on", p.dataset.pane === b.dataset.tab)); };
</script>
</body></html>`;

for (const p of pages) {
  const md = readFileSync(path.join(root, p.file), "utf8").replace(/\]\((?:\.\/)?docs\/([a-z-]+)\.md(#[^)]*)?\)/g, "](/regressa/docs/$1.html$2)").replace(/\]\(([a-z-]+)\.md(#[^)]*)?\)/g, "](/regressa/docs/$1.html$2)");
  writeFileSync(path.join(out, "docs", `${p.slug}.html`), shell(p.title, marked.parse(md), { slug: p.slug }));
}
writeFileSync(path.join(out, "docs", "index.html"), `<!doctype html><meta http-equiv="refresh" content="0; url=/regressa/docs/local-dev.html">`);
writeFileSync(path.join(out, "index.html"), shell("Catch AI regressions before your users do", readFileSync(path.join(root, "site", "landing.html"), "utf8"), { docs: false }));
writeFileSync(path.join(out, ".nojekyll"), "");
console.log(`built ${pages.length} docs pages + landing into site/dist`);
