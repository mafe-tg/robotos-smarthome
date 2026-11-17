# Avance de Sofia — RobotOS Core y Administración de recursos

## Implementado en este avance

### 1. RobotOS Core
- Boot Manager: secuencia de arranque, validaciones y reporte de fallos.
- Kernel Core: coordinación de los servicios centrales.
- System State: estados globales y transiciones permitidas.
- System Calls: registro e invocación controlada de servicios.
- Event Engine: eventos con listeners, `once`, desuscripción y manejo de errores.
- Gestión de errores: clasificación, códigos, historial limitado y degradación ante errores críticos.

### 2. Administración de recursos
- Process Manager: creación, consulta, transición de estado y control básico de memoria.
- CPU Scheduler: fachada que reutiliza los algoritmos PRIORIDAD y ROUND_ROBIN del módulo `procesos-cpu`.
- Thread Manager: creación, admisión, bloqueo, desbloqueo, finalización y turnos Round Robin.

## Pruebas
Ejecutar desde la raíz del proyecto:

```bash
npm install
npm run test:os
npm run build
```

Las pruebas de este avance cubren el arranque, system calls, eventos, errores, procesos, scheduler e hilos.

## Alcance y limitaciones
Es una simulación académica en JavaScript dentro del proyecto React/Vite. No es un kernel de sistema operativo real, no ejecuta hilos nativos y todavía no persiste estos nuevos objetos en Supabase ni conecta automáticamente todos los módulos a la interfaz principal. La página existente de Procesos ya utiliza la lógica de `procesos-cpu`; este avance añade servicios organizados y probados sin reemplazar esa integración.
