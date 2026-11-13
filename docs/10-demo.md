# 10 · Modo demo (datos de ejemplo, sin red)

> **Estado:** Operativo · **Predecesor:** [09 · Deploy](09-deploy.md)

---

## Por qué existe

El proyecto de Supabase sigue **en pausa por decisión del autor** y su host ya no se resuelve por DNS. Con el backend así, el sitio publicado cargaba el acceso pero no se podía hacer nada: «Entrar» daba un error de red y «Acceder con Google» sacaba a la persona de la app hacia una pantalla de error del navegador (en el celular se vive como «no carga»). Diagnóstico completo más abajo.

El **modo demo** deja recorrer la app entera con datos de ejemplo, **sin cuenta y sin red**. Para usarla de verdad (con cuentas y con otras personas) hay que **pedir una muestra o una prueba**: <https://juandgaitan.com/es/#contacto>.

## Cómo se activa

En la pantalla de acceso, el aviso «Esto es una demo» lleva el botón **«Probar la demo»** (en escritorio dentro del panel oscuro; en móvil sobre el formulario). Al pulsarlo se descarga el código de la demo (un fragmento aparte de ~18 kB, ~7 kB comprimido) y se entra como «Invitado».

- Una **franja fija** arriba dice en todo momento «Demo · datos de ejemplo · Nada de lo que hagas se envía ni se guarda» y tiene **«Salir de la demo»** (en móvil, «Salir»). «Cerrar sesión» del inicio hace lo mismo. Ajustes añade un recordatorio propio (los diálogos a pantalla completa tapan la franja) y la sala explica que no se usa el micrófono.
- Recargar la página **no saca de la demo** (se recuerda en `sessionStorage`, solo de esa pestaña); el contenido, en cambio, vuelve a empezar. Al salir, la app vuelve al acceso con el tema por defecto.

## Cómo funciona (la vía menos invasiva)

Un **cliente de Supabase simulado en memoria** sustituye al real solo mientras la demo está activa; la lógica de los componentes y de los hooks no cambia.

| Pieza | Qué hace |
|---|---|
| `src/demo/modo.ts` | Lo único de la demo en el paquete principal: el interruptor (`entrarEnDemo`, `salirDeDemo`, `useDemoActiva`) y el registro de niveles simulados. Importa el resto con `import()` al pulsar «Probar la demo». |
| `src/supabase.ts` | Exporta un `Proxy` del cliente real. Con la demo apagada, cada llamada va al cliente real **sin cambios**; con la demo encendida, al simulado. Crear el cliente real no hace ninguna petición. |
| `src/demo/cliente.ts` | Cliente simulado: `from(...)` con `select/insert/update/delete`, `eq/neq/gte/in/ilike/or`, `order/limit/single/maybeSingle`; canales con `postgres_changes`, presencia y broadcast; `rpc` (`touch_call`, `join_call_by_invite`); sesión de «Invitado». Lleva también el guion: las personas de ejemplo responden, entran a la sala, cambian de ánimo y de micro. |
| `src/demo/datos.ts` | Datos ficticios y avatares dibujados en SVG local (`data:`). |
| `src/hooks/useRtc.ts` + `src/demo/rtc.ts` | `CallRoom` llama a `useRtc`, que elige **una vez por montaje** entre `useWebRTC` (real, intacto) y `useRtcDemo` (sin micrófono, sin `RTCPeerConnection`, sin señalización). |
| `src/demo/voz.ts` + `src/hooks/useAudioLevel.ts` | Niveles de voz simulados, deterministas. `useAudioLevel` los lee de un registro (`nivelesSimulados`) si el flujo es de la demo; si no, analiza audio real como siempre. |
| `src/components/FranjaDemo.tsx`, `AvisoDemo.tsx` | La franja y el aviso del acceso. |

No se tocaron `useWebRTC.ts`, la señalización, `supabase/` ni `scripts/deploy-gh-pages.mjs`.

## Qué es ficticio

Todo: las personas (Valentina Ríos, Mateo Cárdenas, Camila Ortega, Santiago Mejía, Daniela Fuentes, Julián Pardo, Bruno Salas y cinco personas más que salen en la búsqueda), las salas (Noche de juegos, Estudio de cálculo II, Planes del viernes, Tertulia de música y tres terminadas), los mensajes y los avatares. No hay datos de nadie real.

Lo que se ve con guion: Camila escribe un mensaje directo a los 9 s de entrar (aparece la insignia de no leídos); cualquier mensaje que se envíe en un mensaje directo o en el chat de una sala recibe una respuesta de ejemplo; en la sala, las personas entran de una en una, cambian de ánimo y de micro cada ~11 s y «hablan» con niveles simulados (movimiento reducido: dos escalones y 1,4 cambios por segundo en vez de 10). Con `prefers-reduced-motion` el medidor sigue siendo información, pero se mueve despacio y a saltos.

