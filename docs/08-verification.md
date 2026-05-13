# 08 · Verificación E2E y medición de cuotas

> **Estado:** Checklist final · **Predecesor:** [07 · Limpieza](07-cleanup-firebase.md)

---

## Objetivo

Validar que la migración completa funciona de extremo a extremo y, sobre todo, que **se cumplió el objetivo original**: que la app pueda usarse activamente sin acercarse a los límites del tier gratuito de Supabase.

---

## Checklist de funcionalidad

### Auth

- [x] Registro email/password con `Confirm email` desactivado → entra inmediatamente al dashboard. Trigger SQL crea fila en `profiles` con avatar DiceBear por defecto.
- [x] Login email/password con una cuenta existente.
- [x] Google OAuth → redirige al consent de Google → vuelve al dashboard con avatar de Google real.
- [x] Logout vuelve a la pantalla de Auth.

### Perfil

- [ ] Abrir Ajustes → cambiar nombre, randomizar avatar, alternar tema y modo oscuro → guardar → el header del dashboard refleja los cambios sin recargar. Recargar → los cambios persisten.
- [ ] Verificar en Supabase → Table Editor → `profiles` que `display_name`, `photo_url`, `avatar_config` (jsonb), `theme`, `is_dark_mode` y `updated_at` reflejan lo guardado.

### Dashboard

- [ ] Crear una llamada nueva → redirige a CallRoom. En Table Editor → `calls` hay nueva fila con `status='active'`, `creator_id = auth.uid`, `last_active_at` ≈ now.
- [ ] Abrir el dashboard en dos pestañas. Crear una llamada en pestaña A → aparece en "En Vivo" de pestaña B sin recargar (Realtime CDC).
- [ ] Llamadas con `last_active_at` viejo (>5 min) **no** aparecen en "En Vivo".

### Llamadas (CallRoom)

- [ ] **1-a-1**: dos pestañas/dispositivos. Una crea, la otra se une. Audio funciona bidireccional, mute y mood se reflejan en ≤1 s.
- [ ] **Grupal 3+**: tres+ peers, mesh WebRTC, todos se ven y se oyen.
- [ ] **Mute con `M`**: toggle local + propagación por Presence.
- [ ] **Mood**: click en un emoji → el otro peer lo ve como overlay.
- [ ] **Salida limpia**: cerrar pestaña → el otro peer ve al usuario desaparecer de la grilla en ≤2 s (Presence onLeave automático).
- [ ] **"Terminar para todos"** (solo creador) → los demás clientes salen automáticamente al dashboard.
- [ ] **Heartbeat**: con la llamada abierta, ejecutar en SQL editor cada minuto: `select last_active_at from calls where id = '...'`. Debe avanzar.

### Limpieza

- [x] `git grep -i firebase` sobre archivos versionados de código (`.ts`, `.tsx`, `.json`, `.js`, `.jsx`) devuelve 0.
- [x] `npm run lint` pasa.
- [x] `npm run build` pasa.

---

## Medición de cuotas (la prueba real)

El objetivo de toda la migración: que esta app pueda correr indefinidamente sin acercarse a los límites del free tier.

### Plan de prueba

1. Limpiar contadores del dashboard de Supabase: ir a **Project → Settings → Usage** y anotar valores actuales.
2. Sesión sintética: 2 usuarios en una llamada durante **10 minutos**, con cambios de mute/mood cada ~5 segundos (≈120 transiciones por usuario).
3. Tras la sesión, anotar valores nuevos.

### Resultado esperado

| Métrica | Free tier | Esperado tras 10 min |
|---|---|---|
| Database egress | 5 GB/mes | <1 MB |
| Database writes | sin límite duro (es Postgres) | ~10–15 writes total: 1 insert call + 10 heartbeats × N usuarios + 0–1 ended |
| Auth users | 50 000 MAU | 2 |
| Realtime messages | 2 000 000/mes free | ~500 broadcast + ~50 presence sync |
| Storage | 1 GB | 0 (no usamos Storage) |

### Por qué importa

En el modelo Firestore previo, la misma sesión generaba:

- 1 escritura por ICE candidate (≈50–200 por participante por llamada inicial).
- 1 escritura por cada cambio de mute/mood (≈240 en 10 min con 2 usuarios).
- N lecturas por escritura en cada peer.

Total estimado: **>1 000 escrituras** en 10 minutos para 2 usuarios. Con 20 minutos de uso activo, ya rompía la cuota diaria del free tier de Firestore (20 000 escrituras/día).

Tras la migración: **≈15 escrituras** para la misma sesión. **Dos órdenes de magnitud menos.**

---

## Trade-offs aceptados y conocidos

- **Pausa por inactividad**: Supabase free pausa proyectos sin actividad por 7 días. Al despertar tarda ~30 s la primera carga. Aceptable para portafolio.
- **`touch_call` ejecutable por authenticated**: advisor de Supabase indica que es una RPC `SECURITY DEFINER` expuesta. **Intencional**: es el patrón heartbeat sin backend. Documentado en [docs/02-database-schema.md](02-database-schema.md).
- **Cleanup de llamadas abandonadas**: si todos cierran pestaña sin "Terminar", la llamada queda con `status='active'` pero `last_active_at` viejo → no aparece en el dashboard. Quedan filas "huérfanas" en DB. Solución futura: job `pg_cron` que marque ended después de 1 h sin heartbeat.
- **Sin Realtime para `profiles`**: los cambios al perfil se propagan vía callback `onProfileUpdated`, no por suscripción. Trade-off: simplicidad vs latencia (igualmente solo aplica al propio usuario en la sesión actual).
- **Vulnerabilidades npm**: tras la limpieza quedaron 3 (1 moderada, 2 high) en deps transitivas. Revisar con `npm audit` periódicamente.

---

## Próximos pasos sugeridos (fuera del alcance de esta migración)

- Chat de texto en llamada (tablas `call_messages` ya existen, falta UI).
- Lista de amigos + DMs (tablas `friendships`, `dm_threads`, `dm_messages` ya existen).
- Cleanup automático de llamadas abandonadas vía `pg_cron`.
- Code splitting del bundle (605 KB → reducir con dynamic imports).
- Reactivar "Confirm email" antes de pasar a producción real + configurar SMTP.

---

## Estado del proyecto

✅ **Migración completa**. La app funciona sobre Supabase, el código no contiene rastros de Firebase, la documentación cuenta toda la historia. Listo como caso de estudio de portafolio.
