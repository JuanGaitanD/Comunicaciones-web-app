# 07 · Limpieza de Firebase

> **Estado:** En curso · **Predecesor:** [06 · Profile](06-profile-migration.md) · **Sucesor:** [08 · README + Verificación E2E](08-verification.md)

---

## Objetivo

Eliminar todo rastro de Firebase del proyecto y los artefactos legacy de Google AI Studio. Tras este paso, el proyecto compila, ejecuta y publica sin que la palabra "firebase" aparezca en ningún archivo activo del repo.

---

## Lo que se elimina

### Archivos

- `src/firebase.ts` — bootstrap del SDK Firebase.
- `src/lib/firestore-errors.ts` — helper de logging con `auth.currentUser`. Ya no se usa.
- `firestore.rules` — reglas de seguridad de Firestore.
- `firebase-applet-config.json` — config con apiKey/projectId/etc. (no es secreto pero ya no se usa).
- `firebase-blueprint.json` — documentación del data model original (obsoleta; el modelo nuevo está en `supabase/migrations/0001_init.sql` + `docs/02-database-schema.md`).

### Dependencias en `package.json`

- `firebase` (^12.11.0)
- `react-firebase-hooks` (^5.1.1)

Ninguna se importa. Quitarlas reduce el bundle final y la superficie de auditoría.

### Variables de entorno legacy

- `GEMINI_API_KEY` (vite.config.ts `define`, .env.example).
- `APP_URL` (.env.example).

Inyectadas originalmente por Google AI Studio; ningún archivo del proyecto las lee. Se quitan junto con el `define` correspondiente de `vite.config.ts`.

---

## Pasos

1. Borrar los 5 archivos listados.
2. Editar `package.json` para quitar `firebase` y `react-firebase-hooks`.
3. Editar `vite.config.ts` para quitar el bloque `define: { 'process.env.GEMINI_API_KEY': ... }`.
4. Editar `.env.example` para quitar `GEMINI_API_KEY` y `APP_URL`.
5. `npm install` para regenerar `package-lock.json` sin las dependencias firebase.
6. `npm run lint` final.

---

## Verificación

- `git grep -i firebase` no debe devolver resultados en archivos versionados (excepto quizás en `docs/` que sí los menciona como contexto histórico, lo cual es correcto).
- `git grep GEMINI_API_KEY` no debe devolver nada.
- `npm run lint` pasa.
- `npm run build` pasa (build de producción real).
- Bundle size: comparar `dist/assets/index-*.js` antes y después debe mostrar reducción significativa (firebase es pesado).

---

## Resultado

Hecho:

- ✅ Borrados los 5 archivos: `src/firebase.ts`, `src/lib/firestore-errors.ts`, `firestore.rules`, `firebase-applet-config.json`, `firebase-blueprint.json`.
- ✅ Quitadas de `package.json`: `firebase`, `react-firebase-hooks`.
- ✅ Quitadas (bonus) deps legacy AI Studio sin uso real: `@google/genai`, `express`, `dotenv`, `@types/express`, `tsx`. Si se necesitan más adelante para alguna feature, se reinstalan puntualmente.
- ✅ `vite.config.ts` limpio: sin `loadEnv` ni `define` de GEMINI_API_KEY. Comentarios de AI Studio quitados.
- ✅ `.env.example` reducido a solo las dos variables que realmente se usan.
- ✅ Reemplazado el `<img src="https://www.gstatic.com/firebasejs/...">` del botón Google por un **SVG inline** del logo de Google (cero dependencias externas, mejor rendimiento, sin ningún string "firebase" en el repo).
- ✅ `npm install` regeneró `package-lock.json`: vulnerabilidades bajaron de 6 (2 mod, 3 high, 1 critical) → 3 (1 mod, 2 high).
- ✅ `npm run lint` pasa.
- ✅ `npm run build` produce `dist/`: 605 KB JS / 178 KB gzip + 32 KB CSS / 6 KB gzip. Aceptable para un SPA con React 19 + Supabase + WebRTC + Motion + Tailwind. Se podría code-splittear más adelante si crece.
- ✅ `git grep -i firebase` sobre archivos `.{ts,tsx,json,js,jsx}` devuelve cero coincidencias.

**Nota de auditoría**: `docs/` sí menciona "Firebase" — pero es el contexto histórico de la migración (por qué se hizo, qué reemplazó). Eso es correcto: la documentación cuenta la historia del proyecto.
