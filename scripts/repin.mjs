// Moves every pinned subject in devrel/subjects.json forward to the newest
// commit on its main whose gate workflow passed, when that commit descends
// from the one pinned now (scripts/repin.sh runs this; DR-53).
//
// The rule, per subject that is not `self`:
// - the newest successful run of the subject's `gate` workflow on main names
//   the candidate commit; no such run, or the candidate is the pin: it stays;
// - GitHub's compare of pin...candidate must say `ahead`, so a pin never moves
//   back, sideways onto a diverged history, or to a commit whose gate has not
//   passed;
// - a subject whose API call fails keeps its pin with a warning, and the
//   others are still re-pinned: one unreachable repository stops nothing.
//
// The API is `gh api`. REPIN_API_FIXTURES names a JSON file mapping each API
// path to its recorded response instead (a path it does not name fails as an
// unreachable API would), so the decision is tested without the network.
// REPIN_SUBJECTS names the subjects file (default devrel/subjects.json).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.env.REPIN_SUBJECTS || 'devrel/subjects.json';
const fixtures = process.env.REPIN_API_FIXTURES;
const recorded = fixtures ? JSON.parse(readFileSync(fixtures, 'utf8')) : null;

function api(path) {
  if (recorded) {
    if (!Object.hasOwn(recorded, path)) throw new Error(`no recorded response for ${path}`);
    return recorded[path];
  }
  return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
}

const GITHUB = 'https://github.com/';

/** The decision for one subject: `{ commit, line }`, where `commit` is the new pin. */
function decide(subject, call) {
  const { slug, repository, commit: pinned, gate } = subject;
  if (!repository.startsWith(GITHUB)) return { commit: pinned, line: `repin: ${slug} is not on GitHub; it stays at ${pinned}`, warn: true };
  if (!gate) return { commit: pinned, line: `repin: ${slug} names no gate workflow; it stays at ${pinned}`, warn: true };
  const repo = repository.slice(GITHUB.length).replace(/\/$/, '');
  const runs = call(`repos/${repo}/actions/workflows/${gate}/runs?branch=main&status=success&per_page=1`);
  const green = runs.workflow_runs?.[0]?.head_sha ?? '';
  if (!green) return { commit: pinned, line: `repin: ${slug} has no green ${gate} run on main; it stays at ${pinned}` };
  if (!/^[0-9a-f]{40}$/.test(green)) return { commit: pinned, line: `repin: ${slug}'s green run names ${green}, not a full commit; it stays at ${pinned}`, warn: true };
  if (green === pinned) return { commit: pinned, line: `repin: ${slug} stays at ${pinned}` };
  const { status } = call(`repos/${repo}/compare/${pinned}...${green}`);
  if (status !== 'ahead') return { commit: pinned, line: `repin: the newest green ${slug} commit ${green} is ${status} of ${pinned}; the pin stays` };
  return { commit: green, line: `repin: ${slug} ${pinned} -> ${green}` };
}

const config = JSON.parse(readFileSync(file, 'utf8'));
for (const subject of config.subjects) {
  if (subject.self) continue;
  let decision;
  try {
    decision = decide(subject, api);
  } catch (error) {
    const reason = String(error.stderr || error.message).trim().split('\n')[0];
    decision = { commit: subject.commit, line: `repin: ${subject.slug}: the GitHub API failed (${reason}); it stays at ${subject.commit}`, warn: true };
  }
  subject.commit = decision.commit;
  if (decision.warn && process.env.GITHUB_ACTIONS) console.log(`::warning::${decision.line}`);
  else console.log(decision.line);
}
writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
