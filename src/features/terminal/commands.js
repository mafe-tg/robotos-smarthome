/**
 * Intérprete de comandos de la terminal de RobotOS.
 *
 * Cada comando que toca el sistema se ejecuta mediante una system call del
 * kernel de Sofia (kernel.syscalls.invoke). Si el kernel no está en RUNNING,
 * la llamada falla con KERNEL_NOT_READY: así se demuestra que las
 * aplicaciones solo acceden a los recursos a través del kernel.
 */
import { getKernel, bootKernel, shutdownKernel, SYSTEM_STATUS } from './kernelBridge';
import { runFullBenchmark } from '../../resources/BenchmarkCenter';

// Tipos de línea: 'out' (normal), 'ok', 'err', 'warn', 'info', 'dim'
const line = (text, type = 'out') => ({ text, type });
const pad = (value, size) => String(value ?? '').slice(0, size).padEnd(size);

const PRIORITY_BY_NAME = { critica: 'Crítica', crítica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Baja' };
const PRIORITY_BY_NUM = { 1: 'Crítica', 2: 'Alta', 3: 'Media', 4: 'Baja' };

/** Rol mínimo de cada comando. Los demás quedan disponibles para USER. */
const ADMIN_COMMANDS = new Set(['boot', 'reboot', 'shutdown', 'run', 'kill', 'write', 'rm']);

export const COMMAND_HELP = [
  ['help', 'Muestra esta ayuda'],
  ['clear', 'Limpia la pantalla'],
  ['whoami', 'Usuario y rol actual'],
  ['boot', 'Ejecuta la secuencia de arranque del kernel (ADMIN)'],
  ['reboot', 'Apaga y vuelve a arrancar el kernel (ADMIN)'],
  ['shutdown', 'Apaga el kernel (ADMIN)'],
  ['status', 'Estado del kernel, tiempo activo y transiciones'],
  ['syscalls', 'Lista las llamadas al sistema registradas'],
  ['errors', 'Últimos errores registrados por el kernel'],
  ['ps', 'Lista los procesos'],
  ['run <nombre> [prioridad] [KB] [ticks]', 'Crea un proceso (ADMIN)'],
  ['admit | exec | pause | resume <pid>', 'Cambia el estado de un proceso'],
  ['kill <pid>', 'Finaliza un proceso y libera su memoria (ADMIN)'],
  ['threads [pid]', 'Lista los hilos (de un proceso o de todos)'],
  ['thread add <pid> <nombre> [ráfaga]', 'Crea un hilo dentro de un proceso'],
  ['thread admit | block | unblock | kill <tid>', 'Cambia el estado de un hilo'],
  ['thread step', 'Ejecuta un turno Round Robin (quantum 2)'],
  ['thread run', 'Ejecuta turnos hasta terminar todos los hilos'],
  ['mem', 'Uso de memoria y bloques asignados'],
  ['ls [carpeta]', 'Lista archivos del sistema de archivos virtual'],
  ['cat <ruta>', 'Muestra el contenido de un archivo'],
  ['write <ruta> <texto>', 'Crea un archivo (ADMIN)'],
  ['rm <ruta>', 'Elimina un archivo (ADMIN)'],
  ['devices', 'Lista los dispositivos y su estado'],
  ['toggle <n.º de dispositivo>', 'Enciende, apaga o bloquea un dispositivo'],
  ['logs [n]', 'Últimos registros del sistema (por defecto 10)'],
  ['sensors', 'Lecturas de los sensores del robot'],
  ['drivers', 'Drivers del robot y su estado'],
  ['driver restart | stop | load | fail <id>', 'Controla un driver (stop, load y fail: ADMIN)'],
  ['motor <actuador> <valor>', 'Mueve un actuador: rueda_izq, rueda_der, brazo, aspiradora'],
  ['move | stop', 'Pone en marcha o detiene los motores de RX-1'],
  ['diagnose', 'RX-1 revisa el sistema y sugiere arreglos'],
  ['bench', 'Compara el rendimiento del sistema'],
];

export const COMMAND_NAMES = [
  'help', 'clear', 'whoami', 'boot', 'reboot', 'shutdown', 'status', 'syscalls', 'errors',
  'ps', 'run', 'admit', 'exec', 'pause', 'resume', 'kill', 'threads', 'thread',
  'mem', 'ls', 'cat', 'write', 'rm', 'devices', 'toggle', 'logs',
  'sensors', 'drivers', 'driver', 'motor', 'move', 'stop', 'diagnose', 'bench',
];

/** Divide la línea respetando comillas: write /a.txt "hola mundo" */
function tokenize(input) {
  const tokens = [];
  const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = regex.exec(input))) tokens.push(match[1] ?? match[2] ?? match[3]);
  return tokens;
}

