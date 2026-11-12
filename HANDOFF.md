# HANDOFF — mejora de diseño (ramas `design/disenojg` y `design/ronda-2`)

Estado del trabajo de diseño de KallIt con la skill diseñoJG. La rama `design/disenojg` se integró en `main` por avance rápido y se publicó en GitHub Pages el 2026-11-12 con `npm run deploy`. La **ronda 2** (`design/ronda-2`, desde `main` en `3423f3d`) añade el aviso de demo bajo demanda, la compatibilidad con navegadores y el favicon nuevo.

## Dónde estamos

La interfaz entera se rediseñó con la dirección **«la consola de la sala»**: cada persona en la llamada es un canal con nombre, medidor de nivel, fader de volumen y botón de silencio; los controles propios son teclas con canto que se quedan hundidas cuando están activas (micro silenciado, compartiendo). Lógica, datos, rutas y APIs no cambian.

- **Color:** neutros cálidos y una cara de acción por tema. Los cuatro temas (`default`, `ocean`, `sunset`, `forest`) y el modo oscuro conservan los identificadores guardados en `profiles`; solo cambian los colores que producen. Tokens en `src/index.css` (8 juegos de color).
- **Tipografía:** Rubik (texto) y Montserrat 900 (marca), autoalojadas en `public/fonts/` (licencia OFL en `OFL.txt`). Se retiró Google Fonts.
- **Componentes base:** `src/components/ui/` (`Boton`, `Campo`, `Selector`, `Interruptor`, `GrupoOpciones`, `Medidor`, `ChipEstado`, `MensajeError`), `src/hooks/useDialogo.ts`, `src/hooks/usePermisoMicro.ts`, `src/lib/errores.ts`.
- **Acceso:** salas operables con teclado, atajos `M`/`Esc` que no actúan al escribir ni con una capa abierta, paneles cerrados `inert`, diálogos con foco y retorno, aviso de micrófono denegado, error de red en español.
- **Textos:** solo cambiaron dos etiquetas («Hablando» → «Micro abierto» en la tecla del micro; «Terminar» → «Salir» para quien no creó la sala) y se quitó la fila «Estado: En línea» del acceso (era un dato falso fijo).

## Demo disponible bajo demanda

**Decisión de Juan: no se reactiva Supabase; la demo se activa a pedido.** Qué significa:

- El proyecto de Supabase sigue **en pausa**. Entrar o registrarse en el sitio publicado no conecta (sale el error de red en español de `src/lib/errores.ts`).
- La pantalla de acceso lleva un **aviso fijo** (`src/components/AvisoDemo.tsx`, usado en `Auth.tsx`): «Demo en pausa. KallIt es una demo y su servidor está en pausa: se activa a pedido. Si intentas entrar o registrarte ahora, no conectará.», con enlace al perfil de GitHub del autor (el mismo que cita el `README.md`; no se inventó ningún otro contacto). En escritorio ocupa el panel oscuro, que así queda lleno; en móvil va sobre el formulario.
- Es contenido estático: no hace llamadas de red ni comprueba el estado del servidor. Por eso la decisión D1 de la ronda 1 (comprobación real de `…/auth/v1/health`) queda descartada mientras la demo siga en pausa.
- Para activarla: reactivar el proyecto de Supabase (`docs/01-supabase-bootstrap.md`) y retirar `AvisoDemo` del acceso.

## Compatibilidad con navegadores

**Objetivo (diseño completo):** Chrome y Edge 111+, Firefox 128+, Safari e iOS 16.4+, Samsung Internet 22+ (declarado en `.browserslistrc`). **Mínimo en que la página se lee:** Chrome 99, Firefox 97, Safari 15.4 (`build.target` de `vite.config.ts`, con `es2020`).

El punto de partida (Safari 14+, Chrome/Edge/Firefox 90+) **no se puede cumplir**: el suelo lo pone Tailwind CSS 4.2 (la versión instalada), que usa capas en cascada (`@layer`, Chrome 99 / Firefox 97 / Safari 15.4: sin ellas el navegador ignora los bloques de capa y casi ninguna utilidad se aplica; deducido de la especificación, no ejecutado en un navegador así) y `@property` y `color-mix()` (Chrome 111 / Firefox 128 / Safari 16.4: por debajo, Tailwind trae sus respaldos y el diseño degrada). Bajarlo exigiría migrar a Tailwind 3 o aplanar las capas con PostCSS (dependencia nueva); no se hizo. `@tailwindcss/vite` fija además sus propios objetivos de CSS (Safari 16.4, Chrome 111, Firefox 128), así que `build.target` solo afecta al JS.

Respaldos añadidos (todos CSS, sin polyfills ni dependencias):

- `color-mix()`: el filo de los botones pasa a `rgb(255 255 255 / .35)` (antes, sin `color-mix`, la sombra entera era inválida y el botón perdía el canto); el hover de peligro es el token `--peligro-hover`; el pulsado de los botones planos y el velo de los paneles llevan respaldo y `@supports`.
- `:hover` solo bajo `@media (hover: hover)` (botones, campos, selector, opciones): sin estados pegados en táctil. Los `hover:` de Tailwind ya venían así.
- `dvh`: respaldo en `vh` bajo `@supports not (height: 100dvh)` para `h-dvh`, `min-h-dvh`, `h-[85dvh]` y el máximo del carril lateral.
- `:has()`: la opción elegida de los grupos de radios se marca con `data-marcada` (ya no depende de `:has`); el anillo de foco usa `:has` y, sin él, `:focus-within`.
- `forced-colors`: el medidor distingue encendido (relleno) de apagado (hueco con borde); la pestaña elegida del acceso y de amigos, y los botones activos (ánimo, chat), llevan borde resaltado o doble; el aviso de demo dibuja su borde.
- `navigator.clipboard.writeText` al copiar la invitación en la sala: ahora con `try/catch` (el inicio ya lo tenía).
- Ya estaban bien: `appearance: base-select` dentro de `@supports`; `font-display: swap`; `inert` (los paneles cerrados además quedan `visibility: hidden`, así que salen del orden de Tab aunque el navegador no soporte `inert`); sin `@container`, `structuredClone`, `.at()`, `ResizeObserver`, `backdrop-filter` ni `TouchEvent`.

