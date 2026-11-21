/**
 * Puente entre el kernel de Sofia (src/core y src/resources) y el dashboard.
 *
 * - Crea UNA sola instancia del kernel para toda la aplicación.
 * - Registra las llamadas al sistema (system calls) que usa la terminal.
 *   Cada comando pasa por kernel.syscalls.invoke(), así que si el kernel no
 *   está en RUNNING los comandos fallan con KERNEL_NOT_READY.
 * - Reenvía los eventos del kernel y de los hilos a Supabase (system_events).
 *
 * No modifica ningún archivo del kernel: solo lo usa.
 */
import { KernelCore } from '../../core/KernelCore';
import { BootManager } from '../../core/BootManager';
import { SYSTEM_STATUS } from '../../core/SystemState';
import { ThreadManager } from '../../resources/ThreadManager';
import { emitSystemEvent } from '../../lib/persistence';
import { HardwareManager } from '../hardware/HardwareManager';
import { diagnose } from '../diagnostics/diagnose';

// Contexto vivo del dashboard (estado y funciones de SystemContext/AuthContext).
// La terminal lo actualiza en cada render; las system calls lo leen desde aquí.
const bridge = {
  ctx: null,
  kernel: null,
  boot: null,
  threads: null,
  hardware: null,
};

export function setTerminalContext(ctx) {
  bridge.ctx = ctx;
}

const ctx = () => {
  if (!bridge.ctx) throw new Error('La terminal no está conectada al sistema');
  return bridge.ctx;
};

const findProcess = (pid) => {
  const p = ctx().processes.find((proc) => proc.pid === Number(pid));
  if (!p) throw new Error(`No existe un proceso con PID ${pid}`);
  return p;
};

/** Comprobaciones de arranque: revisan el estado real del sistema. */
function buildBootChecks() {
  return [
    {
      name: 'Memoria principal (MemoryManager)',
      run: () => {
        const stats = ctx().memoryStats;
        if (!stats || !(stats.totalKb > 0)) throw new Error('Memoria no inicializada');
        return true;
      },
    },
    {
      name: 'Sistema de archivos (VFS)',
      run: () => {
        if (!ctx().vfs) throw new Error('VFS no disponible');
        return true;
      },
    },
    {
      name: 'Planificador de CPU',
      run: () => {
        if (!Array.isArray(ctx().processes)) throw new Error('Tabla de procesos no disponible');
        return true;
      },
    },
    {
      name: 'Bus de dispositivos IoT',
      run: () => {
        const online = ctx().devices.filter((d) => d.status !== 'OFFLINE').length;
        if (online === 0) throw new Error('Ningún dispositivo responde');
        return true;
      },
    },
  ];
}

