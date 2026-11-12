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
import { PATTERNS, XACML_DECISIONS } from './prompt.mjs';
import { ASSETS } from './assets.mjs';
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

/**
 * A figure, as the declarative spec scripts/content/enrich.mjs draws
 * (scripts/content/figures.mjs): the picture, its caption and its data.
 * The twin gets the same figure as words and a table.
 */
export const figure = (spec) => `<figure class="cs-figure"><script type="application/vnd.prism.figure+json">${JSON.stringify(spec).replace(/</g, '\\u003c')}</script></figure>`;
export function figureMd(spec) {
  const rows = spec.kind === 'flow' ? spec.steps.map((s, i) => [`${i + 1}. ${s.label}`, s.sub ?? ''])
    : spec.kind === 'graph' ? spec.edges.map((e) => [spec.nodes.find((n) => n.id === e.from)?.label ?? e.from, e.label ?? '→', spec.nodes.find((n) => n.id === e.to)?.label ?? e.to])
      : spec.kind === 'bars' ? spec.rows.map((r) => [r.label, ...(r.values ?? [r.value]).map(String)])
        : spec.cells.map((c) => [c.label, c.sub ?? '']);
  const head = spec.kind === 'flow' ? ['Step', 'What happens'] : spec.kind === 'graph' ? ['From', 'Link', 'To'] : spec.kind === 'bars' ? ['', ...(spec.series ?? [spec.unit ?? 'Value'])] : ['Cell', 'Meaning'];
  return `**Figure: ${md(spec.title)}.** ${md(spec.caption)}\n\n${mdTable(head, rows)}`;
}

/** How many rules give each answer, and the default. */
function answersFigure(m) {
  const by = new Map(m.spec.outcomes.map((o) => [o, 0]));
  for (const r of m.spec.rules) by.set(r.then, (by.get(r.then) ?? 0) + 1);
  return {
    kind: 'bars', title: 'Rules for each answer', unit: 'rules',
    caption: `Each bar counts the rules that give one answer. When no rule matches, the answer is ${m.spec.otherwise}.`,
    rows: [...by].map(([label, value]) => ({ label, value, note: `${value}${label === m.spec.otherwise ? ' + default' : ''}` })),
  };
}

/** The app at a glance: a state machine as its states, any other pattern as request, rules, answer and proof. */
function heroFigure(m) {
  if (m.machine) {
    const mc = m.machine;
    const edges = new Map();
    for (const t of mc.transitions) {
      const k = `${t.from}\u0000${t.to}`;
      edges.set(k, [...(edges.get(k) ?? []), t.rule]);
    }
    return {
      kind: 'graph', title: `The ${m.title} state machine`,
      caption: `Each box is a state and each arrow a step a rule can take. A run starts at ${mc.initial}${mc.final.length ? ` and stops at ${mc.final.join(' or ')}` : ''}. Dashed arrows go back to an earlier state.`,
      nodes: mc.states.map((st) => ({ id: st, label: st, sub: [st === mc.initial ? 'start' : '', mc.final.includes(st) ? 'end' : '', mc.reachable.includes(st) ? '' : 'unreachable'].filter(Boolean).join(', ') || undefined, group: st === mc.initial ? 'start' : mc.final.includes(st) ? 'end' : 'step' })),
      edges: [...edges].map(([k, rules]) => { const [from, to] = k.split('\u0000'); return { from, to, label: rules.length === 1 ? rules[0] : `${rules.length} rules` }; }),
    };
  }
  return {
    kind: 'flow', title: `What the ${m.title} app does`,
    caption: `A request goes in, the rules decide, and the Lean kernel has already proved what the rules promise.`,
    steps: [
      { label: 'Request', sub: m.spec.fields.map((f) => f.name).join(', ') },
      { label: `${count(m.spec.rules.length, 'rule')}`, sub: m.pattern.key === 'policyDecision' ? 'the first that applies decides' : 'the first that matches wins' },
      { label: 'Answer', sub: m.spec.outcomes.join(', ') },
      { label: 'Proved', sub: `${count(m.spec.properties.length, 'theorem')}, ${count(m.vectors.length, 'test')}` },
    ],
  };
}
const code = (s) => `<code>${esc(s)}</code>`;

/** What each part of a prompt becomes, for the start page and its twin. */
const FACET_MAP = [
  ['app (prism/spec/1)', 'Behavior', 'the model the guest is built from, a theorem per property, acceptance vectors', 'LexLean, Lean kernel, prismpm verify'],
  ['stakeholders, concerns, components', 'Architecture', 'stakeholders, concerns, components, edges, viewpoints, views', 'ISO/IEC/IEEE 42010:2022'],
  ['(derived from app)', 'Design views', 'an OPM object-process view; UML component, sequence and state-machine views', 'ISO/PAS 19450, OMG UML 2.5.1'],
  ['journeys', 'Features and journeys', 'a feature per rule and property, a journey per stakeholder', 'PrismPM features (PP2014 to PP2018)'],
  ['threats', 'Security and threat model', 'assets, STRIDE threats, risks, controls with evidence, accepted risks', 'ISO/IEC 27034, 27005 (PP2019 to PP2022)'],
  ['quality', 'Quality', 'characteristics, subcharacteristics, requirements, measures with thresholds', 'ISO/IEC 25010:2023'],
  ['pattern, machine', 'Behavior and compliance', 'the pattern\'s obligation; for a state machine its states and transitions, a UML state-machine view, and theorems that final states are never left and no run leaves the reachable states', 'OMG DMN 1.5, OASIS XACML 3.0, OMG UML 2.5.1'],
  ['license', 'Compliance', 'an obligation per standard, each naming its evidence', 'the standards above, SPDX'],
  ['repository', 'System and release', 'prism.toml granting nothing, site/app.json, register rows, scenarios, tests, OpenSpec', 'UOR-Foundation/template gate and Pages'],
];

