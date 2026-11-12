# HANDOFF — mejora de diseño (rama `design/disenojg`)

Estado del trabajo de diseño de KallIt con la skill diseñoJG. Solo commits locales: no hay push, PR ni despliegue.

## Dónde estamos

La interfaz entera se rediseñó con la dirección **«la consola de la sala»**: cada persona en la llamada es un canal con nombre, medidor de nivel, fader de volumen y botón de silencio; los controles propios son teclas con canto que se quedan hundidas cuando están activas (micro silenciado, compartiendo). Lógica, datos, rutas y APIs no cambian.

- **Color:** neutros cálidos y una cara de acción por tema. Los cuatro temas (`default`, `ocean`, `sunset`, `forest`) y el modo oscuro conservan los identificadores guardados en `profiles`; solo cambian los colores que producen. Tokens en `src/index.css` (8 juegos de color).
- **Tipografía:** Rubik (texto) y Montserrat 900 (marca), autoalojadas en `public/fonts/` (licencia OFL en `OFL.txt`). Se retiró Google Fonts.
- **Componentes base:** `src/components/ui/` (`Boton`, `Campo`, `Selector`, `Interruptor`, `GrupoOpciones`, `Medidor`, `ChipEstado`, `MensajeError`), `src/hooks/useDialogo.ts`, `src/hooks/usePermisoMicro.ts`, `src/lib/errores.ts`.
- **Acceso:** salas operables con teclado, atajos `M`/`Esc` que no actúan al escribir ni con una capa abierta, paneles cerrados `inert`, diálogos con foco y retorno, aviso de micrófono denegado, error de red en español.
- **Textos:** solo cambiaron dos etiquetas («Hablando» → «Micro abierto» en la tecla del micro; «Terminar» → «Salir» para quien no creó la sala) y se quitó la fila «Estado: En línea» del acceso (era un dato falso fijo).

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
- Lectores de pantalla y zoom al 200 %.
- Firefox muestra el aviso de consola «Acquiring an exclusive Navigator LockManager lock…» del cliente de Supabase con el arnés; no se comparó con `main`.

## Pendiente

- **Decisión de Juan:** ¿quiere una comprobación real del estado del servidor en el acceso (`GET …/auth/v1/health` con tope de 4 s) en lugar de no mostrar estado?
- **Decisión de Juan:** lemas de plantilla («¿Listo para una comunicación auténtica?», «Únete a la red de comunicación más auténtica») y el anglicismo «invite link» (título y `aria-label` del botón de copiar en el inicio): no se tocaron.
- Cuando se reactive la demo: repetir el recorrido con dos navegadores reales (audio, pantalla compartida, popup de solicitud) y revisar el medidor con voz remota.
- Cerrar Ajustes sin guardar deja aplicado el tema previsualizado hasta recargar (comportamiento previo, no cambiado).
