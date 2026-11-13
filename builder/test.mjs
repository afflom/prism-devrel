#!/usr/bin/env node
/**
 * The builder's checks, one per register row. `crates/devrel/tests/builder.rs`
 * runs each by its ID (`node builder/test.mjs DR-07`) and requires it to pass
 * and to report the number of assertions it made, so a case that checks
 * nothing fails too.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './build.mjs';
import { buildSet, routerRespond } from './set.mjs';
import { WIDTH } from './vendor/prism-code/src/journey/render.mjs';
import { machineDeclarations } from './machine.mjs';
import { deriveModel } from './model.mjs';
import { render as renderAssets } from './pack.mjs';
import { DIATAXIS, EXAMPLES, JOURNEY, OVERVIEW, PATTERN_TEXT, cliCommands, examplePage, groupOf, guidePath, guideTitle, page, prismSource, verifyScript, workflowStep, writeSite } from './site.mjs';
import { PATTERNS, STRIDE_PER_ELEMENT, XACML_DECISIONS, readPrompt } from './prompt.mjs';
import { ASSETS } from './assets.mjs';
import { SPEC_INPUT, TOOL } from './tool.mjs';
import { zip, crc32 } from './zip.mjs';
import { SpecError, holds, judge, sampleRequests } from './vendor/prism-code/src/journey/spec.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const examples = join(here, '..', 'examples');
const AT = '2026-11-12T00:00:00Z';
let made = 0;
const ok = (value, message) => {
  assert.ok(value, message);
  made++;
};
const eq = (a, b, message) => {
  assert.deepEqual(a, b, message);
  made++;
};
const refused = async (fn, pattern, message) => {
  await assert.rejects(fn, (e) => e instanceof SpecError && pattern.test(e.message), message);
  made++;
};
const prompts = () =>
  readdirSync(examples)
    .filter((f) => f.endsWith('.prompt.json'))
    .sort()
    .map((f) => ({ file: f, prompt: JSON.parse(readFileSync(join(examples, f), 'utf8')) }));
const rule30 = () => JSON.parse(readFileSync(join(examples, 'rule-30-cell.prompt.json'), 'utf8'));
const module = (files, name) => files[`app/src/${name}.lex.tex`];
const sha = (text) => createHash('sha256').update(text).digest('hex');
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const meta = (html, name) => html.match(new RegExp(`<meta name="${name}" content="([^"]*)">`))?.[1];

/**
 * A door: closed, open, locked, broken (final, entered by a kick from any
 * state) and welded, which nothing reaches from closed. The machine the
 * state-machine checks exercise.
 */
const door = () => {
  const is = (field, value) => ({ field, op: 'is', value });
  return {
    goal: 'Step a door.',
    pattern: 'stateMachine',
    machine: { state: 'door', initial: 'closed', final: ['broken'] },
    app: {
      name: 'door-step',
      purpose: 'The next state of a door.',
      fields: [
        { name: 'door', kind: 'choice', values: ['closed', 'open', 'locked', 'broken', 'welded'] },
        { name: 'event', kind: 'choice', values: ['push', 'pull', 'lock', 'unlock', 'kick'] },
      ],
      outcomes: ['closed', 'open', 'locked', 'broken', 'welded'],
      rules: [
        { when: [is('door', 'broken')], then: 'broken' },
        { when: [is('event', 'kick')], then: 'broken' },
        { when: [is('door', 'closed'), is('event', 'push')], then: 'open' },
        { when: [is('door', 'open'), is('event', 'pull')], then: 'closed' },
        { when: [is('door', 'closed'), is('event', 'lock')], then: 'locked' },
        { when: [is('door', 'locked'), is('event', 'unlock')], then: 'closed' },
        { when: [is('door', 'open')], then: 'open' },
        { when: [is('door', 'locked')], then: 'locked' },
        { when: [is('door', 'welded')], then: 'welded' },
      ],
      otherwise: 'closed',
      examples: [{ request: 'closed push', response: 'open' }, { request: 'broken push', response: 'broken' }],
    },
  };
};

