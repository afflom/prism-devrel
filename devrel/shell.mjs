#!/usr/bin/env node
/**
 * The documentation shell: one header, one set of tabs, one side navigation,
 * one footer and one stylesheet for every documentation page, whichever
 * generator wrote it, in the layout of the Prism docs on uor.foundation
 * (UOR-Foundation/website src/docs/Docs.tsx and src/index.css, the commit
 * devrel/site.json names).
 *
 *   node devrel/shell.mjs site
 *
 * A documentation page is any HTML file under site/ that carries
 * <meta name="diataxis"> and <meta name="developer-journey">; crates/devrel
 * writes learn/, builder/site.mjs writes start/ and examples/. Each is one
 * Diátaxis type (a tab) and one stage of the developer journey (a group in
 * the tab's side navigation); devrel/site.json names the allowed values and
 * their order. Within a stage, pages keep the order the generators list them
 * in llms.txt, then path order for any they leave out; the llms.txt written
 * here lists every page.
 *
 * It then writes the docs hub (docs/), rewrites llms.txt by type, adds the
 * pages a generator left out of llms-full.txt and feed.xml, writes
 * sitemap.xml, and links the app page to the hub. It exits non-zero, so
 * pages.yml deploys nothing, when a page has an unknown type or stage, when
 * a page in a documentation directory carries neither, or when a link or
 * fragment on a documentation page points at nothing on the site.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const SITE = JSON.parse(readFileSync(join(here, 'site.json'), 'utf8'));
const TYPES = SITE.diataxis.types;
const STAGES = SITE.journey.stages;
const typeOf = Object.fromEntries(TYPES.map((t) => [t.id, t]));
const stageOf = Object.fromEntries(STAGES.map((s) => [s.id, s]));
const FONTS = join(repo, 'crates/devrel/assets/fonts');
const DOCS_DIRS = ['learn/', 'start/', 'examples/'];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => String(s).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const text = (html) => unesc(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const meta = (head, name) => head.match(new RegExp(`<meta name="${name}" content="([^"]*)"`))?.[1];

class ShellError extends Error {}
const refuse = (msg) => { throw new ShellError(msg); };

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Reads one generated page into its parts. */
function parse(site, file) {
  const rel = relative(site, file).split('\\').join('/');
  const html = readFileSync(file, 'utf8');
  // A fragment outside the documentation directories (the app's spec.html)
  // is not a page; one inside them is refused below for its missing metas.
  const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? (DOCS_DIRS.some((d) => rel.startsWith(d)) ? refuse(`${rel}: no <head>`) : '');
  const diataxis = meta(head, 'diataxis');
  const journey = meta(head, 'developer-journey');
  return { rel, file, html, head, diataxis, journey };
}

function load(site) {
  const pages = [];
  for (const file of walk(site).filter((f) => f.endsWith('.html'))) {
    const p = parse(site, file);
    const inDocs = DOCS_DIRS.some((d) => p.rel.startsWith(d));
    if (p.diataxis === undefined && p.journey === undefined) {
      if (inDocs) refuse(`${p.rel}: a documentation page needs <meta name="diataxis"> and <meta name="developer-journey">`);
      continue;
    }
    if (!typeOf[p.diataxis]) refuse(`${p.rel}: diataxis "${p.diataxis}" is not one of ${TYPES.map((t) => t.id).join(', ')}`);
    if (!stageOf[p.journey]) refuse(`${p.rel}: developer-journey "${p.journey}" is not one of ${STAGES.map((s) => s.id).join(', ')}`);
    if (/<body[^>]*\bdc-root\b/.test(p.html)) refuse(`${p.rel}: already wrapped; write the pages again before running the shell`);
    const body = p.html.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? refuse(`${p.rel}: no <body>`);
    const main = body.match(/<main id="main"[^>]*>([\s\S]*)<\/main>/)?.[1] ?? refuse(`${p.rel}: no <main id="main">`);
    const after = body.slice(body.lastIndexOf('</main>') + 7);
    const scripts = [...after.matchAll(/<script[\s\S]*?<\/script>/g)].map((m) => m[0]);
    const provenance = after.match(/<footer class="foot">([\s\S]*?)<\/footer>/)?.[1]?.replace(/^<p>|<\/p>$/g, '') ?? '';
    const title = text(main.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? refuse(`${p.rel}: no <h1>`));
    const summary = unesc(meta(p.head, 'description') ?? refuse(`${p.rel}: no <meta name="description">`));
    const twin = p.head.match(/<link rel="alternate" type="text\/markdown" href="([^"]*)"/)?.[1] ?? refuse(`${p.rel}: no Markdown twin`);
    const url = p.rel.replace(/index\.html$/, '');
    pages.push({ ...p, main, scripts, provenance, title, summary, url, twin: posix.normalize(posix.join(posix.dirname(p.rel), twin)) });
  }
  return pages;
}

