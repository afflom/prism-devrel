/**
 * The product page of a prompt set: `site/product/index.html`, written from the
 * set, its prompts and the product record (`prism/product.json`), and the lock
 * that binds it, `prism/builder.lock`. The page decides nothing: every answer is
 * the verified holo's, run in the reader's browser after its archive identities
 * verify and its acceptance vectors replay. The page loads the holo and the
 * prism-code runtime the Pages workflow publishes beside it.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const PAGE = readFileSync(new URL('./ui/product.html', import.meta.url), 'utf8');
const LOADER = `import { parseArchive, resolveArchive, asBytes } from "../vendor/prism-code/src/archive.mjs";
import { compileGuest, runGuest, runAcceptance } from "../vendor/prism-code/src/core.mjs";
import { blake3Hex } from "../vendor/prism-code/src/blake3.mjs";
async function openHolo() {
  const resolved = resolveArchive(parseArchive(new Uint8Array(await (await fetch("../app.holo")).arrayBuffer())));
  const a = resolved.modelDocument.application;
  const module = await compileGuest(resolved.guest.content);
  const limits = { request: a.request_maximum, response: a.response_maximum, guestAllocation: a.guest_allocation_maximum };
  const vectors = (a.acceptance_vectors ?? []).map((v) => ({ request: Uint8Array.from(v.request), response: Uint8Array.from(v.response) }));
  const dispatch = async (request) => runGuest(module, asBytes(request), limits);
  return { identities: resolved.identities, vectors, dispatch, acceptance: () => runAcceptance(vectors, dispatch) };
}`;

/** The design system's tokens as CSS custom properties, light and dark, from `product.design`. */
function tokens(d) {
  const kebab = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  const colors = (c) => Object.entries(c).map(([k, v]) => `--${kebab(k)}: ${v};`).join(' ');
  const fixed = [
    `--f-display: "${d.type.display}", system-ui, sans-serif; --f-body: "${d.type.body}", system-ui, sans-serif; --f-mono: "${d.type.mono}", ui-monospace, monospace;`,
    Object.entries(d.type.scale).map(([k, v]) => `--t-${k}: ${v};`).join(' '),
    Object.entries(d.space).map(([k, v]) => `--s-${k}: ${v};`).join(' '),
    Object.entries(d.radius).map(([k, v]) => `--r-${k}: ${v};`).join(' '),
  ].join('\n  ');
  return `/* Design system: ${d.accessibility.standard} ${d.accessibility.level}. Generated from prism/product.json. */
:root {\n  ${fixed}\n  ${colors(d.color.light)} color-scheme: light;\n}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${colors(d.color.dark)} color-scheme: dark; } }
:root[data-theme="dark"] { ${colors(d.color.dark)} color-scheme: dark; }`;
}

export function productUi(set, prompts, product) {
  const model = { set, prompts: Object.fromEntries(prompts.map((p) => [p.app.name, p])), product };
  const page = PAGE.replace('/*LOADER*/', () => LOADER)
    .replace('/*TOKENS*/', () => tokens(product.design))
    .replace('/*MODEL*/', () => JSON.stringify(model).replace(/</g, '\\u003c'))
    .replaceAll('{{TITLE}}', product.brand.name);
  const files = { 'site/product/index.html': page };
  const lock = {
    spec: 'prism/builder-lock/1',
    source: { repository: set.builder.repository, commit: set.builder.commit },
    files: Object.entries(files).map(([path, text]) => ({ path, sha256: createHash('sha256').update(text).digest('hex') })),
  };
  return { ...files, 'prism/builder.lock': `${JSON.stringify(lock, null, 2)}\n` };
}
