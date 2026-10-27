# Registro de Vibe Coding — Módulo Procesos y CPU

El profesor pide conservar evidencia de prompts, código generado, cambios, errores y correcciones. Este archivo es el punto de partida; sigue completándolo en cada sesión.

## Entrada 1 — Primera versión de la lógica

**Prompt (resumen):** Pedí un módulo de Procesos y CPU en JavaScript con creación y administración de procesos, estados y transiciones, scheduler, simulación y pruebas, sin inventar integraciones con Supabase ni con el trabajo de mis compañeros.

**Código generado por la IA:** `src/proceso.js`, `src/scheduler.js`, `src/cpu.js`, `src/index.js`, `test/proceso.test.js`, `test/cpu.test.js`, `package.json`, `README.md`.

**Error encontrado:** Una prueba de transición inválida incluía una comprobación incorrecta: `reanudar()` desde NEW sí está permitido (NEW pasa a READY), así que habría fallado por un error de la prueba y no del código.

**Corrección:** Se eliminó esa comprobación y se dejó solo lo que realmente debe fallar (`ejecutar()` y `pausar()` desde NEW).

**Verificación:** `npm test` → 16 pruebas, 16 correctas. `npm run demo` → muestra las líneas de tiempo de PRIORIDAD y ROUND_ROBIN.

**Qué debo poder explicar con mis palabras:** (completar tú: cómo funciona el mapa de transiciones, cómo elige el siguiente proceso el scheduler y cómo se calcula la espera).

## Entradas siguientes

(Agrega una por sesión: prompt, código generado, cambios, errores, correcciones.)
