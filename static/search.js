// static/search.js — búsqueda en el navegador. Vainilla ES6+, sin dependencias.
// Estilo funcional: funciones puras arriba; el DOM (efectos) solo al final.
//
// MDN:
//   fetch                 https://developer.mozilla.org/es/docs/Web/API/Fetch_API
//   Array.filter / every  https://developer.mozilla.org/es/docs/Web/JavaScript/Reference/Global_Objects/Array/filter
//   String.normalize      https://developer.mozilla.org/es/docs/Web/JavaScript/Reference/Global_Objects/String/normalize
//   Element.replaceChildren https://developer.mozilla.org/es/docs/Web/API/Element/replaceChildren
//   Escapes Unicode \p{M} https://developer.mozilla.org/es/docs/Web/JavaScript/Reference/Regular_expressions/Unicode_character_class_escape

// --- puras ------------------------------------------------------------------

// "Árbol" → "arbol": minúsculas y sin acentos
const normalize = s => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

const terms = query => normalize(query).split(/\s+/).filter(Boolean);

const haystack = post => normalize(`${post.title} ${post.tags.join(" ")} ${post.text}`);

// Número total de apariciones de los términos buscados en el post
const countHits = ts => post => {
  const h = haystack(post);
  return ts.reduce((total, t) => total + (h.split(t).length - 1), 0);
};

// Un post coincide si contiene TODOS los términos
const matches = ts => post => ts.every(t => haystack(post).includes(t));

// Filtra y ordena por número de coincidencias descendente (función pura: no muta `posts`)
const search = (posts, query) => {
  const ts = terms(query);
  if (!ts.length) return [];
  const hitsOf = countHits(ts);
  return posts
    .filter(matches(ts))
    .map(post => ({ ...post, hits: hitsOf(post) }))
    .sort((a, b) => b.hits - a.hits);
};

// --- efectos (DOM) ----------------------------------------------------------

// textContent, nunca innerHTML: el contenido se trata como texto, no como HTML
const toItem = base => post => {
  const a = document.createElement("a");
  a.href = base.replace(/\/$/, "") + post.url;
  a.textContent = post.title;

  const details = [
    post.hits ? `${post.hits} coincidencia${post.hits === 1 ? "" : "s"}` : "",
    post.words ? `${post.words} palabras` : "",
  ].filter(Boolean).join(" · ");
  const meta = document.createElement("span");
  meta.className = "meta";
  meta.textContent = ` ${post.date.slice(0, 10)}${details ? ` (${details})` : ""} — ${post.summary}`;

  const li = document.createElement("li");
  li.append(a, meta);
  return li;
};

const emptyItem = () => {
  const li = document.createElement("li");
  li.className = "meta";
  li.textContent = "Sin resultados.";
  return li;
};

const main = async () => {
  const input = document.querySelector("#q");
  const list = document.querySelector("#results");
  if (!input || !list) return;

  const { index, base } = list.dataset;
  const posts = await fetch(index).then(r => r.json());

  const render = () => {
    const found = search(posts, input.value);
    const items = found.map(toItem(base));
    list.replaceChildren(...(items.length || !input.value.trim() ? items : [emptyItem()]));
  };

  input.addEventListener("input", render);
  input.addEventListener("keydown", e => {
    if (e.key === "Escape") { input.value = ""; render(); }
  });

  const initialQuery = new URLSearchParams(window.location.search).get("q");
  if (initialQuery) { input.value = initialQuery; render(); }
};

main().catch(err => console.error("search.js:", err));
