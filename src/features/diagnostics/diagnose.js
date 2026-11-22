/**
 * Asistente de diagnóstico de RobotOS.
 *
 * Revisa el estado del sistema (kernel, procesos, memoria, CPU, dispositivos,
 * hardware, alertas y registros) y devuelve hallazgos en lenguaje sencillo, cada
 * uno con su causa probable y una acción para corregirlo.
 *
 * Es una función pura: recibe el estado y devuelve el diagnóstico. Por eso se
 * prueba con node --test y la usan igual la app, RX-1 y la terminal.
 *
 * Autora: María Fernanda Tuta Gómez
 */

export const SEVERITY = Object.freeze({ CRITICAL: 'critical', WARNING: 'warning', INFO: 'info' });

const WEIGHT = { critical: 30, warning: 12, info: 3 };

/** Cuenta los huecos libres entre bloques de memoria (fragmentación externa). */
export function countMemoryHoles(blocks = [], totalKb = 0) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  let cursor = 0;
  let holes = 0;
  for (const b of sorted) {
    if (b.start > cursor) holes += 1;
    cursor = Math.max(cursor, b.start + b.size);
  }
  if (cursor < totalKb) holes += 1;
  return holes;
}

/**
 * @param {object} s
 * @param {string} s.kernelStatus
 * @param {Array}  s.processes
 * @param {object} s.memoryStats   { totalKb, usedKb, freeKb }
 * @param {Array}  s.memoryBlocks
 * @param {number} s.cpuUsage
 * @param {number} s.batteryPercent
 * @param {Array}  s.devices
 * @param {Array}  s.alerts
 * @param {Array}  s.logs
 * @param {object} [s.hardware]    snapshot del HardwareManager
 * @param {number} [s.hour]        hora local (0-23)
 */
