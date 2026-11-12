// An example page: load the holo the pages workflow verified, check its
// digests here, replay its acceptance vectors and answer a request, with the
// same vendored prism-code runtime the app page uses.
import { load } from '../../vendor/prism-code/src/browser.mjs';

const $ = (id) => document.getElementById(id);
const panel = document.querySelector('.verified');
let app = null;

async function ready() {
  app ??= await load(new URL(panel.dataset.holo, location.href).href);
  if (!app.identities.verified) throw new Error('the holo did not verify; nothing runs');
  return app;
}

$('replay').addEventListener('click', async () => {
  $('replayed').textContent = 'Verifying…';
  try {
    const a = await ready();
    const result = await a.acceptance();
    $('replayed').textContent = `Verified ${a.identities.archiveFingerprint.slice(0, 16)}…, ${result.passed} of ${result.total} vectors replayed.`;
  } catch (error) {
    $('replayed').textContent = `Refused: ${error.message}`;
  }
});

$('try').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const a = await ready();
    const out = await a.dispatch(new TextEncoder().encode($('request').value));
    $('answer').textContent = new TextDecoder().decode(out);
  } catch (error) {
    $('answer').textContent = `Refused: ${error.message}`;
  }
});
