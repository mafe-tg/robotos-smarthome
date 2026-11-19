# Administración de recursos

- `ProcessManager.js`: ciclo de vida de procesos, memoria solicitada y eventos. Reutiliza `Proceso` existente.
- `CPUScheduler.js`: fachada para los algoritmos PRIORIDAD y ROUND_ROBIN existentes.
- `ThreadManager.js`: ciclo de vida y planificación Round Robin de hilos simulados.

Los hilos son entidades simuladas de RobotOS; no son Web Workers ni threads nativos.
