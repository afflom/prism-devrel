/**
 * `prism/prompt/1`: the one prompt from which the builder writes a whole Prism
 * application, every facet of it.
 *
 * The prompt is shaped as an MCP tool call (`tools/call` with `name` and
 * `arguments`), and its `app` member is exactly the `prism/spec/1` spec that
 * prism-code's own MCP tool `prism_spec` takes: the request fields, the
 * answers, the rules, the properties Lean proves, and the examples. A prompt
 * drafted for `prism_spec` is therefore already a prompt here. What the spec
 * does not say (who the app is for, what they care about, what can go wrong,
 * how good is good enough) is the rest of the prompt, and every part of it is
 * optional: what is left out is derived from the spec, never invented.
 */
import { SpecError } from './vendor/prism-code/src/journey/spec.mjs';

export const PROMPT_SCHEMA = 'prism/prompt/1';

/** The STRIDE categories `Production.ThreatModel::Stride` declares. */
export const STRIDE = ['spoofing', 'tampering', 'repudiation', 'informationDisclosure', 'denialOfService', 'elevationOfPrivilege'];
/** `Foundation.Sec::Likelihood` and `Foundation.Sec::Impact`. */
export const LIKELIHOOD = ['low', 'medium', 'high'];
export const IMPACT = ['minor', 'major', 'critical'];
/** `Foundation.Arch::ComponentKind`. */
export const COMPONENT_KINDS = ['service', 'database', 'externalSystem', 'cliAdapter', 'staticSite', 'releaseBinary'];
/** The model a concern is viewed in: `Foundation.Arch::ModelKind`, in the order its index counts. */
export const MODEL_KINDS = ['component', 'quality', 'security'];
/** `Production.ThreatModel::EvidenceKind`. */
export const EVIDENCE_KINDS = ['gate', 'proof', 'review'];
/** What a threat in the prompt can be against: the assets every app has. */
export const ASSET_KEYS = ['request', 'answer', 'holo', 'source'];
/** The axioms a Lean kernel check can observe in a generated declaration, as LexLean's exact axiom policy names them. */
export const AXIOMS = ['Classical.choice', 'Quot.sound', 'propext'];

/**
 * ISO/IEC 25010:2023 product quality: each characteristic with its
 * subcharacteristics. A quality row in the prompt names one pair.
 */
export const ISO25010 = {
  'Functional suitability': ['Functional completeness', 'Functional correctness', 'Functional appropriateness'],
  'Performance efficiency': ['Time behaviour', 'Resource utilization', 'Capacity'],
  Compatibility: ['Co-existence', 'Interoperability'],
  'Interaction capability': ['Appropriateness recognizability', 'Learnability', 'Operability', 'User error protection', 'User engagement', 'Inclusivity', 'User assistance', 'Self-descriptiveness'],
  Reliability: ['Faultlessness', 'Availability', 'Fault tolerance', 'Recoverability'],
  Security: ['Confidentiality', 'Integrity', 'Non-repudiation', 'Accountability', 'Authenticity', 'Resistance'],
  Maintainability: ['Modularity', 'Reusability', 'Analysability', 'Modifiability', 'Testability'],
  Flexibility: ['Adaptability', 'Scalability', 'Installability', 'Replaceability'],
  Safety: ['Operational constraint', 'Risk identification', 'Fail safe', 'Hazard warning', 'Safe integration'],
};

const text = { type: 'string' };
const named = (description, extra = {}, required = ['name']) => ({ type: 'object', description, properties: { name: text, text, ...extra }, required });

/**
 * The `arguments` of the MCP tool `prism_prompt`. `app` is the input of
 * prism-code's `prism_spec` (`prism/spec/1`), referenced by the schema it
 * carries in prism-code's MCP server and checked against it in the tests.
 */
