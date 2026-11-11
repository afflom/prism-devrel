// The record explorer: filters learn/records.json in the browser. Subject text
// is set with textContent, never as markup.
const q = document.getElementById("q");
const facet = document.getElementById("facet");
const count = document.getElementById("count");
const results = document.getElementById("results");
const data = await fetch("../records.json").then((r) => r.json());
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
  results.replaceChildren(...hits.slice(0, 200).map((r) => {
    const li = el("li");
    const head = el("p");
    head.append(el("strong", r.name), " ", el("code", r.id), " ", el("span", `${r.facet}, ${r.kind}, #${r.index}`, "chip"));
    const links = el("p", "Taught by ", "links");
    r.covers.forEach((c, i) => {
      const a = el("a", c.title);
      a.href = `../${c.slug}/#${r.anchor}`;
      links.append(i ? ", " : "", a);
    });
    li.append(head);
    if (r.text) li.append(el("p", r.text));
    li.append(links);
    return li;
  }));
}
q.addEventListener("input", show);
facet.addEventListener("change", show);
q.value = new URLSearchParams(location.search).get("q") ?? "";
show();
