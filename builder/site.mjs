#!/usr/bin/env node
/**
 * The pages that teach the single prompt: `start/` (what a prompt is, the
 * builder in the browser, how to ship what it writes), `examples/` (the
 * gallery) and one page per example with its prompt, every facet the builder
 * derived, the Prism source it wrote and the holo the pages workflow verified.
 * Each page has a Markdown twin beside it, and llms.txt gains a section for
 * them, as the learning catalog's pages do.
 *
 *   node builder/site.mjs --site site [--built <dir>]
 *
 * `--built` is where the pages workflow put each example's verified build:
 * `<dir>/<name>/app.holo`, `holo-identities.json` and `design/`. Without it
 * the pages say the example was not built here, and offer no replay.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './build.mjs';
import { TOOL } from './tool.mjs';
import { zip } from './zip.mjs';
import { describeConditions } from './vendor/prism-code/src/journey/spec.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const REPOSITORY = 'https://github.com/afflom/prism-devrel';
const TEMPLATE_REPO = 'UOR-Foundation/template';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const md = (s) => String(s).replace(/[\\`*_[\]<>|]/g, (c) => `\\${c}`);

/** The instant a file was last committed, so a page names the prompt's own date. */
export function committed(path) {
  let out = '';
  try {
    out = execFileSync('git', ['log', '-1', '--format=%ct', '--', path], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {}
  const seconds = /^\d+$/.test(out) ? Number(out) : Math.floor(statSync(path).mtimeMs / 1000);
  return new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function page({ depth, title, eyebrow, summary, body, twin, scripts = [], importmap = null }) {
  const root = '../'.repeat(depth);
  const map = importmap ? `<script type="importmap">${JSON.stringify(importmap)}</script>` : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} · Prism-DevRel</title><meta name="description" content="${esc(summary)}"><link rel="alternate" type="text/markdown" href="${twin}"><link rel="stylesheet" href="${root}learn/devrel.css"><link rel="stylesheet" href="${root}builder/web/builder.css">${map}</head><body class="foundation"><a class="skip" href="#main">Skip to content</a><header class="top"><a class="mark" href="${root}start/"><span class="spectrum" aria-hidden="true"></span>Prism-DevRel</a><nav aria-label="Site"><a href="${root}start/">Start</a><a href="${root}examples/">Examples</a><a href="${root}learn/">Learn</a><a href="${root}">App</a><a href="${root}llms.txt">llms.txt</a><a href="${REPOSITORY}">Source</a></nav></header><main id="main" class="wide"><p class="eyebrow">// ${esc(eyebrow)}</p><h1>${esc(title)}</h1><p class="lead">${esc(summary)}</p>${body}<p class="twin">Plain text: <a href="${twin}">Markdown twin</a>.</p></main><footer class="foot"><p>Written by the Prism-DevRel builder from <code>prism/prompt/1</code> prompts. Prism by the <a href="https://uor.foundation">UOR Foundation</a>. MIT or Apache-2.0.</p></footer>${scripts.map((s) => `<script type="module" src="${s}"></script>`).join('')}</body></html>
`;
}

const table = (head, rows) => `<div class="table"><table><thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const mdTable = (head, rows) => [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map((c) => md(c)).join(' | ')} |`)].join('\n');
/** A Markdown code fence longer than any backtick run in `text`, so quoted text cannot close it. */
const fence = (text) => '`'.repeat(Math.max(3, ...[...String(text).matchAll(/`+/g)].map((r) => r[0].length + 1)));
const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const code = (s) => `<code>${esc(s)}</code>`;

/** What each part of a prompt becomes, for the start page and its twin. */
const FACET_MAP = [
  ['app (prism/spec/1)', 'Behavior', 'the model the guest is built from, a theorem per property, acceptance vectors', 'LexLean, Lean kernel, prismpm verify'],
  ['stakeholders, concerns, components', 'Architecture', 'stakeholders, concerns, components, edges, viewpoints, views', 'ISO/IEC/IEEE 42010:2022'],
  ['(derived from app)', 'Design views', 'an OPM object-process view; UML component, sequence and state-machine views', 'ISO/PAS 19450, OMG UML 2.5.1'],
  ['journeys', 'Features and journeys', 'a feature per rule and property, a journey per stakeholder', 'PrismPM features (PP2014 to PP2018)'],
  ['threats', 'Security and threat model', 'assets, STRIDE threats, risks, controls with evidence, accepted risks', 'ISO/IEC 27034, 27005 (PP2019 to PP2022)'],
  ['quality', 'Quality', 'characteristics, subcharacteristics, requirements, measures with thresholds', 'ISO/IEC 25010:2023'],
  ['license', 'Compliance', 'an obligation per standard, each naming its evidence', 'the standards above, SPDX'],
  ['repository', 'System and release', 'prism.toml granting nothing, site/app.json, register rows, scenarios, tests, OpenSpec', 'UOR-Foundation/template gate and Pages'],
];

function facetSections(m) {
  const A = m.architecture;
  const S = m.security;
  const Q = m.quality;
  const F = m.features;
  const D = m.design;
  const html = [];
  const text = [];
  const section = (id, title, intro, head, rows) => {
    html.push(`<h2 id="${id}">${esc(title)}</h2><p>${esc(intro)}</p>${table(head, rows.map((r) => r.map((c) => esc(c))))}`);
    text.push(`## ${title}\n\n${intro}\n\n${mdTable(head, rows)}`);
  };
  section('behavior', 'Behavior', `A request is ${m.spec.fields.map((f) => f.name).join(', ')}, separated by spaces; the first rule that matches decides, otherwise ${m.spec.otherwise}. Requests over ${m.limits.requestMaximum} bytes, or not in that form, are answered invalid.`, ['Rule', 'When', 'Answer', 'Why'], [
    ...m.spec.rules.map((r) => [r.id, describeConditions(r.when), r.then, r.why ?? '']),
    ['otherwise', 'no rule matches', m.spec.otherwise, m.spec.otherwiseWhy ?? ''],
  ]);
  if (m.spec.properties.length) section('properties', 'Properties Lean proves', 'Each property is a theorem about the very definitions the guest is built from, proved for every request.', ['Property', 'Statement', 'Theorem', 'Why'], m.spec.properties.map((p) => [p.id, p.says, `${m.proofs}::${m.names.properties[p.id].theorem}`, p.why ?? '']));
  section('architecture', 'Architecture', 'Stakeholders and the concerns each one views the app through (ISO/IEC/IEEE 42010).', ['Stakeholder', 'Who they are', 'Concerns'], A.stakeholders.map((s) => [s.name, s.text, s.concerns.join(', ')]));
  section('concerns', 'Concerns', 'What the stakeholders care about, and the model each is viewed in.', ['Concern', 'What it means', 'Model'], A.concerns.map((c) => [c.name, c.text, c.model]));
  section('components', 'Components', `${A.components.length} components and ${A.edges.length} edges between them.`, ['Component', 'Kind', 'What it is'], A.components.map((c) => [c.name, c.kind, c.text]));
  section('design', 'Design views', 'Each view is checked by the SDK against the system model and rendered as OPL and PlantUML.', ['View', 'Diagram', 'Viewpoint'], D.views.map((v) => [v.title, v.diagram, `${v.viewpoint.stakeholder.name}: ${v.viewpoint.concern.name}`]));
  section('features', 'Features and journeys', `${F.features.length} features, each naming the definitions that realize it and the rows that accept it; one journey per stakeholder.`, ['Feature', 'Calls', 'Accepted by'], F.features.map((f) => [f.statement, f.calls.join(', '), f.accept ? f.accept.target : f.acceptance.join(', ')]));
  section('journeys', 'Journeys', 'The ordered features each stakeholder takes.', ['Stakeholder', 'Steps'], F.journeys.map((j) => [j.actor.name, j.steps.map((s) => s.key).join(' → ')]));
  section('security', 'Security and threat model', `${S.threats.length} threats against ${S.assets.length} assets, each with a STRIDE category and a control with evidence, or an accepted risk.`, ['Threat', 'STRIDE', 'Asset', 'Risk', 'Answered by'], S.threats.map((t) => [t.name, t.stride, t.assetRecord.name, `${t.likelihood} likelihood, ${t.impact} impact`, t.control ? `${t.control.name}: ${t.control.evidence.map((e) => `${e.kind} ${e.reference}`).join('; ')}` : `accepted: ${t.accepted}`]));
  section('quality', 'Quality', 'ISO/IEC 25010:2023 requirements, each with a measure and the threshold a theorem pins.', ['Requirement', 'Characteristic', 'Measure', 'Threshold'], Q.requirements.map((r) => {
    const ms = Q.measures.find((x) => x.requirement === r);
    return [`${r.name}: ${r.text}`, `${r.subcharacteristic.characteristic.name}: ${r.subcharacteristic.name}`, ms.name, String(ms.threshold)];
  }));
  section('compliance', 'Compliance', 'One obligation per standard, each naming its evidence.', ['Standard', 'Subject', 'Evidence'], m.compliance.map((o) => [o.standard, o.subject, o.evidence.join(', ')]));
  return { html: html.join(''), text: text.join('\n\n') };
}

function sources(files) {
  const shown = Object.keys(files).filter((p) => (p.startsWith('app/src/') && !p.startsWith('app/src/Foundation/') && !p.startsWith('app/src/Production/')) || /^(model|features|crates|openspec)\//.test(p) || p === 'app/prompt.json' || p === 'app/lexlean.toml' || p === 'site/app.json');
  return shown.map((p) => `<details class="source"><summary>${code(p)} <span class="dim">${files[p].split('\n').length} lines</span></summary><pre><code>${esc(files[p])}</code></pre></details>`).join('');
}

export function examplePage(entry, built, m, files, claims, zipName, verified) {
  const v = verified;
  const repoUrl = `https://github.com/${entry.repository}`;
  const facets = facetSections(m);
  const status = v
    ? `<div class="verified" data-holo="app.holo" data-vectors="${m.vectors.length}"><dl class="stats"><div><dt>Fingerprint</dt><dd class="fp">${code(v.fingerprint)}</dd></div><div><dt>Acceptance vectors</dt><dd>${m.vectors.length}</dd></div><div><dt>Claims</dt><dd>${claims.length}</dd></div></dl><p>Verified by <code>prismpm verify</code> in the pinned SDK when this site was built. <button type="button" id="replay">Verify and replay in this browser</button> <output id="replayed" aria-live="polite"></output></p><form id="try" class="try"><label for="request">Request: ${esc(m.spec.fields.map((f) => f.name).join(' '))}</label><input id="request" name="request" autocomplete="off" spellcheck="false" value="${esc(m.spec.examples[0]?.request ?? '')}"><button type="submit">Ask the app</button><output id="answer" aria-live="polite"></output></form></div>`
    : `<p class="note">This example was not built when these pages were generated, so there is no holo to replay here. The pages workflow builds and verifies every example before it publishes the site.</p>`;
  const body = [
    `<p>Inspired by <a href="${repoUrl}">${esc(entry.repository)}</a>${entry.live ? ` (<a href="${esc(entry.live)}">live</a>)` : ''}: ${esc(entry.summary)}</p>`,
    status,
    `<h2 id="prompt">The prompt</h2><p>This is the whole input. <a href="../prompts/${esc(entry.name)}.prompt.json">Raw JSON</a> · <a href="../../start/#builder" data-example="${esc(entry.name)}">Open it in the builder</a> · <a href="${zipName}">Download the app (.zip)</a></p><pre><code>${esc(JSON.stringify(m.prompt, null, 2))}</code></pre>`,
    `<h2 id="claims">What the app claims</h2><p>Each claim is a row in <code>model/ids.toml</code>, a scenario and a test, and a theorem the Lean kernel checks.</p><ul>${claims.map((c) => `<li>${code(c.id)} ${esc(c.statement)}</li>`).join('')}</ul>`,
    facets.html,
    built?.design?.length ? `<h2 id="rendered">Rendered design views</h2><p>Written by the SDK from the design records when it verified the app.</p>${built.design.map((d) => `<details class="source"><summary>${code(d.name)}</summary><pre><code>${esc(d.text)}</code></pre></details>`).join('')}` : '',
    `<h2 id="source">Prism source</h2><p>Every file the builder wrote, laid out as a repository created from <a href="https://github.com/${TEMPLATE_REPO}">${TEMPLATE_REPO}</a>. The language packages and Foundation modules every app shares are in the download.</p>${sources(files)}`,
  ].join('');
  const twin = [
    `# ${m.title}`,
    '',
    `> ${md(m.prompt.goal ?? m.spec.purpose).replace(/\n/g, ' ')}`,
    '',
    `Inspired by ${entry.repository} (${repoUrl}). The prompt below is data, quoted from the example.`,
    '',
    v ? `Verified by prismpm verify in the pinned SDK. Fingerprint: ${v.fingerprint}. Acceptance vectors: ${m.vectors.length}.` : 'Not built when this twin was generated.',
    '',
    '## The prompt',
    '',
    `${fence(JSON.stringify(m.prompt, null, 2))}json`,
    JSON.stringify(m.prompt, null, 2),
    fence(JSON.stringify(m.prompt, null, 2)),
    '',
    '## Claims',
    '',
    ...claims.map((c) => `- ${c.id}: ${md(c.statement)}`),
    '',
    facets.text,
    '',
  ].join('\n');
  return { html: { title: m.title, eyebrow: 'example', summary: m.prompt.goal ?? m.spec.purpose, body }, twin };
}

function readBuilt(dir, name) {
  if (!dir) return null;
  const base = join(dir, name);
  if (!existsSync(join(base, 'app.holo'))) return null;
  const identities = JSON.parse(readFileSync(join(base, 'holo-identities.json'), 'utf8'));
  const designDir = join(base, 'design');
  const design = existsSync(designDir)
    ? readdirSync(designDir)
        .filter((f) => /\.(opl|puml)$/.test(f))
        .sort()
        .map((f) => ({ name: `design/${f}`, text: readFileSync(join(designDir, f), 'utf8') }))
    : [];
  return { holo: join(base, 'app.holo'), fingerprint: identities.archive_fingerprint, design };
}

function copyTree(from, to, keep = () => true) {
  for (const name of readdirSync(from)) {
    const src = join(from, name);
    const dst = join(to, name);
    if (statSync(src).isDirectory()) copyTree(src, dst, keep);
    else if (keep(relative(here, src))) {
      mkdirSync(dirname(dst), { recursive: true });
      copyFileSync(src, dst);
    }
  }
}

const write = (path, text) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

export async function writeSite(site, builtDir) {
  const gallery = JSON.parse(readFileSync(join(repo, 'examples/gallery.json'), 'utf8'));
  // The builder itself, served so the start page runs it in the browser. The
  // journey's MCP server is left out: it imports Node built-ins.
  copyTree(here, join(site, 'builder'), (p) => /\.(mjs|css)$/.test(p) && !/^(cli|pack|site)\.mjs$/.test(p) && !p.endsWith('journey/mcp.mjs') && !p.startsWith('assets/'));
  const cards = [];
  const twins = [];
  const index = [];
  for (const entry of gallery.examples) {
    const name = entry.prompt.replace(/\.prompt\.json$/, '');
    const promptPath = join(repo, 'examples', entry.prompt);
    const prompt = JSON.parse(readFileSync(promptPath, 'utf8'));
    const lastModified = committed(promptPath);
    const { files, model: m, claims } = await buildApp(prompt, { lastModified });
    const dir = join(site, 'examples', name);
    const zipName = `prism-${m.spec.name}.zip`;
    writeFileSync(join(mkdirp(dir), zipName), zip(files, lastModified));
    write(join(site, 'examples/prompts', `${name}.prompt.json`), readFileSync(promptPath, 'utf8'));
    const built = readBuilt(builtDir, name);
    if (built) copyFileSync(built.holo, join(dir, 'app.holo'));
    const { html, twin } = examplePage({ ...entry, name }, built, m, files, claims, zipName, built);
    write(join(dir, 'index.html'), page({ depth: 2, ...html, twin: 'index.md', scripts: built ? ['../../builder/web/example.mjs'] : [], importmap: built ? { imports: { 'node:crypto': '../../vendor/node-crypto-shim.mjs' } } : null }));
    write(join(dir, 'index.md'), twin);
    index.push({ name, title: m.title, goal: m.prompt.goal ?? m.spec.purpose, repository: entry.repository, prompt: `${name}.prompt.json` });
    cards.push(`<li class="card"><p class="eyebrow">${esc(entry.repository)}</p><h3><a href="${name}/">${esc(m.title)}</a></h3><p>${esc(m.prompt.goal ?? m.spec.purpose)}</p><p class="dim">${count(m.spec.rules.length, 'rule')} · ${count(m.spec.properties.length, 'proved property', 'proved properties')} · ${count(m.security.threats.length, 'threat')} · ${count(m.vectors.length, 'vector')}${built ? ' · verified' : ''}</p></li>`);
    twins.push(`- [${m.title}](examples/${name}/index.md): ${md(m.prompt.goal ?? m.spec.purpose)} Inspired by ${entry.repository}.`);
  }
  write(join(site, 'examples/prompts/index.json'), `${JSON.stringify(index, null, 2)}\n`);
  write(join(site, 'examples/index.html'), page({ depth: 1, title: 'Examples', eyebrow: 'gallery', summary: gallery.about, twin: 'index.md', body: `<ul class="cards">${cards.join('')}</ul>` }));
  write(join(site, 'examples/index.md'), `# Examples\n\n${gallery.about}\n\n${twins.map((t) => t.replace('(examples/', '(')).join('\n')}\n`);

  const sample = JSON.parse(readFileSync(join(repo, 'examples', gallery.examples[0].prompt), 'utf8'));
  const call = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: TOOL.name, arguments: sample } };
  const start = [
    `<ol class="steps"><li><strong>Write one prompt.</strong> Its <code>app</code> is the <code>prism/spec/1</code> spec prism-code's MCP tool <code>prism_spec</code> takes: the request fields, the answers, the rules in order, the properties Lean must prove, and examples. Everything else is optional, and derived from the spec when left out.</li><li><strong>Build.</strong> Here in the browser, with <code>node builder/cli.mjs build prompt.json --out my-app</code>, or by an agent calling the MCP tool <code>${TOOL.name}</code>. Every facet is written: architecture, design views, features and journeys, security and the threat model, quality, compliance and the behavior with its proofs.</li><li><strong>Ship.</strong> Create a repository from <a href="https://github.com/${TEMPLATE_REPO}">${TEMPLATE_REPO}</a>, put the files in, push. Its gate checks every claim and its Pages workflow verifies the holo and publishes it.</li></ol>`,
    `<h2 id="facets">One prompt, every facet</h2><p>What each part of the prompt becomes, and what checks it.</p>${table(['Prompt', 'Facet', 'Records', 'Checked against'], FACET_MAP.map((r) => r.map(esc)))}`,
    `<h2 id="builder">Build an app</h2><p>Pick an example or paste your own prompt. The builder runs here, in this page: nothing is sent anywhere.</p><div id="app-builder" class="builder"><div class="row"><label for="example">Start from</label><select id="example"><option value="">Loading examples…</option></select></div><label for="prompt" class="sr">Prompt (JSON)</label><textarea id="prompt" spellcheck="false" rows="18"></textarea><div class="row"><button type="button" id="build">Build the app</button><button type="button" id="download" disabled>Download .zip</button><output id="status" aria-live="polite"></output></div><div id="result"></div></div><noscript><p class="note">The builder needs JavaScript. Without it, run <code>node builder/cli.mjs build prompt.json --out my-app</code> from a clone of <a href="${REPOSITORY}">prism-devrel</a>.</p></noscript>`,
    `<h2 id="ship">Ship what it writes</h2><pre><code>${esc(['gh repo create OWNER/prism-NAME --template UOR-Foundation/template --public', 'gh api -X POST repos/OWNER/prism-NAME/pages -f build_type=workflow', 'git -c core.autocrlf=false clone https://github.com/OWNER/prism-NAME.git', 'cd prism-NAME', 'git rm -q app/src/Contract.lex.tex crates/conformance/tests/contract.rs features/suites/contract.feature', 'unzip -o ../prism-NAME.zip', 'git add -A && git commit -m "Build the app from its prompt" && git push'].join('\n'))}</code></pre><p>Set <code>repository</code> in the prompt to <code>OWNER/prism-NAME</code> first, so the page links to the right place. The <code>bootstrap</code> workflow runs the gate, <code>just vv</code>, and <code>pages</code> builds, verifies and publishes the holo.</p>`,
    `<h2 id="mcp">As an MCP tool call</h2><p>The prompt is the <code>arguments</code> of one call to <code>${TOOL.name}</code>; its <a href="../builder/tool-schema.json">input schema</a> embeds <code>prism_spec</code>'s. An agent drafts the spec from one sentence, as prism-code's guided build already does, and the facets with it.</p><pre><code>${esc(JSON.stringify(call, null, 2))}</code></pre>`,
    `<h2 id="language">From structure to language</h2><p>Today the prompt is structured, like an MCP tool call, so every part of it is checked before anything is written: an example the rules contradict, or a property with a counterexample, is refused with the reason. Natural language attaches in front of it: a sentence becomes this prompt, then the same checks, the same facets and the same proofs.</p>`,
    `<h2 id="examples">Examples</h2><p>${gallery.examples.length} apps in the spirit of real Prism projects, from <a href="https://github.com/afflom">afflom</a> and the <a href="https://github.com/UOR-Foundation">UOR Foundation</a>, each built from one prompt and verified. <a href="../examples/">See them all</a>.</p>`,
  ].join('');
  write(
    join(site, 'start/index.html'),
    page({ depth: 1, title: 'One prompt, a whole Prism app', eyebrow: 'start', summary: 'Describe your app once, as a structured prompt, and Prism writes every facet of it, proves what it promises and publishes it.', twin: 'index.md', body: start, scripts: ['../builder/web/start.mjs'], importmap: { imports: { 'node:crypto': '../vendor/node-crypto-shim.mjs' } } }),
  );
  write(
    join(site, 'start/index.md'),
    [
      '# One prompt, a whole Prism app',
      '',
      'Describe your app once, as a structured prism/prompt/1 prompt, and the Prism-DevRel builder writes every facet of it as a repository created from UOR-Foundation/template.',
      '',
      '1. Write one prompt. Its app member is the prism/spec/1 spec prism-code\'s MCP tool prism_spec takes. Everything else is optional and derived from the spec.',
      `2. Build: node builder/cli.mjs build prompt.json --out my-app, or the MCP tool ${TOOL.name}.`,
      '3. Ship: push the files to a repository created from UOR-Foundation/template; its gate and Pages workflow verify and publish the app.',
      '',
      '## One prompt, every facet',
      '',
      mdTable(['Prompt', 'Facet', 'Records', 'Checked against'], FACET_MAP),
      '',
      '## As an MCP tool call',
      '',
      '```json',
      JSON.stringify(call, null, 2),
      '```',
      '',
      '## Examples',
      '',
      ...twins,
      '',
    ].join('\n'),
  );
  write(join(site, 'builder/tool-schema.json'), `${JSON.stringify(TOOL, null, 2)}\n`);
  const llms = join(site, 'llms.txt');
  if (existsSync(llms)) {
    const section = ['', '## Build an app from one prompt', '', `- [One prompt, a whole Prism app](start/index.md): the prism/prompt/1 prompt, what each part becomes, and how to ship it.`, `- [MCP tool ${TOOL.name}](builder/tool-schema.json): its input schema.`, ...twins, ''].join('\n');
    writeFileSync(llms, `${readFileSync(llms, 'utf8').replace(/\n*$/, '\n')}${section}`);
  }
  return { examples: gallery.examples.length };
}

function mkdirp(dir) {
  mkdirSync(dir, { recursive: true });
  return dir;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const flag = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const site = flag('--site');
  if (!site) {
    console.error('usage: site.mjs --site <dir> [--built <dir>]');
    process.exit(64);
  }
  const { examples } = await writeSite(site, flag('--built'));
  console.log(`wrote start/, examples/ and ${examples} example pages into ${site}`);
}
