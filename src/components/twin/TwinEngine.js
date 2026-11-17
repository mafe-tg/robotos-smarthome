/**
 * TwinEngine.js — Función pura del Gemelo Digital de RobotOS SmartHome
 *
 * Recibe el estado real del SystemContext y devuelve un objeto TwinState
 * que describe exactamente cómo debe verse el gemelo en cada instante.
 *
 * Regla de diseño: NINGÚN efecto secundario. Sin setX, sin fetch, sin refs.
 * Esto garantiza que el gemelo sea una representación determinista del SO.
 *
 * Autoras: Mafe (fase 1 y 2) — feature/gemelo-mafe
 */

// ─── Asignación proceso → habitación ────────────────────────────────────────
export const PROCESS_ROOM = {
  lighting_daemon:   'salon',
  temp_manager:      'salon',
  surveillance_proc: 'entrada',
  lock_guard:        'entrada',
  routine_engine:    'cocina',
  energy_monitor:    'base',
};

// ─── Asignación dispositivo → habitación ─────────────────────────────────────
export const DEVICE_ROOM = {
  d1: 'salon',    // Luces Salón Principal
  d2: 'cocina',   // Luces Cocina
  d3: 'entrada',  // Sensor Movimiento Entrada
  d4: 'exterior', // Cámara Frontal
  d5: 'entrada',  // Cerradura Puerta Principal
  d6: 'salon',    // Termostato Salón
};

// Dispositivos visibles para GUEST (solo Salón y Cocina)
export const GUEST_VISIBLE_DEVICES = new Set(['d1', 'd2', 'd6']);

// ─── Paleta de estados del gemelo ────────────────────────────────────────────
export const STATE_COLORS = {
  RUNNING:    '#10B981',
  READY:      '#F59E0B',
  WAITING:    '#F97316',
  NEW:        '#3B82F6',
  TERMINATED: '#475569',
  FALLA:      '#EF4444',
};

const ROOM_FILL = {
  RUNNING:    '#0F2A1A',
  READY:      '#1C1A09',
  WAITING:    '#1C1109',
  NEW:        '#0A1225',
  TERMINATED: '#111827',
  FALLA:      '#1F0A0A',
};

export { ROOM_FILL };

// ─── Función principal ────────────────────────────────────────────────────────
/**
 * @param {object} param0
 * @param {Array}  param0.processes      — lista de procesos del SystemContext
 * @param {Array}  param0.devices        — lista de dispositivos del SystemContext
 * @param {Array}  param0.alerts         — alertas activas del SystemContext
 * @param {object} param0.memoryStats    — { usedKb, totalKb }
 * @param {object} param0.energyReport   — { totalKwh }
 * @param {object} param0.systemSettings
 * @param {number} param0.batteryPercent — batería real del SystemContext (metrics.batteryPercent)
 * @param {number} param0.cpuUsage       — % CPU real del SystemContext (metrics.cpuUsage)
 * @returns {TwinState}
 */
