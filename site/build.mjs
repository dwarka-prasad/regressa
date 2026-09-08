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
<style>${css}</style>
<script>(function(){try{var t=localStorage.getItem("regressa_theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",t)}catch(e){}})();</script>
</head><body class="${docs ? "docs" : "landing"}">
<header class="top"><a class="brand" href="/regressa/"><span class="logo"></span>Regressa</a>
<nav><a href="/regressa/docs/local-dev.html">Docs</a><a href="/regressa/docs/architecture.html">Architecture</a><a href="/regressa/docs/sdks.html">SDKs</a><a href="https://github.com/dwarka-prasad/regressa">GitHub</a><button id="theme" aria-label="Toggle theme">◐</button></nav></header>
${docs ? `<div class="wrap"><aside class="side">${nav}</aside><main class="content" data-slug="${slug}">${body}</main></div>` : body}
<footer>Regressa · <a href="https://github.com/dwarka-prasad/regressa">Source</a> · docs.regressa.dev</footer>
<script type="module">
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
const dark = document.documentElement.getAttribute("data-theme") === "dark";
mermaid.initialize({ startOnLoad: true, theme: dark ? "dark" : "neutral" });
document.getElementById("theme").onclick = () => { const n = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"; document.documentElement.setAttribute("data-theme", n); localStorage.setItem("regressa_theme", n); location.reload(); };
const s = document.querySelector("main[data-slug]")?.dataset.slug; if (s) document.querySelector('.side a[data-slug="'+s+'"]')?.classList.add("on");
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