/** What each pattern means for an app, shown with its standard. */
export const PATTERN_TEXT = {
  decisionTable: 'The rules are tried in order, and the first one that matches gives the answer. If none matches, the default answer applies. This is a DMN decision table with the FIRST hit policy.',
  policyDecision: `The answer is one XACML 3.0 decision: ${XACML_DECISIONS.join(', ')}. A policy that applies gives permit or deny. If none applies, the answer is not-applicable. If the request cannot be judged, it is indeterminate.`,
  stateMachine: 'The answer is the next state, given the current state and an event. This is a UML state machine written as one pure function. The state travels in the request, so the app keeps nothing between requests. The builder proves what holds over every run.',
};

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
  section('pattern', 'Pattern', `${m.pattern.name}: ${m.pattern.standard}. ${PATTERN_TEXT[m.pattern.key]}`, ['Pattern', 'Standard', 'Answers'], [[m.pattern.name, m.pattern.standard, m.spec.outcomes.join(', ')]]);
  const answers = answersFigure(m);
  html.push(figure(answers));
  text.push(figureMd(answers));
  section('behavior', 'Behavior', `A request is ${m.spec.fields.map((f) => f.name).join(', ')}, separated by spaces. The first rule that matches decides. If none matches, the answer is ${m.spec.otherwise}. A request over ${m.limits.requestMaximum} bytes, or in any other form, is answered invalid.`, ['Rule', 'When', 'Answer', 'Why'], [
    ...m.spec.rules.map((r) => [r.id, describeConditions(r.when), r.then, r.why ?? '']),
    ['otherwise', 'no rule matches', m.spec.otherwise, m.spec.otherwiseWhy ?? ''],
  ]);
  if (m.machine) {
    const mc = m.machine;
    const kind = (s) => [s === mc.initial ? 'initial' : '', mc.final.includes(s) ? 'final' : '', mc.reachable.includes(s) ? 'reachable' : 'unreachable'].filter(Boolean).join(', ');
    section('machine', 'State machine', `The state is ${mc.state}, and the answer is the next state. A run feeds each answer back in as the next ${mc.state}, starting from ${mc.initial} (OMG UML 2.5.1, clause 14). ${mc.exhaustive ? `All ${mc.sampled} requests of the spec's sample were stepped to find the states a run can reach.` : `The spec's sample of ${mc.sampled} requests is not every request, so no state is called unreachable.`} ${mc.derived.length ? `The invariants are ${mc.derived.join(', ')}. Each holds for one step, so by induction it holds over every run.` : 'Every state can be reached and none is final, so every state is allowed in a run.'}`, ['State', 'Kind', 'Meaning'], mc.states.map((st) => [st, kind(st), m.spec.meanings?.[st] ?? '']));
    section('transitions', 'Transitions', 'Every step a reachable state can take, and the rule that takes it.', ['From', 'To', 'By'], mc.transitions.map((t) => [t.from, t.to, t.rule]));
  }
  if (m.spec.properties.length) section('properties', 'Properties Lean proves', 'Each property is a theorem about the same definitions the app is built from. It is proved for every request, not only the tested ones.', ['Property', 'Statement', 'Theorem', 'Why'], m.spec.properties.map((p) => [p.id, p.says, `${m.proofs}::${m.names.properties[p.id].theorem}`, p.why ?? '']));
  section('architecture', 'Architecture', 'Stakeholders and the concerns each one views the app through (ISO/IEC/IEEE 42010).', ['Stakeholder', 'Who they are', 'Concerns'], A.stakeholders.map((s) => [s.name, s.text, s.concerns.join(', ')]));
  section('concerns', 'Concerns', 'What the stakeholders care about, and the model each is viewed in.', ['Concern', 'What it means', 'Model'], A.concerns.map((c) => [c.name, c.text, c.model]));
  section('components', 'Components', `${A.components.length} components and ${A.edges.length} edges between them.`, ['Component', 'Kind', 'What it is'], A.components.map((c) => [c.name, c.kind, c.text]));
  section('design', 'Design views', 'The SDK checks each view against the system model and draws it as OPL and PlantUML.', ['View', 'Diagram', 'Viewpoint'], D.views.map((v) => [v.title, v.diagram, `${v.viewpoint.stakeholder.name}: ${v.viewpoint.concern.name}`]));
  section('features', 'Features and journeys', `${F.features.length} features. Each names the definitions that do the work and the tests that accept it. Each stakeholder has one journey.`, ['Feature', 'Calls', 'Accepted by'], F.features.map((f) => [f.statement, f.calls.join(', '), f.accept ? f.accept.target : f.acceptance.join(', ')]));
  section('journeys', 'Journeys', 'The ordered features each stakeholder takes.', ['Stakeholder', 'Steps'], F.journeys.map((j) => [j.actor.name, j.steps.map((s) => s.key).join(' → ')]));
  section('security', 'Security and threat model', `${S.threats.length} threats against ${S.assets.length} assets. Each has a STRIDE category, and either a control with evidence or a risk that is accepted on purpose.`, ['Threat', 'STRIDE', 'Asset', 'Risk', 'Answered by'], S.threats.map((t) => [t.name, t.stride, t.assetRecord.name, `${t.likelihood} likelihood, ${t.impact} impact`, t.control ? `${t.control.name}: ${t.control.evidence.map((e) => `${e.kind} ${e.reference}`).join('; ')}` : `accepted: ${t.accepted}`]));
  section('quality', 'Quality', 'ISO/IEC 25010:2023 requirements. Each has a measure and a threshold that a theorem pins.', ['Requirement', 'Characteristic', 'Measure', 'Threshold'], Q.requirements.map((r) => {
    const ms = Q.measures.find((x) => x.requirement === r);
    return [`${r.name}: ${r.text}`, `${r.subcharacteristic.characteristic.name}: ${r.subcharacteristic.name}`, ms.name, String(ms.threshold)];
  }));
  section('compliance', 'Compliance', 'One obligation per standard, each naming its evidence.', ['Standard', 'Subject', 'Evidence'], m.compliance.map((o) => [o.standard, o.subject, o.evidence.join(', ')]));
  return { html: html.join(''), text: text.join('\n\n') };
}

