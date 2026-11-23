# RobotOS SmartHome – Cambios realizados

Esta copia contiene ajustes sobre el proyecto original, manteniendo su estructura y diseño general.

## Cambios incluidos

- La ubicación del robot y el panel de habitación se actualizan al interactuar con los dispositivos de la casa.
- Los procesos asociados a luces, cámara y sensores pasan a espera cuando el dispositivo correspondiente se apaga y vuelven a ejecutarse al encenderlo. Así disminuye el uso de CPU cuando hay menos actividad.
- Se redujo la carga base de CPU en reposo.
- El escritorio mantiene una sola aplicación abierta a la vez y la muestra maximizada para evitar acumular ventanas como pestañas en el Dock.
- Se eliminó la opción de compactar memoria de las pantallas, el diagnóstico y la terminal.
- El diagnóstico ya no recomienda compactar memoria ni marca como llena una memoria que todavía tiene espacio disponible.
- Si el LiDAR detecta un obstáculo con una velocidad alta, pausa el desplazamiento sin borrar el valor seleccionado del actuador. La persona puede reducir la velocidad desde el control para continuar.
- Se retiró el panel de procesos por habitación del gemelo digital.
- Se simplificaron los nombres y explicaciones de la sección de pruebas de rendimiento.
- Se cambió el nombre “Stream de Eventos” por “Actividad del sistema”.
- Se retiró la mención de “Sofía (Integrante 1)” de la pantalla del Kernel.

## Verificación

- Archivos JavaScript/JSX/TypeScript analizados: sin errores de sintaxis.
- Pruebas automatizadas: **114 aprobadas, 0 fallidas**.
- No se incluyó `node_modules` ni `dist`; así se evitan dependencias instaladas para otro sistema operativo y se instala limpio en tu Mac.

## Cómo abrirlo en tu Mac

Abre Terminal dentro de esta carpeta y ejecuta:

```bash
npm install
npm run dev
```

Después abre la dirección local que muestre Vite (normalmente `http://localhost:5173`).
