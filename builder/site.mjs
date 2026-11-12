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

/**
 * Every page is one Diátaxis documentation type (https://diataxis.fr) and
 * serves one stage of the developer journey of Lewko and Parton, Developer
 * Relations (Apress, 2021). Both lists are devrel/site.json's, which
 * devrel/shell.mjs reads to wrap every page in one header and navigation.
 */
const IA = JSON.parse(readFileSync(join(repo, 'devrel/site.json'), 'utf8'));
export const DIATAXIS = Object.fromEntries(IA.diataxis.types.map((t) => [t.id, t.label]));
export const JOURNEY = Object.fromEntries(IA.journey.stages.map((s) => [s.id, s.label]));

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

export function page({ depth, title, diataxis, journey, summary, body, twin, scripts = [], importmap = null }) {
  if (!Object.hasOwn(DIATAXIS, diataxis) || !Object.hasOwn(JOURNEY, journey)) throw new TypeError(`${title}: a page is one Diátaxis type and one journey stage`);
  const root = '../'.repeat(depth);
  const map = importmap ? `<script type="importmap">${JSON.stringify(importmap)}</script>` : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} · Prism-DevRel</title><meta name="description" content="${esc(summary)}"><meta name="diataxis" content="${diataxis}"><meta name="developer-journey" content="${journey}"><link rel="alternate" type="text/markdown" href="${twin}"><link rel="stylesheet" href="${root}learn/devrel.css"><link rel="stylesheet" href="${root}builder/web/builder.css">${map}</head><body class="foundation"><a class="skip" href="#main">Skip to content</a><header class="top"><a class="mark" href="${root}start/"><span class="spectrum" aria-hidden="true"></span>Prism-DevRel</a><nav aria-label="Site"><a href="${root}start/">Tutorial</a><a href="${root}examples/">How-to</a><a href="${root}start/reference/">Reference</a><a href="${root}start/explanation/">Explanation</a><a href="${root}learn/">Learn</a><a href="${root}">App</a><a href="${root}llms.txt">llms.txt</a><a href="${REPOSITORY}">Source</a></nav></header><main id="main" class="wide"><p class="eyebrow">// ${esc(DIATAXIS[diataxis])} · ${esc(JOURNEY[journey])}</p><h1>${esc(title)}</h1><p class="lead">${esc(summary)}</p>${body}<p class="twin">Plain text: <a href="${twin}">Markdown twin</a>.</p></main><footer class="foot"><p>Organized as <a href="https://diataxis.fr">Diátaxis</a> documentation along the developer journey (Discover, Evaluate, Learn, Build, Scale) of Lewko and Parton, <cite>Developer Relations</cite>. Written by the Prism-DevRel builder from <code>prism/prompt/1</code> prompts. Prism by the <a href="https://uor.foundation">UOR Foundation</a>. MIT or Apache-2.0.</p></footer>${scripts.map((s) => `<script type="module" src="${s}"></script>`).join('')}</body></html>
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
    `# How to build the ${m.title} app`,
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
  return { html: { title: `How to build the ${m.title} app`, summary: m.prompt.goal ?? m.spec.purpose, body }, twin };
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
    write(join(dir, 'index.html'), page({ depth: 2, ...html, diataxis: 'howToGuide', journey: 'build', twin: 'index.md', scripts: built ? ['../../builder/web/example.mjs'] : [], importmap: built ? { imports: { 'node:crypto': '../../vendor/node-crypto-shim.mjs' } } : null }));
    write(join(dir, 'index.md'), twin);
    index.push({ name, title: m.title, goal: m.prompt.goal ?? m.spec.purpose, repository: entry.repository, prompt: `${name}.prompt.json` });
    cards.push(`<li class="card"><p class="eyebrow">${esc(entry.repository)}</p><h3><a href="${name}/">${esc(m.title)}</a></h3><p>${esc(m.prompt.goal ?? m.spec.purpose)}</p><p class="dim">${count(m.spec.rules.length, 'rule')} · ${count(m.spec.properties.length, 'proved property', 'proved properties')} · ${count(m.security.threats.length, 'threat')} · ${count(m.vectors.length, 'vector')}${built ? ' · verified' : ''}</p></li>`);
    twins.push(`- [${m.title}](examples/${name}/index.md): ${md(m.prompt.goal ?? m.spec.purpose)} Inspired by ${entry.repository}.`);
  }
  write(join(site, 'examples/prompts/index.json'), `${JSON.stringify(index, null, 2)}\n`);
  write(join(site, 'examples/index.html'), page({ depth: 1, title: 'How-to guides', diataxis: 'howToGuide', journey: 'build', summary: gallery.about, twin: 'index.md', body: `<ul class="cards">${cards.join('')}</ul>` }));
  write(join(site, 'examples/index.md'), `# How-to guides\n\n${gallery.about}\n\n${twins.map((t) => t.replace('(examples/', '(')).join('\n')}\n`);

  const sample = JSON.parse(readFileSync(join(repo, 'examples', gallery.examples[0].prompt), 'utf8'));
  const call = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: TOOL.name, arguments: sample } };
  const shim = (depth) => ({ imports: { 'node:crypto': `${'../'.repeat(depth)}vendor/node-crypto-shim.mjs` } });
  const ship = ['gh repo create OWNER/prism-NAME --template UOR-Foundation/template --public', 'gh api -X POST repos/OWNER/prism-NAME/pages -f build_type=workflow', 'git -c core.autocrlf=false clone https://github.com/OWNER/prism-NAME.git', 'cd prism-NAME', 'git rm -q app/src/Contract.lex.tex crates/conformance/tests/contract.rs features/suites/contract.feature', 'unzip -o ../prism-NAME.zip', 'git add -A && git commit -m "Build the app from its prompt" && git push'].join('\n');

  // Tutorial (Learn): one lesson with one outcome, a verified first app.
  const first = gallery.examples[0];
  const tutorialSteps = [
    ['Load the first example.', `In the builder below, <em>Start from</em> already shows <a href="../examples/${esc(first.prompt.replace(/\.prompt\.json$/, ''))}/">${esc(first.summary)}</a>. Its <code>app</code> is a <code>prism/spec/1</code> spec: the request fields, the answers, the rules in order, the properties Lean must prove, and examples.`],
    ['Build it.', 'Press <strong>Build the app</strong>. The builder runs in this page and nothing is sent anywhere. You see what the app will claim and every file it wrote, one module per facet.'],
    ['Change one rule and build again.', 'Edit a rule\'s answer so that it contradicts an example, and build. The builder refuses and names the example; put the rule back. Every prompt is checked before anything is written.'],
    ['Download and ship it.', 'Press <strong>Download .zip</strong> and run the commands under <a href="#ship">Ship</a>. The repository\'s gate, <code>just vv</code>, checks every claim, and its Pages workflow proves the app with the Lean kernel and publishes it.'],
  ];
  const tutorial = [
    `<p>In this tutorial you build, check and ship one Prism app from one prompt. It takes four steps; the first app is verified the first time its repository's workflow runs.</p>`,
    `<ol class="steps">${tutorialSteps.map(([t, d]) => `<li><strong>${esc(t)}</strong> ${d}</li>`).join('')}</ol>`,
    `<h2 id="builder">Build an app</h2><div id="app-builder" class="builder"><div class="row"><label for="example">Start from</label><select id="example"><option value="">Loading examples…</option></select></div><label for="prompt" class="sr">Prompt (JSON)</label><textarea id="prompt" spellcheck="false" rows="18"></textarea><div class="row"><button type="button" id="build">Build the app</button><button type="button" id="download" disabled>Download .zip</button><output id="status" aria-live="polite"></output></div><div id="result"></div></div><noscript><p class="note">The builder needs JavaScript. Without it, run <code>node builder/cli.mjs build prompt.json --out my-app</code> from a clone of <a href="${REPOSITORY}">prism-devrel</a>.</p></noscript>`,
    `<h2 id="ship">Ship</h2><pre><code>${esc(ship)}</code></pre><p>Set <code>repository</code> in the prompt to <code>OWNER/prism-NAME</code> first, so the page links to the right place.</p>`,
    `<h2 id="next">Next</h2><ul><li><a href="../examples/">How-to guides</a>: ${gallery.examples.length} apps in the spirit of real Prism projects, each built from one prompt and verified.</li><li><a href="reference/">Reference</a>: every member of a prompt, the CLI and the MCP tool.</li><li><a href="explanation/">Explanation</a>: how one prompt becomes every facet, and what checks each.</li></ul>`,
  ].join('');
  const tutorialTwin = ['# Build your first Prism app', '', 'In this tutorial you build, check and ship one Prism app from one prompt.', '', ...tutorialSteps.map(([t, d], i) => `${i + 1}. ${t} ${d.replace(/<[^>]+>/g, '')}`), '', '## Ship', '', fence(ship), ship, fence(ship), '', '## Next', '', '- [How-to guides](../examples/index.md)', '- [Reference](reference/index.md)', '- [Explanation](explanation/index.md)', ''].join('\n');

  // Reference (Build): the prompt's members, read from the tool's own schema.
  const members = (schema) => Object.entries(schema.properties).filter(([k]) => k !== 'schema').map(([k, v]) => [k, v.type ?? (v.enum ? 'one of' : 'value'), (schema.required ?? []).includes(k) ? 'required' : 'optional', v.description ?? '']);
  // `app` is prism_spec's input as prism-code declares it; its own description speaks of that tool, so the row says what it is here.
  const promptRows = members(TOOL.inputSchema).map((r) => (r[0] === 'app' ? [r[0], r[1], r[2], 'The whole app as a prism/spec/1 spec, the input of prism-code\'s prism_spec. Its members are below.'] : r));
  const appRows = members(TOOL.inputSchema.properties.app);
  const cliRows = [
    ['build <prompt.json> --out <dir>', 'Write every file of the app into a template instance, removing the template\'s example app.'],
    ['check <prompt.json>', 'Check the prompt and print what the app will claim, writing nothing.'],
    ['axioms <prompt.json> <verify.log>', 'Record the axiom sets a verify observed (LLV7005) in the prompt.'],
    ['schema', `Print the MCP tool ${TOOL.name}.`],
    ['list', 'Print the example names the pages workflow verifies.'],
  ];
  const head = ['Member', 'Type', 'Presence', 'Meaning'];
  const reference = [
    `<h2 id="prompt">Prompt members</h2><p>A prompt is the <code>arguments</code> of one call to <code>${TOOL.name}</code>; this table is its <a href="../../builder/tool-schema.json">input schema</a>.</p>${table(head, promptRows.map((r) => r.map(esc)))}`,
    `<h2 id="app">app: the prism/spec/1 spec</h2><p>The same input prism-code's MCP tool <code>prism_spec</code> takes.</p>${table(head, appRows.map((r) => r.map(esc)))}`,
    `<h2 id="cli">Command line</h2>${table(['node builder/cli.mjs', 'Does'], cliRows.map((r) => r.map(esc)))}<p>Exit codes: 0 done, 2 the prompt was refused (the reason is printed), 64 usage.</p>`,
    `<h2 id="mcp">MCP tool call</h2><pre><code>${esc(JSON.stringify(call, null, 2))}</code></pre>`,
  ].join('');
  const referenceTwin = ['# Prompt reference', '', `A prompt is the arguments of one call to the MCP tool ${TOOL.name}.`, '', '## Prompt members', '', mdTable(head, promptRows), '', '## app: the prism/spec/1 spec', '', mdTable(head, appRows), '', '## Command line', '', mdTable(['node builder/cli.mjs', 'Does'], cliRows), '', '## MCP tool call', '', fence(JSON.stringify(call, null, 2)) + 'json', JSON.stringify(call, null, 2), fence(JSON.stringify(call, null, 2)), ''].join('\n');

  // Explanation (Evaluate): why one prompt is enough, and what checks each part.
  const why = 'A Prism app is one model with several facets, each with its own standard. Every facet but behavior has records that follow from the behavior by fixed rules: a rule is a feature, a property is a control with proof evidence, the request bound is a quality threshold. So a prompt that states the behavior, and only what cannot be derived from it, determines the whole app, and the builder writes it the same way every time.';
  const language = 'The prompt is structured, like an MCP tool call, so every part of it is checked before anything is written: an example the rules contradict, or a property with a counterexample, is refused with the reason. Natural language attaches in front of it: a sentence becomes this prompt, then the same checks, the same facets and the same proofs.';
  const facetHead = ['Prompt', 'Facet', 'Records', 'Checked against'];
  const explanation = [`<p>${esc(why)}</p>`, `<h2 id="facets">One prompt, every facet</h2>${table(facetHead, FACET_MAP.map((r) => r.map(esc)))}`, `<h2 id="language">From structure to language</h2><p>${esc(language)}</p>`].join('');
  const explanationTwin = ['# How one prompt becomes every facet', '', why, '', '## One prompt, every facet', '', mdTable(facetHead, FACET_MAP), '', '## From structure to language', '', language, ''].join('\n');

  write(join(site, 'start/index.html'), page({ depth: 1, title: 'Build your first Prism app', diataxis: 'tutorial', journey: 'learn', summary: 'Describe your app once, as a structured prompt, and Prism writes every facet of it, proves what it promises and publishes it.', twin: 'index.md', body: tutorial, scripts: ['../builder/web/start.mjs'], importmap: shim(1) }));
  write(join(site, 'start/index.md'), tutorialTwin);
  write(join(site, 'start/reference/index.html'), page({ depth: 2, title: 'Prompt reference', diataxis: 'reference', journey: 'build', summary: `Every member of a prism/prompt/1 prompt, the command line and the MCP tool ${TOOL.name}.`, twin: 'index.md', body: reference }));
  write(join(site, 'start/reference/index.md'), referenceTwin);
  write(join(site, 'start/explanation/index.html'), page({ depth: 2, title: 'How one prompt becomes every facet', diataxis: 'explanation', journey: 'evaluate', summary: 'Why the behavior and a few choices determine a whole Prism app, and what checks each facet.', twin: 'index.md', body: explanation }));
  write(join(site, 'start/explanation/index.md'), explanationTwin);
  write(join(site, 'builder/tool-schema.json'), `${JSON.stringify(TOOL, null, 2)}\n`);
  const llms = join(site, 'llms.txt');
  if (existsSync(llms)) {
    const section = ['', '## Build an app from one prompt', '', `- [Build your first Prism app](start/index.md): tutorial, one prompt to a verified app.`, `- [Prompt reference](start/reference/index.md): every member of a prompt, the CLI and the MCP tool.`, `- [How one prompt becomes every facet](start/explanation/index.md): explanation.`, `- [MCP tool ${TOOL.name}](builder/tool-schema.json): its input schema.`, ...twins, ''].join('\n');
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