const sourcePaths = (files) => Object.keys(files).filter((p) => (p.startsWith('app/src/') && !p.startsWith('app/src/Foundation/') && !p.startsWith('app/src/Production/')) || /^(model|features|crates|openspec)\//.test(p) || p === 'app/prompt.json' || p === 'app/lexlean.toml' || p === 'site/app.json');

function sources(files) {
  return sourcePaths(files).map((p) => `<details class="source"><summary>${code(p)} <span class="dim">${files[p].split('\n').length} lines</span></summary><pre><code>${esc(files[p])}</code></pre></details>`).join('');
}

/** A run of a state machine: the steps, one per line, each the fields after the state; the page feeds every answer back as the next state. */
function runForm(m) {
  const mc = m.machine;
  const rest = m.spec.fields.filter((f) => f.name !== mc.state);
  const position = m.spec.fields.findIndex((f) => f.name === mc.state);
  const sample = m.spec.examples.filter((e) => e.request.split(' ')[position] === mc.initial).map((e) => e.request.split(' ').filter((_, i) => i !== position).join(' '));
  return `<form id="run" class="run" data-state="${position}" data-initial="${esc(mc.initial)}"><label for="steps">Run from ${esc(mc.initial)}: one step per line, each ${esc(rest.map((f) => f.name).join(' '))}</label><textarea id="steps" rows="4" spellcheck="false">${esc(sample.join('\n'))}</textarea><button type="submit">Run the machine</button><ol id="trace" class="trace" aria-live="polite"></ol></form>`;
}

export function examplePage(entry, built, m, files, claims, zipName, verified) {
  const v = verified;
  const repoUrl = `https://github.com/${entry.repository}`;
  const facets = facetSections(m);
  const hero = heroFigure(m);
  const status = v
    ? `<div class="verified" data-holo="app.holo" data-vectors="${m.vectors.length}"><dl class="stats"><div><dt>Fingerprint</dt><dd class="fp">${code(v.fingerprint)}</dd></div><div><dt>Acceptance vectors</dt><dd>${m.vectors.length}</dd></div><div><dt>Claims</dt><dd>${claims.length}</dd></div></dl><p>Verified by <code>prismpm verify</code> in the pinned SDK when this site was built. <button type="button" id="replay">Verify and replay in this browser</button> <output id="replayed" aria-live="polite"></output></p><form id="try" class="try"><label for="request">Request: ${esc(m.spec.fields.map((f) => f.name).join(' '))}</label><input id="request" name="request" autocomplete="off" spellcheck="false" value="${esc(m.spec.examples[0]?.request ?? '')}"><button type="submit">Ask the app</button><output id="answer" aria-live="polite"></output></form>${m.machine ? runForm(m) : ''}</div>`
    : `<p class="note">This example was not built when these pages were generated, so there is no holo to replay here. The pages workflow builds and verifies every example before it publishes the site.</p>`;
  const body = [
    `<p>Inspired by <a href="${repoUrl}">${esc(entry.repository)}</a>${entry.live ? ` (<a href="${esc(entry.live)}">live</a>)` : ''}. ${esc(entry.summary)}</p><p class="dim">Pattern: <a href="${esc(m.pattern.url)}">${esc(m.pattern.name)}</a>, ${esc(m.pattern.standard)}.</p>`,
    figure(hero),
    status,
    `<h2 id="prompt">The prompt</h2><p>This is the whole input. <a href="../prompts/${esc(entry.name)}.prompt.json">Raw JSON</a> · <a href="../../start/?example=${esc(entry.name)}#builder" data-example="${esc(entry.name)}">Open it in the builder</a> · <a href="${zipName}">Download the app (.zip)</a></p><pre><code>${esc(JSON.stringify(m.prompt, null, 2))}</code></pre>`,
    `<h2 id="claims">What the app claims</h2><p>Each claim is a row in <code>model/ids.toml</code>, a scenario and a test, and a theorem the Lean kernel checks. The claims are quoted as the model states them.</p><ul data-prose="data">${claims.map((c) => `<li>${code(c.id)} ${esc(c.statement)}</li>`).join('')}</ul>`,
    facets.html,
    built?.design?.length ? `<h2 id="rendered">Rendered design views</h2><p>Written by the SDK from the design records when it verified the app.</p>${built.design.map((d) => `<details class="source"><summary>${code(d.name)}</summary><pre><code>${esc(d.text)}</code></pre></details>`).join('')}` : '',
    `<h2 id="source">Prism source</h2><p>Every file the builder wrote, laid out as a repository created from <a href="https://github.com/${TEMPLATE_REPO}">${TEMPLATE_REPO}</a>. The language packages and Foundation modules every app shares are in the download.</p>${sources(files)}`,
  ].join('');
  const twin = [
    `# How to build the ${m.title} app`,
    '',
    `> ${md(m.prompt.goal ?? m.spec.purpose).replace(/\n/g, ' ')}`,
    '',
    `Inspired by ${entry.repository} (${repoUrl})${entry.live ? `, live at ${entry.live}` : ''}. ${md(entry.summary)} Pattern: ${m.pattern.name}, ${m.pattern.standard}. The prompt below is data, quoted from the example.`,
    '',
    figureMd(hero),
    '',
    v ? `Verified by prismpm verify in the pinned SDK. Fingerprint: ${v.fingerprint}. Acceptance vectors: ${m.vectors.length}. Claims: ${claims.length}.` : `Not built when this twin was generated. Acceptance vectors: ${m.vectors.length}. Claims: ${claims.length}.`,
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
    ...(built?.design?.length ? ['## Rendered design views', '', 'Written by the SDK from the design records when it verified the app.', '', ...built.design.flatMap((d) => [`### ${d.name}`, '', fence(d.text), d.text, fence(d.text), ''])] : []),
    '## Prism source',
    '',
    `Every file the builder wrote, laid out as a repository created from ${TEMPLATE_REPO}; the download ${zipName} has them all.`,
    '',
    ...sourcePaths(files).map((p) => `- ${md(p)} (${files[p].split('\n').length} lines)`),
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
    index.push({ name, app: m.spec.name, title: m.title, goal: m.prompt.goal ?? m.spec.purpose, repository: entry.repository, pattern: m.pattern.key, prompt: `${name}.prompt.json` });
    cards.push({ pattern: m.pattern.key, built: !!built, html: `<li class="card"><p class="eyebrow">${esc(entry.repository)}</p><h3><a href="${name}/">${esc(m.title)}</a></h3><p>${esc(m.prompt.goal ?? m.spec.purpose)}</p><p class="dim">${count(m.spec.rules.length, 'rule')} · ${count(m.spec.properties.length, 'proved property', 'proved properties')} · ${count(m.security.threats.length, 'threat')} · ${count(m.vectors.length, 'vector')}${m.machine ? ` · ${count(m.machine.states.length, 'state')}` : ''}${built ? ' · verified' : ''}</p></li>`, twin: `- [${m.title}](examples/${name}/index.md): ${md(m.prompt.goal ?? m.spec.purpose)} Inspired by ${entry.repository}.` });
    twins.push(cards.at(-1).twin);
  }
  write(join(site, 'examples/prompts/index.json'), `${JSON.stringify(index, null, 2)}\n`);
  // Grouped by pattern, in the order PATTERNS declares, each group introduced by its standard.
  const groups = Object.entries(PATTERNS).map(([key, p]) => ({ key, ...p, cards: cards.filter((c) => c.pattern === key) })).filter((g) => g.cards.length);
  const groupHtml = groups.map((g) => `<h2 id="${g.key}">${esc(g.name)}s</h2><p>${esc(PATTERN_TEXT[g.key])} <a href="${esc(g.url)}">${esc(g.standard)}</a>.</p><ul class="cards">${g.cards.map((c) => c.html).join('')}</ul>`).join('');
  const groupNav = `<p class="dim">${count(cards.length, 'example')}: ${groups.map((g) => `<a href="#${g.key}">${count(g.cards.length, g.name.toLowerCase())}</a>`).join(' · ')}.</p>`;
  const byPattern = { kind: 'bars', title: 'Examples by pattern', unit: 'examples', series: ['verified', 'not built here'], caption: `${count(cards.length, 'example')}. Each bar is one pattern; the coloured part was verified when this site was built.`, rows: groups.map((g) => ({ label: `${g.name}s`, values: [g.cards.filter((c) => c.built).length, g.cards.filter((c) => !c.built).length], note: String(g.cards.length) })) };
  write(join(site, 'examples/index.html'), page({ depth: 1, title: 'Example apps', diataxis: 'howToGuide', journey: 'build', summary: gallery.lead, twin: 'index.md', body: `<p>${esc(gallery.about)}</p>${figure(byPattern)}${groupNav}${groupHtml}` }));
  write(join(site, 'examples/index.md'), `# Example apps\n\n> ${gallery.lead}\n\n${gallery.about}\n\n${figureMd(byPattern)}\n\n${groups.map((g) => `## ${g.name}s\n\n${PATTERN_TEXT[g.key]} ${g.standard} (${g.url}).\n\n${g.cards.map((c) => c.twin.replace('(examples/', '(')).join('\n')}`).join('\n\n')}\n`);

  const sample = JSON.parse(readFileSync(join(repo, 'examples', gallery.examples[0].prompt), 'utf8'));
  const call = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: TOOL.name, arguments: sample } };
  const shim = (depth) => ({ imports: { 'node:crypto': `${'../'.repeat(depth)}vendor/node-crypto-shim.mjs` } });
  const ship = ['gh repo create OWNER/prism-NAME --template UOR-Foundation/template --public', 'gh api -X POST repos/OWNER/prism-NAME/pages -f build_type=workflow', 'git -c core.autocrlf=false clone https://github.com/OWNER/prism-NAME.git', 'cd prism-NAME', 'git rm -q app/src/Contract.lex.tex crates/conformance/tests/contract.rs features/suites/contract.feature', 'unzip -o ../prism-NAME.zip', 'git add -A && git commit -m "Build the app from its prompt" && git push'].join('\n');

  // Tutorial (Learn): one lesson with one outcome, a verified first app.
  const first = index[0];
  const tutorialSteps = [
    ['Load the first example.', `In the builder below, <em>Start from</em> already shows <a href="../examples/${esc(first.name)}/">${esc(first.title)} (${esc(first.repository)})</a>. Its <code>app</code> is a <code>prism/spec/1</code> spec. It lists the request fields, the answers, the rules in order, the properties Lean must prove, and examples.`],
    ['Build it.', 'Press <strong>Build the app</strong>. The builder runs in this page and sends nothing anywhere. You see what the app will claim, and every file it wrote, one module per facet.'],
    ['Change one rule and build again.', 'Change a rule\'s answer so that it contradicts an example, and build. The builder refuses and names the example. Put the rule back. Every prompt is checked before anything is written.'],
    ['Download and ship it.', 'Press <strong>Download .zip</strong> and run the commands under <a href="#ship">Ship</a>. The repository\'s gate, <code>just vv</code>, checks every claim. Its Pages workflow proves the app with the Lean kernel and publishes it.'],
  ];
  const lead = "In this tutorial you build, check and ship one Prism app from one prompt. It takes four steps. The app is verified the first time its repository's workflow runs.";
  const pipeline = {
    kind: 'flow', title: 'From one prompt to a live app',
    caption: 'What happens to your prompt. The first two steps run in this page; the last two run in your repository on GitHub.',
    steps: [
      { label: 'Write a prompt', sub: 'the rules, answers and examples, as JSON' },
      { label: 'Build', sub: 'every facet, written as Prism source' },
      { label: 'Check', sub: 'the Lean kernel proves each claim' },
      { label: 'Ship', sub: 'GitHub Pages serves the verified app' },
    ],
  };
  const shipNote = `NAME is the app's name: app.name in the prompt, such as ${first.app} for ${first.title}. The download is prism-NAME.zip. First set repository in the prompt to OWNER/prism-NAME, so the page links to the right place.`;
  const next = [
    ['../examples/', '../examples/index.md', 'Example apps', `${gallery.examples.length} how-to guides. Each is an app from a real Prism or UOR project, built from one prompt and verified.`],
    ['reference/', 'reference/index.md', 'Reference', 'every member of a prompt, the patterns, the CLI and the MCP tool.'],
    ['source/', 'source/index.md', 'Prism source', 'the Foundation modules and language every app is written in.'],
    ['explanation/', 'explanation/index.md', 'Explanation', 'how one prompt becomes every facet, and what checks each.'],
  ];
  const tutorial = [
    `<p>${esc(lead)}</p>`,
    figure(pipeline),
    `<ol class="steps">${tutorialSteps.map(([t, d]) => `<li><strong>${esc(t)}</strong> ${d}</li>`).join('')}</ol>`,
    `<h2 id="builder">Build an app</h2><div id="app-builder" class="builder"><div class="row"><label for="example">Start from</label><select id="example"><option value="">Loading examples…</option></select></div><label for="prompt" class="sr">Prompt (JSON)</label><textarea id="prompt" spellcheck="false" rows="18"></textarea><div class="row"><button type="button" id="build">Build the app</button><button type="button" id="download" disabled>Download .zip</button><output id="status" aria-live="polite"></output></div><div id="result"></div></div><noscript><p class="note">The builder needs JavaScript. Without it, run <code>node builder/cli.mjs build prompt.json --out my-app</code> from a clone of <a href="${REPOSITORY}">prism-devrel</a>.</p></noscript>`,
    `<h2 id="ship">Ship</h2><pre><code>${esc(ship)}</code></pre><p>${esc(shipNote)}</p>`,
    `<h2 id="next">Next</h2><ul>${next.map(([href, , t, d]) => `<li><a href="${href}">${esc(t)}</a>: ${esc(d)}</li>`).join('')}</ul>`,
  ].join('');
  const tutorialTwin = ['# Build your first Prism app', '', lead, '', figureMd(pipeline), '', ...tutorialSteps.map(([t, d], i) => `${i + 1}. ${t} ${d.replace(/<[^>]+>/g, '')}`), '', '## Ship', '', fence(ship), ship, fence(ship), '', shipNote, '', '## Next', '', ...next.map(([, twin, t, d]) => `- [${t}](${twin}): ${d}`), ''].join('\n');

  // What each part of a prompt becomes: FACET_MAP as a graph, prompt parts on the left, facets on the right.
  const parts = FACET_MAP.map(([part]) => part);
  const facetsOf = [...new Set(FACET_MAP.map(([, f]) => f))];
  const feeds = {
    kind: 'graph', title: 'What each part of a prompt becomes',
    caption: 'Left, the parts of a prompt. Right, the facets of the app the builder writes from them. Design views come from the app itself.',
    nodes: [...parts.map((p, i) => ({ id: `p${i}`, label: p, group: 'prompt', layer: 0 })), ...facetsOf.map((f, i) => ({ id: `f${i}`, label: f, group: 'facet', layer: 1 }))],
    edges: FACET_MAP.map(([p, f], i) => ({ from: `p${i}`, to: `f${facetsOf.indexOf(f)}` })),
  };
  // Reference (Build): the prompt's members, read from the tool's own schema.
  const members = (schema) => Object.entries(schema.properties).filter(([k]) => k !== 'schema').map(([k, v]) => [k, v.type ?? (v.enum ? 'one of' : 'value'), (schema.required ?? []).includes(k) ? 'required' : 'optional', v.description ?? '']);
  // `app` is prism_spec's input as prism-code declares it; its own description speaks of that tool, so the row says what it is here.
  const promptRows = members(TOOL.inputSchema).map((r) => (r[0] === 'app' ? [r[0], r[1], r[2], 'The whole app as a prism/spec/1 spec, the input of prism-code\'s prism_spec. Its members are below.'] : r));
  const appRows = members(TOOL.inputSchema.properties.app);
  const patternRows = Object.entries(PATTERNS).map(([k, p]) => [k, p.name, p.standard, PATTERN_TEXT[k]]);
  const machineRows = members(TOOL.inputSchema.properties.machine);
  const cliRows = [
    ['build <prompt.json> --out <dir>', 'Write every file of the app into a template instance, removing the template\'s example app.'],
    ['check <prompt.json>', 'Check the prompt and print what the app will claim, writing nothing.'],
    ['axioms <prompt.json> <verify.log>', 'Record the axiom sets a verify observed (LLV7005) in the prompt.'],
    ['schema', `Print the MCP tool ${TOOL.name}.`],
    ['list', 'Print the example names the pages workflow verifies.'],
  ];
  const head = ['Member', 'Type', 'Presence', 'Meaning'];
  const tree = {
    kind: 'graph', title: 'The shape of a prompt',
    caption: 'A prompt and its members, then the members of its app spec. The colour marks a required member.',
    nodes: [{ id: 'prompt', label: 'prompt', group: 'required', layer: 0 }, ...promptRows.map((r) => ({ id: `m-${r[0]}`, label: r[0], group: r[2], layer: 1 })), ...appRows.map((r) => ({ id: `a-${r[0]}`, label: r[0], group: r[2], layer: 2 }))],
    edges: [...promptRows.map((r) => ({ from: 'prompt', to: `m-${r[0]}` })), ...appRows.map((r) => ({ from: 'm-app', to: `a-${r[0]}` }))],
  };
  const reference = [
    `<p>A prompt is the <code>arguments</code> of one call to the MCP tool <code>${TOOL.name}</code>. Its members, and the members of its app spec, are below.</p>${figure(tree)}<h2 id="prompt">Prompt members</h2><p>This table is the tool's <a href="../../builder/tool-schema.json">input schema</a>.</p>${table(head, promptRows.map((r) => r.map(esc)))}`,
    `<h2 id="app">app: the prism/spec/1 spec</h2><p>The same input prism-code's MCP tool <code>prism_spec</code> takes.</p>${table(head, appRows.map((r) => r.map(esc)))}`,
    `<h2 id="patterns">Patterns</h2><p>The <code>pattern</code> member names the established pattern the behavior follows. Each is one function from a request to one answer. They differ in what the answer means, and in what is checked and proved.</p>${table(['pattern', 'Name', 'Standard', 'What the builder checks and proves'], patternRows.map((r) => r.map(esc)))}`,
    `<h2 id="machine">machine: the state machine</h2>${table(head, machineRows.map((r) => r.map(esc)))}`,
    `<h2 id="cli">Command line</h2>${table(['node builder/cli.mjs', 'Does'], cliRows.map((r) => r.map(esc)))}<p>Exit codes: 0 done, 2 the prompt was refused (the reason is printed), 64 usage.</p>`,
    `<h2 id="mcp">MCP tool call</h2><pre><code>${esc(JSON.stringify(call, null, 2))}</code></pre>`,
  ].join('');
  const referenceTwin = ['# Prompt reference', '', `A prompt is the arguments of one call to the MCP tool ${TOOL.name}. Its members, and the members of its app spec, are below.`, '', figureMd(tree), '', '## Prompt members', '', mdTable(head, promptRows), '', '## app: the prism/spec/1 spec', '', mdTable(head, appRows), '', '## Patterns', '', mdTable(['pattern', 'Name', 'Standard', 'What the builder checks and proves'], patternRows), '', '## machine: the state machine', '', mdTable(head, machineRows), '', '## Command line', '', mdTable(['node builder/cli.mjs', 'Does'], cliRows), '', '## MCP tool call', '', fence(JSON.stringify(call, null, 2)) + 'json', JSON.stringify(call, null, 2), fence(JSON.stringify(call, null, 2)), ''].join('\n');

  // Explanation (Evaluate): why one prompt is enough, and what checks each part.
  const why = 'A Prism app is one model with several facets, each with its own standard. Every facet but behavior follows from the behavior by fixed rules. A rule becomes a feature. A property becomes a control whose evidence is a proof. The request size limit becomes a quality threshold. So a prompt that states the behavior, and only what cannot be derived from it, decides the whole app. The builder writes it the same way every time.';
  const language = 'The prompt is structured like an MCP tool call, so every part of it is checked before anything is written. An example the rules contradict is refused with the reason. So is a property with a counterexample. Plain language can sit in front of it: a sentence becomes this prompt, then goes through the same checks, facets and proofs.';
  const facetHead = ['Prompt', 'Facet', 'Records', 'Checked against'];
  const explanation = [`<p>${esc(why)}</p>`, figure(feeds), `<h2 id="facets">One prompt, every facet</h2>${table(facetHead, FACET_MAP.map((r) => r.map(esc)))}`, `<h2 id="language">From structure to language</h2><p>${esc(language)}</p>`].join('');
  const explanationTwin = ['# How one prompt becomes every facet', '', why, '', figureMd(feeds), '', '## One prompt, every facet', '', mdTable(facetHead, FACET_MAP), '', '## From structure to language', '', language, ''].join('\n');

  write(join(site, 'start/index.html'), page({ depth: 1, title: 'Build your first Prism app', diataxis: 'tutorial', journey: 'learn', summary: 'Describe your app once, as a structured prompt, and Prism writes every facet of it, proves what it promises and publishes it.', twin: 'index.md', body: tutorial, scripts: ['../builder/web/start.mjs'], importmap: shim(1) }));
  write(join(site, 'start/index.md'), tutorialTwin);
  write(join(site, 'start/reference/index.html'), page({ depth: 2, title: 'Prompt reference', diataxis: 'reference', journey: 'build', summary: `Every member of a prism/prompt/1 prompt, the command line and the MCP tool ${TOOL.name}.`, twin: 'index.md', body: reference }));
  write(join(site, 'start/reference/index.md'), referenceTwin);
  write(join(site, 'start/explanation/index.html'), page({ depth: 2, title: 'How one prompt becomes every facet', diataxis: 'explanation', journey: 'evaluate', summary: 'Why the behavior and a few choices determine a whole Prism app, and what checks each facet.', twin: 'index.md', body: explanation }));
  write(join(site, 'start/explanation/index.md'), explanationTwin);
  write(join(site, 'builder/tool-schema.json'), `${JSON.stringify(TOOL, null, 2)}\n`);
  sourcePage(site);
  const llms = join(site, 'llms.txt');
  if (existsSync(llms)) {
    const section = ['', '## Build an app from one prompt', '', `- [Build your first Prism app](start/index.md): tutorial, one prompt to a verified app.`, `- [Prompt reference](start/reference/index.md): every member of a prompt, the CLI and the MCP tool.`, `- [How one prompt becomes every facet](start/explanation/index.md): explanation.`, `- [MCP tool ${TOOL.name}](builder/tool-schema.json): its input schema.`, `- [Prism source](start/source/index.md): the Foundation and Production modules, language packages and prism-code modules every built app carries.`, ...twins, ''].join('\n');
    writeFileSync(llms, `${readFileSync(llms, 'utf8').replace(/\n*$/, '\n')}${section}`);
  }
  return { examples: gallery.examples.length };
}

