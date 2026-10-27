# Módulo Procesos y CPU — RobotOS SmartHome

Lógica del módulo Procesos y CPU del Equipo 3, con una página web de prototipo para verla y usarla. Esta versión **no usa Supabase todavía** y la página es **independiente**: no es el dashboard del equipo, solo muestra este módulo.

## Cómo ejecutarlo

Requisito: Node.js (versión LTS). Abre la carpeta en VS Code, abre la terminal (Terminal > New Terminal) y escribe:

```
npm run web      # abre la página web del módulo (luego entra a http://localhost:3000)
npm run demo     # muestra la simulación en la terminal
npm test         # ejecuta las pruebas automáticas
```

Con `npm run web` la terminal queda "ocupada" mostrando que el servidor está encendido; eso es normal. Para apagarlo, pulsa `Control + C` en esa terminal.

No hace falta instalar nada más (no hay dependencias externas).

## Qué hace cada archivo

| Archivo | Para qué sirve |
|---|---|
| `src/proceso.js` | Define qué es un proceso, sus 5 estados y qué cambios de estado se permiten. |
| `src/scheduler.js` | El planificador: decide quién usa la CPU. Tiene dos algoritmos: PRIORIDAD y ROUND_ROBIN. |
| `src/cpu.js` | Simula la CPU ejecutando procesos tick a tick, calcula métricas y dibuja la línea de tiempo. |
| `src/index.js` | Demo en la terminal con procesos de ejemplo de la casa inteligente. |
| `server.js` | Servidor local mínimo que entrega la página al navegador (el navegador no permite abrir el módulo con doble clic). |
| `web/index.html` | Estructura de la página: formulario, tabla de procesos, CPU y simulación. |
| `web/app.js` | Conecta los botones de la página con `src/proceso.js` y `src/cpu.js`. No contiene reglas de procesos. |
| `web/estilos.css` | Colores, tipografía y aspecto de la página. |
| `test/proceso.test.js` | Pruebas de creación, estados y transiciones. |
| `test/cpu.test.js` | Pruebas del scheduler y la simulación. |

## Conceptos con analogía de casa inteligente

- **Proceso:** una tarea de la casa (Vigilancia, Control de iluminación…).
- **CPU:** un único robot que solo puede atender una tarea a la vez.
- **Scheduler:** las reglas que deciden qué tarea atiende el robot primero.
- **Tick:** una unidad de tiempo de la simulación (no son segundos reales).
- **Quantum (Round Robin):** cuántos ticks seguidos puede usar la CPU un proceso antes de ceder el turno.

## Estados y transiciones

Los 5 estados y las 5 operaciones vienen del profesor. **El mapa de transiciones es una propuesta nuestra**, basada en el modelo clásico de sistemas operativos; el profesor no lo especificó.

| Desde | Puede pasar a |
|---|---|
| NEW | READY, TERMINATED |
| READY | RUNNING, WAITING, TERMINATED |
| RUNNING | READY, WAITING, TERMINATED |
| WAITING | READY, TERMINATED |
| TERMINATED | (ninguno) |

Operaciones: `admitir` (NEW→READY), `ejecutar` (READY→RUNNING), `pausar` (→WAITING), `reanudar` (WAITING→READY), `finalizar` (→TERMINATED) y `expropiar` (RUNNING→READY, cuando se acaba el turno en Round Robin).

## Algoritmos

- **PRIORIDAD (sin expropiación):** se atiende primero la prioridad más baja (1 = más urgente); el proceso elegido se ejecuta hasta terminar. En empate, gana el que se creó antes. Encaja con una casa donde la vigilancia importa más que el monitoreo de consumo. Riesgo: un proceso de baja prioridad puede esperar mucho.
- **ROUND_ROBIN:** cada proceso usa la CPU por turnos de `quantum` ticks y vuelve al final de la fila. Es más justo, pero no distingue lo urgente de lo que no.

Para la sustentación conviene que el equipo elija **uno** como algoritmo principal y sepa justificar por qué es apropiado para el dispositivo.

## Simplificaciones (a propósito)

- Una sola CPU.
- Todos los procesos están listos desde el tick 0 (no hay llegadas tardías).
- El uso de CPU de un tick es el `cpuRequerida` del proceso que se ejecuta.
- Los valores de prioridad, memoria, CPU y tiempo de la demo son **ejemplos inventados**, no requisitos.
- `tiempoTotal` y `tiempoRestante` son campos añadidos para poder simular; el profesor no los pide.

## La página web

Permite crear procesos, ver su estado y aplicar las operaciones válidas (admitir, ejecutar, devolver a la cola, pausar, reanudar y finalizar), ver el uso de CPU del proceso en RUNNING y simular la CPU con Prioridad o Round Robin, con línea de tiempo y tabla de resultados.

Detalles que conviene saber:

- Los datos viven solo en la memoria de la página: al recargar se pierden.
- La simulación trabaja sobre copias, así que no cambia el estado de la tabla.
- El botón "Ejecutar" no deja tener dos procesos en RUNNING a la vez (una sola CPU). Esta regla está en la página, no en `src/proceso.js`.
- Los botones solo muestran las acciones que tienen sentido para el estado actual del proceso.

## Estado actual

**Implementado y probado (16 pruebas automáticas pasan):**
- Creación de procesos con validación de datos.
- Estados y transiciones, incluyendo rechazo de transiciones inválidas.
- Planificación por PRIORIDAD y ROUND_ROBIN.
- Simulación con métricas de espera y retorno, y uso de CPU promedio.
- Omisión de procesos pausados.

**Implementado y verificado en un navegador automatizado (Chromium) en mi entorno de trabajo; falta que lo pruebes tú en tu navegador:**
- La página web completa: crear, transiciones, error de CPU ocupada, simulación con ambos algoritmos, validaciones, modo oscuro y vista de celular.
- Las pruebas automáticas (`npm test`) cubren la lógica de `src/`; **no cubren la página**.

**Todavía NO está hecho:**
- Conexión con Supabase. Depende de las tablas y columnas que acuerde el equipo.
- Integración de la página con el dashboard del equipo. Depende de la arquitectura que elija el equipo; hoy es una página independiente.
- Que los procesos persistan al recargar (depende de Supabase).
- Escenarios de falla (sensor desconectado, pérdida de comunicación, acceso no autorizado).
- Integración con memoria, seguridad (roles ADMIN/USER/GUEST), dispositivos y logs.
- Prueba contra el repositorio real del equipo.

## Preguntas para coordinar con el equipo

1. ¿Cuál es la estructura del repositorio y el framework del dashboard?
2. ¿Cómo se llaman las tablas y columnas de procesos en Supabase?
3. ¿Cómo se asigna y libera la memoria que pide cada proceso (módulo de memoria)?
4. ¿Quién puede crear, pausar o eliminar procesos y qué es un "proceso crítico" (módulo de seguridad)?
5. ¿Los procesos se vinculan a dispositivos concretos, y quién escribe los logs y con qué formato?

## Posibles preguntas del profesor

- ¿Qué es un proceso y en qué estados puede estar?
- ¿Por qué un proceso no puede pasar de NEW a RUNNING directamente?
- ¿Cómo decide el scheduler? ¿Por qué ese algoritmo es apropiado para una casa inteligente?
- ¿Qué pasa si hay dos procesos con la misma prioridad?
- ¿Qué problema tiene el algoritmo de prioridad? ¿Y Round Robin?
- ¿Cómo se calcula el tiempo de espera?
- ¿Qué parte de esto probaron y cómo?
