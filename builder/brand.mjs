/**
 * An upstream's brand on a built app: the optional `brand` member of a
 * prism/prompt/1 prompt.
 *
 * `brand` is a whole prism/brand-lock/1 document embedded in the prompt, not
 * a path to one. The builder is a pure function of the prompt (the same prompt
 * writes the same bytes, in Node and in the browser), and the prompt is
 * written back as app/prompt.json so that an instance can be rebuilt from
 * itself. A path would make the output depend on a file the prompt does not
 * carry and that a browser cannot open; the embedded lock keeps the prompt the
 * single source. What the lock cannot carry inline, the logo bytes, it names
 * by content: each copied file has its upstream repository, commit, path and
 * SHA-256, so the bytes may be read from anywhere and are trusted only after
 * their digest is re-derived. A mismatch or a missing file is refused, never
 * replaced by a default.
 *
 * The lock is the shape of this repository's own brand.lock (source
 * repository and commit, copied files with their SHA-256, provenance), plus
 * the brand's `name` and its color and typography tokens in the W3C Design
 * Tokens Community Group format (https://tr.designtokens.org/format/).
 */
import { SpecError } from './vendor/prism-code/src/journey/spec.mjs';

export const BRAND_LOCK = 'prism/brand-lock/1';
/** Where a brand's served files go in the instance. The template's own brand files sit beside it and are left alone. */
export const BRAND_DIR = 'site/brand/upstream/';
/** The DTCG `$extensions` key that carries a color's value for the dark theme, which the format has no mode for yet. */
export const DARK = 'foundation.uor.prism';

/** A brand's file whose bytes do not have the digest its lock records, or that could not be read: a typed refusal. */
export class BrandDigestError extends SpecError {
  constructor(message, { from, repository, commit, expected, got }) {
    super(message, 'brand');
    Object.assign(this, { from, repository, commit, expected, got });
  }
}

const refuse = (message) => {
  throw new SpecError(message, 'brand');
};
const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const COMMIT = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const SEGMENT = /^[a-z][a-z0-9-]*$/i;
const FAMILY = /^[A-Za-z0-9][A-Za-z0-9 -]*$/;
const PATH = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._ -]+)*$/;

function source(s, where) {
  if (!isObject(s) || !REPO.test(s.repository ?? '') || !COMMIT.test(s.commit ?? '')) refuse(`${where} names its upstream as {repository: owner/name, commit: a full 40-hex commit}.`);
  return s;
}

/** Every token of a DTCG tree, with its path and its type (its own or the nearest group's). */
function tokens(tree, path = [], inherited) {
  const type = tree.$type ?? inherited;
  if (Object.hasOwn(tree, '$value')) return [{ path, type, value: tree.$value, dark: tree.$extensions?.[DARK]?.dark }];
  return Object.entries(tree)
    .filter(([k]) => !k.startsWith('$'))
    .flatMap(([k, v]) => {
      if (!SEGMENT.test(k)) refuse(`The token name \`${k}\` is not a CSS name.`);
      if (!isObject(v)) refuse(`The token ${[...path, k].join('.')} is a DTCG token or group.`);
      return tokens(v, [...path, k], type);
    });
}

const family = (name) => {
  if (typeof name !== 'string' || !FAMILY.test(name)) refuse(`The font family \`${name}\` is not a plain family name.`);
  return /\s/.test(name) ? `"${name}"` : name;
};

/** The CSS value of one token. Only color and fontFamily are applied; any other type is refused rather than dropped. */
function cssValue(t, value) {
  const name = t.path.join('.');
  if (typeof value === 'string' && /^\{[^}]*\}$/.test(value)) refuse(`The token ${name} is an alias; a brand lock states each value.`);
  if (t.type === 'color') {
    if (typeof value !== 'string' || !HEX.test(value)) refuse(`The color ${name} is a hex color, such as #003756.`);
    return value.toLowerCase();
  }
  if (t.type === 'fontFamily') return (Array.isArray(value) ? value : [value]).map(family).join(', ');
  refuse(`The token ${name} has type ${t.type ?? 'none'}; a brand applies color and fontFamily tokens.`);
}

/** A color token `color.x` is the variable `--x` the template's page reads; a font token `font.x` is `--font-x`. */
const cssName = (path) => `--${(path[0] === 'color' ? path.slice(1) : path).join('-')}`;

/**
 * Check a brand lock's shape and return it with its derived parts: the
 * tokens as CSS declarations, and the logo. Pure and synchronous, so the
 * prompt is refused before anything is read.
 */
