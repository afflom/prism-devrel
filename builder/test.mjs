#!/usr/bin/env node
/**
 * The builder's checks, one per register row. `crates/devrel/tests/builder.rs`
 * runs each by its ID (`node builder/test.mjs DR-07`) and requires it to pass
 * and to report the number of assertions it made, so a case that checks
 * nothing fails too.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './build.mjs';
import { deriveModel } from './model.mjs';
import { render as renderAssets } from './pack.mjs';
import { examplePage, page } from './site.mjs';
import { readPrompt } from './prompt.mjs';
import { SPEC_INPUT, TOOL } from './tool.mjs';
import { zip, crc32 } from './zip.mjs';
import { SpecError } from './vendor/prism-code/src/journey/spec.mjs';

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

const CASES = {
  // A prompt is checked as prism-code's journey checks a drafted spec, and every refusal is typed.
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
    ok(readPrompt({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'prism_prompt', arguments: good } }).app.name === 'rule-thirty-cell', 'a prompt arrives as the tools/call of prism_prompt');
    await assert.rejects(() => buildApp(good, {}), TypeError);
    made++;
  },
  // Every facet, each module with its validity theorem.
  async 'DR-08'() {
    for (const { file, prompt } of prompts()) {
      const { files, model: m } = await buildApp(prompt, { lastModified: AT });
      for (const [name, theorem] of [['Architecture', 'architectureDescriptionHolds'], ['Quality', 'qualityModelHolds'], ['Compliance', 'everyObligationEvidenced']]) ok(module(files, name).includes(`name: ${theorem},`), `${file}: ${name} proves ${theorem}`);
      ok(module(files, 'Design').includes('DesignDiagram.opmObjectProcess') && module(files, 'Design').includes('DesignDiagram.umlStateMachine'), `${file}: OPM and UML views`);
      ok(m.design.transitions.filter((t) => t.trigger.rule).length === m.spec.rules.length, `${file}: one state-machine transition per rule`);
      ok(m.features.features.length === m.spec.rules.length + m.spec.properties.length + 2, `${file}: a feature per rule and property, plus otherwise and refuse`);
      ok(m.features.journeys.length === m.architecture.stakeholders.length, `${file}: a journey per stakeholder`);
      ok(m.security.threats.every((t) => t.control || t.accepted), `${file}: every threat is controlled or accepted`);
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
    const text = page({ depth: 2, ...html, twin: 'index.md' });
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
