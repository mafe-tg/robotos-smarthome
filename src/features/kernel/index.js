/**
 * Punto de entrada del kernel de RobotOS para el resto del proyecto.
 *
 * Arranque:  boot(), restart(), shutdown(), getState()
 * Procesos e hilos (pasan por las system calls, por eso fallan si el kernel no está RUNNING):
 *   createProcess(), createThread(), listProcesses(), listThreads(), setScheduler(), runScheduler()
 *   Todas devuelven una promesa: hay que usar await.
 * Memoria virtual con paginación (page faults, reemplazo FIFO y LRU):
 *   accessPage() y setPageAlgorithm() (promesas, exigen kernel RUNNING) y getMemoryState() (lectura directa)
 * Sincronización, IPC y deadlock (mutex, semáforos, canales de mensajes):
 *   createSyncResource(), lockResource(), unlockResource(), sendMessage(), receiveMessage(),
 *   detectDeadlock() y resolveDeadlock() (promesas) y getSyncState() (lectura directa)
 * Tiempo real (EDF y Rate Monotonic con deadlines): runRealTime() (promesa)
 *
 * Los eventos salen con el formato { tipo, origen, detalle, fecha } hacia la función
 * onEvent que se pase en la PRIMERA llamada a boot(); así otro módulo los puede guardar.
 */
import { KernelCore } from "../../core/KernelCore.js";
import { BootManager } from "../../core/BootManager.js";
import { ProcessManager } from "../../resources/ProcessManager.js";
import { ThreadManager } from "../../resources/ThreadManager.js";
import { CPUScheduler } from "../../resources/CPUScheduler.js";
import { MemoryManager } from "../../resources/MemoryManager.js";
import { SyncManager } from "../../resources/SyncManager.js";
import { simulateRealTime } from "../../resources/RealTimeScheduler.js";

let kernel = null;
let bootManager = null;
let processManager = null;
let threadManager = null;
let scheduler = null;
let memoryManager = null;
let syncManager = null;

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
  memoryManager = new MemoryManager({ eventEngine: k.events });
  syncManager = new SyncManager({ eventEngine: k.events, threadManager });

  // Al apagar el kernel (o detenerlo por un arranque fallido) se vacían procesos, hilos, memoria y sincronización.
  const vaciar = () => {
    processManager.reset();
    threadManager.reset();
    memoryManager.reset();
    syncManager.reset();
  };
  k.events.on("kernel:shutdown", vaciar);
  k.events.on("kernel:halted", vaciar);

  k.syscalls.register("process.create", (data) => {
    const proceso = processManager.create(data);
    // Memoria virtual: cada proceso con memoria recibe su tabla de páginas (1 página por MB).
    const mb = Number(proceso.memoriaRequerida);
    if (Number.isFinite(mb) && mb > 0) memoryManager.registerProcess(proceso.pid, mb);
    return processManager.toJSON(proceso);
  });
  k.syscalls.register("process.list", (filtro) => processManager.list(filtro));

  // Un hilo creado entra directamente a la cola de listos (admit = false lo deja en NEW).
  k.syscalls.register("thread.create", ({ admit = true, ...datos } = {}) => {
    const hilo = threadManager.create(datos);
    return admit ? threadManager.admit(hilo.tid) : hilo;
  });
  k.syscalls.register("thread.list", (filtro) => threadManager.list(filtro));

  k.syscalls.register("memory.access", (pid, page) => memoryManager.access(pid, page));
  k.syscalls.register("memory.configure", (config) => memoryManager.configure(config));

  k.syscalls.register("sync.create", (config) => syncManager.create(config));
  k.syscalls.register("sync.acquire", (nombre, tid) => syncManager.acquire(nombre, tid));
  k.syscalls.register("sync.release", (nombre, tid) => syncManager.release(nombre, tid));
  k.syscalls.register("ipc.send", (canal, tid, mensaje) => syncManager.send(canal, tid, mensaje));
  k.syscalls.register("ipc.receive", (canal, tid) => syncManager.receive(canal, tid));
  k.syscalls.register("deadlock.detect", () => syncManager.detectDeadlock());
  k.syscalls.register("deadlock.resolve", () => syncManager.resolveDeadlock());

  k.syscalls.register("realtime.run", ({ tasks, algorithm = "EDF", horizon } = {}) => {
    const resultado = simulateRealTime(tasks, algorithm, horizon);
    // Como en el scheduler, los eventos salen después de la corrida. La línea de tiempo no va en el evento (es larga).
    k.events.emit("realtime:started", { algoritmo: algorithm, tareas: resultado.tasks.length, horizonte: resultado.horizon });
    for (const perdido of resultado.misses) k.events.emit("realtime:deadline_missed", { algoritmo: algorithm, ...perdido });
    const { timeline, ...resumen } = resultado;
    k.events.emit("realtime:completed", resumen);
    return resultado;
  });

  // Cuando un proceso termina (lo avisa ProcessManager.run) se liberan sus marcos.
  k.events.on("process:terminate", (evento) => memoryManager.releaseProcess(evento.payload.pid));

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