## Qué no hace la demo (y se dice)

- **No hay audio ni micrófono**: ni se pide permiso ni se abre `getUserMedia`; las voces y los niveles son simulados y no salen del navegador. La sala lo explica.
- **Compartir pantalla no está disponible** («No disponible», con «En la demo no se puede compartir pantalla»).
- Nada se envía ni se guarda: crear salas, amigos, bloqueos, mensajes, nombre, tema y avatar viven en memoria hasta salir o recargar.
- Los permisos de notificación son los del navegador: si el sitio ya los tenía concedidos, los mensajes entrantes de ejemplo pueden mostrar una notificación local.

## Garantía de «sin red»

`demo.mjs` (Playwright; fuera del repo, en las carpetas de la ronda) registra todas las peticiones del recorrido completo y exige que **ninguna salga del propio origen**: acceso → «Probar la demo» → salas → amigos → mensaje directo → sala con llamada → medidor → silenciar → volumen → chat → ajustes y tema → salir. Resultado en Chromium, Firefox y WebKit a 390 px (táctil) y 1440 px, más 390 px con movimiento reducido: 0 peticiones fuera del origen, `getUserMedia` y `RTCPeerConnection` en 0, 0 errores de consola (salvo el aviso de `LockManager` del cliente **real** de Supabase en Firefox, que sale con solo cargar el acceso y es de origen).

## El aviso del acceso

«Esto es una demo»: dice que se puede probar con datos de ejemplo, que no se envía ni se guarda nada, que entrar con una cuenta real todavía no es posible (el servidor está en pausa) y que para usarla de verdad hay que **pedir una muestra o una prueba**, con enlace a <https://juandgaitan.com/es/#contacto> (`target="_blank"`, `rel="noopener noreferrer"`). El estado se dice con texto, no solo con color; a 390 px no desborda en los 4 temas, claro y oscuro (48 combinaciones comprobadas).

Además, **«Acceder con Google» ya no saca de la app** con el servidor caído: antes de redirigir comprueba con una petición mínima a su endpoint de salud (4 s de tope; `servidorResponde` en `src/lib/errores.ts`) y, si no responde, muestra el error de red en español sin salir.

## Diagnóstico de «no carga» (2026-11-12, producción, solo lectura)

Playwright cargó <https://juangaitand.github.io/Comunicaciones-web-app/> como visitante nuevo en iPhone (WebKit y Chromium, 390 px, táctil), Android (Chromium) y escritorio (Chromium, Firefox, WebKit):

- **La página carga en los 6 casos**: HTTP 200, 0 respuestas ≥ 400, sin errores de JS al cargar, sin desborde, fuentes cargadas, sin service worker ni caché (`max-age=600` de GitHub Pages). Las rutas con la base `/Comunicaciones-web-app/` están bien.
- **Causa: el backend en pausa.** «Entrar» da `ERR_NAME_NOT_RESOLVED` y el mensaje de red; **«Acceder con Google» navega al host del backend, que no existe, y deja la pantalla de error del navegador** (Chromium y Firefox). Es lo que se vive como «no carga».
- Respuesta: demo con datos de ejemplo, aviso nuevo y comprobación previa en el botón de Google (arriba).

## Cuando vuelva el backend

El modo normal no cambia: con la demo apagada el `Proxy` delega en el cliente real. Para reactivar el servicio: [01 · Supabase](01-supabase-bootstrap.md). Después conviene decidir si el aviso sigue ofreciendo «Probar la demo» (sirve de muestra sin cuenta) y retirar el texto de «servidor en pausa»; ese texto está en `src/components/AvisoDemo.tsx` y `src/lib/errores.ts`.

## Cómo verificar

```bash
npm run lint && npm run build
# build servido bajo la base de Pages, con variables ficticias y fuera del repo:
VITE_SUPABASE_URL=https://demo-falso.invalid VITE_SUPABASE_ANON_KEY=falsa \
  VITE_TURN_URL= VITE_TURN_URL_TLS= VITE_TURN_USERNAME= VITE_TURN_CREDENTIAL= \
  npx vite build --outDir <carpeta-fuera-del-repo> --emptyOutDir
npx vite preview --outDir <carpeta-fuera-del-repo> --port 3102 --strictPort
node demo.mjs http://localhost:3102/Comunicaciones-web-app/ <salida>   # recorrido con registro de red
```

Las variables van en la línea de comandos (prevalecen sobre `.env`). Los scripts de Playwright viven fuera del repo.