export function deriveTwinState({
  processes = [],
  devices = [],
  alerts = [],
  memoryStats = {},
  energyReport = {},
  systemSettings = {},
  batteryPercent = 84,
  cpuUsage = 28,
}) {
  const rooms       = deriveRooms(processes, devices, alerts);
  const deviceStates = deriveDevices(devices, processes);
  const robot       = deriveRobot(processes, memoryStats, alerts, batteryPercent, cpuUsage);

  const activeAlerts = alerts.filter((a) => a.state === 'Activa');
  const hasCommLoss = activeAlerts.some((a) =>
    a.title?.toLowerCase().includes('comunicación') ||
    a.details?.toLowerCase().includes('offline') ||
    a.details?.toLowerCase().includes('bus')
  );
  const hasUnauthorized = activeAlerts.some((a) =>
    a.title?.toLowerCase().includes('autorizado') ||
    a.title?.toLowerCase().includes('intrusión')
  );
  const hasDeadlock = activeAlerts.some((a) =>
    a.title?.toLowerCase().includes('deadlock') ||
    a.title?.toLowerCase().includes('interbloqueo')
  );
  const hasCpuOverload = cpuUsage > 80 || activeAlerts.some((a) =>
    a.title?.toLowerCase().includes('sobrecarga') ||
    a.title?.toLowerCase().includes('cpu')
  );
  const hasMemoryCorruption = activeAlerts.some((a) =>
    a.title?.toLowerCase().includes('corrupción') ||
    a.details?.toLowerCase().includes('paridad') ||
    a.details?.toLowerCase().includes('checksum')
  );

  const runningProcess = processes.find((p) => p.state === 'RUNNING') || null;
  const runningRoom    = runningProcess ? (PROCESS_ROOM[runningProcess.name] || 'base') : 'base';

  return {
    rooms,
    deviceStates,
    robot: { ...robot, currentRoom: runningRoom, runningProcess },
    globalAlerts: { hasCommLoss, hasUnauthorized, hasDeadlock, hasCpuOverload, hasMemoryCorruption, count: activeAlerts.length },
    summary: {
      algorithm: systemSettings.scheduler_algorithm || 'PRIORIDAD',
      rr_quantum: systemSettings.rr_quantum || 2,
      ramPct: memoryStats.usedKb && memoryStats.totalKb
        ? Math.round((memoryStats.usedKb / memoryStats.totalKb) * 100)
        : 0,
      energyKwh: energyReport.totalKwh || 0,
    },
  };
}

// ─── Derivar estado de habitaciones ──────────────────────────────────────────
function deriveRooms(processes, devices, alerts) {
  const roomIds = ['salon', 'cocina', 'entrada', 'base', 'exterior'];
  const roomMap = {};

  roomIds.forEach((roomId) => {
    const roomProcesses = processes.filter((p) => PROCESS_ROOM[p.name] === roomId);
    const roomDevices   = devices.filter((d) => DEVICE_ROOM[d.id] === roomId);
    const dominantState = getDominantState(roomProcesses);
    const hasAlert = alerts.some(
      (a) => a.state === 'Activa' &&
        roomProcesses.some((p) => a.details?.toLowerCase().includes(p.name.toLowerCase()))
    );
    const hasLightOn = roomDevices.some((d) => d.type === 'light' && d.status === 'ON');

    roomMap[roomId] = {
      id: roomId,
      dominantState,
      hasAlert,
      hasLightOn,
      processes: roomProcesses,
      devices:   roomDevices,
    };
  });

  return roomMap;
}

// ─── Derivar estado de dispositivos ──────────────────────────────────────────
function deriveDevices(devices, processes) {
  return devices.map((dev) => {
    const responsibleProcess = findResponsibleProcess(dev, processes);
    const procState = responsibleProcess?.state || 'RUNNING';
    const isOffline = dev.status === 'OFFLINE';
    const icon      = getDeviceIcon(dev);
    const dotColor  = getDeviceDotColor(dev, procState, isOffline);
    const tooltip   = `${dev.name}\nEstado: ${dev.status}${responsibleProcess ? `\nProceso: ${responsibleProcess.name} [${procState}]` : ''}`;

    return {
      id: dev.id,
      name: dev.name,
      type: dev.type,
      status: dev.status,
      icon,
      dotColor,
      isOffline,
      procState,
      responsibleProcess: responsibleProcess?.name || null,
      tooltip,
      room: DEVICE_ROOM[dev.id] || 'exterior',
      pulsing: dev.status === 'DETECTADO' || procState === 'WAITING',
      dimmed: isOffline || procState === 'TERMINATED',
    };
  });
}

