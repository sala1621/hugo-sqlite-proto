# hugo-sqlite-proto

Prototipo didáctico: **Hugo** genera HTML estático desde Markdown y **SQLite** trabaja
**solo en tiempo de build** (indexar y agregar). En producción: ficheros estáticos, nada más.

Continuación de la práctica
[P1.2 — Tu mini sitio web con Hugo](https://www.librebits.info/2asir/iaw/mini-sitio-web-con-hugo/).

**Demo en vivo:** [fp-bits.github.io/hugo-sqlite-proto](https://fp-bits.github.io/hugo-sqlite-proto/)

## Hugo build 
El generador de sitios web estático [Hugo](https://gohugo.io/documentation) construye 'las páginas web html (+ css, +javascript)' cuando ejecutas 'hugo serve' desde la terminal.
Ese comando detecta cambios en `content/` y `layouts/` y reconstruye el sitio automáticamente, sin que tengas que parar y volver a arrancar nada.
 
## Idea ([Unix](https://es.wikipedia.org/wiki/Unix): cada pieza hace una cosa, se unen con ficheros, a modo 'tuberías')

```
content/*.md --> tools/index.py --> build/site.db --+--> static/search.json --> navegador (search.js)
 (Markdown)       (parsea + INSERT)   (SQLite, local) +--> data/tags.json -----> Hugo (layouts/index.html)
                                                      +--> data/words.json ----> Hugo (footer.html, single.html)

                                     hugo --> public/   <- lo único que se despliega
```

`build/`, `static/search.json`, `data/tags.json` y `data/words.json` están en `.gitignore`: se **regeneran** en cada build.

## Requisitos

- [Hugo](https://gohugo.io/installation/) (versión estándar, no hace falta *extended*)
- Python 3.8+ (solo biblioteca estándar: [`sqlite3`](https://docs.python.org/3/library/sqlite3.html), `json`, `re`)
- `make`

## Uso

```bash
make                # == make help
make serve          # índice + servidor local en http://localhost:1313/
make serve-drafts   # índice (--drafts) + hugo server -D (incluye borradores)
make build          # índice + hugo --gc --minify  → public/
make check          # valida que los JSON generados son JSON válido
make clean
make check-invites  # [profesor] invitaciones de colaborador pendientes (gh CLI)
```

## Estructura

```
content/            Markdown con front matter YAML (el borrador no se indexa ni se publica)
layouts/            Plantillas Hugo: baseof, single, list, index + parciales header/footer
static/search.js    Búsqueda en el navegador: vainilla ES6+, estilo funcional
static/style.css    CSS3 con variables y modo oscuro
tools/index.py      Markdown → SQLite → JSON (funciones puras + efectos al final)
Makefile            index · build · serve · check · clean
```

## Dónde mirar

- **SQL como generador de JSON**: `Q_SEARCH` y `Q_TAGS` en `tools/index.py`
  ([JSON1](https://www.sqlite.org/json1.html), `GROUP BY`, `COUNT`).
- **Datos de build en plantillas**: `hugo.Data.tags` en `layouts/index.html`
  ([Hugo data](https://gohugo.io/content-management/data-sources/)).
- **Búsqueda sin servidor**: `static/search.js` ([`fetch`](https://developer.mozilla.org/es/docs/Web/API/Fetch_API),
  [`filter`](https://developer.mozilla.org/es/docs/Web/JavaScript/Reference/Global_Objects/Array/filter),
  [`normalize`](https://developer.mozilla.org/es/docs/Web/JavaScript/Reference/Global_Objects/String/normalize)).

## Ejercicios

1. Añade un post con `tags: [sql]` y comprueba cómo cambia el conteo de etiquetas en la home (`make serve`).
2. `hugo server -D` muestra el borrador, pero la búsqueda no lo encuentra. ¿Por qué? Añade un
   flag `--drafts` a `tools/index.py` para que coincidan.
3. Añade una tabla `words(url, n)` con el número de palabras de cada post y muestra el total en el pie.
4. Cambia la búsqueda para ordenar los resultados por número de coincidencias (sigue siendo una función pura).
5. Despliega `public/` con `rsync` a tu VPS o con GitHub Pages. ¿Qué proceso corre en el servidor? (Ninguno de tuyos.)

## Resolución de los ejercicios y flujo de datos

### 1. Nuevo post con `tags: [sql]` (`content/posts/consultas-sql-json.md`)
Se ha añadido el artículo `content/posts/consultas-sql-json.md` con etiquetas `[sql, sqlite, build, kiss]`. Al ejecutar `make index` (o `make serve`), `tools/index.py` extrae el front matter, inserta las filas en la tabla `tags(url, tag)` de `build/site.db` y ejecuta `Q_TAGS` (`GROUP BY tag`), exportando `data/tags.json` para que Hugo actualice automáticamente los contadores en `layouts/index.html`.

### 2. ¿Por qué `hugo server -D` no encontraba el borrador? Flag `--drafts`
Aunque `hugo server -D` renderiza en HTML los ficheros con `draft: true` (como `content/posts/borrador.md`), el buscador del navegador lee únicamente `static/search.json`, que es generado por `tools/index.py`. Originalmente `read_all()` filtraba siempre `if not page["draft"]`, por lo que los borradores nunca entraban en `build/site.db` ni en `static/search.json`.
- **Solución:** Se ha parametrizado `read_all(include_drafts=False)` en `tools/index.py` para aceptar `--drafts` (o `-D`) por línea de comandos y se ha añadido la regla `make serve-drafts` en el `Makefile`.

### 3. Tabla `words(url, n)` en SQLite y total en el pie de página
Siguiendo la filosofía Unix del proyecto (`Markdown → SQLite → JSON → Hugo`):
1. **Parseo puro (`tools/index.py`):** La función pura `count_words(text)` calcula el número de palabras del texto limpio de cada página.
2. **Almacenamiento relacional (`build/site.db`):** Se ha añadido la tabla `words(url TEXT PRIMARY KEY REFERENCES posts(url), n INTEGER NOT NULL DEFAULT 0)` al esquema SQLite.
3. **Agregación SQL a JSON (`Q_WORDS` → `data/words.json`):** Mediante `SUM(n)`, `COUNT(*)` y `json_group_object(url, n)` de la extensión JSON1 de SQLite, se exporta `data/words.json` con el total global y el desglose por URL. Además, `Q_SEARCH` hace `JOIN words` para incluir el conteo en `static/search.json`.
4. **Plantillas Hugo (`layouts/partials/footer.html`):** El pie consume `hugo.Data.words.total` y `hugo.Data.words.pages` en tiempo de build para mostrar el total de palabras del sitio sin necesidad de base de datos en producción.

### 4. Ordenación de resultados por número de coincidencias (`static/search.js`)
Se ha añadido la función pura `countHits(ts)(post)` que cuenta cuántas veces aparecen los términos buscados en el texto normalizado (`title + tags + text`). La función `search(posts, query)` filtra los posts que contienen todos los términos, proyecta copias inmutables (`{ ...post, hits }`) sin mutar el array original `posts` y las ordena de mayor a menor número de coincidencias (`(a, b) => b.hits - a.hits`).

### 5. Despliegue estático y procesos en servidor
Al desplegar `public/` mediante `rsync` o GitHub Pages, en el servidor **no corre ningún proceso nuestro** (ni Python, ni SQLite, ni Hugo): únicamente el servidor web estático (Nginx, Apache o el CDN de GitHub Pages) sirviendo ficheros `.html`, `.css`, `.js` y `.json` precalculados en tiempo de build.

### Aportación propia
- **Conteo de palabras por artículo en plantillas y buscador:** Aprovechando el mapa `by_url` generado por SQLite en `data/words.json` y el campo `words` en `static/search.json`, se muestra el número de palabras de cada post tanto en la portada (`layouts/index.html`), como en la cabecera de cada artículo (`layouts/_default/single.html`) y en cada resultado de búsqueda (`static/search.js`) junto con el número de coincidencias.
- **Mejoras de UX en el buscador (`static/search.js`):** Soporte para inicializar búsquedas desde la URL mediante el parámetro `?q=termino` y limpieza rápida con la tecla `Escape`.
- **Mantenimiento del proyecto (`TASKS.org`, `BUGS.org`, `Makefile`):** Documentación de la causa y solución del error de Pandoc (`lmodern.sty`) en `BUGS.org`, actualización de `TASKS.org` y validación de `data/words.json` en `make check`.

## Límites a propósito (KISS)

`tools/index.py` entiende front matter YAML simple (`clave: valor` y `tags: [a, b]`); no TOML ni listas
multilínea. Para algo más serio, usa una biblioteca de YAML: aquí lo importante es el *flujo*.

## Entregable

Haz un **fork** (o clona y crea tu propio repo) de este proyecto, resuelve los `Ejercicios` que quieras
de los de arriba (no hace falta hacerlos todos) y haz **varios commits** a medida que avanzas.

La práctica se considera entregada en el momento en que **invitas al profesor** (usuario de GitHub
`fenix011`) **como colaborador** de tu repositorio. Sigue estos pasos de la documentación oficial de
GitHub en español:
[Invitar a colaboradores a un repositorio personal](https://docs.github.com/es/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/inviting-collaborators-to-a-personal-repository).

No hace falta sFTP ni capturas: con la invitación aceptada, el profesor ya puede clonar tu repo y revisarlo.

---

# RUBRICA DE CALIFICACIÓN
## Criterios de contenido (10 puntos)

### Implementación técnica — 7 puntos

| **Criterio** | **Peso** | **Qué se valora** |
|:---|:---:|:---|
| **Entorno funcionando** | 1p | `make serve`, `make build` y `make check` corren sin errores sobre tu fork/copia |
| **Ejercicios resueltos** | 3p | Al menos 2 de los 5 `Ejercicios` propuestos, funcionando de verdad (no hace falta hacer los 5) |
| **Comprensión del flujo** | 2p | Se entiende cómo encajan `tools/index.py` → SQLite → JSON → Hugo en los cambios hechos (visible en el código o explicado en el README) |
| **Calidad del código añadido** | 1p | Estilo coherente con el proyecto (funciones puras donde aplica, nombres claros) |

### Más allá de lo técnico — 3 puntos

| **Criterio** | **Peso** | **Qué se valora** |
|:---|:---:|:---|
| **Aportación propia** | 1p | Algo más allá del mínimo pedido en los ejercicios elegidos |
| **Documentación del cambio** | 1p | El README (o un commit) explica qué se ha hecho y por qué |
| **Entregable completo y verificable** | 1p | Invitación a `fenix011` aceptada, repo clonable, commits reales |

## Convención en vivo vs. online, con matiz de `git log`

Esta práctica se entrega vía repositorio GitHub: 
- **10/10** — demo en vivo (en el aula) **y** `git log` con trabajo real incremental (varios commits, marcas de
  tiempo realmente separadas, mensajes no genéricos. Es decir, decriptivos de los cambios realizados!).
- **Intermedio (hasta 9/10)** — sin demo en vivo, pero con esa misma evidencia en el `git log`.
- **Tope 7/10** — sin demo en vivo y sin evidencia en el `git log` (un commit, mensajes genéricos o
  timestamps agrupados).

## Escala orientativa

- **Excelente (9-10):** varios ejercicios resueltos y funcionando, código claro, demo en vivo y/o
  `git log` con evidencia real.
- **Notable (7-8.9):** 2+ ejercicios resueltos y funcionando, algún detalle menor.
- **Suficiente (5-6.9):** el entorno corre pero los ejercicios resueltos son mínimos o tienen fallos.
- **Insuficiente (<5):** el entorno no llega a funcionar (`make build` falla) o no hay ningún ejercicio
  resuelto.

## Lista de comprobación rápida (para nosotros, el profesorado :-)

```bash
git clone https://github.com/<alumno>/<repo>.git && cd <repo>
make check && make build
git log --format='%h %ad %s' --date=iso | head -20
```

## Plantilla de feedback

```
## Feedback
- Qué ha ido bien: …
- A mejorar: …
- ¿Has pensado en usar `git` desde la terminal para hacer los cambios... a lo Pro? ;-)
```

"Recuerda ... KISS!" :-)
