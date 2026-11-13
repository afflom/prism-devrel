// The record explorer: filters a case study's records.json in the browser. The
// page names the file (data-records) and its case study's directory
// (data-base), both relative to the page. Subject text is set with
// textContent, never as markup. It shows one window's height of
// results at a time (the content standard's progressive disclosure, CS-06),
// and "Show more" adds the next window.
const q = document.getElementById("q");
const facet = document.getElementById("facet");
const count = document.getElementById("count");
const results = document.getElementById("results");
const more = document.getElementById("more");
const box = document.querySelector(".explorer");
const data = await fetch(new URL(box.dataset.records, location.href)).then((r) => r.json());
for (const f of [...new Set(data.records.map((r) => r.facet))]) {
  const o = document.createElement("option");
  o.value = f;
  o.textContent = f;
  facet.append(o);
}
const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
function show() {
  const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = data.records.filter((r) => (!facet.value || r.facet === facet.value) && words.every((w) => `${r.index} ${r.id} ${r.name} ${r.kind} ${r.facet} ${r.text}`.toLowerCase().includes(w)));
  count.textContent = `${hits.length} of ${data.records.length} records`;
  results.replaceChildren(...hits.map((r) => {
    const li = el("li");
    const head = el("p");
    head.append(el("strong", r.name), " ", el("code", r.id), " ", el("span", `${r.facet}, ${r.kind}, #${r.index}`, "chip"));
    const links = el("p", "Taught by ", "links");
    r.covers.forEach((c, i) => {
      const a = el("a", c.title);
      a.href = `${box.dataset.base}${c.href}#${r.anchor}`;
      links.append(i ? ", " : "", a);
    });
    li.append(head);
    if (r.text) li.append(el("p", r.text));
    li.append(links);
    return li;
  }));
  page(0);
}
/** Reveal results down to one window below `from`, and offer the rest. The
 *  first window is measured from the list's own top, so its padding counts. */
function page(from) {
  const items = [...results.children];
  for (const li of items.slice(from)) li.hidden = true;
  const top = from ? items[from].getBoundingClientRect().top : results.getBoundingClientRect().top;
  let shown = from;
  for (const li of items.slice(from)) {
    li.hidden = false;
    if (shown > from && results.getBoundingClientRect().bottom - top > innerHeight) { li.hidden = true; break; }
    shown++;
  }
  for (const li of items.slice(shown)) li.hidden = true;
  more.hidden = shown >= items.length;
  more.textContent = `Show more (${items.length - shown} left)`;
  more.onclick = () => page(shown);
}
q.addEventListener("input", show);
facet.addEventListener("change", show);
q.value = new URLSearchParams(location.search).get("q") ?? "";
show();