export function diagnose(s) {
  const findings = [];
  const add = (f) => findings.push(f);
  const processes = s.processes || [];
  const alive = processes.filter((p) => p.state !== 'TERMINATED');

  // Kernel
  if (s.kernelStatus && s.kernelStatus !== 'RUNNING') {
    add({
      id: 'kernel',
      severity: s.kernelStatus === 'DEGRADED' ? SEVERITY.WARNING : SEVERITY.CRITICAL,
      area: 'Kernel',
      title: s.kernelStatus === 'DEGRADED' ? 'El kernel funciona en modo degradado' : 'El kernel no está en ejecución',
      detail: `Estado actual: ${s.kernelStatus}. Las llamadas al sistema pueden fallar hasta que el kernel vuelva a RUNNING.`,
      action: { type: 'reboot', label: 'Reiniciar RobotOS' },
    });
  }

  // Alertas
  const active = (s.alerts || []).filter((a) => a.state === 'Activa');
  if (active.length) {
    add({
      id: 'alerts',
      severity: active.some((a) => a.severity === 'critical') ? SEVERITY.CRITICAL : SEVERITY.WARNING,
      area: 'Alertas',
      title: `${active.length} alerta${active.length > 1 ? 's' : ''} sin resolver`,
      detail: active.slice(0, 3).map((a) => a.title).join('; '),
      action: { type: 'open_app', label: 'Ver en el visor de eventos', payload: 'logs-alerts' },
    });
  }

  // Memoria
  const mem = s.memoryStats || {};
  const usage = mem.totalKb ? (mem.usedKb / mem.totalKb) * 100 : 0;
  const holes = countMemoryHoles(s.memoryBlocks, mem.totalKb);
  if (usage >= 96) {
    add({
      id: 'ram-full',
      severity: SEVERITY.CRITICAL,
      area: 'Memoria',
      title: `La memoria está casi llena (${Math.round(usage)} %)`,
      detail: `Quedan ${mem.freeKb} KB. Un proceso nuevo puede no tener dónde cargarse. Cierra apps que no uses.`,
      action: { type: 'open_app', label: 'Ver procesos en el monitor', payload: 'monitor' },
    });
  } else if (usage >= 91) {
    add({
      id: 'ram-high',
      severity: SEVERITY.WARNING,
      area: 'Memoria',
      title: `Uso de memoria alto (${Math.round(usage)} %)`,
      detail: `Quedan ${mem.freeKb} KB libres.`,
      action: { type: 'open_app', label: 'Ver procesos en el monitor', payload: 'monitor' },
    });
  }
  if (holes > 2) {
    add({
      id: 'fragmentation',
      severity: SEVERITY.WARNING,
      area: 'Memoria',
      title: `Memoria fragmentada en ${holes} huecos`,
      detail: 'Hay espacio libre, pero repartido en partes pequeñas. Compactar une los huecos.',
      action: { type: 'compact', label: 'Compactar memoria' },
    });
  }
  const corrupted = (s.memoryBlocks || []).filter((b) => b.corrupted);
  if (corrupted.length) {
    add({
      id: 'corruption',
      severity: SEVERITY.CRITICAL,
      area: 'Memoria',
      title: `${corrupted.length} bloque${corrupted.length > 1 ? 's' : ''} de memoria corrupto${corrupted.length > 1 ? 's' : ''}`,
      detail: `Afecta a: ${corrupted.map((b) => b.owner).join(', ')}. Compactar reubica los bloques sanos.`,
      action: { type: 'compact', label: 'Compactar memoria' },
    });
  }

  // CPU
  if (s.cpuUsage >= 85) {
    const heavy = alive
      .filter((p) => p.state === 'RUNNING')
      .sort((a, b) => (b.cpu || 0) - (a.cpu || 0))
      .slice(0, 3)
      .map((p) => `${p.name} (${p.cpu} %)`);
    add({
      id: 'cpu',
      severity: s.cpuUsage >= 95 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
      area: 'CPU',
      title: `CPU muy alta (${s.cpuUsage} %)`,
      detail: heavy.length ? `Los procesos que más consumen: ${heavy.join(', ')}.` : 'Revisa los procesos en ejecución.',
      action: { type: 'open_app', label: 'Abrir el monitor del sistema', payload: 'monitor' },
    });
  }

  // Batería
  if (typeof s.batteryPercent === 'number' && s.batteryPercent < 25) {
    add({
      id: 'battery',
      severity: s.batteryPercent < 10 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
      area: 'Energía',
      title: `Batería baja (${s.batteryPercent} %)`,
      detail: 'RX-1 debería volver a la base de carga antes de seguir con tareas que usen los motores.',
      action: { type: 'stop_motors', label: 'Detener motores' },
    });
  }

  // Dispositivos de la casa
  for (const d of s.devices || []) {
    if (d.status === 'OFFLINE') {
      add({
        id: `device-${d.id}`,
        severity: SEVERITY.WARNING,
        area: 'Dispositivos',
        title: `${d.name} sin conexión`,
        detail: 'El dispositivo no responde en el bus de la casa.',
        action: { type: 'toggle_device', label: 'Reconectar', payload: d.id },
      });
    }
  }
  const door = (s.devices || []).find((d) => d.type === 'lock');
  const night = typeof s.hour === 'number' && (s.hour >= 21 || s.hour < 6);
  if (door && door.status !== 'BLOQUEADA' && night) {
    add({
      id: 'door',
      severity: SEVERITY.WARNING,
      area: 'Seguridad',
      title: 'La puerta principal está abierta de noche',
      detail: 'Se recomienda cerrarla.',
      action: { type: 'toggle_device', label: 'Cerrar la puerta', payload: door.id },
    });
  }

  // Hardware del robot
  const hw = s.hardware;
  if (hw) {
    for (const d of hw.drivers || []) {
      if (d.status === 'FAILED' || d.status === 'STOPPED') {
        add({
          id: `driver-${d.id}`,
          severity: d.status === 'FAILED' ? SEVERITY.CRITICAL : SEVERITY.WARNING,
          area: 'Hardware',
          title: `${d.name} ${d.status === 'FAILED' ? 'falló' : 'está detenido'}`,
          detail: `Sin este driver no funcionan: ${d.devices.join(', ')}.${
            d.status === 'FAILED' && d.recoverIn ? ` El watchdog lo intentará recuperar en ${d.recoverIn} ciclo(s).` : ''
          }`,
          action: { type: 'restart_driver', label: 'Reiniciar driver', payload: d.id },
        });
      }
    }
    const temp = (hw.sensors || []).find((x) => x.id === 'temp_motores');
    if (temp?.value !== null && temp?.value > 70) {
      add({
        id: 'motor-temp',
        severity: temp.value > 85 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
        area: 'Hardware',
        title: `Motores calientes (${temp.value} °C)`,
        detail: 'Reduce la potencia o detén los motores para que se enfríen.',
        action: { type: 'stop_motors', label: 'Detener motores' },
      });
    }
    const lidar = (hw.sensors || []).find((x) => x.id === 'lidar');
    if (lidar?.value !== null && lidar?.value < 20) {
      add({
        id: 'obstacle',
        severity: SEVERITY.INFO,
        area: 'Hardware',
        title: `Obstáculo a ${lidar.value} cm`,
        detail: 'El robot frena solo si un obstáculo está a menos de 20 cm.',
      });
    }
  }

  // Errores recientes
  const errors = (s.logs || []).slice(0, 30).filter((l) => l.level === 'ERROR');
  if (errors.length >= 3) {
    add({
      id: 'errors',
      severity: SEVERITY.INFO,
      area: 'Registros',
      title: `${errors.length} errores en los registros recientes`,
      detail: errors[0].message,
      action: { type: 'open_app', label: 'Ver registros', payload: 'logs-alerts' },
    });
  }

  const order = { critical: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  const penalty = findings.reduce((sum, f) => sum + WEIGHT[f.severity], 0);
  const score = Math.max(0, 100 - penalty);
  const level = findings.some((f) => f.severity === SEVERITY.CRITICAL)
    ? 'critical'
    : findings.some((f) => f.severity === SEVERITY.WARNING)
      ? 'warning'
      : 'ok';

  const summary =
    level === 'ok'
      ? 'Todo está en orden. No encontré problemas.'
      : `Encontré ${findings.length} punto${findings.length > 1 ? 's' : ''} por revisar${
          level === 'critical' ? ', al menos uno es crítico' : ''
        }.`;

  return {
    score,
    level,
    summary,
    findings,
    checked: ['Kernel', 'Alertas', 'Memoria', 'CPU', 'Energía', 'Dispositivos', 'Seguridad', 'Hardware', 'Registros'],
    at: new Date().toISOString(),
  };
}
