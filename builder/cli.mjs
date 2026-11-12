#!/usr/bin/env node
/**
 * prism-prompt: one prompt to a whole Prism application.
 *
 *   node builder/cli.mjs build <prompt.json> --out <dir> [--last-modified <instant>]
 *       Write every file of the application into <dir>, laid out as a
 *       repository created from UOR-Foundation/template, and delete the
 *       template's example app there if it is present.
 *   node builder/cli.mjs check <prompt.json>
 *       Check the prompt and print what the app will claim, writing nothing.
 *   node builder/cli.mjs schema
 *       Print the MCP tool `prism_prompt`, whose input is one prompt.
 *   node builder/cli.mjs list
 *       Print the gallery's example names as a JSON array, the matrix the
 *       pages workflow builds and verifies one job per example from.
 *
 * Exit codes: 0 done, 2 the prompt was refused (the reason is printed), 64 usage.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp, claimLines } from './build.mjs';
import { TOOL } from './tool.mjs';
import { SpecError } from './vendor/prism-code/src/journey/spec.mjs';

const [verb, file, ...rest] = process.argv.slice(2);
const flag = (name) => {
  const i = rest.indexOf(name);
  return i < 0 ? undefined : rest[i + 1];
};
/** When the prompt was last committed, so a rebuild writes the same bytes; now, for a prompt Git does not know. */
const committed = (path) => {
  let iso = '';
  try {
    iso = execFileSync('git', ['log', '-1', '--format=%ct', '--', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {}
  const seconds = /^\d+$/.test(iso) ? Number(iso) : Math.floor(Date.now() / 1000);
  return new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
};
/** The gallery's examples, by the name of each prompt file. */
function exampleNames() {
  const examples = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples');
  return JSON.parse(readFileSync(join(examples, 'gallery.json'), 'utf8')).examples.map((e) => e.prompt.replace(/\.prompt\.json$/, ''));
}
const usage = () => {
  console.error('usage: cli.mjs build <prompt.json> --out <dir> | check <prompt.json> | schema | list');
  process.exit(64);
};

try {
  if (verb === 'schema') {
    console.log(JSON.stringify(TOOL, null, 2));
  } else if (verb === 'list') {
    console.log(JSON.stringify(exampleNames()));
  } else if (verb === 'build' || verb === 'check') {
    if (!file) usage();
    const prompt = JSON.parse(readFileSync(file, 'utf8'));
    const built = await buildApp(prompt, { lastModified: flag('--last-modified') ?? committed(file) });
    if (verb === 'check') {
      console.log(`${built.model.title}: ${Object.keys(built.files).length} files, ${built.model.vectors.length} acceptance vectors`);
      for (const line of claimLines(built.claims)) console.log(line);
    } else {
      const out = flag('--out');
      if (!out) usage();
      for (const path of built.remove) rmSync(join(out, path), { force: true });
      for (const [path, text] of Object.entries(built.files)) {
        mkdirSync(dirname(join(out, path)), { recursive: true });
        writeFileSync(join(out, path), text);
      }
      console.log(`wrote ${Object.keys(built.files).length} files for ${built.model.title} into ${out}`);
    }
  } else usage();
} catch (error) {
  if (error instanceof SpecError || error instanceof SyntaxError) {
    console.error(`refused: ${error.message}`);
    process.exit(2);
  }
  throw error;
}