const localTime = (iso) => new Date(iso).toLocaleTimeString('es-CO', { hour12: false });

const formatUptime = (ms) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m ${s % 60}s`;
};

const requireArg = (value, usage) => {
  if (value === undefined || value === '') throw new Error(`Uso: ${usage}`);
  return value;
};

/**
 * Ejecuta una línea de comando.
 * @returns {Promise<{ lines: Array<{text,type}>, clear?: boolean }>}
 */
export async function runCommand(input, { role, user, checkPermission, addLog, onLine }) {
  const tokens = tokenize(input.trim());
  if (tokens.length === 0) return { lines: [] };

  const [rawCmd, ...args] = tokens;
  const cmd = rawCmd.toLowerCase();
  const { kernel } = getKernel();
  const call = (name, ...callArgs) => kernel.syscalls.invoke(name, ...callArgs);
  const out = [];

  if (!COMMAND_NAMES.includes(cmd)) {
    return { lines: [line(`${rawCmd}: comando no encontrado. Escribe "help" para ver los comandos.`, 'err')] };
  }

  // Control de acceso por rol (muestra el aviso ACCESO DENEGADO y lo registra)
  if (ADMIN_COMMANDS.has(cmd) && !checkPermission('ADMIN', `Comando de terminal "${cmd}"`, addLog)) {
    return { lines: [line(`${cmd}: permiso denegado. Se requiere rol ADMIN (rol actual: ${role}).`, 'err')] };
  }

  try {
    switch (cmd) {
      case 'help':
        out.push(line('Comandos disponibles:', 'info'));
        for (const [usage, desc] of COMMAND_HELP) out.push(line(`  ${pad(usage, 44)} ${desc}`));
        out.push(line('Los comandos de procesos, memoria, archivos y dispositivos usan system calls:', 'dim'));
        out.push(line('si el kernel no está en RUNNING, fallan hasta ejecutar "boot".', 'dim'));
        break;

      case 'clear':
        return { lines: [], clear: true };

      case 'whoami':
        out.push(line(`${user?.name || 'Sin sesión'} (${user?.email || '-'}) · rol ${role}`));
        break;

      case 'boot':
      case 'reboot': {
        if (cmd === 'reboot' && kernel.state.status !== SYSTEM_STATUS.OFF) {
          shutdownKernel('Reinicio solicitado desde la terminal');
          onLine?.(line('[ OK ] Kernel detenido. Reiniciando...', 'warn'));
        }
        if (kernel.state.status === SYSTEM_STATUS.RUNNING) {
          out.push(line('El kernel ya está en ejecución (RUNNING). Usa "reboot" para reiniciarlo.', 'warn'));
          break;
        }
        onLine?.(line('Iniciando secuencia de arranque de RobotOS...', 'info'));
        const report = await bootKernel((step) => {
          if (step.step === 'KERNEL_INITIALIZED') onLine?.(line('[ OK ] Kernel inicializado (BOOTING)', 'ok'));
          if (step.step === 'CHECK_PASSED') onLine?.(line(`[ OK ] ${step.name}`, 'ok'));
          if (step.step === 'BOOT_COMPLETED') onLine?.(line('[ OK ] Kernel en ejecución (RUNNING)', 'ok'));
        });
        if (report.success) {
          out.push(line(`Arranque completado: ${report.checks.length} comprobaciones superadas.`, 'ok'));
        } else {
          for (const c of report.checks.filter((x) => !x.success)) out.push(line(`[FAIL] ${c.name}: ${c.message}`, 'err'));
          out.push(line(`Arranque fallido: ${report.error}`, 'err'));
        }
        break;
      }

      case 'shutdown':
        shutdownKernel();
        out.push(line('Kernel apagado (OFF). Las system calls quedan deshabilitadas.', 'warn'));
        break;

      case 'status': {
        const snap = kernel.state.snapshot();
        const type = snap.status === 'RUNNING' ? 'ok' : snap.status === 'DEGRADED' ? 'warn' : 'err';
        out.push(line(`Estado del kernel: ${snap.status}`, type));
        out.push(line(`Tiempo activo:     ${formatUptime(snap.uptimeMs)}`));
        out.push(line(`System calls:      ${kernel.syscalls.list().length} registradas`));
        out.push(line(`Errores:           ${kernel.errors.getRecent(200).length}`));
        if (snap.history.length) {
          out.push(line('Transiciones:', 'info'));
          for (const h of snap.history.slice(-8)) {
            out.push(line(`  ${localTime(h.at)}  ${pad(h.previous, 13)} -> ${pad(h.next, 13)} ${h.reason}`, 'dim'));
          }
        }
        break;
      }

      case 'syscalls':
        out.push(line(`System calls registradas (${kernel.syscalls.list().length}):`, 'info'));
        out.push(line(`  ${kernel.syscalls.list().join('  ')}`));
        break;

      case 'errors': {
        const errs = kernel.errors.getRecent(10);
        if (!errs.length) out.push(line('Sin errores registrados.', 'ok'));
        for (const e of errs) out.push(line(`${localTime(e.timestamp)} [${e.level}] ${e.code}: ${e.message}`, 'err'));
        break;
      }

      case 'ps': {
        const procs = await call('sys_ps');
        out.push(line(`${pad('PID', 6)}${pad('NOMBRE', 20)}${pad('ESTADO', 12)}${pad('PRIORIDAD', 12)}${pad('CPU', 7)}MEMORIA`, 'info'));
        for (const p of procs) {
          const type = p.state === 'RUNNING' ? 'ok' : p.state === 'WAITING' ? 'warn' : p.state === 'TERMINATED' ? 'dim' : 'out';
          out.push(line(`${pad(p.pid, 6)}${pad(p.name, 20)}${pad(p.state, 12)}${pad(`${p.priority} (${p.prioridadNum})`, 12)}${pad(`${p.cpu}%`, 7)}${p.memoryKb ?? p.memory} KB`, type));
        }
        break;
      }

      case 'run': {
        const name = requireArg(args[0], 'run <nombre> [prioridad] [KB] [ticks]');
        const prioArg = (args[1] || 'media').toLowerCase();
        const priority = PRIORITY_BY_NAME[prioArg] || PRIORITY_BY_NUM[prioArg] || 'Media';
        const res = await call('sys_spawn', {
          name,
          priority,
          memoryKb: Number(args[2]) || 64,
          cpu: 10,
          tiempoTotal: Number(args[3]) || 4,
        });
        if (res?.success) out.push(line(`Proceso ${res.process.name} creado con PID ${res.process.pid} (NEW).`, 'ok'));
        else out.push(line(`No se pudo crear el proceso: ${res?.reason === 'MEM_INSUFFICIENT' ? 'memoria insuficiente' : 'error desconocido'}.`, 'err'));
        break;
      }

      case 'admit':
      case 'exec':
      case 'pause':
      case 'resume':
      case 'kill': {
        const pid = requireArg(args[0], `${cmd} <pid>`);
        const before = (await call('sys_ps')).find((p) => p.pid === Number(pid));
        await call(`sys_${cmd}`, pid);
        const expected = { admit: 'NEW', exec: 'READY', pause: 'RUNNING o READY', resume: 'WAITING', kill: 'cualquiera salvo TERMINATED' };
        const valid = {
          admit: before?.state === 'NEW',
          exec: before?.state === 'READY',
          pause: before?.state === 'RUNNING' || before?.state === 'READY',
          resume: before?.state === 'WAITING',
          kill: before && before.state !== 'TERMINATED',
        }[cmd];
        if (valid) out.push(line(`${cmd}: proceso ${pid} (${before.name}) actualizado.`, 'ok'));
        else out.push(line(`${cmd}: transición no permitida desde ${before?.state}. Requiere estado ${expected[cmd]}.`, 'err'));
        break;
      }

      case 'threads': {
        const list = await call('sys_threads', args[0]);
        if (!list.length) {
          out.push(line('No hay hilos. Crea uno con: thread add <pid> <nombre> [ráfaga]', 'dim'));
          break;
        }
        out.push(line(`${pad('TID', 6)}${pad('PROCESO', 9)}${pad('NOMBRE', 20)}${pad('ESTADO', 12)}RESTANTE`, 'info'));
        for (const t of list) {
          const type = t.state === 'TERMINATED' ? 'dim' : t.state === 'BLOCKED' ? 'warn' : t.state === 'RUNNING' ? 'ok' : 'out';
          out.push(line(`${pad(t.tid, 6)}${pad(t.processId, 9)}${pad(t.name, 20)}${pad(t.state, 12)}${t.remaining}/${t.burst}`, type));
        }
        break;
      }

      case 'thread': {
        const sub = (args[0] || '').toLowerCase();
        if (sub === 'add') {
          const pid = requireArg(args[1], 'thread add <pid> <nombre> [ráfaga]');
          const name = requireArg(args[2], 'thread add <pid> <nombre> [ráfaga]');
          const t = await call('sys_thread_create', { pid, name, burst: Number(args[3]) || 4 });
          out.push(line(`Hilo ${t.tid} (${t.name}) creado en el proceso ${t.processId} con ráfaga ${t.burst} (NEW).`, 'ok'));
        } else if (['admit', 'block', 'unblock', 'kill'].includes(sub)) {
          const tid = requireArg(args[1], `thread ${sub} <tid>`);
          const t = await call(`sys_thread_${sub}`, tid);
          out.push(line(`Hilo ${t.tid} (${t.name}): ${t.state}.`, 'ok'));
        } else if (sub === 'step' || sub === 'run') {
          let turns = 0;
          const gantt = [];
          do {
            const result = await call('sys_thread_step');
            if (!result) break;
            turns += 1;
            gantt.push(`T${result.thread.tid}×${result.executed}`);
            out.push(line(
              `Turno ${turns}: hilo ${result.thread.tid} (${result.thread.name}) ejecutó ${result.executed} tick(s), restan ${result.thread.remaining}${result.finished ? ' → TERMINATED' : ''}`,
              result.finished ? 'ok' : 'out'
            ));
          } while (sub === 'run' && turns < 200);
          if (turns === 0) out.push(line('No hay hilos en READY. Admite alguno con: thread admit <tid>', 'warn'));
          else if (sub === 'run') out.push(line(`Planificación: ${gantt.join(' | ')}`, 'info'));
        } else {
          throw new Error('Uso: thread add | admit | block | unblock | kill | step | run');
        }
        break;
      }

      case 'mem': {
        const { stats, blocks } = await call('sys_mem');
        out.push(line(`Memoria: ${stats.usedKb} KB usados de ${stats.totalKb} KB (${stats.usagePct}%) · libres ${stats.freeKb} KB`, 'info'));
        const width = 50;
        let bar = '';
        let cursor = 0;
        for (const b of blocks) {
          bar += '.'.repeat(Math.round(((b.start - cursor) / stats.totalKb) * width));
          bar += (b.corrupted ? '!' : '#').repeat(Math.max(1, Math.round((b.size / stats.totalKb) * width)));
          cursor = b.start + b.size;
        }
        bar = bar.padEnd(width, '.').slice(0, width);
        out.push(line(`[${bar}]  # asignado  . libre  ! corrupto`, 'dim'));
        for (const b of blocks) {
          out.push(line(`  ${pad(`[${b.start}..${b.start + b.size - 1} KB]`, 16)}${pad(b.owner, 20)}${b.size} KB${b.corrupted ? '  CORRUPTO' : ''}`, b.corrupted ? 'err' : 'out'));
        }
        break;
      }


      case 'ls': {
        const files = await call('sys_ls');
        const dir = args[0] ? `/${args[0].replace(/^\/+|\/+$/g, '')}/` : '/';
        const filtered = files.filter((f) => f.path.startsWith(dir)).sort((a, b) => a.path.localeCompare(b.path));
        if (!filtered.length) out.push(line(`ls: ${dir} está vacío o no existe.`, 'warn'));
        for (const f of filtered) out.push(line(`  ${pad(f.path, 44)}${f.size_bytes ?? 0} B`));
        out.push(line(`${filtered.length} archivo(s)`, 'dim'));
        break;
      }

      case 'cat': {
        const path = requireArg(args[0], 'cat <ruta>');
        const content = await call('sys_read', path);
        for (const l of String(content).split('\n')) out.push(line(l));
        break;
      }

      case 'write': {
        const path = requireArg(args[0], 'write <ruta> <texto>');
        const content = args.slice(1).join(' ');
        const res = await call('sys_write', path, content);
        out.push(res?.success ? line(`Archivo ${path} creado (${content.length} B).`, 'ok') : line(`write: ${res?.error}`, 'err'));
        break;
      }

      case 'rm': {
        const path = requireArg(args[0], 'rm <ruta>');
        const res = await call('sys_unlink', path);
        out.push(res?.success ? line(`Archivo ${path} eliminado.`, 'ok') : line(`rm: ${res?.error}`, 'err'));
        break;
      }

      case 'devices': {
        const devs = await call('sys_devices');
        out.push(line(`${pad('N.º', 5)}${pad('DISPOSITIVO', 30)}${pad('TIPO', 10)}${pad('ZONA', 12)}ESTADO`, 'info'));
        devs.forEach((d, i) => {
          const value = d.type === 'climate' && d.temperature !== undefined ? `${d.temperature} °C` : d.status;
          out.push(line(`${pad(i + 1, 5)}${pad(d.name, 30)}${pad(d.type, 10)}${pad(d.zone, 12)}${value}`, d.status === 'OFFLINE' ? 'err' : 'out'));
        });
        break;
      }

      case 'toggle': {
        const n = Number(requireArg(args[0], 'toggle <n.º de dispositivo>'));
        const devs = await call('sys_devices');
        const dev = devs[n - 1];
        if (!dev) throw new Error(`No existe el dispositivo ${n}. Usa "devices" para ver la lista.`);
        const permission = dev.type === 'lock' || dev.type === 'camera' ? 'USER' : 'GUEST';
        if (!checkPermission(permission, `Operar dispositivo "${dev.name}" desde la terminal`, addLog)) {
          out.push(line('toggle: permiso denegado.', 'err'));
          break;
        }
        await call('sys_toggle', dev.id);
        out.push(line(`Orden enviada a ${dev.name} (estado anterior: ${dev.status}).`, 'ok'));
        break;
      }

      case 'logs': {
        const n = Math.min(50, Number(args[0]) || 10);
        const logs = await call('sys_logs', n);
        for (const l of logs) {
          const type = l.level === 'ERROR' || l.level === 'CRITICAL' ? 'err' : l.level === 'WARNING' ? 'warn' : 'out';
          out.push(line(`${l.timestamp} [${l.level}] ${l.source}: ${l.message}`, type));
        }
        break;
      }

      case 'sensors': {
        const hw = await call('sys_hw');
        out.push(line(`${pad('SENSOR', 34)}${pad('VALOR', 14)}${pad('DRIVER', 15)}ESTADO`, 'info'));
        for (const x of hw.sensors) {
          const value = x.value === null ? 'sin lectura' : `${x.value} ${x.unit}`;
          const st = x.status === 'OK' ? 'normal' : x.status === 'ALERTA' ? 'fuera de rango' : 'sin driver';
          out.push(line(`${pad(x.name, 34)}${pad(value, 14)}${pad(x.driver, 15)}${st}`, x.status === 'OK' ? 'out' : x.status === 'ALERTA' ? 'warn' : 'err'));
        }
        out.push(line(`Actuadores: ${hw.actuators.map((a) => `${a.id}=${a.value}${a.unit}`).join('  ')}`, 'dim'));
        break;
      }

      case 'drivers': {
        const hw = await call('sys_hw');
        out.push(line(`${pad('ID', 15)}${pad('DRIVER', 34)}${pad('VERSIÓN', 9)}${pad('BUS', 6)}${pad('ESTADO', 11)}FALLAS`, 'info'));
        for (const d of hw.drivers) {
          const type = d.status === 'ACTIVE' ? 'out' : d.status === 'FAILED' ? 'err' : 'warn';
          out.push(line(`${pad(d.id, 15)}${pad(d.name, 34)}${pad(d.version, 9)}${pad(d.bus, 6)}${pad(d.status, 11)}${d.failures}`, type));
        }
        break;
      }

      case 'driver': {
        const action = requireArg(args[0], 'driver restart | stop | load | fail <id>').toLowerCase();
        const id = requireArg(args[1], 'driver restart | stop | load | fail <id>');
        const needed = action === 'restart' ? 'USER' : 'ADMIN';
        if (!checkPermission(needed, `Driver ${action} ${id} desde la terminal`, addLog)) {
          out.push(line(`driver ${action}: permiso denegado (se requiere ${needed}).`, 'err'));
          break;
        }
        const d = await call('sys_driver', action, id);
        const msg = { restart: 'reiniciado', stop: 'detenido', load: 'cargado', fail: 'en falla simulada; el watchdog lo recuperará' }[action];
        out.push(line(`${d.name}: ${msg}. Estado: ${d.status}.`, action === 'fail' || action === 'stop' ? 'warn' : 'ok'));
        break;
      }

      case 'motor': {
        const id = requireArg(args[0], 'motor <actuador> <valor>');
        const value = requireArg(args[1], 'motor <actuador> <valor>');
        if (!checkPermission('USER', `Mover ${id} desde la terminal`, addLog)) {
          out.push(line('motor: permiso denegado.', 'err'));
          break;
        }
        const a = await call('sys_actuator_set', id, value);
        out.push(line(`${a.name}: ${a.value} ${a.unit}`, 'ok'));
        break;
      }

      case 'move':
      case 'stop': {
        if (!checkPermission('USER', `Motores (${cmd}) desde la terminal`, addLog)) {
          out.push(line(`${cmd}: permiso denegado.`, 'err'));
          break;
        }
        if (cmd === 'move') {
          await call('sys_move', Number(args[0]) || 60);
          out.push(line('RX-1 en movimiento: ruedas al ' + (Number(args[0]) || 60) + ' % durante 3 ciclos.', 'ok'));
        } else {
          await call('sys_motors_stop');
          out.push(line('Motores detenidos.', 'ok'));
        }
        break;
      }

      case 'diagnose': {
        const r = await call('sys_diagnose');
        out.push(line(`Salud del sistema: ${r.score}/100. ${r.summary}`, r.level === 'ok' ? 'ok' : r.level === 'warning' ? 'warn' : 'err'));
        for (const f of r.findings) {
          const type = f.severity === 'critical' ? 'err' : f.severity === 'warning' ? 'warn' : 'info';
          out.push(line(`  [${f.area}] ${f.title}`, type));
          out.push(line(`      ${f.detail}${f.action ? `  Sugerencia: ${f.action.label}.` : ''}`, 'dim'));
        }
        break;
      }

      case 'bench': {
        await call('sys_ps'); // exige kernel en RUNNING, como cualquier aplicación
        const b = runFullBenchmark();
        out.push(line('CPU (4 procesos de prueba):', 'info'));
        for (const r of b.cpu.resultados) {
          out.push(line(`  ${pad(r.etiqueta, 28)}espera ${pad(r.esperaPromedio, 6)}retorno ${pad(r.retornoPromedio, 7)}cambios de contexto ${r.cambiosContexto}`));
        }
        out.push(line('Memoria virtual (FIFO frente a LRU):', 'info'));
        for (const m of b.memoria.comparativaPorMarcos) {
          out.push(line(`  ${m.marcos} marcos: FIFO ${m.fifo.pageFaults} fallos, LRU ${m.lru.pageFaults} fallos. Mejor: ${m.mejor}`));
        }
        const be = b.memoria.analisisBelady;
        out.push(line(`  Anomalía de Belady: FIFO pasa de ${be.fifo3Marcos} a ${be.fifo4Marcos} fallos con más marcos; LRU baja de ${be.lru3Marcos} a ${be.lru4Marcos}.`, 'warn'));
        out.push(line(`Tiempo real (utilización ${Math.round(b.rtos.utilizacion * 100)} %):`, 'info'));
        out.push(line(`  EDF: ${b.rtos.edf.deadlinesCumplidos} plazos cumplidos, ${b.rtos.edf.deadlinesPerdidos} perdidos`));
        out.push(line(`  Rate Monotonic: ${b.rtos.rm.deadlinesCumplidos} cumplidos, ${b.rtos.rm.deadlinesPerdidos} perdidos`));
        out.push(line(`Ganador en tiempo real: ${b.rtos.ganador}`, 'ok'));
        break;
      }

      default:
        break;
    }
  } catch (error) {
    if (error.code === 'KERNEL_NOT_READY') {
      out.push(line(`${cmd}: el kernel no está operativo (${kernel.state.status}). Ejecuta "boot" primero.`, 'err'));
    } else {
      out.push(line(`${cmd}: ${error.message}`, 'err'));
    }
  }

  return { lines: out };
}