const CASES = {
  // A state machine is checked as a UML 2.5.1 state machine, and its invariants over every run become theorems.
  async 'DR-17'() {
    const { files, model: m, claims } = await buildApp(door(), { lastModified: AT });
    const mc = m.machine;
    eq(mc.reachable, ['closed', 'open', 'locked', 'broken'], 'the reachable states are read off the successor relation from the initial state');
    eq(mc.unreachable, ['welded'], 'a state no step from a reachable state enters is unreachable');
    ok(mc.exhaustive && mc.sampled === 25, 'the successor relation is read from every request');
    eq(mc.derived, ['INV-001', 'INV-002', 'INV-003', 'INV-004', 'INV-005'], 'one property per final state and one per reachable and unreachable pair');
    const says = m.spec.properties.map((p) => p.says);
    ok(says[0] === 'It always answers broken when door is broken.', 'a final state is never left');
    ok(['closed', 'open', 'locked', 'broken'].every((r, i) => says[i + 1] === `It never answers welded when door is ${r}.`), 'no step from a reachable state reaches the unreachable one');
    for (const id of mc.derived) ok(module(files, m.proofs).includes(`name: ${m.names.properties[id].theorem},`) && claims.some((c) => c.id.endsWith(id.slice(-2)) || c.statement), `${id} is a theorem and a claim`);
    ok(claims.filter((c) => c.kind === 'property').length === mc.derived.length, 'every derived property is a registered claim');
    const view = m.design.views.find((v) => v.title === `The ${m.title} state machine`);
    ok(view && view.diagram === 'umlStateMachine', 'a UML state-machine view of the machine itself');
    eq(m.design.umlStates.filter((s) => s.view === view).map((s) => s.initial), [true, false, false, false, false], 'one UML state per machine state, the initial one marked');
    eq(m.design.transitions.filter((t) => t.view === view).length, mc.transitions.length, 'one UML transition per step a reachable state takes');
    ok(m.design.transitions.filter((t) => t.view === view).every((t) => t.trigger && t.source && t.target), 'every machine transition is triggered by the rule that takes it');
    // The decision is owned by the states (UML 2.5.1, 14.2.3.8): judge tests the state, then fires the first rule of that state's chain.
    const owned = machineDeclarations(m.spec, m.machine);
    eq(owned.steps.map((s) => s.value), m.machine.states, 'one chain per state');
    const byId = Object.fromEntries(m.spec.rules.map((r) => [r.id, r]));
    const fire = (ids, req) => ids.map((id) => byId[id]).find((r) => r.when.every((c) => holds(c, req)))?.then ?? m.spec.otherwise;
    const sample = [...sampleRequests(m.spec)];
    ok(sample.length > 0 && sample.every((req) => fire(owned.steps.find((s) => s.value === req[mc.state]).rules, req) === judge(m.spec, req).outcome), "each state's chain answers as the whole first-match chain, for every request");
    ok(owned.steps.every((s) => s.rules.length < m.spec.rules.length), 'each chain holds only the rules that can fire from its state');
    const text = module(files, m.module);
    ok(owned.steps.every((s) => text.includes(`name: ${s.name},`)) && text.includes('(if ((project request door) =? (doorClosed)) then (stepClosed request)'), "the app module decides by state, then by that state's chain");
    ok(owned.steps.every((s) => module(files, m.proofs).includes(`${m.module}::${s.name}`)), "every theorem unfolds the states' chains");
    const obligation = m.compliance.find((o) => o.subject === 'State machine');
    ok(obligation.standard === PATTERNS.stateMachine.standard && mc.derived.every((id) => obligation.evidence.includes(`${m.proofs}::${m.names.properties[id].theorem}`)), 'the UML obligation names every invariant theorem as its evidence');
    // Without an exhaustive sample no state is called unreachable, so a sample can never make a property false.
    const wide = door();
    wide.app.fields.push({ name: 'force', kind: 'number' });
    for (let k = 0; k < 5; k++) wide.app.fields.push({ name: `x${k}`, kind: 'choice', values: Array.from({ length: 8 }, (_, i) => `v${i}`) });
    wide.app.examples = [{ request: `closed push 0 ${'v0 '.repeat(5).trim()}`, response: 'open' }];
    const wm = deriveModel(wide).machine;
    ok(!wm.exhaustive && wm.unreachable.length === 0 && wm.derived.length === 1, 'a partial sample claims only the final state');
    const d = door();
    await refused(async () => deriveModel({ ...d, app: { ...d.app, outcomes: [...d.app.outcomes, 'ajar'] } }), /answers are exactly the states/, 'answers that are not the states are refused');
    await refused(async () => deriveModel({ ...d, machine: { ...d.machine, initial: 'ajar' } }), /not a state/, 'an initial state that is not a state is refused');
    await refused(async () => deriveModel({ ...d, machine: { ...d.machine, final: ['open'] } }), /open is final, but/, 'a final state a step leaves is refused, naming the step');
    await refused(async () => deriveModel({ ...d, machine: undefined }), /names its machine/, 'a stateMachine without its machine is refused');
    await refused(async () => deriveModel({ ...rule30(), machine: d.machine, pattern: 'decisionTable' }), /machine belongs to a stateMachine/, 'a machine on another pattern is refused');
    await refused(async () => deriveModel({ ...d, machine: { ...d.machine, state: 'force' }, app: { ...d.app, fields: [...d.app.fields, { name: 'force', kind: 'number' }] } }), /not a choice field/, 'a number field cannot be the state');
  },
  // A policy decision answers exactly the XACML 3.0 decisions, and every app's pattern is a compliance obligation with its standard.
  async 'DR-18'() {
    const r = rule30();
    await refused(async () => deriveModel({ ...r, pattern: 'policyDecision' }), /XACML 3.0 decisions/, 'a policy decision with other answers is refused');
    await refused(async () => deriveModel({ ...r, pattern: 'flowchart' }), /pattern/, 'an unknown pattern is refused');
    const is = (field, value) => ({ field, op: 'is', value });
    const policy = {
      pattern: 'policyDecision',
      app: {
        name: 'door-policy',
        purpose: 'Who may open the door.',
        fields: [{ name: 'role', kind: 'choice', values: ['owner', 'guest', 'unknown'] }, { name: 'resource', kind: 'choice', values: ['door', 'safe', 'other'] }],
        outcomes: [...XACML_DECISIONS],
        rules: [{ when: [is('role', 'unknown')], then: 'indeterminate' }, { when: [is('resource', 'other')], then: 'not-applicable' }, { when: [is('role', 'owner')], then: 'permit' }],
        otherwise: 'deny',
        properties: [{ kind: 'never', when: [is('role', 'guest'), is('resource', 'safe')], then: 'permit' }],
        examples: [{ request: 'owner safe', response: 'permit' }, { request: 'guest safe', response: 'deny' }],
      },
    };
    const m = deriveModel(policy);
    ok(m.pattern.key === 'policyDecision' && m.compliance.some((o) => o.subject === 'Policy decision' && o.standard === PATTERNS.policyDecision.standard), 'a policy decision is an XACML obligation');
    ok(deriveModel(r).compliance.some((o) => o.subject === 'Decision table' && o.standard === PATTERNS.decisionTable.standard), 'a prompt without a pattern is a DMN decision table');
    for (const { file, prompt } of prompts()) {
      const pm = deriveModel(prompt);
      ok(Object.hasOwn(PATTERNS, pm.pattern.key) && pm.compliance.filter((o) => o.standard === PATTERNS[pm.pattern.key].standard).length === 1, `${file}: one obligation for its pattern, ${pm.pattern.key}`);
      if (pm.pattern.key === 'policyDecision') eq([...pm.spec.outcomes].sort(), [...XACML_DECISIONS].sort(), `${file}: answers exactly the four decisions`);
      if (pm.pattern.key === 'stateMachine') ok(pm.machine.derived.every((id) => pm.spec.properties.some((p) => p.id === id)), `${file}: its invariants are properties`);
    }
    eq(Object.keys(PATTERN_TEXT), Object.keys(PATTERNS), 'every pattern is explained');
  },
  // The Prism source page shows every module and language entry every built app carries, from the bytes the builder carries.
  async 'DR-19'() {
    const provenance = JSON.parse(readFileSync(join(here, 'assets/provenance.json'), 'utf8'));
    eq(provenance.files.map((f) => f.path).sort(), Object.keys(ASSETS).map((p) => `app/${p}`).sort(), 'every carried file has a recorded source, and every recorded file is carried');
    for (const f of provenance.files) ok(sha(ASSETS[f.path.slice('app/'.length)]) === f.sha256 && /^[0-9a-f]{40}$/.test(f.source.commit) && /^UOR-Foundation\//.test(f.source.repository), `${f.path} has the SHA-256 its source records, at a full commit`);
    const { modules, packages, journey } = prismSource();
    ok(modules.length === Object.keys(ASSETS).filter((p) => p.endsWith('.lex.tex')).length, 'every LexLean module is on the page');
    const site = mkdtempSync(join(tmpdir(), 'devrel-source-'));
    try {
      await writeSite(site, null);
      const html = readFileSync(join(site, 'start/source/index.html'), 'utf8');
      const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      for (const m of modules) {
        ok(readFileSync(join(site, 'start/source/files', m.path), 'utf8') === m.text, `${m.path} is served as carried`);
        for (const d of m.declarations) ok(html.includes(`<code>${esc(`${m.name}::${d.name}`)}</code>`), `${m.name}::${d.name} is listed`);
      }
      ok(modules.reduce((n, m) => n + m.declarations.length, 0) > 0, 'the modules declare something');
      for (const p of packages) for (const e of p.entries) ok(html.includes(`<code>${esc(e.entry)}</code>`) && html.includes(`<code>${esc(e.denotes)}</code>`), `${p.name} ${e.entry} names what it denotes`);
      for (const j of journey) ok(/^[0-9a-f]{64}$/.test(j.sha256) && sha(readFileSync(join(site, 'start/source/files', j.path))) === j.sha256, `${j.name} is served with the digest VENDOR.md records`);
      ok(html.includes('<meta name="diataxis" content="reference">'), 'the Prism source page is reference');
    } finally {
      rmSync(site, { recursive: true, force: true });
    }
  },
  // The how-to guides are grouped by pattern, and a state machine's page runs it through the verified holo.
  async 'DR-20'() {
    const site = mkdtempSync(join(tmpdir(), 'devrel-gallery-'));
    try {
      await writeSite(site, null);
      const index = readFileSync(join(site, 'examples/index.html'), 'utf8');
      const listed = JSON.parse(readFileSync(join(site, 'examples/prompts/index.json'), 'utf8'));
      let last = -1;
      for (const key of Object.keys(PATTERNS).filter((k) => listed.some((e) => e.pattern === k))) {
        const at = index.indexOf(`<h2 id="${key}">`);
        ok(at > last, `the ${key} group follows the one before it`);
        last = at;
        const next = index.slice(at + 1).search(/<h2 id="/);
        const group = next < 0 ? index.slice(at) : index.slice(at, at + 1 + next);
        for (const e of listed) ok(group.includes(`href="${e.name}/"`) === (e.pattern === key), `${e.name} is in its own group only`);
      }
      ok(listed.length === prompts().length, 'every example is listed');
    } finally {
      rmSync(site, { recursive: true, force: true });
    }
    const { files, model: m, claims } = await buildApp(door(), { lastModified: AT });
    const verified = { fingerprint: 'f'.repeat(64) };
    const { html, twin } = examplePage({ name: 'door', repository: 'afflom/prism-devrel', summary: 'A door.' }, null, m, files, claims, 'x.zip', verified);
    ok(html.body.includes('<form id="run" class="run" data-state="0" data-initial="closed">'), 'the run starts from the initial state, and the page knows which field is the state');
    ok(html.body.includes('<textarea id="steps" rows="4" spellcheck="false">push</textarea>'), 'the run is seeded from the examples that start in the initial state');
    for (const t of m.machine.transitions) ok(html.body.includes(`<td>${t.from}</td><td>${t.to}</td><td>${t.rule}</td>`), `the transition ${t.from} to ${t.to} by ${t.rule} is shown`);
    ok(twin.includes('Pattern: State machine, OMG UML 2.5.1 behavioral state machine.'), 'the twin names the pattern');
    const script = readFileSync(join(here, 'web/example.mjs'), 'utf8');
    ok(script.includes("words.splice(at, 0, state)") && script.includes('state = answer;') && script.includes("if (answer === 'invalid') break;"), 'each answer is the next state, and a refused step ends the run');
  },
  // Every pattern has a how-to guide built from its simplest example, and every example page is in the Examples collection under its pattern.
  async 'DR-21'() {
    const site = mkdtempSync(join(tmpdir(), 'devrel-guides-'));
    try {
      writeFileSync(join(site, 'llms.txt'), '# Prism-DevRel\n');
      await writeSite(site, null);
      const listed = JSON.parse(readFileSync(join(site, 'examples/prompts/index.json'), 'utf8'));
      const rules = (e) => JSON.parse(readFileSync(join(examples, e.prompt), 'utf8')).app.rules.length;
      const { commands } = cliCommands();
      const llms = readFileSync(join(site, 'llms.txt'), 'utf8');
      for (const [key, P] of Object.entries(PATTERNS)) {
        const at = join(site, guidePath(key), 'index.html');
        ok(existsSync(at) && existsSync(join(site, guidePath(key), 'index.md')), `${key} has a how-to guide and its twin`);
        const html = readFileSync(at, 'utf8');
        eq([meta(html, 'diataxis'), meta(html, 'developer-journey'), meta(html, 'collection')], ['howToGuide', 'build', undefined], `${key}'s guide is a how-to guide for building, in no collection, so it is in the How-to guides tab`);
        ok(guideTitle(key) === `How to build ${/^[aeiou]/i.test(P.name) ? 'an' : 'a'} ${P.name.toLowerCase()} app` && html.includes(`<h1>${escHtml(guideTitle(key))}</h1>`), `${key}'s guide is titled for its pattern`);
        ok(html.includes(escHtml(PATTERN_TEXT[key])) && html.includes(escHtml(P.standard)), `${key}'s guide says when to choose the pattern, with its standard`);
        const steps = [...html.matchAll(/<h2 id="step-(\d+)">(\d+)\. /g)];
        ok(steps.length >= 3 && steps.every((m, i) => Number(m[1]) === i + 1 && Number(m[2]) === i + 1), `${key}'s guide is numbered steps`);
        const mine = listed.filter((e) => e.pattern === key);
        ok(mine.length > 0, `some example follows ${key}`);
        for (const e of mine) ok(html.includes(`href="../../examples/${e.name}/"`), `${key}'s guide links ${e.name}`);
        const w = [...mine].sort((a, b) => rules(a) - rules(b) || (a.name < b.name ? -1 : 1))[0];
        const file = `examples/${w.prompt}`;
        ok(html.includes(`<pre><code>${escHtml(JSON.stringify(JSON.parse(readFileSync(join(examples, w.prompt), 'utf8')), null, 2))}</code></pre>`), `${key}'s worked prompt is ${w.name}, its simplest example`);
        ok(html.includes(escHtml(`node builder/cli.mjs check ${file}`)) && html.includes(escHtml(verifyScript(file))), `${key}'s guide checks the prompt and runs the gate as pages.yml runs it`);
        ok(llms.includes(`](${guidePath(key)}index.md)`), `${key}'s guide is in llms.txt`);
      }
      // The gate a guide shows is the pages workflow's, so a change to pages.yml changes every guide.
      const gate = workflowStep('example', "Pass the instance's gate through the locked SDK").split('\n').filter((l) => l !== 'set -euo pipefail').join('\n');
      ok(verifyScript('P').includes(gate) && gate.includes('"$image" just vv'), 'the verify script ends with the locked SDK running just vv');
      ok(verifyScript('P').includes('node builder/cli.mjs build "$PROMPT" --out "$instance"'), 'the verify script builds the prompt it names');
      // Every builder command a guide runs is one builder/cli.mjs documents.
      const guideDirs = readdirSync(join(site, 'guides'));
      ok(guideDirs.length > Object.keys(PATTERNS).length, 'the builder offers task guides beyond the patterns');
      for (const g of guideDirs) {
        const html = readFileSync(join(site, 'guides', g, 'index.html'), 'utf8');
        eq([meta(html, 'diataxis'), meta(html, 'collection')], ['howToGuide', undefined], `guides/${g} is a how-to guide in no collection`);
        const run = [...html.matchAll(/node builder\/cli\.mjs (\w+)/g)].map((m) => m[1]);
        ok(run.every((v) => commands.some((c) => c.verb === v)), `guides/${g} runs only documented commands`);
      }
      // The Examples collection: the landing page first, then each pattern's examples in the order PATTERNS declares.
      const landing = readFileSync(join(site, 'examples/index.html'), 'utf8');
      eq([meta(landing, 'collection'), meta(landing, 'collection-group'), meta(landing, 'diataxis')], [EXAMPLES, OVERVIEW, 'howToGuide'], 'the gallery is the collection\'s overview, a how-to guide by label');
      for (const e of listed) {
        const html = readFileSync(join(site, 'examples', e.name, 'index.html'), 'utf8');
        eq([meta(html, 'collection'), meta(html, 'collection-group'), meta(html, 'diataxis'), meta(html, 'developer-journey')], [EXAMPLES, groupOf(e.pattern), 'howToGuide', 'build'], `${e.name} is in the Examples collection under ${groupOf(e.pattern)}, keeping its labels`);
        ok(html.includes(`<h1>${escHtml(e.title)}</h1>`) && html.includes(`href="../../${guidePath(e.pattern)}"`), `${e.name} is titled by its app and links its pattern's guide`);
      }
      eq([...llms.matchAll(/\]\((examples\/[^)]*index\.md)\)/g)].map((m) => m[1]), ['examples/index.md', ...Object.keys(PATTERNS).flatMap((k) => listed.filter((e) => e.pattern === k).map((e) => `examples/${e.name}/index.md`))], 'llms.txt lists the landing page, then the examples by pattern');
      await assert.rejects(async () => page({ depth: 1, title: 't', summary: 's', body: '', twin: 'index.md', diataxis: 'howToGuide', journey: 'build', collection: EXAMPLES }), TypeError);
      made++;
    } finally {
      rmSync(site, { recursive: true, force: true });
    }
  },
  // A prompt is checked as prism-code's journey checks a drafted spec, and every refusal is typed.
  async 'DR-22'() {
    // One app of each pattern, built into one application.
    const names = ['kappa-namespace-authorization', 'prismpm-container-lifecycle', 'dataflow-policy-check'];
    // A long app name makes scoped declarations outrun the line their unscoped names were laid out in.
    const prompts = names.map((n, i) => {
      const p = JSON.parse(readFileSync(join(examples, `${n}.prompt.json`), 'utf8'));
      if (i === 0) p.app.name = 'kappa-namespace-authorization-policy';
      return readPrompt(p);
    });
    const set = { schema: 'prism/prompt-set/1', name: 'gallery-set', title: 'Gallery set', purpose: 'Three gallery apps in one application.', repository: 'afflom/prism-devrel', prompts: names.map((n) => `${n}.prompt.json`) };
    const built = await buildSet(set, prompts, { lastModified: AT });
    const again = await buildSet(set, prompts, { lastModified: AT });
    eq(JSON.stringify(again.files), JSON.stringify(built.files), 'the same set always writes the same bytes');
    const { router, files, claims } = built;
    eq(files['app/prismpm.toml'].match(/^project = "(.*)"$/m)[1], router.module, 'the router is the project root');
    const roots = Object.entries(files).filter(([p, t]) => p.startsWith('app/src/') && /\n {2}name: application,\n/.test(t)).map(([p]) => p);
    eq(roots, [`app/src/${router.module}.lex.tex`], 'one application root (PP2001): the router\'s');
    // The guest crate, which compiles the router and every app module, names a declaration by its last component.
    const guest = new Set([router.module, ...router.apps.map((m) => m.module)].map((m) => `app/src/${m}.lex.tex`));
    const declared = new Map();
    for (const [path, text] of Object.entries(files).filter(([p]) => /^app\/src\/[^/]+\.lex\.tex$/.test(p))) {
      if (guest.has(path)) {
        for (const [, name] of text.matchAll(/^(?:definition|structure|inductive)\{(?:\n {2})?name: ([A-Za-z_][A-Za-z0-9_]*),/gm)) {
          ok(!declared.has(name), `${name} is declared once in the guest (${path}, ${declared.get(name)})`);
          declared.set(name, path);
        }
      }
      // As lexlean fmt lays it out: only a term outruns WIDTH.
      for (const line of text.split('\n').filter((l) => l.length > WIDTH)) ok(/^ *(?:(?:[A-Za-z_]+: )?\(|\| |[A-Za-z_]+: [A-Za-z0-9_]+,?$)/.test(line), `${path}: a line past ${WIDTH} columns is a term: ${line.slice(0, 80)}`);
    }
    // The router answers each app's vectors, prefixed with the app's name, as the app does.
    for (const m of router.apps) {
      for (const v of m.vectors) eq(routerRespond(router, Uint8Array.from([...Buffer.from(`${m.spec.name} `), ...v.bytes])), v.response, `${m.spec.name}: ${v.why}`);
      ok(router.vectors.some((v) => Buffer.from(v.bytes).toString('latin1').startsWith(`${m.spec.name} `)), `the router replays ${m.spec.name}`);
    }
    for (const v of router.vectors) eq(routerRespond(router, v.bytes), v.response, `router: ${v.why}`);
    const ids = claims.map((c) => c.id);
    eq(new Set(ids).size, ids.length, 'every claim id is distinct');
    ok(['KNAP-01', 'PCL-01', 'DPC-01', 'GS-01'].every((id) => ids.includes(id)), `${ids.join(' ')}: claims take the initials of each app's name, the facets the set's`);
    ok(files['model/ids.toml'].includes('id = "GS-01"'), 'the facet claims are registered');
  },
  async 'DR-07'() {
    const good = rule30();
    ok(deriveModel(good).spec.rules.length === 3, 'the Rule 30 prompt is accepted');
    await refused(async () => deriveModel({ ...good, app: { ...good.app, examples: [{ request: 'on off off', response: 'off' }] } }), /expects off/, 'an example the rules contradict is refused');
    await refused(async () => deriveModel({ ...good, app: { ...good.app, properties: [{ kind: 'never', when: [{ field: 'left', op: 'is', value: 'on' }], then: 'on' }] } }), /does not hold/, 'a property with a counterexample is refused');
    await refused(async () => deriveModel({ ...good, app: { ...good.app, fields: [] } }), /at least one field/, 'a spec with no field is refused');
    await refused(async () => deriveModel({ ...good, threats: [{ name: 'x', text: 'y', stride: 'tampering', asset: 'request' }] }), /control with evidence, or an accepted risk/, 'a threat with neither control nor acceptance is refused');
    await refused(async () => deriveModel({ ...good, threats: [{ name: 'x', text: 'y', stride: 'sneaking', asset: 'request', accepted: 'z' }] }), /stride/, 'an unknown STRIDE category is refused');
    await refused(async () => deriveModel({ ...good, quality: [{ characteristic: 'Reliability', subcharacteristic: 'Learnability', requirement: 'r', text: 't', measure: 'm', measureText: 'mt', threshold: 0 }] }), /subcharacteristic of Reliability/, 'a subcharacteristic outside its ISO/IEC 25010 characteristic is refused');
    await refused(async () => deriveModel({ ...good, journeys: [{ stakeholder: 'Researcher', steps: ['REQ-999'] }] }), /names no rule/, 'a journey step naming no feature is refused');
    await refused(async () => deriveModel({ ...good, stakeholders: [{ name: 'A', text: 'a', concerns: ['Nothing'] }] }), /is not a concern/, 'a stakeholder naming an undeclared concern is refused');
    await refused(async () => readPrompt({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'prism_spec', arguments: good } }), /prism_prompt/, 'a tools/call of another tool is refused');
    await refused(async () => deriveModel({ ...good, axioms: { noSuchDeclaration: ['propext'] } }), /does not declare/, 'an axiom set for a declaration the app does not have is refused');
    await refused(async () => deriveModel({ ...good, axioms: { inv001Holds: ['Classical.em'] } }), /axiom of inv001Holds/, 'an axiom outside the policy vocabulary is refused');
    const proofThreat = (reference) => ({ ...good, threats: [{ name: 'x', text: 'y', stride: 'repudiation', asset: 'answer', control: { name: 'c', text: 't', evidence: [{ kind: 'proof', reference }] } }] });
    ok(deriveModel(proofThreat('INV-001')).security.controls.some((c) => c.evidence.some((e) => e.reference === 'RuleThirtyCellProofs::inv001Holds')), 'a property id as proof evidence becomes its theorem');
    await refused(async () => deriveModel(proofThreat('INV-009')), /names no property/, 'proof evidence naming no property is refused');
    await refused(async () => deriveModel(proofThreat('RuleThirtyCellProofs::inv009Holds')), /is not a theorem of RuleThirtyCellProofs/, 'proof evidence naming a theorem the app does not declare is refused');
    ok(readPrompt({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'prism_prompt', arguments: good } }).app.name === 'rule-thirty-cell', 'a prompt arrives as the tools/call of prism_prompt');
    await assert.rejects(() => buildApp(good, {}), TypeError);
    made++;
  },
  // Every facet, each module with its validity theorem.
  async 'DR-08'() {
    for (const { file, prompt } of prompts()) {
      const { files, model: m } = await buildApp(prompt, { lastModified: AT });
      for (const [name, theorem] of [['Architecture', 'architectureDescriptionHolds'], ['Quality', 'qualityModelHolds'], ['Security', 'strideEnumerated'], ['Compliance', 'everyObligationEvidenced']]) ok(module(files, name).includes(`name: ${theorem},`), `${file}: ${name} proves ${theorem}`);
      ok(module(files, 'Design').includes('DesignDiagram.opmObjectProcess') && module(files, 'Design').includes('DesignDiagram.umlStateMachine'), `${file}: OPM and UML views`);
      ok(m.design.transitions.filter((t) => t.trigger.rule && t.view === m.design.views[3]).length === m.spec.rules.length, `${file}: one guest state-machine transition per rule`);
      ok(m.features.features.length === m.spec.rules.length + m.spec.properties.length + 2, `${file}: a feature per rule and property, plus otherwise and refuse`);
      ok(m.features.journeys.length === m.architecture.stakeholders.length, `${file}: a journey per stakeholder`);
      ok(m.security.threats.every((t) => t.control || t.reuse || t.accepted), `${file}: every threat is controlled or accepted`);
      ok(m.security.mappings.every((x) => x.controls.length > 0 && x.controls.every(Boolean)), `${file}: every mapped threat names a declared control`);
      // STRIDE per element: the answered and open pairs partition the pairs the method opens.
      const opened = m.security.elements.flatMap((x) => STRIDE_PER_ELEMENT[x.dfd].map((c) => `${x.index}:${c}`));
      const answered = new Set(m.security.threats.map((t) => `${t.target.index}:${t.stride}`));
      eq(m.security.strideOpen.map((p) => `${p.element.index}:${p.category}`), opened.filter((k) => !answered.has(k)), `${file}: the open STRIDE pairs are exactly the unanswered ones`);
      eq(m.security.elements.length, m.architecture.components.length + m.architecture.edges.length, `${file}: every component and data flow is a STRIDE element`);
      // ISO/IEC 25010:2023 whole: 9 characteristics, 40 subcharacteristics, each stated or open.
      eq([m.quality.characteristics.length, m.quality.subcharacteristics.length], [9, 40], `${file}: the whole ISO/IEC 25010:2023 model`);
      eq(m.quality.openSubcharacteristics.length + new Set(m.quality.requirements.map((r) => r.subcharacteristic)).size, 40, `${file}: each subcharacteristic is stated or open`);
      ok(m.compliance.some((o) => o.standard === 'NIST OSCAL 1.1.0') && m.compliance.filter((o) => o.holds).every((o) => module(files, 'Compliance').includes(`statement: ((${o.holds}) = true)`)), `${file}: OSCAL is an obligation and each decided obligation is re-proved`);
      ok(m.spec.properties.every((p) => m.security.controls.some((c) => c.evidence.some((e) => e.kind === 'proof' && e.reference.endsWith(`::${m.names.properties[p.id].theorem}`)))), `${file}: every property is a control's proof evidence`);
      ok(m.quality.measures.some((x) => x.threshold === m.limits.requestMaximum), `${file}: the request bound is a quality threshold, read from the spec`);
      ok(module(files, m.module).includes('Foundation.View.Text.V1.Model::TextApplication'), `${file}: one text application`);
      if (m.hasProofs) ok(module(files, m.proofs).includes('linear_arithmetic'), `${file}: the proofs module`);
      for (const t of ['Stakeholder', 'Concern', 'Component', 'Edge', 'Viewpoint', 'View']) {
        const indices = [...module(files, 'Architecture').matchAll(new RegExp(`Foundation\\.Arch::${t} \\{index := (\\d+)`, 'g'))].map((x) => Number(x[1]));
        eq(indices, indices.map((_, i) => i), `${file}: ${t} records numbered by identifier`);
      }
    }
  },
  // A whole template instance.
  async 'DR-09'() {
    const { files, remove, claims, model: m } = await buildApp(rule30(), { lastModified: AT });
    for (const path of ['app/lexlean.toml', 'app/lexlean.lock', 'app/prismpm.toml', 'app/lakefile.toml', 'app/lake-manifest.json', 'app/lean-toolchain', 'app/prompt.json', 'model/ids.toml', 'CONFORMANCE.md', 'site/app.json', `features/suites/${m.suite}.feature`, `crates/conformance/tests/${m.suite}.rs`, `openspec/specs/${m.spec.name}/spec.md`]) ok(path in files, `${path} is written`);
    eq(remove, ['app/src/Contract.lex.tex', 'crates/conformance/tests/contract.rs', 'features/suites/contract.feature'], 'the template example is replaced');
    for (const c of claims) {
      ok(files['model/ids.toml'].includes(`id = "${c.id}"`), `${c.id} is registered`);
      ok(files[`features/suites/${m.suite}.feature`].includes(`@${c.id} @build`), `${c.id} has a scenario`);
      ok(files[`crates/conformance/tests/${m.suite}.rs`].includes(`fn ${c.test}()`), `${c.id} has a test`);
      ok(files['CONFORMANCE.md'].includes(`| \`${c.id}\` | \`build\` |`), `${c.id} is in CONFORMANCE.md`);
    }
    const lock = files['app/lexlean.lock'];
    ok(lock.includes(`project_config_sha256 = "${sha(files['app/lexlean.toml'])}"`), 'the lock binds lexlean.toml');
    for (const p of ['lake-manifest.json', 'lakefile.toml', 'lean-toolchain']) ok(lock.includes(`path = "${p}"\nsha256 = "${sha(files[`app/${p}`])}"`), `the lock binds ${p}`);
    const entry = files['app/lexlean.toml'].match(/^entrypoints = \[(.*)\]$/m)[1];
    for (const name of ['Architecture', 'Compliance', 'Design', 'Features', 'Quality', 'Security', m.module, m.proofs]) ok(entry.includes(`"src/${name}.lex.tex"`), `${name} is an entrypoint`);
    ok(JSON.parse(files['site/app.json']).name === m.spec.title, 'the page describes the app');
    const observed = await buildApp({ ...rule30(), axioms: { inv001Holds: ['propext', 'Quot.sound', 'Classical.choice'] } }, { lastModified: AT });
    const theorem = module(observed.files, m.proofs).split('\n\n').find((d) => d.includes('name: inv001Holds,'));
    ok(theorem.includes('axioms: [Classical.choice, Quot.sound, propext]'), 'an observed axiom set is the policy the theorem declares');
    ok(module(files, m.proofs).split('\n\n').find((d) => d.includes('name: inv001Holds,')).includes('axioms: [Quot.sound, propext]'), 'otherwise the renderer expects Quot.sound and propext');
  },
  // The same prompt and instant write the same bytes; the archive is a valid ZIP.
  async 'DR-10'() {
    const a = await buildApp(rule30(), { lastModified: AT });
    const b = await buildApp(rule30(), { lastModified: AT });
    eq(a.files, b.files, 'equal files');
    const z = zip(a.files, AT);
    eq(z, zip(b.files, AT), 'equal archives');
    const view = new DataView(z.buffer);
    ok(view.getUint32(0, true) === 0x04034b50, 'a local file header first');
    ok(view.getUint16(z.length - 22 + 10, true) === Object.keys(a.files).length, 'the end record counts every file');
    ok(crc32(new TextEncoder().encode('123456789')) === 0xcbf43926, 'CRC-32 check value');
    const c = await buildApp(rule30(), { lastModified: '2026-11-13T00:00:00Z' });
    ok(module(a.files, 'Security') !== module(c.files, 'Security'), 'the instant dates the control set');
  },
  // The builder's copies equal their sources.
  async 'DR-12'() {
    ok(readFileSync(join(here, 'assets.mjs'), 'utf8') === renderAssets(), 'assets.mjs is packed from assets/');
    const vendor = readFileSync(join(here, 'vendor/prism-code/VENDOR.md'), 'utf8');
    for (const f of ['spec.mjs', 'session.mjs', 'render.mjs', 'template.mjs', 'mcp.mjs']) {
      const digest = sha(readFileSync(join(here, 'vendor/prism-code/src/journey', f)));
      ok(vendor.includes(`\`${digest}\``), `${f} has the digest VENDOR.md records`);
    }
    const mcp = readFileSync(join(here, 'vendor/prism-code/src/journey/mcp.mjs'), 'utf8');
    const literal = mcp.slice(mcp.indexOf('const CONDITIONS = '), mcp.indexOf('const TOOLS = '));
    const original = new Function(`${literal}; return SPEC_INPUT;`)();
    eq(SPEC_INPUT, original, 'the app input is prism_spec input, as prism-code declares it');
    ok(TOOL.inputSchema.properties.app === SPEC_INPUT, 'the tool takes it as app');
  },
  // Every example is built from its prompt into a template instance whose own gate passes in the SDK before its page is published.
  async 'DR-11'() {
    const gallery = JSON.parse(readFileSync(join(examples, 'gallery.json'), 'utf8'));
    eq(gallery.examples.map((e) => e.prompt).sort(), prompts().map((p) => p.file), 'the gallery lists every prompt in examples/, once');
    for (const e of gallery.examples) ok(/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(e.repository) && e.summary, `${e.prompt} names the repository it follows and says what it shows`);
    const yml = readFileSync(join(here, '..', '.github/workflows/pages.yml'), 'utf8');
    const job = (name) => {
      const start = yml.indexOf(`\n  ${name}:\n`);
      ok(start >= 0, `pages.yml has the ${name} job`);
      const rest = yml.slice(start + 1);
      const end = rest.slice(1).search(/\n {2}[a-z-]+:\n/);
      return end < 0 ? rest : rest.slice(0, end + 1);
    };
    ok(job('examples').includes('node builder/cli.mjs list'), 'the examples job reads the gallery');
    const example = job('example');
    ok(example.includes('needs: examples') && example.includes('fromJSON(needs.examples.outputs.names)'), 'one example job per gallery entry');
    ok(example.includes('fail-fast: false'), 'every example reports');
    ok(example.includes('.source[process.argv[1]]') && example.includes('test "$(git -C "$instance" rev-parse HEAD)" = "$(field commit)"'), 'the instance is the template at the commit frame.lock pins');
    ok(example.includes('node builder/cli.mjs build "examples/$EXAMPLE.prompt.json" --out "$instance"'), 'the builder writes the app into it');
    ok(example.includes('"$image" just vv') && example.includes('prismpm.lock'), "the instance's whole gate runs in the locked SDK");
    ok(example.includes('cp "${holos[0]}" "$out/app.holo"') && example.includes('holo-identities.json'), 'the verified holo is kept');
    const build = job('build');
    ok(build.includes('needs: example'), 'the page waits for every example');
    ok(build.includes('pattern: example-*') && build.includes('node builder/site.mjs --site site --built "$RUNNER_TEMP/built"'), 'the pages are written from the verified builds');
    ok(build.indexOf('node builder/site.mjs') < build.indexOf('node bootstrap/precache.mjs'), 'the example pages are precached');
  },
  // An example page shows every record, and prompt text is escaped in the page and quoted as data in the twin.
  async 'DR-13'() {
    const H = '<script>alert(1)</script> & "q" ``` | *x* [l](u)';
    const good = rule30();
    const hostile = { ...good, goal: H, stakeholders: [{ name: 'Researcher', text: H, concerns: good.stakeholders?.[0]?.concerns ?? [] }] };
    const { files, model: m, claims } = await buildApp(hostile, { lastModified: AT });
    const entry = { name: 'hostile', repository: 'afflom/rule30', summary: H };
    const { html, twin } = examplePage(entry, null, m, files, claims, 'x.zip', null);
    const text = page({ depth: 2, ...html, diataxis: 'howToGuide', journey: 'build', twin: 'index.md' });
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    ok(!text.includes('<script>alert'), 'no prompt text becomes markup');
    ok(text.includes(esc(H)), 'prompt text is shown escaped');
    const fenceOpen = twin.match(/^(`{3,})json$/m);
    ok(fenceOpen && fenceOpen[1].length > 3, 'the twin fences the prompt with a fence longer than any backtick run in it');
    ok(twin.split('\n').some((l) => l.startsWith('> ') && l.includes('\\<script\\>')), 'the goal is quoted as escaped Markdown');
    const records = [
      ...m.spec.rules.map((r) => r.id),
      ...m.spec.properties.map((p) => p.id),
      ...m.architecture.stakeholders.map((s) => s.name),
      ...m.architecture.concerns.map((c) => c.name),
      ...m.architecture.components.map((c) => c.name),
      ...m.design.views.map((v) => v.title),
      ...m.features.features.map((f) => f.statement),
      ...m.security.threats.map((t) => t.name),
      ...m.quality.requirements.map((r) => r.name),
      ...m.compliance.map((o) => o.standard),
      ...claims.map((c) => c.id),
    ];
    for (const r of records) ok(text.includes(esc(r)), `the page shows ${r}`);
    for (const f of Object.keys(files).filter((p) => p.startsWith('app/src/') && !/^app\/src\/(Foundation|Production)\//.test(p))) ok(text.includes(`<code>${esc(f)}</code>`), `the page shows ${f}`);
  },
  // Every page is one Diátaxis type and one developer-journey stage, and the reference is the tool's own schema.
  async 'DR-14'() {
    eq(Object.keys(DIATAXIS), ['tutorial', 'howToGuide', 'reference', 'explanation'], 'the four Diátaxis types');
    eq(Object.keys(JOURNEY), ['discover', 'evaluate', 'learn', 'build', 'scale'], 'the five journey stages of Lewko and Parton');
    await assert.rejects(async () => page({ depth: 1, title: 't', summary: 's', body: '', twin: 'index.md', diataxis: 'blog', journey: 'build' }), TypeError);
    made++;
    const site = mkdtempSync(join(tmpdir(), 'devrel-site-'));
    try {
      const { guides } = await writeSite(site, null);
      const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : e.name === 'index.html' ? [join(dir, e.name)] : []));
      const pages = walk(site);
      ok(guides >= Object.keys(PATTERNS).length && pages.length === prompts().length + 5 + guides, 'a page per example, the gallery, the tutorial, the reference, the Prism source, the explanation and every how-to guide');
      const kinds = {};
      for (const path of pages) {
        const html = readFileSync(path, 'utf8');
        const type = html.match(/<meta name="diataxis" content="([A-Za-z]+)">/)?.[1];
        const stage = html.match(/<meta name="developer-journey" content="([a-z]+)">/)?.[1];
        ok(Object.hasOwn(DIATAXIS, type) && Object.hasOwn(JOURNEY, stage), `${path.slice(site.length)} is one Diátaxis type and one journey stage`);
        kinds[path.slice(site.length + 1)] = type;
      }
      eq([kinds['start/index.html'], kinds['start/reference/index.html'], kinds['start/explanation/index.html'], kinds['examples/index.html']], ['tutorial', 'reference', 'explanation', 'howToGuide'], 'the tutorial, reference, explanation and how-to guides are separate pages');
      const reference = readFileSync(join(site, 'start/reference/index.html'), 'utf8');
      for (const k of Object.keys(TOOL.inputSchema.properties).filter((k) => k !== 'schema')) ok(reference.includes(`<td>${k}</td>`), `the reference documents ${k}`);
      for (const k of Object.keys(SPEC_INPUT.properties)) ok(reference.includes(`<td>${k}</td>`), `the reference documents app.${k}`);
    } finally {
      rmSync(site, { recursive: true, force: true });
    }
  },
};

const id = process.argv[2];
if (!CASES[id]) {
  console.error(`usage: test.mjs ${Object.keys(CASES).join('|')}`);
  process.exit(64);
}
await CASES[id]();
if (made === 0) {
  console.error(`${id} made no assertion`);
  process.exit(1);
}
console.log(`${id}: ${made} assertions passed`);
