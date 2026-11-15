/**
 * The system as a whole: the top of a set's architecture description (ISO/IEC/IEEE
 * 42010) and its OPM system diagram (ISO 19450), from the set's `system` record.
 *
 * Without it a set describes only its decisions, each with its own OPM view. The
 * `system` record says what the decisions are parts of: the system's main process,
 * its beneficiary and the attribute of the beneficiary it changes (from one state
 * to another), the objects the main process uses (instruments), takes in (inputs)
 * and makes (results), and the parts the main process zooms into. Every decision of
 * the set is a part's, exactly once; a part no decision realizes yet states what it
 * owes. Each standard the system answers to is named once, by its key in the
 * repository's standards register, with what it settles for the system.
 *
 * The records it adds: a stakeholder (the beneficiary), a concern (the attribute),
 * a viewpoint and a view; components for the system, the beneficiary, every input
 * and result it names (a shared component, such as the browser, by its key); the
 * main process, one process per part, and the attribute's two states; two OPM views,
 * the system diagram and its zoom (main process into parts, each part into the
 * Decide process of every decision it holds); one compliance obligation per standard.
 */
import { SpecError } from './vendor/prism-code/src/journey/spec.mjs';

const SHARED = ['browser', 'build', 'host', 'source'];
const KINDS = ['service', 'database', 'externalSystem', 'cliAdapter', 'staticSite', 'releaseBinary'];
const pascal = (s) =>
  String(s)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('') || 'X';
const text = (v, where) => {
  if (typeof v !== 'string' || !v.trim()) throw new SpecError(`The system needs \`${where}\`.`, `system.${where}`);
  return v;
};
const named = (v, where) => ({ name: text(v?.name, `${where}.name`), text: text(v?.text, `${where}.text`) });

/** The `system` record, checked against the set's apps (by their prompt's name in the set, without `.prompt.json`). */
export function readSystem(system, apps) {
  if (system === undefined) return null;
  const s = {
    name: text(system.name, 'name'),
    text: text(system.text, 'text'),
    frame: text(system.frame, 'frame'),
    mainProcess: named(system.mainProcess, 'mainProcess'),
    beneficiary: named(system.beneficiary, 'beneficiary'),
    attribute: { ...named(system.attribute, 'attribute'), from: named(system.attribute?.from, 'attribute.from'), to: named(system.attribute?.to, 'attribute.to') },
  };
  const objects = (key) => {
    const list = system[key] ?? [];
    if (!Array.isArray(list) || !list.length) throw new SpecError(`The system's main process needs at least one of \`${key}\`.`, `system.${key}`);
    return list.map((o, i) => {
      if (o?.component !== undefined) {
        if (!SHARED.includes(o.component)) throw new SpecError(`\`${key}[${i}].component\` is one of ${SHARED.join(', ')}.`, `system.${key}`);
        return { shared: o.component };
      }
      if (!KINDS.includes(o?.kind)) throw new SpecError(`\`${key}[${i}].kind\` is one of ${KINDS.join(', ')}.`, `system.${key}`);
      return { ...named(o, `${key}[${i}]`), kind: o.kind };
    });
  };
  s.instruments = objects('instruments');
  s.inputs = objects('inputs');
  s.results = objects('results');
  if (!Array.isArray(system.parts) || !system.parts.length) throw new SpecError('The system names its parts.', 'system.parts');
  const held = new Map();
  s.parts = system.parts.map((p, i) => {
    const part = { ...named(p, `parts[${i}]`), process: text(p.process, `parts[${i}].process`), decisions: p.decisions ?? [] };
    if (!Array.isArray(part.decisions)) throw new SpecError(`\`parts[${i}].decisions\` lists app names.`, 'system.parts');
    for (const d of part.decisions) {
      if (!apps.includes(d)) throw new SpecError(`The part ${part.name} holds ${d}, which is no app of the set.`, 'system.parts');
      if (held.has(d)) throw new SpecError(`${d} is a part of both ${held.get(d)} and ${part.name}.`, 'system.parts');
      held.set(d, part.name);
    }
    if (part.decisions.length && p.owed !== undefined) throw new SpecError(`The part ${part.name} holds decisions, so it owes none.`, 'system.parts');
    if (!part.decisions.length) part.owed = text(p.owed, `parts[${i}].owed`);
    return part;
  });
  const loose = apps.filter((a) => !held.has(a));
  if (loose.length) throw new SpecError(`Every app is a part of the system; ${loose.join(', ')} ${loose.length === 1 ? 'is' : 'are'} not.`, 'system.parts');
  if (new Set(s.parts.map((p) => p.name)).size !== s.parts.length) throw new SpecError('Two parts share a name.', 'system.parts');
  s.standards = (system.standards ?? []).map((x, i) => ({ key: text(x?.key, `standards[${i}].key`), title: text(x?.title, `standards[${i}].title`), settles: text(x?.settles, `standards[${i}].settles`) }));
  if (new Set(s.standards.map((x) => x.key)).size !== s.standards.length) throw new SpecError('A standard is named once.', 'system.standards');
  return s;
}

/**
 * The system's records, added to a merged model in place, before its records are
 * indexed. `shared` maps a shared component key to its merged component, and
 * `decide` maps an app name to its Decide process declaration.
 */