/** The order llms.txt lists pages in: the order their generators declare. */
function llmsOrder(site, live) {
  const at = join(site, 'llms.txt');
  const lines = existsSync(at) ? readFileSync(at, 'utf8').split('\n') : [];
  const order = [];
  for (const l of lines) {
    const m = l.match(/^- \[[^\]]*\]\(([^)]+)\)/);
    if (!m) continue;
    let u = m[1];
    if (u.startsWith(live)) u = u.slice(live.length);
    order.push(posix.normalize(u.replace(/^\.\//, '')));
  }
  return { lines, order };
}

const icon = {
  github: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>',
  discord: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
  app: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m4 17 6-6-6-6M12 19h8"/></svg>',
};

/** Pages of one type, by journey stage, then in declared order. */
function arrange(pages, order) {
  const pos = (p) => {
    const i = order.indexOf(p.twin);
    return i < 0 ? order.length : i;
  };
  const tabs = TYPES.map((t) => {
    const mine = pages.filter((p) => p.diataxis === t.id);
    const groups = STAGES.map((s) => ({ stage: s, pages: mine.filter((p) => p.journey === s.id).sort((a, b) => pos(a) - pos(b) || a.rel.localeCompare(b.rel)) })).filter((g) => g.pages.length);
    return { type: t, groups, flat: groups.flatMap((g) => g.pages) };
  });
  return tabs;
}

function header(root, activeType) {
  const tab = (href, label, on) => `<a href="${href}"${on ? ' class="dc-active" aria-current="true"' : ''}>${esc(label)}</a>`;
  return `<header class="dc-header"><div class="dc-topbar"><a href="${root}${SITE.hub.path}" class="dc-brand"><span class="fd-head">${esc(SITE.brand.primary)}</span><span class="fd-mono">${esc(SITE.brand.secondary)}</span></a><nav class="dc-social" aria-label="Community"><a href="${SITE.links.source}" aria-label="Source on GitHub">${icon.github}</a><a href="${SITE.links.discord}" aria-label="Discord">${icon.discord}</a></nav><a href="${root}" class="dc-cta">${icon.app}<span>Open the app</span></a></div><nav class="dc-tabs" aria-label="Documentation types">${tab(`${root}${SITE.hub.path}`, 'Home', activeType === null)}${TABS.map((t) => (t.flat.length ? tab(`${root}${t.flat[0].url}`, t.type.tab, activeType === t.type.id) : '')).join('')}</nav><span aria-hidden="true" class="fd-header-line"></span></header>`;
}

function footer(root, provenance) {
  return `<footer class="dc-foot"><div class="dc-foot-row"><nav aria-label="Foundation"><a href="${SITE.links.foundation}">UOR Foundation</a><a href="${SITE.links.prismDocs}">Prism docs</a><a href="${SITE.links.github}">GitHub</a><a href="${SITE.links.discord}">Discord</a><a href="${root}llms.txt">llms.txt</a><a href="${root}sitemap.xml">Sitemap</a></nav><span>Prism by the UOR Foundation. MIT or Apache-2.0.</span></div><p class="dc-foot-note">Organized as <a href="https://diataxis.fr">Diátaxis</a> documentation along the developer journey (${STAGES.map((s) => s.label).join(', ')}) of Lewko and Parton, <cite>Developer Relations</cite> (Apress, 2021).${provenance ? ` ${provenance}` : ''}</p></footer>`;
}

function doc({ root, title, summary, canonical, twin, extraHead = '', body, scripts = '' }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><meta name="theme-color" content="#0a0a0a"><title>${esc(title)} · ${esc(SITE.name)}</title><meta name="description" content="${esc(summary)}"><link rel="canonical" href="${canonical}">${twin ? `<link rel="alternate" type="text/markdown" href="${twin}">` : ''}<link rel="icon" href="${root}favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="${root}docs/docs.css">${extraHead}</head><body class="foundation dc-root"><a class="skip" href="#main">Skip to content</a>${body}${scripts}</body></html>
`;
}

let TABS = [];
let FEED = false;

/** Gives every second-level heading an id, so the page can list them. */
function anchorHeadings(main) {
  const used = new Set([...main.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const toc = [];
  const out = main.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/g, (all, attrs, inner) => {
    let id = attrs.match(/\sid="([^"]+)"/)?.[1];
    if (!id) {
      const base = slug(text(inner)) || 'section';
      id = base;
      for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
      used.add(id);
      attrs = `${attrs} id="${id}"`;
    }
    toc.push({ id, label: text(inner) });
    return `<h2${attrs}>${inner}</h2>`;
  });
  return { main: out, toc };
}

function wrap(p, live) {
  const depth = p.rel.split('/').length - 1;
  const root = '../'.repeat(depth);
  const href = (q) => posix.relative(posix.dirname(p.rel), q.rel).replace(/index\.html$/, '') || './';
  const tab = TABS.find((t) => t.type.id === p.diataxis);
  const i = tab.flat.indexOf(p);
  const prev = tab.flat[i - 1];
  const next = tab.flat[i + 1];
  const t = typeOf[p.diataxis];
  const s = stageOf[p.journey];
  const side = tab.groups.map((g) => `<div><p>${esc(g.stage.label)}</p>${g.pages.map((q) => `<a href="${href(q)}"${q === p ? ' class="dc-active" aria-current="page"' : ''}>${esc(q.title)}</a>`).join('')}</div>`).join('');
  const { main, toc } = anchorHeadings(p.main);
  // The generator's own eyebrow gives way to the type and stage, worded once here.
  const eyebrow = `<p class="eyebrow">// ${esc(t.label)} · ${esc(s.label)}</p>`;
  // The twin is a chip under the page, so the generator's own line about it goes.
  const lead = main.replace(/^\s*<p class="eyebrow">[\s\S]*?<\/p>/, '').replace(/<p class="twin">[\s\S]*?<\/p>/, '');
  const crumbs = `<nav aria-label="Breadcrumb" class="dc-crumbs"><a href="${root}${SITE.hub.path}">Docs</a>${icon.chevron}<a href="${href(tab.flat[0])}">${esc(t.tab)}</a>${icon.chevron}<span>${esc(s.label)}</span></nav>`;
  const chips = `<p class="dc-meta"><a class="dc-tag" href="${t.href}" title="${esc(`${t.orientation}: ${t.what}`)}">${esc(t.label)}</a><a class="dc-tag" href="${root}${SITE.hub.path}#${s.id}" title="${esc(s.question)}">${esc(s.label)}</a><a class="dc-tag" href="${posix.relative(posix.dirname(p.rel), p.twin)}">Markdown</a></p>`;
  const pager = `<nav class="dc-pager" aria-label="${esc(t.tab)}">${prev ? `<a class="dc-card" href="${href(prev)}"><span>Previous</span><strong>${esc(prev.title)}</strong></a>` : '<span></span>'}${next ? `<a class="dc-card dc-next" href="${href(next)}"><span>Next</span><strong>${esc(next.title)}</strong></a>` : ''}</nav>`;
  const mnav = `<details class="dc-mnav"><summary>${esc(t.tab)}: ${esc(p.title)}</summary>${side}</details>`;
  const onPage = toc.length > 1 ? `<aside class="dc-toc" aria-label="On this page"><p>On this page</p>${toc.map((h) => `<a href="#${h.id}">${esc(h.label)}</a>`).join('')}</aside>` : '';
  // Each generator's own stylesheets and import map stay; its chrome does not.
  const keep = [...p.head.matchAll(/<link rel="stylesheet" href="([^"]*)">/g)].map((m) => m[1]).filter((h) => !h.endsWith('docs/docs.css'));
  const extraHead = keep.map((h) => `<link rel="stylesheet" href="${h}">`).join('') + [...p.head.matchAll(/<script type="importmap">[\s\S]*?<\/script>/g)].map((m) => m[0]).join('') + `<meta name="diataxis" content="${p.diataxis}"><meta name="developer-journey" content="${p.journey}">${FEED ? `<link rel="alternate" type="application/rss+xml" href="${root}feed.xml" title="${esc(SITE.name)}">` : ''}`;
  const body = `${header(root, p.diataxis)}<div class="dc-layout${onPage ? '' : ' dc-layout-notoc'}"><nav class="dc-side" aria-label="${esc(t.tab)}">${side}</nav><main id="main" class="dc-article">${crumbs}${mnav}${eyebrow}${lead}${chips}${pager}</main>${onPage}</div>${footer(root, p.provenance)}`;
  return doc({ root, title: p.title, summary: p.summary, canonical: `${live}${p.url}`, twin: posix.relative(posix.dirname(p.rel), p.twin), extraHead, body, scripts: p.scripts.join('') });
}

function hub(pages, live) {
  const root = '../'.repeat(SITE.hub.path.split('/').filter(Boolean).length);
  const first = TABS.find((t) => t.type.id === 'tutorial')?.flat[0] ?? TABS.find((t) => t.flat.length).flat[0];
  const link = (p) => `${root}${p.url}`;
  const patterns = ['dc-dots', 'dc-grid', 'dc-lines'];
  const ordered = TABS.flatMap((t) => t.flat);
  // A stage lists one line per documentation type: the page itself when it is
  // the only one, otherwise how many there are, opening on the first.
  const journey = STAGES.map((s, i) => {
    const lines = TABS.map((t) => ({ t, mine: t.flat.filter((p) => p.journey === s.id) })).filter((x) => x.mine.length).flatMap(({ t, mine }) => (mine.length === 1
      ? mine.map((p) => `<li><a href="${link(p)}">${esc(p.title)}</a> <span class="dc-dim">${esc(t.type.label)}</span></li>`)
      : [`<li><a href="${link(mine[0])}">${mine.length} ${esc(t.type.tab.toLowerCase())}</a> <span class="dc-dim">from ${esc(mine[0].title)}</span></li>`]));
    return `<li id="${s.id}" class="dc-home-card"><div class="dc-pattern ${patterns[i % patterns.length]}"></div><div class="dc-card-body"><em class="fd-mono">${String(i + 1).padStart(2, '0')} · ${esc(s.label)}</em><strong>${esc(s.question)}</strong>${lines.length ? `<ul>${lines.join('')}</ul>` : ''}</div></li>`;
  }).join('');
  const types = TABS.filter((t) => t.flat.length).map((t) => `<li><a class="dc-home-card" href="${link(t.flat[0])}"><div class="dc-card-body"><em class="fd-mono">${esc(t.type.orientation)}</em><strong>${esc(t.type.tab)}</strong><span>${esc(t.type.what)}</span><span class="dc-dim">${t.flat.length} ${t.flat.length === 1 ? 'page' : 'pages'}</span></div></a></li>`).join('');
  const matrix = `<div class="table"><table><thead><tr><th scope="col">Stage</th>${TYPES.map((t) => `<th scope="col">${esc(t.tab)}</th>`).join('')}</tr></thead><tbody>${STAGES.map((s) => `<tr><th scope="row">${esc(s.label)}</th>${TYPES.map((t) => `<td>${ordered.filter((p) => p.journey === s.id && p.diataxis === t.id).map((p) => `<a href="${link(p)}">${esc(p.title)}</a>`).join('<br>')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const body = `${header(root, null)}<main id="main" class="dc-home"><div class="dc-pixels" aria-hidden="true"></div><p class="eyebrow">// ${esc(SITE.hub.eyebrow)}</p><h1>${esc(SITE.hub.title)}<span class="dc-dim">.</span></h1><p class="dc-summary">${esc(SITE.hub.lead)}</p><p class="dc-body">${esc(SITE.hub.body)}</p><p class="dc-actions"><a class="dc-cta" href="${link(first)}">${esc(SITE.hub.start)}</a><a class="dc-ghost" href="${root}">Open the app</a><a class="dc-ghost" href="${SITE.links.prismDocs}">Prism docs</a></p><h2 id="journey">Your developer journey</h2><p class="dc-dim">The five stages of the developer journey, and the pages for each.</p><ol class="dc-home-grid dc-path-grid">${journey}</ol><h2 id="types">Four kinds of documentation</h2><p class="dc-dim">${esc(SITE.diataxis.authority.split(',')[0])}'s Diátaxis: each page does one of four jobs.</p><ul class="dc-home-grid">${types}</ul><h2 id="map">Every page, by stage and type</h2>${matrix}</main>${footer(root, '')}`;
  const md = [
    `# ${SITE.hub.title}`,
    '',
    `> ${SITE.hub.lead}`,
    '',
    SITE.hub.body,
    '',
    ...STAGES.flatMap((s) => {
      const mine = ordered.filter((p) => p.journey === s.id);
      return mine.length ? [`## ${s.label}: ${s.question}`, '', ...mine.map((p) => `- [${p.title}](${live}${p.twin}) (${typeOf[p.diataxis].label}): ${p.summary}`), ''] : [];
    }),
  ].join('\n');
  return { html: doc({ root, title: 'Docs', summary: SITE.hub.lead, canonical: `${live}${SITE.hub.path}`, twin: 'index.md', body }), md };
}

function llms(pages, live, lines) {
  const pageTwins = new Set(pages.map((p) => p.twin));
  const intro = [];
  const keep = [];
  let section = null;
  for (const l of lines) {
    if (l.startsWith('# ')) continue;
    if (l.startsWith('## ')) { section = { title: l, items: [] }; keep.push(section); continue; }
    if (!section) { if (!l.startsWith('>')) intro.push(l); continue; }
    const m = l.match(/^- \[[^\]]*\]\(([^)]+)\)/);
    if (m) {
      let u = m[1];
      if (u.startsWith(live)) u = u.slice(live.length);
      u = posix.normalize(u.replace(/^\.\//, ''));
      if (pageTwins.has(u)) continue;
      section.items.push(l.replace(m[1], /^https?:/.test(m[1]) ? m[1] : `${live}${u}`));
    } else if (l.trim()) section.items.push(l);
  }
  const out = [`# ${SITE.name}`, '', `> ${SITE.hub.lead}`, '', SITE.hub.body, '', ...intro.filter((l, i, a) => l.trim() || (i > 0 && a[i - 1].trim())), ''];
  out.push(`- [Docs home](${live}${SITE.hub.path}index.md): every page by developer journey stage.`, '');
  for (const t of TABS) {
    if (!t.flat.length) continue;
    out.push(`## ${t.type.tab}`, '');
    for (const p of t.flat) out.push(`- [${p.title}](${live}${p.twin}): ${p.summary} (${stageOf[p.journey].label})`);
    out.push('');
  }
  for (const s of keep) if (s.items.length) out.push(s.title, '', ...s.items, '');
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

/** Markdown links made absolute against the twin's own URL, so the text reads the same anywhere. */
const absolute = (md, base) => md.replace(/\]\(([^)\s]+)\)/g, (all, u) => (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(u) ? all : `](${new URL(u, base).href})`));

/** llms-full.txt and feed.xml gain every page their generators left out. */
function fullText(site, pages, live) {
  const out = new Map();
  const fullAt = join(site, 'llms-full.txt');
  let full = existsSync(fullAt) ? readFileSync(fullAt, 'utf8') : '';
  const there = new Set([...full.matchAll(/^url: (\S+)$/gm)].map((m) => m[1]));
  const ordered = TABS.flatMap((t) => t.flat);
  for (const p of ordered) {
    if (there.has(`${live}${p.url}`)) continue;
    const md = readFileSync(join(site, p.twin), 'utf8').replace(/^---\n[\s\S]*?\n---\n+/, '');
    full += `${full && !full.endsWith('\n') ? '\n' : ''}${full ? '\n' : ''}---\ntitle: ${JSON.stringify(p.title)}\nurl: ${live}${p.url}\ndiataxis: ${p.diataxis}\ndeveloper-journey: ${p.journey}\n---\n\n${absolute(md, `${live}${p.twin}`).trimEnd()}\n`;
  }
  out.set('llms-full.txt', full);
  const feedAt = join(site, 'feed.xml');
  if (existsSync(feedAt)) {
    const feed = readFileSync(feedAt, 'utf8');
    const listed = new Set([...feed.matchAll(/<link>([^<]+)<\/link>/g)].map((m) => unesc(m[1])));
    const items = ordered.filter((p) => !listed.has(`${live}${p.url}`)).map((p) => `<item><title>${esc(p.title)}</title><link>${esc(`${live}${p.url}`)}</link><guid>${esc(`${live}${p.url}`)}</guid><category>${esc(typeOf[p.diataxis].label)}</category><description>${esc(p.summary)}</description></item>\n`).join('');
    if (!feed.includes('</channel>')) refuse('feed.xml has no </channel>');
    out.set('feed.xml', feed.replace('</channel>', `${items}</channel>`));
  }
  return out;
}

/** Every link between pages, and every fragment, must land. */
function checkLinks(site, pages) {
  const files = walk(site).map((f) => relative(site, f).split('\\').join('/'));
  const have = new Set(files);
  const ids = new Map();
  const idsOf = (rel) => {
    if (!ids.has(rel)) ids.set(rel, new Set([...readFileSync(join(site, rel), 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
    return ids.get(rel);
  };
  const broken = [];
  for (const rel of pages) {
    const html = readFileSync(join(site, rel), 'utf8');
    // Inline scripts and templates build their own links at run time.
    const markup = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<template[\s\S]*?<\/template>/g, '');
    for (const m of markup.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
      const raw = unesc(m[1]);
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw) || raw === '') continue;
      const [path, frag] = raw.split('#');
      let target = path === '' ? rel : posix.normalize(posix.join(posix.dirname(rel), decodeURIComponent(path.split('?')[0])));
      if (target.startsWith('..')) { broken.push(`${rel}: ${raw} leaves the site`); continue; }
      if (target === '.' || target === './') target = '';
      if (target === '' || target.endsWith('/') || (!have.has(target) && have.has(`${target}/index.html`))) target = `${target === '' ? '' : target.replace(/\/?$/, '/')}index.html`;
      if (!have.has(target)) { broken.push(`${rel}: ${raw} points at nothing`); continue; }
      if (frag && target.endsWith('.html') && !idsOf(target).has(decodeURIComponent(frag))) broken.push(`${rel}: ${raw} names no id in ${target}`);
    }
  }
  if (broken.length) refuse(`links that land nowhere:\n  ${broken.join('\n  ')}`);
}

/** The app page is the root; it gains a way to the docs beside "View spec". */
function linkApp(site) {
  const at = join(site, 'index.html');
  if (!existsSync(at)) return;
  const html = readFileSync(at, 'utf8');
  if (html.includes('id="open-docs"')) return;
  const anchor = /(<a id="open-spec" class="spec-link"[^>]*>[\s\S]*?<\/a>)/;
  if (!anchor.test(html)) refuse('index.html: the app page has no "View spec" link to put the docs link beside');
  const docIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/></svg>';
  writeFileSync(at, html.replace(anchor, `<span class="head-links"><a id="open-docs" class="spec-link" href="./${SITE.hub.path}">${docIcon}<span>Docs</span></a>$1</span>`));
}

export function shell(site) {
  const app = JSON.parse(readFileSync(join(site, 'app.json'), 'utf8'));
  const live = app.live.endsWith('/') ? app.live : `${app.live}/`;
  const pages = load(site);
  if (!pages.length) refuse('no documentation pages under site/');
  const { lines, order } = llmsOrder(site, live);
  TABS = arrange(pages, order);
  FEED = existsSync(join(site, 'feed.xml'));
  const out = new Map();
  for (const p of pages) out.set(p.rel, wrap(p, live));
  const h = hub(pages, live);
  out.set(`${SITE.hub.path}index.html`, h.html);
  out.set(`${SITE.hub.path}index.md`, h.md);
  out.set('llms.txt', llms(pages, live, lines));
  for (const [rel, body] of fullText(site, pages, live)) out.set(rel, body);
  const urls = ['', SITE.hub.path, ...TABS.flatMap((t) => t.flat.map((p) => p.url))];
  out.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(`${live}${u}`)}</loc></url>`).join('\n')}\n</urlset>\n`);
  for (const [rel, body] of out) {
    mkdirSync(dirname(join(site, rel)), { recursive: true });
    writeFileSync(join(site, rel), body);
  }
  mkdirSync(join(site, SITE.hub.path, 'fonts'), { recursive: true });
  copyFileSync(join(here, 'docs.css'), join(site, SITE.hub.path, 'docs.css'));
  for (const f of readdirSync(FONTS)) copyFileSync(join(FONTS, f), join(site, SITE.hub.path, 'fonts', f));
  linkApp(site);
  checkLinks(site, [...pages.map((p) => p.rel), `${SITE.hub.path}index.html`]);
  return { pages: pages.length, tabs: TABS.map((t) => `${t.type.tab} ${t.flat.length}`) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const r = shell(process.argv[2] ?? 'site');
    console.log(`shell: ${r.pages} pages (${r.tabs.join(', ')}), docs hub, llms.txt, sitemap.xml`);
  } catch (e) {
    if (!(e instanceof ShellError)) throw e;
    console.error(`shell: ${e.message}`);
    process.exit(1);
  }
}