/** System calls disponibles para las aplicaciones (la terminal). */
function registerSyscalls(kernel, threads, hardware) {
  const sc = kernel.syscalls;

  // ── Procesos ──
  sc.register('sys_ps', () => ctx().processes.map((p) => ({ ...p })));
  sc.register('sys_spawn', (opts) => ctx().createProcess(opts));
  sc.register('sys_admit', (pid) => ctx().admitProcess(findProcess(pid).id));
  sc.register('sys_exec', (pid) => ctx().executeProcess(findProcess(pid).id));
  sc.register('sys_pause', (pid) => ctx().pauseProcess(findProcess(pid).id));
  sc.register('sys_resume', (pid) => ctx().resumeProcess(findProcess(pid).id));
  sc.register('sys_kill', (pid) => ctx().terminateProcess(findProcess(pid).id));

  // ── Hilos (ThreadManager de Sofia) ──
  sc.register('sys_thread_create', ({ pid, name, burst }) => {
    const p = findProcess(pid);
    if (p.state === 'TERMINATED') throw new Error(`El proceso ${pid} está finalizado`);
    return threads.create({ processId: p.pid, name, priority: p.prioridadNum, burst });
  });
  sc.register('sys_thread_admit', (tid) => threads.admit(tid));
  sc.register('sys_thread_block', (tid) => threads.block(tid));
  sc.register('sys_thread_unblock', (tid) => threads.unblock(tid));
  sc.register('sys_thread_kill', (tid) => threads.terminate(tid));
  sc.register('sys_thread_step', () => threads.scheduleNext());
  sc.register('sys_threads', (pid) =>
    threads.list(pid === undefined ? {} : { processId: Number(pid) })
  );

  // ── Memoria ──
  sc.register('sys_mem', () => ({
    stats: { ...ctx().memoryStats },
    blocks: [...ctx().memoryBlocks].sort((a, b) => a.start - b.start),
  }));
  sc.register('sys_compact', () => ctx().compactMemory());

  // ── Archivos ──
  sc.register('sys_ls', () => ctx().vfsFiles.map((f) => ({ ...f })));
  sc.register('sys_read', (path) => {
    const vfs = ctx().vfs;
    if (!vfs.exists(path)) throw new Error(`No existe el archivo ${path}`);
    return vfs.read(path);
  });
  sc.register('sys_write', (path, content) => ctx().createVfsFile({ path, content }));
  sc.register('sys_unlink', (path) => ctx().deleteVfsFile(path));

  // ── Dispositivos ──
  sc.register('sys_devices', () => ctx().devices.map((d) => ({ ...d })));
  sc.register('sys_toggle', (id) => ctx().toggleDevice(id));

  // ── Registros ──
  sc.register('sys_logs', (n) => ctx().logs.slice(0, n));

  // ── Hardware del robot (sensores, actuadores y drivers) ──
  sc.register('sys_hw', () => hardware.snapshot());
  sc.register('sys_actuator_set', (id, value) => hardware.setActuator(id, value));
  sc.register('sys_move', (power) => hardware.move(power));
  sc.register('sys_motors_stop', () => hardware.stopAll());
  // ── Diagnóstico ──
  sc.register('sys_diagnose', () => {
    const c = ctx();
    return diagnose({
      kernelStatus: kernel.state.status,
      processes: c.processes,
      memoryStats: c.memoryStats,
      memoryBlocks: c.memoryBlocks,
      cpuUsage: c.metrics.cpuUsage,
      batteryPercent: c.metrics.batteryPercent,
      devices: c.devices,
      alerts: c.alerts,
      logs: c.logs,
      hardware: hardware.snapshot(),
      hour: new Date().getHours(),
    });
  });
  sc.register('sys_driver', (action, id) => {
    const ops = {
      load: () => hardware.loadDriver(id),
      stop: () => hardware.unloadDriver(id),
      restart: () => hardware.restartDriver(id),
      fail: () => hardware.failDriver(id, 'Falla simulada'),
    };
    if (!ops[action]) throw new Error(`Acción de driver no válida: ${action}`);
    return ops[action]();
  });
}

/** Eventos del kernel que se guardan en Supabase para auditoría. */
function forwardEvents(kernel) {
  const persisted = {
    'kernel:initialized': ['KERNEL_INITIALIZED', 'INFO'],
    'kernel:started': ['KERNEL_STARTED', 'INFO'],
    'kernel:shutdown': ['KERNEL_SHUTDOWN', 'WARNING'],
    'kernel:error': ['KERNEL_ERROR', 'ERROR'],
    'thread:created': ['THREAD_CREATED', 'INFO'],
    'thread:admitted': ['THREAD_ADMITTED', 'INFO'],
    'thread:blocked': ['THREAD_BLOCKED', 'WARNING'],
    'thread:unblocked': ['THREAD_UNBLOCKED', 'INFO'],
    'thread:terminated': ['THREAD_TERMINATED', 'INFO'],
    'thread:scheduled': ['THREAD_SCHEDULED', 'INFO'],
  };

  // Hardware: solo los eventos importantes (los ciclos del bus no se guardan)
  const hwPersisted = {
    'hardware:driver_failed': ['DRIVER_FAILED', 'ERROR'],
    'hardware:driver_recovered': ['DRIVER_RECOVERED', 'INFO'],
    'hardware:driver_restarted': ['DRIVER_RESTARTED', 'INFO'],
    'hardware:driver_loaded': ['DRIVER_LOADED', 'INFO'],
    'hardware:driver_unloaded': ['DRIVER_UNLOADED', 'WARNING'],
    'hardware:actuator_set': ['ACTUATOR_SET', 'INFO'],
    'hardware:obstacle_stop': ['OBSTACLE_STOP', 'WARNING'],
    'hardware:thermal_stop': ['THERMAL_STOP', 'ERROR'],
  };
  const hwMessages = {
    DRIVER_FAILED: (d) => [`ERROR`, `${d.name} falló: ${d.reason}. El watchdog intentará recuperarlo.`],
    DRIVER_RECOVERED: (d) => ['INFO', `${d.name} recuperado por el watchdog.`],
    DRIVER_RESTARTED: (d) => ['INFO', `${d.name} reiniciado.`],
    DRIVER_UNLOADED: (d) => ['WARNING', `${d.name} detenido. Sus dispositivos quedan sin servicio.`],
    OBSTACLE_STOP: (d) => ['WARNING', `Obstáculo a ${d.distance} cm: las ruedas se detuvieron.`],
    THERMAL_STOP: (d) => ['ERROR', `Motores a ${d.temperature} °C: parada térmica de seguridad.`],
  };
  for (const [eventName, [type, severity]] of Object.entries(hwPersisted)) {
    kernel.events.on(eventName, (event) => {
      const ev = event.payload || event;
      const d = ev.detalle || {};
      const description = hwMessages[type] ? hwMessages[type](d)[1] : `${d.name || type}: ${d.from ?? ''} → ${d.to ?? ''} ${d.unit ?? ''}`;
      emitSystemEvent({ event_type: type, source: 'HARDWARE_MGR', severity, description, details: ev });
      if (hwMessages[type]) {
        try {
          ctx().addLog({ level: hwMessages[type](d)[0], source: 'HARDWARE_MGR', message: description });
        } catch {
          /* sin contexto */
        }
      }
    });
  }

  for (const [eventName, [type, severity]] of Object.entries(persisted)) {
    kernel.events.on(eventName, (event) => {
      const p = event.payload || {};
      const source = eventName.startsWith('thread') ? 'THREAD_MGR' : 'KERNEL';
      const description = eventName.startsWith('thread')
        ? `Hilo ${p.tid} (${p.name}) del proceso ${p.processId}: ${p.state}`
        : `Kernel: ${eventName.split(':')[1]}`;
      emitSystemEvent({ event_type: type, source, severity, description, details: p });
    });
  }
}

