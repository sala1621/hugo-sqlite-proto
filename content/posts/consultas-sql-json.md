---
title: "Consultas SQL que exportan JSON"
date: 2026-11-16
description: "Cómo usar json_object y json_group_array de SQLite para alimentar plantillas Hugo."
tags: [sql, sqlite, build, kiss]
---
La extensión **JSON1** viene integrada por defecto en SQLite y permite que una
simple consulta `SELECT` devuelva directamente un documento JSON listo para
consumir desde Hugo o desde el navegador.

1. `json_object('clave', valor)` construye cada objeto fila a fila.
2. `json_group_array(...)` agrupa todas las filas en un único array JSON.
3. `GROUP BY` y `COUNT(*)` calculan agregaciones como el conteo de etiquetas o palabras.

```sql
SELECT json_group_array(json_object('tag', tag, 'total', total))
FROM (
  SELECT tag, COUNT(*) AS total
  FROM tags
  GROUP BY tag
  ORDER BY total DESC, tag
);
```

De este modo, Python no tiene que transformar diccionarios manualmente: delega
la agregación en el motor relacional y vuelca el resultado directo a `data/` y
`static/`.