export function addSystem(s, { stakeholders, concerns, components, edges, viewpoints, views, design, compliance, shared, decide }) {
  const A = (c) => `Architecture::${c.decl}`;
  const D = (decl) => `Design::${decl}`;
  const beneficiary = { decl: `stakeholder${pascal(s.beneficiary.name)}`, name: s.beneficiary.name, text: s.beneficiary.text };
  stakeholders.push(beneficiary);
  const concern = { decl: `concernSystem${pascal(s.attribute.name)}`, name: s.attribute.name, text: s.attribute.text, model: 'component' };
  concerns.push(concern);
  const viewpoint = { decl: 'viewpointSystem', stakeholder: beneficiary, concern, modelKind: 0 };
  viewpoints.push(viewpoint);
  views.push({ decl: 'viewSystem', viewpoint, modelKind: 0 });

  const component = (o, fallback) => {
    if (o.shared) {
      const c = shared(o.shared);
      if (!c) throw new SpecError(`No app of the set declares the shared component ${o.shared}.`, 'system');
      return c;
    }
    const c = { decl: `componentSystem${pascal(o.name)}`, key: `system:${o.name}`, name: o.name, kind: o.kind ?? fallback, text: o.text };
    components.push(c);
    return c;
  };
  const whole = component({ name: s.name, kind: 'service', text: s.text });
  const person = component({ name: s.beneficiary.name, kind: 'externalSystem', text: s.beneficiary.text });
  const instruments = s.instruments.map((o) => component(o));
  const inputs = s.inputs.map((o) => component(o));
  const results = s.results.map((o) => component(o));
  const edge = (from, to, kind) => edges.push({ decl: `edgeSystem${pascal(`${from.name} to ${to.name}`)}`, from, to, kind });
  for (const c of inputs) edge(c, whole, 'dataFlow');
  for (const c of results) edge(whole, c, 'dataFlow');
  edge(whole, person, 'dataFlow');
  edge(person, whole, 'controlFlow');

  const main = { decl: `processSystem${pascal(s.mainProcess.name)}`, name: s.mainProcess.name, owner: whole, text: s.mainProcess.text };
  const parts = s.parts.map((p) => ({ ...p, decl: `processSystemPart${pascal(p.name)}`, owner: whole }));
  design.processes.push(main, ...parts.map((p) => ({ decl: p.decl, name: p.process, owner: whole, text: p.text })));
  const from = { decl: `stateSystem${pascal(s.attribute.from.name)}`, name: s.attribute.from.name, owner: person, text: s.attribute.from.text };
  const to = { decl: `stateSystem${pascal(s.attribute.to.name)}`, name: s.attribute.to.name, owner: person, text: s.attribute.to.text };
  design.states.push(from, to);

  const sd = { decl: 'designViewSystem', title: `${s.name}: ${s.frame}`, viewpoint, diagram: 'opmObjectProcess' };
  const sd1 = { decl: 'designViewSystemParts', title: `Zooming into ${s.mainProcess.name}`, viewpoint, diagram: 'opmObjectProcess' };
  design.views.push(sd, sd1);
  const thing = (view, kind, subject, name) => design.opmThings.push({ decl: `opm${view === sd ? 'System' : 'SystemParts'}${pascal(name)}`, view, kind, subject });
  const link = (view, kind, source, target, name) => design.opmLinks.push({ decl: `opmSystem${pascal(name)}`, view, kind, source, target });
  thing(sd, 'object', A(whole), whole.name);
  thing(sd, 'object', A(person), person.name);
  for (const c of new Set([...instruments, ...inputs, ...results])) thing(sd, 'object', A(c), c.name);
  thing(sd, 'process', D(main.decl), main.name);
  design.opmStates.push(...[from, to].map((x) => ({ decl: `opmSystem${pascal(`${person.name} ${x.name}`)}`, view: sd, thing: A(person), state: D(x.decl) })));
  link(sd, 'agent', A(person), D(main.decl), `${person.name} agent`);
  link(sd, 'effect', A(person), D(main.decl), `${person.name} effect`);
  link(sd, 'exhibition', A(whole), D(main.decl), `${whole.name} exhibits`);
  for (const c of instruments) link(sd, 'instrument', A(c), D(main.decl), `${c.name} instrument`);
  for (const c of inputs) link(sd, 'consumption', A(c), D(main.decl), `${c.name} consumed`);
  for (const c of results) link(sd, 'result', A(c), D(main.decl), `${c.name} result`);

  thing(sd1, 'process', D(main.decl), main.name);
  parts.forEach((p, order) => {
    thing(sd1, 'process', D(p.decl), p.name);
    design.opmZooms.push({ decl: `opmSystemZoom${pascal(p.name)}`, view: sd1, process: D(main.decl), subprocess: D(p.decl), order });
    p.decisions.forEach((app, k) => {
      thing(sd1, 'process', D(decide(app)), `${app} decide`);
      design.opmZooms.push({ decl: `opmSystemZoom${pascal(`${p.name} ${app}`)}`, view: sd1, process: D(p.decl), subprocess: D(decide(app)), order: k });
    });
  });

  for (const x of s.standards)
    compliance.push({ standard: x.title, subject: `${s.name}: ${x.key}`, text: x.settles, evidence: [D(sd.decl), D(sd1.decl)] });
  return { parts, owed: parts.filter((p) => p.owed).map((p) => p.name) };
}