/** Devuelve el kernel único del dashboard (lo crea la primera vez). */
export function getKernel() {
  if (bridge.kernel) return bridge;

  const kernel = new KernelCore({
    onLog: (entry) => {
      try {
        ctx().addLog({ level: entry.level, source: entry.source, message: entry.message });
      } catch {
        /* sin contexto todavía */
      }
    },
  });
  const threads = new ThreadManager({ eventEngine: kernel.events, quantum: 2 });
  const hardware = new HardwareManager({ eventEngine: kernel.events });

  registerSyscalls(kernel, threads, hardware);
  forwardEvents(kernel);

  bridge.kernel = kernel;
  bridge.threads = threads;
  bridge.hardware = hardware;
  return bridge;
}

/**
 * Ejecuta la secuencia de arranque de Sofia.
 * onStep recibe cada paso para mostrarlo en la terminal.
 */
export async function bootKernel(onStep) {
  const { kernel } = getKernel();

  if (kernel.state.status === SYSTEM_STATUS.RUNNING) {
    return { success: true, alreadyRunning: true };
  }
  // Tras un apagado el kernel vuelve a OFF, pero KernelCore conserva
  // initialized = true; se reinicia para que boot() repita el ciclo completo.
  if (kernel.state.status === SYSTEM_STATUS.OFF || kernel.state.status === SYSTEM_STATUS.HALTED) {
    kernel.initialized = false;
  }

  const boot = new BootManager({ kernel, checks: buildBootChecks(), onStep });
  bridge.boot = boot;
  const report = await boot.boot();

  emitSystemEvent({
    event_type: report.success ? 'BOOT_COMPLETED' : 'BOOT_FAILED',
    source: 'BOOT_MANAGER',
    severity: report.success ? 'INFO' : 'ERROR',
    description: report.success
      ? `Secuencia de arranque completada (${report.checks.length} comprobaciones)`
      : `Falló el arranque: ${report.error}`,
    details: report,
  });

  try {
    ctx().addLog({
      level: report.success ? 'INFO' : 'ERROR',
      source: 'BOOT_MANAGER',
      message: report.success
        ? `RobotOS arrancado: ${report.checks.length} comprobaciones superadas.`
        : `Falló la secuencia de arranque: ${report.error}`,
    });
  } catch {
    /* sin contexto */
  }
  return report;
}

/** Apaga el kernel; los comandos que usan system calls dejan de funcionar. */
export function shutdownKernel(reason = 'Apagado desde la terminal') {
  const { kernel } = getKernel();
  const snapshot = kernel.shutdown(reason);
  try {
    ctx().addLog({ level: 'WARNING', source: 'KERNEL', message: `Kernel apagado: ${reason}.` });
  } catch {
    /* sin contexto */
  }
  return snapshot;
}

export { SYSTEM_STATUS };