export function readBrand(lock) {
  if (!isObject(lock)) refuse(`brand is a ${BRAND_LOCK} document.`);
  if (lock.spec !== BRAND_LOCK) refuse(`brand.spec must be ${BRAND_LOCK}.`);
  const name = String(lock.name ?? '').replace(/[\p{Cc}"\\]/gu, '').replace(/\s+/g, ' ').trim();
  if (!name) refuse('brand names the brand, such as "CHAOSS GrimoireLab".');
  source(lock.source, 'brand.source');
  if (!Array.isArray(lock.copied) || lock.copied.length === 0) refuse('brand.copied lists the files the brand serves, each with its SHA-256.');
  const seen = new Set();
  for (const f of lock.copied) {
    if (!isObject(f) || !PATH.test(f.from ?? '') || f.from.split('/').includes('..')) refuse('Every copied file names its path in the upstream repository as from.');
    if (typeof f.to !== 'string' || !f.to.startsWith(BRAND_DIR) || !PATH.test(f.to) || f.to.split('/').includes('..')) refuse(`The copied file ${f.from} is served under ${BRAND_DIR}.`);
    if (!SHA256.test(f.sha256 ?? '')) refuse(`The copied file ${f.from} records its SHA-256 as 64 lower-case hex digits.`);
    if (f.source !== undefined) source(f.source, `The source of ${f.from}`);
    if (seen.has(f.to)) refuse(`Two copied files are served as ${f.to}.`);
    seen.add(f.to);
  }
  const logos = lock.copied.filter((f) => f.role === 'logo');
  if (logos.length !== 1) refuse('Exactly one copied file has the role logo.');
  const dark = lock.copied.filter((f) => f.role === 'logo-dark');
  if (dark.length > 1) refuse('At most one copied file has the role logo-dark.');
  if (!isObject(lock.tokens)) refuse('brand.tokens holds the color and typography tokens, as W3C DTCG.');
  const all = tokens(lock.tokens);
  if (!all.some((t) => t.type === 'color')) refuse('brand.tokens has at least one color token.');
  const light = all.map((t) => [cssName(t.path), cssValue(t, t.value)]);
  const night = all.filter((t) => t.dark !== undefined).map((t) => {
    if (t.type !== 'color') refuse(`Only a color has a dark value; ${t.path.join('.')} is ${t.type}.`);
    return [cssName(t.path), cssValue(t, t.dark)];
  });
  return { lock, name, light, night, logo: logos[0], logoDark: dark[0] ?? null };
}

const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Where a copied file comes from: its own source, or the lock's. */
export const origin = (lock, file) => ({ repository: (file.source ?? lock.source).repository, commit: (file.source ?? lock.source).commit, from: file.from });

/**
 * Read every copied file through `read({repository, commit, from})` and
 * re-derive its SHA-256. Returns the verified bytes by served path.
 */
export async function verifiedFiles(brand, read) {
  const out = {};
  for (const file of brand.lock.copied) {
    const at = origin(brand.lock, file);
    const where = `${at.repository}@${at.commit.slice(0, 12)}:${at.from}`;
    const bytes = typeof read === 'function' ? await read(at) : null;
    if (!bytes) throw new BrandDigestError(`The brand file ${where} could not be read, so it cannot be verified.`, { ...at, expected: file.sha256, got: null });
    const got = hex(await globalThis.crypto.subtle.digest('SHA-256', bytes));
    if (got !== file.sha256) throw new BrandDigestError(`The brand file ${where} has SHA-256 ${got}, but the brand lock records ${file.sha256}.`, { ...at, expected: file.sha256, got });
    out[file.to] = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  }
  return out;
}

const block = (selector, decls) => (decls.length ? `${selector} {\n${decls.map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}\n` : '');
const cssString = (s) => `"${s.replace(/[\\"]/g, '\\$&')}"`;
/** A served path as the page addresses it: site/ is the page's root. */
export const pageUrl = (to) => `./${to.slice('site/'.length)}`;

/**
 * The tokens as CSS for `scope`. A color is set for the light theme only
 * (`:not(.dark)`), so the template's dark theme keeps its own values unless
 * the token states a dark one; fonts apply to both.
 */
export function brandCss(brand, scope = ':root') {
  const colors = brand.light.filter(([k]) => !k.startsWith('--font-'));
  const fonts = brand.light.filter(([k]) => k.startsWith('--font-'));
  return [block(`${scope}:not(.dark)`, colors), block(`${scope}.dark`, brand.night), block(scope, fonts)].join('');
}

/**
 * site/card.css, the one stylesheet the template's page inlines that belongs
 * to the app (bootstrap/page.mjs), after its own brand layer: the upstream's
 * tokens override the template's variables, and the header carries the
 * upstream's logo and name.
 */
export function cardCss(brand) {
  const { lock } = brand;
  const head = '#main .head .ident::before';
  return [
    `/* @generated by the Prism-DevRel builder from the prompt's brand, ${brand.name}: a ${BRAND_LOCK} lock pinned to ${lock.source.repository}@${lock.source.commit}.\n * Tokens are W3C DTCG; every file under brand/upstream/ was verified by its SHA-256. Do not edit. */\n`,
    brandCss(brand),
    `${head} {\n  content: ${cssString(brand.name)};\n  display: block;\n  min-height: 2rem;\n  padding-left: 7.5rem;\n  background: url(${cssString(pageUrl(brand.logo.to))}) left center / 6.5rem auto no-repeat;\n  font: 500 0.875rem/2rem var(--font-sans);\n  color: var(--muted-foreground);\n}\n`,
    brand.logoDark ? `:root.dark ${head} {\n  background-image: url(${cssString(pageUrl(brand.logoDark.to))});\n}\n` : '',
  ].join('');
}

/** The `brand` member of site/app.json: what the page is branded as, and where that brand is pinned. */
export function appJsonBrand(brand) {
  const { lock } = brand;
  const pins = [...new Map(lock.copied.map((f) => origin(lock, f)).map((o) => [`${o.repository}@${o.commit}`, { repository: o.repository, commit: o.commit, url: `https://github.com/${o.repository}/tree/${o.commit}` }])).values()];
  return {
    name: brand.name,
    logo: pageUrl(brand.logo.to).slice(2),
    ...(brand.logoDark ? { logoDark: pageUrl(brand.logoDark.to).slice(2) } : {}),
    stylesheet: 'card.css',
    lock: `${BRAND_DIR.slice('site/'.length)}brand.lock.json`,
    sources: pins,
  };
}

/**
 * Every file a brand adds to the instance: the verified copies, the lock
 * itself beside them, and site/card.css.
 */
export async function brandFiles(brand, read) {
  return {
    ...(await verifiedFiles(brand, read)),
    [`${BRAND_DIR}brand.lock.json`]: `${JSON.stringify(brand.lock, null, 2)}\n`,
    'site/card.css': cardCss(brand),
  };
}
