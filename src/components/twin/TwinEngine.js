/**
 * TwinEngine.js — Función pura del Gemelo Digital de RobotOS SmartHome
 *
 * Recibe el estado real del SystemContext y devuelve un objeto TwinState
 * que describe exactamente cómo debe verse el gemelo en cada instante.
 *
 * Regla de diseño: NINGÚN efecto secundario. Sin setX, sin fetch, sin refs.
 * Esto garantiza que el gemelo sea una representación determinista del SO.
 *
 * Autora de la fase 1: Mafe (feature/gemelo-mafe)
 */

// ─── Asignación proceso → habitación ────────────────────────────────────────
export const PROCESS_ROOM = {
  lighting_daemon:  'salon',
  temp_manager:     'salon',
  surveillance_proc:'entrada',
  lock_guard:       'entrada',
  routine_engine:   'cocina',
  energy_monitor:   'base',
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

// ─── Paleta de estados del gemelo ────────────────────────────────────────────
const STATE_COLORS = {
  RUNNING:    { ring: '#10B981', glow: 'rgba(16,185,129,0.25)',  label: 'RUNNING'    },
  READY:      { ring: '#F59E0B', glow: 'rgba(245,158,11,0.15)',  label: 'READY'      },
  WAITING:    { ring: '#F97316', glow: 'rgba(249,115,22,0.15)',  label: 'WAITING'    },
  NEW:        { ring: '#3B82F6', glow: 'rgba(59,130,246,0.15)',  label: 'NEW'        },
  TERMINATED: { ring: '#475569', glow: 'rgba(71,85,105,0.08)',   label: 'TERMINADO'  },
  FALLA:      { ring: '#EF4444', glow: 'rgba(239,68,68,0.20)',   label: 'FALLA'      },
};

// ─── Función principal ────────────────────────────────────────────────────────
/**
 * @param {object} param0
 * @param {Array}  param0.processes   — lista de procesos del SystemContext
 * @param {Array}  param0.devices     — lista de dispositivos del SystemContext
 * @param {Array}  param0.alerts      — alertas activas del SystemContext
 * @param {object} param0.memoryStats — { usedKb, totalKb, freeKb, usagePct }
 * @param {object} param0.energyReport— { totalKwh, costoEstimado }
 * @param {object} param0.systemSettings
 * @returns {TwinState}
 */
export function deriveTwinState({
  processes = [],
  devices = [],
  alerts = [],
  memoryStats = {},
  energyReport = {},
  systemSettings = {},
}) {
  // ── 1. Estado de cada habitación ─────────────────────────────────────────
  const rooms = deriveRooms(processes, devices, alerts);

  // ── 2. Dispositivos individuales ─────────────────────────────────────────
  const deviceStates = deriveDevices(devices, processes);

  // ── 3. Robot (posición y estado corporal) ─────────────────────────────────
  const robot = deriveRobot(processes, memoryStats, energyReport, alerts);

  // ── 4. Alertas globales que afectan el plano completo ────────────────────
  const globalAlerts = alerts.filter((a) => a.state === 'Activa');
  const hasCommLoss = globalAlerts.some((a) =>
    a.title?.toLowerCase().includes('comunicación') ||
    a.details?.toLowerCase().includes('offline') ||
    a.details?.toLowerCase().includes('bus')
  );
  const hasUnauthorized = globalAlerts.some((a) =>
    a.title?.toLowerCase().includes('autorizado') ||
    a.title?.toLowerCase().includes('intrusión')
  );

  // ── 5. Proceso RUNNING actual ──────────────────────────────────────────────
  const runningProcess = processes.find((p) => p.state === 'RUNNING') || null;
  const runningRoom = runningProcess ? (PROCESS_ROOM[runningProcess.name] || 'base') : 'base';

  return {
    rooms,
    deviceStates,
    robot: { ...robot, currentRoom: runningRoom, runningProcess },
    globalAlerts: { hasCommLoss, hasUnauthorized, count: globalAlerts.length },
    summary: {
      algorithm: systemSettings.scheduler_algorithm || 'PRIORIDAD',
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
    // Procesos asignados a esta habitación
    const roomProcesses = processes.filter(
      (p) => PROCESS_ROOM[p.name] === roomId
    );

    // Dispositivos en esta habitación
    const roomDevices = devices.filter(
      (d) => DEVICE_ROOM[d.id] === roomId
    );

    // Estado dominante del cuarto (prioridad: RUNNING > WAITING > READY > NEW > TERMINATED)
    const dominantState = getDominantState(roomProcesses);
    const stateStyle = STATE_COLORS[dominantState] || STATE_COLORS.TERMINATED;

    // ¿Tiene alguna falla activa?
    const hasAlert = alerts.some(
      (a) =>
        a.state === 'Activa' &&
        roomProcesses.some((p) =>
          a.details?.toLowerCase().includes(p.name.toLowerCase())
        )
    );

    // ¿Alguna luz encendida?
    const hasLightOn = roomDevices.some(
      (d) => d.type === 'light' && d.status === 'ON'
    );

    roomMap[roomId] = {
      id: roomId,
      dominantState,
      stateStyle: hasAlert ? STATE_COLORS.FALLA : stateStyle,
      hasAlert,
      hasLightOn,
      processes: roomProcesses,
      devices: roomDevices,
    };
  });

  return roomMap;
}

// ─── Derivar estado de cada dispositivo ──────────────────────────────────────
function deriveDevices(devices, processes) {
  return devices.map((dev) => {
    // Proceso responsable de este dispositivo (heurística por nombre)
    const responsibleProcess = findResponsibleProcess(dev, processes);
    const procState = responsibleProcess?.state || 'RUNNING';

    // ¿Está desconectado por falla?
    const isOffline = dev.status === 'OFFLINE';

    // Icono según tipo y estado
    const icon = getDeviceIcon(dev);

    // Color del indicador
    const dotColor = getDeviceDotColor(dev, procState, isOffline);

    // Texto de tooltip
    const tooltip = `${dev.name}\nEstado: ${dev.status}${responsibleProcess ? `\nProceso: ${responsibleProcess.name} [${procState}]` : ''}`;

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
      // Animaciones especiales
      pulsing: dev.status === 'DETECTADO' || procState === 'WAITING',
      dimmed: isOffline || procState === 'TERMINATED',
    };
  });
}