**WebRTC y compartir pantalla** (no se tocaron): hacen falta HTTPS o `localhost` (`getUserMedia`, `crypto.randomUUID`, portapapeles), `RTCPeerConnection` y permiso de micrófono. `getDisplayMedia` solo existe en escritorio (Chrome 72+, Firefox 66+, Safari 13+); en móviles el botón sale «No disponible» (`canShareScreen`).

**Probado** (Playwright con arnés, 390 y 1440 px; acceso, salas y sala en llamada): Chromium 158, Firefox 159 y WebKit 27, en normal, `forced-colors: active`, `prefers-reduced-motion: reduce` y táctil (`hover: none`, `pointer: coarse`): 0 px de desborde, ningún 404, sin errores de consola nuevos. **No se pudo probar de verdad:** Safari e iOS reales, Samsung Internet, versiones viejas de cualquier navegador (Playwright solo trae las recientes: los respaldos de `dvh`, `:has` y `color-mix` están comprobados por lectura del CSS, no ejecutados en un navegador sin ellos), alto contraste real de Windows ni lectores de pantalla.

## Favicon

Medidor de canal: cinco barras escalonadas, tres en ámbar `#fea754` y dos apagadas, sobre un cuadrado grafito `#17130f` (`public/favicon.svg`, 458 B; el cuadrado opaco se ve igual en pestañas claras y oscuras, así que no lleva `prefers-color-scheme`). Respaldos: `favicon-32.png` (491 B) y `apple-touch-icon.png` (180 px, fondo opaco, 1,2 kB). `index.html` los enlaza con rutas absolutas que Vite reescribe con la base `/Comunicaciones-web-app/` y declara `theme-color` `#f7f4f1`. No hay `favicon.ico` ni manifest: el proyecto no es una PWA. `metadata.json` pasó de «Comunicaciones Made By Jada» a «KallIt». El `name` de `package.json` (`comunicaciones-made-by-jada`) se dejó: cambiarlo reescribe el lockfile.

## Cómo verificar

```
npm ci
npm run lint      # = tsc --noEmit; es el único lint
npm run build
```

No hay pruebas automáticas ni ESLint en el repo. Con el backend pausado la app queda en blanco sin variables de entorno; para ver las pantallas internas hace falta un arnés que simule Supabase (REST, auth, RPC y Realtime). Se usó uno **fuera del repo**; no se incluye aquí. Servidor de verificación: `VITE_SUPABASE_URL=<url ficticia> VITE_SUPABASE_ANON_KEY=<clave ficticia> npx vite --port <puerto> --strictPort` (el script `dev` fija el puerto 3000).

## Qué no se pudo verificar (backend pausado)

- Audio y vídeo reales entre dos personas; que el medidor refleje la voz de un peer remoto (en el arnés los remotos no tienen stream).
- Estados reales «Reconectando…» y «Sin audio (red bloqueada)» (solo se vieron los textos al forzarlos y en Firefox con peers simulados).
- Realtime real (CDC, presencia), OAuth de Google, notificaciones de escritorio.
- Lectores de pantalla y Safari en iOS real (el zoom al 200 % y `forced-colors` se comprobaron emulados en la revisión).
- Firefox muestra el aviso de consola «Acquiring an exclusive Navigator LockManager lock…» del cliente de Supabase con el arnés; también sale en `main`, es de origen.

## Revisión independiente (2026-11-12)

Veredicto: apto con dos correcciones, ya aplicadas en commits `fix` propios: Escape en el selector de ánimo sacaba de la llamada en móvil, y el botón «Salir» conservaba el nombre accesible «Terminar comunicación». Lint, build, build servido bajo `/Comunicaciones-web-app/`, los tres navegadores, movimiento reducido, alto contraste y los 8 juegos de color pasan; la lógica WebRTC y las llamadas a Supabase no cambiaron. Hallazgos que quedan abiertos:

- **P2:** en las teclas del micro y de compartir, el nombre accesible no contiene el texto visible (se ve «Micro abierto» y el lector dice «Silenciar micrófono (M)»). Ya ocurría en `main`.
- **P2:** a 320 px la barra de controles de la sala se sale 5 px (en `main`, hasta 28 px).
- **P3:** con el chat abierto a 1440 px se tapa el cuarto participante (de origen). El medidor en alto contraste que también figuraba aquí se arregló en la ronda 2.
- **Riesgo sin verificar:** `usePermisoMicro` podría dar un aviso falso de micrófono denegado en Firefox si la persona tarda más de 4 s en aceptar el permiso.

## Pendiente

- ~~Comprobación real del estado del servidor en el acceso~~: descartada por decisión de Juan (la demo se activa a pedido; ver «Demo disponible bajo demanda»). El aviso es estático.
- **Decisión de Juan:** lemas de plantilla («¿Listo para una comunicación auténtica?», «Únete a la red de comunicación más auténtica») y el anglicismo «invite link» (título y `aria-label` del botón de copiar en el inicio): no se tocaron.
- Cuando se reactive la demo: repetir el recorrido con dos navegadores reales (audio, pantalla compartida, popup de solicitud) y revisar el medidor con voz remota.
- Cerrar Ajustes sin guardar deja aplicado el tema previsualizado hasta recargar (comportamiento previo, no cambiado).
