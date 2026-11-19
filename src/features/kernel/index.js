/**
 * Punto de entrada del kernel de RobotOS para el resto del proyecto.
 *
 * Arranque:  boot(), restart(), shutdown(), getState()
 * Procesos e hilos (pasan por las system calls, por eso fallan si el kernel no está RUNNING):
 *   createProcess(), createThread(), listProcesses(), listThreads(), setScheduler(), runScheduler()
 *   Todas devuelven una promesa: hay que usar await.
 *
 * Los eventos salen con el formato { tipo, origen, detalle, fecha } hacia la función
 * onEvent que se pase en la PRIMERA llamada a boot(); así otro módulo los puede guardar.
 */
import { KernelCore } from "../../core/KernelCore.js";
import { BootManager } from "../../core/BootManager.js";
import { ProcessManager } from "../../resources/ProcessManager.js";
import { ThreadManager } from "../../resources/ThreadManager.js";
import { CPUScheduler } from "../../resources/CPUScheduler.js";

let kernel = null;
let bootManager = null;
let processManager = null;
let threadManager = null;
let scheduler = null;

/**
 * Agrupa la línea de tiempo del scheduler en turnos: cada vez que cambia el proceso
 * que usa la CPU empieza un turno nuevo.
 */
function turnosDe(linea) {
  const turnos = [];
  for (const tick of linea) {
    const ultimo = turnos[turnos.length - 1];
    if (ultimo && ultimo.pid === tick.pid) ultimo.ticks += 1;
    else turnos.push({ pid: tick.pid, nombre: tick.nombre, inicio: tick.tick, ticks: 1 });
  }
  return turnos;
}

/** Crea los managers con el bus de eventos del kernel y registra las system calls (una sola vez). */
function crearRecursos(k, { memoryLimitMb }) {
  processManager = new ProcessManager({ eventEngine: k.events, memoryLimitMb });
  threadManager = new ThreadManager({ eventEngine: k.events, processManager });
  scheduler = new CPUScheduler();

  // Al apagar el kernel (o detenerlo por un arranque fallido) se vacían procesos e hilos.
  const vaciar = () => {
    processManager.reset();
    threadManager.reset();
  };
  k.events.on("kernel:shutdown", vaciar);
  k.events.on("kernel:halted", vaciar);

  k.syscalls.register("process.create", (data) => processManager.toJSON(processManager.create(data)));
  k.syscalls.register("process.list", (filtro) => processManager.list(filtro));

  // Un hilo creado entra directamente a la cola de listos (admit = false lo deja en NEW).
  k.syscalls.register("thread.create", ({ admit = true, ...datos } = {}) => {
    const hilo = threadManager.create(datos);
    return admit ? threadManager.admit(hilo.tid) : hilo;
  });
  k.syscalls.register("thread.list", (filtro) => threadManager.list(filtro));

  k.syscalls.register("scheduler.set", (config) => {
    scheduler.setConfiguration(config);
    const actual = scheduler.getConfiguration();
    k.events.emit("scheduler:configured", actual);
    return actual;
  });

  k.syscalls.register("scheduler.run", () => {
    const { algorithm, quantum } = scheduler.getConfiguration();
    k.events.emit("scheduler:started", { algoritmo: algorithm, quantum });
    return processManager.run(scheduler, (resultado) => {
      for (const turno of turnosDe(resultado.linea)) k.events.emit("scheduler:turn", turno);
      const { algoritmo, quantum: q, duracionTotal, usoCpuPromedio, metricas, omitidos } = resultado;
      k.events.emit("scheduler:completed", { algoritmo, quantum: q, duracionTotal, usoCpuPromedio, metricas, omitidos });
    });
  });
}

function llamar(nombre, ...args) {
  return (async () => {
    if (!kernel) throw new Error("RobotOS aún no se ha arrancado: usa boot() primero");
    return kernel.syscalls.invoke(nombre, ...args);
  })();
}

/** Arranca RobotOS. Opciones (solo se usan la primera vez): { onEvent, onLog, checks, memoryLimitMb }. */
export function boot({ onEvent = null, onLog = null, checks = [], memoryLimitMb = Infinity } = {}) {
  if (!kernel) {
    kernel = new KernelCore({ onEvent, onLog });
    bootManager = new BootManager({ kernel, checks });
    crearRecursos(kernel, { memoryLimitMb });
  }
  return bootManager.boot();
}

/** Reinicia RobotOS: vuelve a ejecutar el ciclo de arranque. */
export function restart(reason) {
  if (!bootManager) throw new Error("RobotOS aún no se ha arrancado: usa boot() primero");
  return bootManager.restart(reason);
}

/** Apaga RobotOS. */
export function shutdown(reason) {
  if (!kernel) throw new Error("RobotOS aún no se ha arrancado: usa boot() primero");
  return kernel.shutdown(reason);
}

/** Estado actual del sistema (status, uptime e historial de transiciones). */
export function getState() {
  return kernel ? kernel.state.snapshot() : { status: "OFF" };
}

/** Historial de arranques (reportes de boot). */
export function getBootHistory() {
  return bootManager ? [...bootManager.history] : [];
}

/** Acceso a la instancia del kernel, para que otros módulos se conecten a él. */
export function getKernel() {
  return kernel;
}

/** Crea un proceso: { nombre, prioridad, memoriaRequerida (MB), cpuRequerida, tiempoTotal }. */
export function createProcess(datos) {
  return llamar("process.create", datos);
}

/** Crea un hilo de un proceso existente: { processId (pid), name, priority, burst }. */
export function createThread(datos) {
  return llamar("thread.create", datos);
}

/** Lista los procesos. Filtro opcional: { state }. */
export function listProcesses(filtro) {
  return llamar("process.list", filtro);
}

/** Lista los hilos. Filtro opcional: { processId }. */
export function listThreads(filtro) {
  return llamar("thread.list", filtro);
}

/** Configura el scheduler: { algorithm: "PRIORIDAD" | "ROUND_ROBIN", quantum }. */
export function setScheduler(config) {
  return llamar("scheduler.set", config);
}

/** Ejecuta el scheduler sobre los procesos NEW o READY y devuelve la línea de tiempo y las métricas. */
export function runScheduler() {
  return llamar("scheduler.run");
}

/** Descarta la instancia actual (útil en pruebas). */
export function resetKernel() {
  kernel = null;
  bootManager = null;
  processManager = null;
  threadManager = null;
  scheduler = null;
}