// ─── Derivar estado del robot ─────────────────────────────────────────────────
function deriveRobot(processes, memoryStats, alerts, batteryPercent, cpuUsage) {
  // Corrección: usar la batería real del SystemContext (metrics.batteryPercent)
  const batteryPct     = typeof batteryPercent === 'number' ? batteryPercent : 84;
  const batteryCritical = batteryPct < 15;  // < 15 % → vuelve a la base (fase 2)
  const batterLow       = batteryPct < 30;

  const ramPct = memoryStats.usedKb && memoryStats.totalKb
    ? Math.round((memoryStats.usedKb / memoryStats.totalKb) * 100)
    : 0;

  const hasActiveAlert = alerts.some((a) => a.state === 'Activa');
  const cpuBusy        = processes.some((p) => p.state === 'RUNNING');

  let robotStatus = 'IDLE';
  if (batteryCritical)     robotStatus = 'CHARGING';
  else if (hasActiveAlert) robotStatus = 'ALERT';
  else if (cpuBusy)        robotStatus = 'WORKING';

  // ── Velocidad de movimiento: a mayor uso de CPU o menor batería, más lento (mayor intervalo en ms) ──
  // Base: 700 ms (en condiciones ideales: CPU baja y batería llena)
  // Penalización por CPU: cpuUsage (0 a 100%) añade hasta 1100 ms de retraso por saturación
  // Penalización por Batería: batería baja añade hasta 700 ms por degradación energética
  const cpuPenalty     = Math.round((cpuUsage / 100) * 1100);
  const batteryPenalty = Math.round(((100 - batteryPct) / 100) * 700);
  const moveIntervalMs = 700 + cpuPenalty + batteryPenalty;

  return {
    batteryPct,
    batteryCritical,
    ramPct,
    cpuBusy,
    cpuUsage,
    hasActiveAlert,
    robotStatus,
    moveIntervalMs,
    cpuColor:     cpuUsage > 80 ? '#EF4444' : cpuBusy ? '#10B981' : '#475569',
    ramColor:     alerts.some(a => a.state === 'Activa' && a.title?.includes('Corrupción')) ? '#EF4444' : ramPct > 80  ? '#EF4444' : ramPct > 50 ? '#F59E0B' : '#10B981',
    batteryColor: batteryCritical ? '#EF4444' : batterLow ? '#F59E0B' : '#10B981',
    alertColor:   hasActiveAlert ? '#EF4444' : '#475569',
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getDominantState(procs) {
  if (procs.length === 0) return 'TERMINATED';
  for (const s of ['RUNNING', 'WAITING', 'READY', 'NEW', 'TERMINATED']) {
    if (procs.some((p) => p.state === s)) return s;
  }
  return 'TERMINATED';
}

function findResponsibleProcess(device, processes) {
  const MAP = {
    d1: 'lighting_daemon',
    d2: 'routine_engine',
    d3: 'surveillance_proc',
    d4: 'surveillance_proc',
    d5: 'lock_guard',
    d6: 'temp_manager',
  };
  const procName = MAP[device.id];
  return procName ? processes.find((p) => p.name === procName) : null;
}

function getDeviceIcon(dev) {
  if (dev.type === 'light')   return dev.status === 'ON'           ? '💡' : '🔅';
  if (dev.type === 'motion')  return dev.status === 'DETECTADO'    ? '🚨' : '🚶';
  if (dev.type === 'camera')  return dev.status === 'OFFLINE'      ? '📵' : '📷';
  if (dev.type === 'lock')    return dev.status === 'DESBLOQUEADA' ? '🔓' : '🔒';
  if (dev.type === 'climate') return '🌡️';
  return '⚙️';
}

function getDeviceDotColor(dev, procState, isOffline) {
  if (isOffline || procState === 'TERMINATED')             return '#EF4444';
  if (procState === 'WAITING')                              return '#F97316';
  if (dev.type === 'light'  && dev.status === 'OFF')        return '#475569';
  if (dev.type === 'motion' && dev.status === 'DETECTADO')  return '#F59E0B';
  if (dev.type === 'lock'   && dev.status === 'DESBLOQUEADA') return '#F97316';
  return '#10B981';
}