/** Accede a una página de un proceso: { pid, page, fault, frame, victim }. fault es true si hubo page fault. */
export function accessPage(pid, page) {
  return llamar("memory.access", pid, page);
}

/** Configura el reemplazo de páginas: { algorithm: "FIFO" | "LRU", frames }. Cambiar frames vacía la RAM. */
export function setPageAlgorithm(config) {
  return llamar("memory.configure", config);
}

/** Estado de la memoria paginada (marcos, tablas de páginas, page faults). Es null si aún no se ha arrancado. */
export function getMemoryState() {
  return memoryManager ? memoryManager.getState() : null;
}

/** Crea un mutex o un semáforo: { type: "MUTEX" | "SEMAPHORE", name, count (solo semáforo) }. */
export function createSyncResource(config) {
  return llamar("sync.create", config);
}

/** Un hilo (tid) pide un mutex (lock) o un semáforo (wait): { acquired, waiting }. Si debe esperar, el hilo pasa a WAITING. */
export function lockResource(nombre, tid) {
  return llamar("sync.acquire", nombre, tid);
}

/** Un hilo (tid) libera un mutex (unlock, solo su dueño) o un semáforo (signal). Despierta al primero que espera. */
export function unlockResource(nombre, tid) {
  return llamar("sync.release", nombre, tid);
}

/** Envía un mensaje por un canal IPC (se crea al usarlo). Si un hilo esperaba, se le entrega y se despierta. */
export function sendMessage(canal, tid, mensaje) {
  return llamar("ipc.send", canal, tid, mensaje);
}

/** Recibe un mensaje de un canal IPC: { received, waiting, message }. Si no hay, el hilo pasa a WAITING. */
export function receiveMessage(canal, tid) {
  return llamar("ipc.receive", canal, tid);
}

/** Busca un deadlock entre hilos con mutex: { hasDeadlock, cycle, processesInCycle }. */
export function detectDeadlock() {
  return llamar("deadlock.detect");
}

/** Si hay deadlock, termina al hilo de menor prioridad y libera sus mutex: { resolved, victim, survivor, ... }. */
export function resolveDeadlock() {
  return llamar("deadlock.resolve");
}

/** Lista de procesos leída directamente, sin system call (para refrescar pantallas sin generar eventos). */
export function getProcessList() {
  return processManager ? processManager.list() : [];
}

/** Estado de mutex, semáforos, canales IPC y deadlock. Es null si aún no se ha arrancado. */
export function getSyncState() {
  return syncManager ? syncManager.getState() : null;
}

/** Simula tareas de tiempo real: { tasks: [{ name, period, computation, deadline }], algorithm: "EDF" | "RM", horizon }. */
export function runRealTime(config) {
  return llamar("realtime.run", config);
}

/** Descarta la instancia actual (útil en pruebas). */
export function resetKernel() {
  kernel = null;
  bootManager = null;
  processManager = null;
  memoryManager = null;
  syncManager = null;
  threadManager = null;
  scheduler = null;
}

// ==========================================
// BENCHMARK CENTER (Fase 6)
// ==========================================
export {
  runCPUBenchmark,
  runMemoryBenchmark,
  runRTOSBenchmark,
  runFullBenchmark,
  PROCESOS_DEMO_BENCHMARK,
  SECUENCIA_LIBRO_PAGINAS,
  SECUENCIA_BELADY,
  TAREAS_DEMO_RTOS,
} from "../../resources/BenchmarkCenter.js";