/**
 * The Prism source every built app carries unchanged, read from the builder's
 * own assets: each LexLean module with what it declares and imports, each
 * language package with the words that denote those declarations, and the
 * vendored prism-code modules that write an app's behavior. The bytes shown
 * and served are the bytes an app is built from (DR-19).
 */
export function prismSource() {
  const lexicon = {};
  for (const [path, text] of Object.entries(ASSETS)) {
    if (!/^language\/[^/]+\/entries\/.+\.toml$/.test(path)) continue;
    const module = text.match(/^module = "([^"]+)"$/m)?.[1];
    const component = text.match(/^component = "([^"]+)"$/m)?.[1];
    const surface = text.match(/^surface = "([^"]+)"$/m)?.[1];
    if (module && component && surface) lexicon[`${module}::${component}`] = { surface, entry: text.match(/^id = "([^"]+)"$/m)?.[1], package: path.split('/')[1] };
  }
  const modules = Object.entries(ASSETS)
    .filter(([path]) => path.endsWith('.lex.tex'))
    .map(([path, text]) => {
      const name = text.match(/\\begin\{lexlean\}\{([^}]+)\}/)?.[1] ?? path;
      const declarations = [...text.matchAll(/^([a-z]+)\{\n {2}name: ([A-Za-z0-9_.]+),/gm)].map((d) => ({ kind: d[1], name: d[2], word: lexicon[`${name}::${d[2]}`]?.surface ?? '' }));
      return { path: `app/${path}`, name, title: text.match(/\\title\{([^}]*)\}/)?.[1] ?? '', imports: [...text.matchAll(/\\importmodule\{([^}]+)\}/g)].map((x) => x[1]), glossaries: [...text.matchAll(/\\useglossary\{([^}]+)\}/g)].map((x) => x[1]), declarations, text };
    });
  const packages = Object.entries(ASSETS)
    .filter(([path]) => /^language\/[^/]+\/lexicon\.toml$/.test(path))
    .map(([path, text]) => {
      const pkg = path.split('/')[1];
      return { path: `app/${path}`, name: pkg, version: text.match(/^version = "([^"]+)"$/m)?.[1] ?? '', entries: Object.entries(lexicon).filter(([, e]) => e.package === pkg).map(([denotes, e]) => ({ ...e, denotes })).sort((a, b) => (a.entry < b.entry ? -1 : 1)), text };
    });
  const provenance = JSON.parse(readFileSync(join(here, 'assets/provenance.json'), 'utf8'));
  for (const f of provenance.files) Object.assign(f, { repository: f.source.repository, commit: f.source.commit, url: `https://github.com/${f.source.repository}/blob/${f.source.commit}/${f.source.path}` });
  const from = Object.fromEntries(provenance.files.map((f) => [f.path, f]));
  for (const x of [...modules, ...packages]) x.from = from[x.path];
  const vendor = readFileSync(join(here, 'vendor/prism-code/VENDOR.md'), 'utf8');
  const journey = ['spec.mjs', 'render.mjs', 'session.mjs', 'template.mjs', 'mcp.mjs'].map((f) => {
    const text = readFileSync(join(here, 'vendor/prism-code/src/journey', f), 'utf8');
    return { path: `builder/vendor/prism-code/src/journey/${f}`, name: f, summary: text.match(/^\/\*\*\n((?: \*.*\n)+?) \*\//)?.[1].replace(/^ \* ?/gm, '').split('\n\n')[0].replace(/\s+/g, ' ').trim() ?? '', sha256: vendor.match(new RegExp(`src/journey/${f.replace('.', '\\.')}\` \\| \`([0-9a-f]{64})\``))?.[1] ?? '', text };
  });
  return { modules, packages, journey, provenance };
}

function sourcePage(site) {
  const { modules, packages, journey, provenance } = prismSource();
  const kinds = (m) => Object.entries(m.declarations.reduce((a, d) => ({ ...a, [d.kind]: (a[d.kind] ?? 0) + 1 }), {})).map(([k, n]) => count(n, k, k.endsWith('s') ? `${k}es` : `${k}s`)).join(', ');
  const origin = (f) => `<a href="${esc(f.url)}">${esc(f.repository)}@${esc(f.commit.slice(0, 8))}</a>`;
  const repos = [...new Set(provenance.files.map((f) => f.repository))];
  const shares = {
    kind: 'bars', title: 'What every app carries', unit: 'files',
    caption: 'The files the builder copies into every app, by kind. None of them changes from app to app.',
    rows: [
      { label: 'LexLean modules', value: modules.length },
      { label: 'Language packages', value: packages.length },
      { label: 'Language entries', value: packages.reduce((n, p) => n + p.entries.length, 0) },
      { label: 'prism-code modules', value: journey.length },
    ],
  };
  const html = [
    `<p>Every app the builder writes carries these ${provenance.files.length} files, unchanged, beside its own model. They are the Foundation and Production modules that type its facets, and the LexLean language packages whose words name them. Each is a byte-for-byte copy of a file of ${repos.map((r) => `<a href="https://github.com/${esc(r)}">${esc(r)}</a>`).join(' or ')} at a pinned commit. Its SHA-256 is recorded in <code>builder/assets/provenance.json</code>. The prism-code modules at the end write the behavior, and are copied byte for byte too.</p>`,
    figure(shares),
    `<h2 id="modules">LexLean modules</h2>${table(['Module', 'Declares', 'Imports', 'From'], modules.map((m) => [`<a href="#${esc(m.name)}">${code(m.name)}</a>`, esc(kinds(m)), esc([...m.imports, ...m.glossaries].join(', ')), origin(m.from)]))}`,
    ...modules.map((m) => `<h3 id="${esc(m.name)}">${esc(m.name)}</h3><p><a href="files/${esc(m.path)}">${code(m.path)}</a>, ${m.text.split('\n').length} lines, from ${origin(m.from)}.</p>${table(['Declaration', 'Kind', 'Word'], m.declarations.map((d) => [code(`${m.name}::${d.name}`), esc(d.kind), esc(d.word)]))}<details class="source"><summary>Source</summary><pre><code>${esc(m.text)}</code></pre></details>`),
    `<h2 id="language">Language packages</h2><p>Each entry is a word of the controlled vocabulary an app's facet records are written in, and the declaration it denotes.</p>`,
    ...packages.map((p) => `<h3 id="${esc(p.name)}">${esc(p.name)} ${esc(p.version)}</h3><p><a href="files/${esc(p.path)}">${code(p.path)}</a>, from ${origin(p.from)}.</p>${table(['Entry', 'Word', 'Denotes'], p.entries.map((e) => [code(e.entry), esc(e.surface), code(e.denotes)]))}`),
    `<h2 id="journey">prism-code journey</h2><p>These modules check a <code>prism/spec/1</code> spec and turn it into the LexLean model the app is built from. They come from the npm package prism-code 0.7.2. Each has the SHA-256 that <code>VENDOR.md</code> records.</p>${table(['Module', 'What it does', 'SHA-256'], journey.map((j) => [`<a href="files/${esc(j.path)}">${code(j.name)}</a>`, esc(j.summary), code(j.sha256)]))}`,
  ].join('');
  const twin = [
    '# Prism source',
    '',
    `Every app the builder writes carries these ${provenance.files.length} files unchanged beside its own model, each byte for byte a file of ${repos.join(' or ')} at a pinned commit (builder/assets/provenance.json).`,
    '',
    figureMd(shares),
    '',
    '## LexLean modules',
    '',
    mdTable(['Module', 'File', 'Declares', 'Imports', 'From'], modules.map((m) => [m.name, m.path, kinds(m), [...m.imports, ...m.glossaries].join(', '), m.from.url])),
    ...modules.flatMap((m) => ['', `### ${m.name}`, '', `Source: files/${m.path}, from ${m.from.url}`, '', mdTable(['Declaration', 'Kind', 'Word'], m.declarations.map((d) => [`${m.name}::${d.name}`, d.kind, d.word]))]),
    '',
    '## Language packages',
    ...packages.flatMap((p) => ['', `### ${p.name} ${p.version}`, '', mdTable(['Entry', 'Word', 'Denotes'], p.entries.map((e) => [e.entry, e.surface, e.denotes]))]),
    '',
    '## prism-code journey',
    '',
    mdTable(['Module', 'What it does', 'SHA-256'], journey.map((j) => [j.name, j.summary, j.sha256])),
    '',
  ].join('\n');
  for (const f of [...modules, ...packages, ...journey]) write(join(site, 'start/source/files', f.path), f.text);
  for (const [path, text] of Object.entries(ASSETS)) if (path.startsWith('language/')) write(join(site, 'start/source/files/app', path), text);
  write(join(site, 'start/source/index.html'), page({ depth: 2, title: 'Prism source', diataxis: 'reference', journey: 'build', summary: 'The shared files every app is built on, and where each one comes from.', twin: 'index.md', body: html }));
  write(join(site, 'start/source/index.md'), twin);
  return modules.length;
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