// ─── Derivar estado del robot ─────────────────────────────────────────────────
function deriveRobot(processes, memoryStats, energyReport, alerts) {
  const ramPct = memoryStats.usedKb && memoryStats.totalKb
    ? Math.round((memoryStats.usedKb / memoryStats.totalKb) * 100)
    : 0;

  const energyKwh = energyReport.totalKwh || 0;
  // La batería simulada baja según el consumo (máx referencia: 15 kWh = batería agotada)
  const batteryPct = Math.max(0, Math.min(100, Math.round(100 - (energyKwh / 15) * 100)));
  const batteryCritical = batteryPct < 20;

  const hasActiveAlert = alerts.some((a) => a.state === 'Activa');

  // CPU: contar procesos RUNNING (simplificado, ya que no tenemos % real del tick)
  const runningCount = processes.filter((p) => p.state === 'RUNNING').length;
  const cpuBusy = runningCount > 0;

  // Estado global del robot
  let robotStatus = 'IDLE';
  if (batteryCritical)       robotStatus = 'CHARGING';
  else if (hasActiveAlert)   robotStatus = 'ALERT';
  else if (cpuBusy)          robotStatus = 'WORKING';

  return {
    batteryPct,
    batteryCritical,
    ramPct,
    cpuBusy,
    runningCount,
    hasActiveAlert,
    robotStatus,
    // Colores del cuerpo
    cpuColor:     cpuBusy      ? '#10B981' : '#475569',
    ramColor:     ramPct > 80  ? '#EF4444' : ramPct > 50 ? '#F59E0B' : '#10B981',
    batteryColor: batteryCritical ? '#EF4444' : batteryPct < 50 ? '#F59E0B' : '#10B981',
    alertColor:   hasActiveAlert ? '#EF4444' : '#475569',
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getDominantState(procs) {
  if (procs.length === 0) return 'TERMINATED';
  const order = ['RUNNING', 'WAITING', 'READY', 'NEW', 'TERMINATED'];
  for (const s of order) {
    if (procs.some((p) => p.state === s)) return s;
  }
  return 'TERMINATED';
}

function findResponsibleProcess(device, processes) {
  // Mapa explícito dispositivo → proceso responsable
  const MAP = {
    d1: 'lighting_daemon',   // Luces Salón
    d2: 'routine_engine',    // Luces Cocina (routine_engine controla la cocina)
    d3: 'surveillance_proc', // Sensor Movimiento
    d4: 'surveillance_proc', // Cámara Frontal
    d5: 'lock_guard',        // Cerradura
    d6: 'temp_manager',      // Termostato
  };
  const procName = MAP[device.id];
  return procName ? processes.find((p) => p.name === procName) : null;
}

function getDeviceIcon(dev) {
  if (dev.type === 'light')   return dev.status === 'ON'          ? '💡' : '🔅';
  if (dev.type === 'motion')  return dev.status === 'DETECTADO'   ? '🚨' : '🚶';
  if (dev.type === 'camera')  return dev.status === 'OFFLINE'     ? '📵' : '📷';
  if (dev.type === 'lock')    return dev.status === 'DESBLOQUEADA'? '🔓' : '🔒';
  if (dev.type === 'climate') return '🌡️';
  return '⚙️';
}

function getDeviceDotColor(dev, procState, isOffline) {
  if (isOffline || procState === 'TERMINATED') return '#EF4444'; // rojo: sin servicio
  if (procState === 'WAITING')                  return '#F97316'; // naranja: en espera
  if (dev.type === 'light' && dev.status === 'OFF') return '#475569'; // gris: apagado
  if (dev.type === 'motion' && dev.status === 'DETECTADO') return '#F59E0B'; // ámbar: alerta
  if (dev.type === 'lock' && dev.status === 'DESBLOQUEADA') return '#F97316'; // naranja
  return '#10B981'; // verde: operativo normal
}