export function inputSchema(specInput) {
  return {
    type: 'object',
    description: 'One prism/prompt/1 prompt: the app as a prism/spec/1 spec, and, optionally, everything else every facet needs.',
    properties: {
      schema: { const: PROMPT_SCHEMA },
      goal: { type: 'string', description: 'The goal the app is built toward, in one sentence a developer would say. It becomes the spec purpose when app.purpose is left out.' },
      app: specInput,
      stakeholders: { type: 'array', description: 'Who the app is for. A Verifier, anyone who replays the holo before trusting it, is always added.', items: named('A stakeholder.', { concerns: { type: 'array', items: text, description: 'Names of concerns, from concerns or the derived ones.' } }) },
      concerns: { type: 'array', description: 'What the stakeholders care about, each viewed in one model.', items: named('A concern.', { model: { enum: MODEL_KINDS } }) },
      components: { type: 'array', description: 'Systems outside the app that send it requests or read its answers.', items: named('A component.', { kind: { enum: COMPONENT_KINDS } }) },
      threats: {
        type: 'array',
        description: 'What can go wrong, beyond the threats every app has (an oversized or malformed request, a substituted holo or source, a granted capability, an answer a property rules out).',
        items: {
          type: 'object',
          properties: {
            name: text,
            text,
            stride: { enum: STRIDE },
            asset: { enum: ASSET_KEYS },
            likelihood: { enum: LIKELIHOOD },
            impact: { enum: IMPACT },
            control: named('The control that answers it.', { evidence: { type: 'array', items: { type: 'object', properties: { kind: { enum: EVIDENCE_KINDS }, reference: text }, required: ['kind', 'reference'] } } }, ['name', 'text', 'evidence']),
            accepted: { type: 'string', description: 'Instead of a control: why the risk is accepted.' },
          },
          required: ['name', 'text', 'stride', 'asset'],
        },
      },
      quality: {
        type: 'array',
        description: 'How good is good enough, as ISO/IEC 25010:2023 requirements with a measure and its threshold.',
        items: {
          type: 'object',
          properties: {
            characteristic: { enum: Object.keys(ISO25010) },
            subcharacteristic: text,
            requirement: text,
            text,
            measure: text,
            measureText: text,
            threshold: { type: 'integer', minimum: 0 },
          },
          required: ['characteristic', 'subcharacteristic', 'requirement', 'text', 'measure', 'measureText', 'threshold'],
        },
      },
      journeys: { type: 'array', description: 'Ordered steps a stakeholder takes. A step is a rule ID (REQ-001), a property ID (INV-001), otherwise or refuse.', items: { type: 'object', properties: { stakeholder: text, steps: { type: 'array', items: text } }, required: ['stakeholder', 'steps'] } },
      license: { type: 'string', description: 'The SPDX license expression; MIT OR Apache-2.0 when left out.' },
      repository: { type: 'string', description: 'owner/name of the repository the app will live in, for its page and links.' },
      axioms: {
        type: 'object',
        description: 'The exact axiom set a verify observed for a generated declaration, by declaration name, as prism-code records it when LexLean reports LLV7005. `node builder/cli.mjs axioms` writes it from a verify log.',
        additionalProperties: { type: 'array', items: { enum: AXIOMS }, uniqueItems: true },
      },
    },
    required: ['app'],
  };
}

const refuse = (message, rule) => {
  throw new SpecError(message, rule);
};

