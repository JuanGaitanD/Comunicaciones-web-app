# 09 · Deploy a GitHub Pages

> **Estado:** Operativo · **Predecesor:** [08 · Verificación](08-verification.md)

---

## Objetivo

Publicar la app en GitHub Pages con un único comando, sin GitHub Actions ni servicios externos. El script `scripts/deploy-gh-pages.mjs` automatiza todo el ciclo build → reemplazo de archivos en la rama `gh-pages` → push.

---

## Por qué deploy manual desde local (y no GitHub Actions)

Los secrets de cliente del proyecto (claves `VITE_*`) se **hornean** en el bundle durante `vite build`. Para un workflow de CI haría falta replicar las cuatro variables TURN + las dos de Supabase como GitHub Secrets, y rotarlas en dos sitios cuando cambien. Para una app de portafolio con un solo desarrollador, mantener el `.env.local` como fuente única y publicar manualmente es más simple y reduce superficie de error.

La rama `main` contiene solo código fuente. La rama `gh-pages` contiene solo el build estático (`index.html`, `favicon.svg`, `assets/`). Nunca conviven en el mismo árbol de trabajo.

---

## El script

[`scripts/deploy-gh-pages.mjs`](../scripts/deploy-gh-pages.mjs) hace lo siguiente:

```
1. Valida que dist/ exista (si no, aborta — pide correr `npm run build`).
2. Limpia un worktree previo si quedó por un deploy fallido.
3. git fetch origin gh-pages
4. git worktree add .gh-pages-deploy gh-pages    ← checkout aislado
5. Borra todo el contenido del worktree salvo .git/
6. Copia dist/* dentro del worktree
7. git add -A  →  commit "Deploy <timestamp>"  →  push origin gh-pages
8. git worktree remove --force .gh-pages-deploy
```

El comando `npm run deploy` encadena `npm run build` con la ejecución del script:

```json
"deploy": "npm run build && node scripts/deploy-gh-pages.mjs"
```

### Por qué `git worktree` y no `git checkout gh-pages`

- **No fuerza a stashear cambios** en `main`. El worktree es una carpeta separada con su propio HEAD.
- **No hay riesgo de olvidarse de volver a `main`**. El worktree se borra al final del script.
- **El editor nunca ve archivos de producción** mezclados con código fuente. No es posible editar por error un `index-*.js` minificado creyendo que es un archivo del repo.
- **Atómico**: si algo falla a mitad, la rama `main` queda intacta. La rama `gh-pages` se actualiza solo si los pasos 5–7 fueron exitosos.

`.gh-pages-deploy/` está en `.gitignore` para que un fallo a mitad no contamine la rama `main` con una carpeta colgante.

---

## Uso

### Deploy normal

```bash
npm run deploy
```

Salida esperada al final:

```
[gh-pages <hash>] Deploy 2026-05-24 19:22
 N files changed, ...
To https://github.com/JuanGaitanD/Comunicaciones-web-app.git
   <old>..<new>  gh-pages -> gh-pages

Deploy publicado a gh-pages.
```

GitHub Pages tarda **30–60 segundos** en propagar. Tras el push:

1. Abrir https://juangaitand.github.io/Comunicaciones-web-app/ en modo incógnito (evita cache del navegador).
2. Verificar que el `<script>` en el HTML apunta al hash nuevo de `index-*.js`.
3. Los clientes ya conectados pueden ver el bundle viejo hasta hacer **hard refresh** (`Ctrl+Shift+R`). Si reportan errores tras un deploy, lo primero a pedir es esto.

### Sin cambios

Si `dist/` no produjo diferencias respecto al deploy anterior, el script imprime:

```
No hay cambios para desplegar.
```

y termina sin hacer commit. Útil cuando se buildea de prueba.

---

## Cuándo redesplegar

| Cambio | ¿Requiere deploy? |
|---|---|
| Editar código en `src/` | Sí. Vite genera nuevo hash de bundle. |
| Cambiar `.env.local` | Sí. Las `VITE_*` se inlinean en build. |
| Migraciones SQL en Supabase | No. El frontend no embebe el schema. |
| Cambios en `docs/` o `README.md` | No. Solo se sirven desde `main`. |
| Cambios en `scripts/deploy-gh-pages.mjs` | No (el script vive en `main`; solo afecta a futuros deploys). |

---

## Troubleshooting

### `fatal: '.gh-pages-deploy' already exists`

Un deploy previo no limpió el worktree (interrumpido con Ctrl+C). El script lo detecta y limpia automáticamente en la siguiente ejecución. Si no lo logra:

```bash
git worktree remove --force .gh-pages-deploy
rm -rf .gh-pages-deploy
```

y volver a intentar.

### Push rechazado por `non-fast-forward`

Significa que alguien (otra máquina, otro colaborador) pusheó a `gh-pages` desde el último `git fetch`. El script ya hace `git fetch origin gh-pages` antes de cada deploy, así que esto solo aparece si dos personas despliegan al mismo tiempo. Reintentar suele bastar.

### El bundle nuevo no se ve en producción

1. Esperar 60 segundos tras el push.
2. Comprobar en https://github.com/JuanGaitanD/Comunicaciones-web-app/deployments que la última entrada está en verde.
3. Abrir DevTools → Network → recargar con `Disable cache` activo. El `index.html` debe pedir el hash nuevo.
4. Si el HTML sigue apuntando al hash viejo, el CDN de GitHub Pages está sirviendo cache rancia → forzar un nuevo deploy vacío con `npm run deploy` (genera un commit nuevo y purga el cache).

---

## Resultado

- ✅ `npm run deploy` despliega en ≈ 15 segundos (build + push).
- ✅ `main` nunca se contamina con archivos de build.
- ✅ Un solo punto de configuración: `.env.local` local del desarrollador.
- ✅ Documentado en [README.md](../README.md) y en este archivo.
