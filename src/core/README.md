# RobotOS Core

- `BootManager.js`: secuencia de arranque y comprobaciones.
- `KernelCore.js`: coordina los servicios centrales.
- `SystemState.js`: estados OFF, BOOTING, RUNNING, DEGRADED, SHUTTING_DOWN y HALTED.
- `SystemCalls.js`: interfaz controlada para invocar servicios del kernel.
- `EventEngine.js`: publicación/suscripción de eventos.
- `ErrorManager.js`: normalización y registro de errores.

Es una simulación de software en JavaScript; no arranca hardware ni un sistema operativo real.