const words = (s) => String(s ?? '').replace(/[\p{Cc}"\\]/gu, '').replace(/\s+/g, ' ').trim();

/**
 * Accept a prompt as data: either the arguments alone, or a whole MCP
 * `tools/call` request whose `params.name` is `prism_prompt`. Every member is
 * checked against the closed sets above; free text is cut to what a LexLean
 * string can carry. Returns the arguments.
 */
export function readPrompt(input) {
  let args = input;
  if (input && input.jsonrpc === '2.0') {
    if (input.method !== 'tools/call' || input.params?.name !== 'prism_prompt') refuse('A prompt is the tools/call of prism_prompt.', 'prompt');
    args = input.params.arguments;
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) refuse('A prompt is an object.', 'prompt');
  if (args.schema !== undefined && args.schema !== PROMPT_SCHEMA) refuse(`schema must be ${PROMPT_SCHEMA}`, 'schema');
  if (!args.app || typeof args.app !== 'object') refuse('A prompt carries its app as a prism/spec/1 spec under app.', 'app');
  const prompt = structuredClone(args);
  prompt.schema = PROMPT_SCHEMA;
  if (prompt.goal !== undefined) prompt.goal = words(prompt.goal);
  if (!prompt.app.purpose && prompt.goal) prompt.app.purpose = prompt.goal;
  const list = (key) => {
    if (prompt[key] === undefined) return [];
    if (!Array.isArray(prompt[key])) refuse(`${key} is a list.`, key);
    return prompt[key];
  };
  const oneOf = (value, set, what) => {
    if (!set.includes(value)) refuse(`${what} \`${value}\` is not one of ${set.join(', ')}.`, what);
    return value;
  };
  const unique = (items, what) => {
    const seen = new Set();
    for (const item of items) {
      if (!item.name) refuse(`Every ${what} has a name.`, what);
      if (seen.has(item.name)) refuse(`The ${what} \`${item.name}\` is named twice.`, what);
      seen.add(item.name);
    }
    return items;
  };
  prompt.stakeholders = unique(list('stakeholders').map((s) => ({ name: words(s.name), text: words(s.text), concerns: (s.concerns ?? []).map(words) })), 'stakeholder');
  prompt.concerns = unique(list('concerns').map((c) => ({ name: words(c.name), text: words(c.text), model: oneOf(c.model ?? 'component', MODEL_KINDS, 'model') })), 'concern');
  prompt.components = unique(list('components').map((c) => ({ name: words(c.name), text: words(c.text), kind: oneOf(c.kind ?? 'externalSystem', COMPONENT_KINDS, 'component kind') })), 'component');
  prompt.threats = unique(
    list('threats').map((t) => {
      const threat = { name: words(t.name), text: words(t.text), stride: oneOf(t.stride, STRIDE, 'stride'), asset: oneOf(t.asset, ASSET_KEYS, 'asset'), likelihood: oneOf(t.likelihood ?? 'medium', LIKELIHOOD, 'likelihood'), impact: oneOf(t.impact ?? 'major', IMPACT, 'impact') };
      if (t.control && t.accepted) refuse(`The threat \`${threat.name}\` has both a control and an accepted risk; it has one or the other.`, 'threat');
      if (t.control) {
        const evidence = (t.control.evidence ?? []).map((e) => ({ kind: oneOf(e.kind, EVIDENCE_KINDS, 'evidence kind'), reference: words(e.reference) }));
        if (evidence.length === 0) refuse(`The control of \`${threat.name}\` names no evidence.`, 'threat');
        threat.control = { name: words(t.control.name), text: words(t.control.text), evidence };
      } else if (t.accepted) threat.accepted = words(t.accepted);
      else refuse(`The threat \`${threat.name}\` needs a control with evidence, or an accepted risk with its rationale.`, 'threat');
      return threat;
    }),
    'threat',
  );
  prompt.quality = list('quality').map((q) => {
    const characteristic = oneOf(q.characteristic, Object.keys(ISO25010), 'characteristic');
    oneOf(q.subcharacteristic, ISO25010[characteristic], `subcharacteristic of ${characteristic}`);
    if (!(Number.isSafeInteger(q.threshold) && q.threshold >= 0)) refuse(`The threshold of \`${q.measure}\` is a whole number.`, 'quality');
    return { characteristic, subcharacteristic: q.subcharacteristic, requirement: words(q.requirement), text: words(q.text), measure: words(q.measure), measureText: words(q.measureText), threshold: q.threshold };
  });
  prompt.journeys = list('journeys').map((j) => ({ stakeholder: words(j.stakeholder), steps: (j.steps ?? []).map(words) }));
  prompt.license = words(prompt.license ?? 'MIT OR Apache-2.0');
  if (prompt.axioms === undefined) prompt.axioms = {};
  if (typeof prompt.axioms !== 'object' || Array.isArray(prompt.axioms)) refuse('axioms maps a declaration name to its observed axiom set.', 'axioms');
  prompt.axioms = Object.fromEntries(
    Object.keys(prompt.axioms)
      .sort()
      .map((name) => {
        const set = prompt.axioms[name];
        if (!Array.isArray(set)) refuse(`The axioms of \`${name}\` are a list.`, 'axioms');
        for (const a of set) oneOf(a, AXIOMS, `axiom of ${name}`);
        if (new Set(set).size !== set.length) refuse(`The axioms of \`${name}\` name one axiom twice.`, 'axioms');
        return [name, [...set].sort()];
      }),
  );
  if (prompt.repository !== undefined && !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(prompt.repository)) refuse('repository is owner/name.', 'repository');
  return prompt;
}
