/**
 * Pantalla principal de RobotOS: la casa.
 *
 * - Plano ilustrado con las habitaciones, sus dispositivos y el robot, que se
 *   mueve a la habitación del proceso en RUNNING (motor del gemelo digital).
 * - Los dispositivos se encienden o apagan tocándolos en el plano.
 * - RX-1, el asistente, cuenta qué está pasando y sugiere acciones.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Lightbulb, Thermometer, Camera, Lock, LockOpen, Footprints, Zap, ShieldCheck, BatteryMedium, BatteryCharging, Cpu,
} from 'lucide-react';
import { useSystem } from '../../context/SystemContext';
import { useAuth } from '../../context/AuthContext';
import { deriveTwinState, DEVICE_ROOM } from '../../components/twin/TwinEngine';
import { RobotMascot } from './RobotMascot';
import { useDesktop } from './DesktopContext';
import { sfx } from './sound';

/* ── Plano (viewBox 1000 x 620) ── */
const ROOMS = {
  exterior: { x: 24, y: 24, w: 300, h: 262, name: 'Jardín', from: '#25b5d8', to: '#2f6bff' },
  salon: { x: 340, y: 24, w: 400, h: 300, name: 'Salón', from: '#7b3cff', to: '#4b2fd6' },
  cocina: { x: 756, y: 24, w: 220, h: 300, name: 'Cocina', from: '#3f7bff', to: '#5a3ff0' },
  entrada: { x: 24, y: 302, w: 300, h: 294, name: 'Entrada', from: '#9b5cff', to: '#5b2fc9' },
  base: { x: 340, y: 340, w: 636, h: 256, name: 'Base de carga', from: '#4b3bd1', to: '#2a2190' },
};

export const ROOM_NAMES = Object.fromEntries(Object.entries(ROOMS).map(([k, v]) => [k, v.name]));

// Dónde se para el robot en cada habitación
const ROBOT_SPOT = {
  exterior: { x: 200, y: 200 },
  salon: { x: 620, y: 250 },
  cocina: { x: 880, y: 250 },
  entrada: { x: 220, y: 480 },
  base: { x: 660, y: 470 },
};

// Dónde va cada dispositivo en el plano
const DEVICE_SPOT = {
  d1: { x: 450, y: 120 },
  d6: { x: 560, y: 120 },
  d2: { x: 866, y: 120 },
  d4: { x: 110, y: 120 },
  d3: { x: 130, y: 400 },
  d5: { x: 60, y: 520 },
};

const pct = (v, total) => `${(v / total) * 100}%`;

const deviceView = (d) => {
  switch (d.type) {
    case 'light':
      return { icon: Lightbulb, on: d.status === 'ON', text: d.status === 'ON' ? 'Encendida' : 'Apagada' };
    case 'climate':
      return { icon: Thermometer, on: true, text: `${d.temperature ?? ''} °C` };
    case 'camera':
      return { icon: Camera, on: d.status === 'ONLINE', text: d.status === 'ONLINE' ? 'Grabando' : 'Sin señal' };
    case 'lock':
      return { icon: d.status === 'BLOQUEADA' ? Lock : LockOpen, on: d.status === 'BLOQUEADA', text: d.status === 'BLOQUEADA' ? 'Cerrada' : 'Abierta' };
    case 'motion':
      return { icon: Footprints, on: d.status === 'DETECTADO', text: d.status === 'DETECTADO' ? 'Movimiento' : 'En calma' };
    default:
      return { icon: Zap, on: d.status === 'ON', text: d.status };
  }
};

export function useTwinSnapshot() {
  const { processes, devices, alerts, memoryStats, energyReport, metrics, robotTargetRoom } = useSystem();
  return useMemo(
    () =>
      deriveTwinState({
        processes,
        devices,
        alerts,
        memoryStats,
        energyReport,
        batteryPercent: metrics.batteryPercent,
        cpuUsage: metrics.cpuUsage,
        robotTargetRoom,
      }),
    [processes, devices, alerts, memoryStats, energyReport, metrics.batteryPercent, metrics.cpuUsage, robotTargetRoom]
  );
}

/** Encender o apagar un dispositivo respetando los permisos del perfil. */
function useDeviceToggle() {
  const { toggleDevice, addLog } = useSystem();
  const { role, checkPermission } = useAuth();
  return (d) => {
    const guestBlocked = role === 'GUEST' && (!d.isCommonArea || d.type === 'lock' || d.type === 'camera');
    if (guestBlocked) {
      sfx.error();
      checkPermission('USER', `Cambiar "${d.name}"`, addLog);
      return;
    }
    sfx.move();
    toggleDevice(d.id);
  };
}

const greeting = (date) => {
  const h = date.getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
};

const ROLE_NAME = { ADMIN: 'Administrador', USER: 'Residente', GUEST: 'Invitado' };

/* ── Plano de la casa ── */
export const HousePlan = ({ twin, selectedRoom, onSelectRoom, robotRoom = null, transitionMs = 1400, caption = null }) => {
  const { devices } = useSystem();
  const toggle = useDeviceToggle();
  const room = robotRoom || twin.robot.currentRoom || 'base';
  const spot = ROBOT_SPOT[room] || ROBOT_SPOT.base;
  const alarm = twin.globalAlerts.count > 0;

  return (
    <div className="relative w-full aspect-[1000/620]">
      <svg viewBox="0 0 1000 620" className="absolute inset-0 w-full h-full" aria-hidden="true">
        <defs>
          {Object.entries(ROOMS).map(([id, r]) => (
            <linearGradient key={id} id={`room-${id}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={r.from} stopOpacity="0.9" />
              <stop offset="1" stopColor={r.to} stopOpacity="0.9" />
            </linearGradient>
          ))}
          <radialGradient id="lamp">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {Object.entries(ROOMS).map(([id, r]) => {
          const state = twin.rooms[id] || {};
          const selected = selectedRoom === id;
          return (
            <g key={id}>
              <rect
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                rx="34"
                fill={`url(#room-${id})`}
                opacity={state.hasLightOn || id === 'exterior' || id === 'base' ? 1 : 0.62}
                stroke={state.hasAlert ? '#ff5c7a' : selected ? '#3de0ff' : 'rgba(255,255,255,0.18)'}
                strokeWidth={selected || state.hasAlert ? 4 : 1.5}
              />
              {state.hasLightOn && (
                <ellipse cx={r.x + r.w / 2} cy={r.y + r.h / 2} rx={r.w * 0.55} ry={r.h * 0.5} fill="url(#lamp)" />
              )}
            </g>
          );
        })}

        {/* Muebles: formas suaves para que se lea como una casa */}
        <g fill="#ffffff" opacity="0.16">
          {/* salón: sofá, alfombra y mesa */}
          <rect x="420" y="250" width="200" height="56" rx="22" />
          <rect x="400" y="236" width="40" height="76" rx="18" />
          <rect x="600" y="236" width="40" height="76" rx="18" />
          <ellipse cx="520" cy="200" rx="80" ry="26" />
          {/* cocina: mesón y mesa con sillas */}
          <rect x="776" y="190" width="36" height="116" rx="12" />
          <circle cx="900" cy="290" r="26" />
          <circle cx="900" cy="246" r="10" />
          <circle cx="944" cy="290" r="10" />
          {/* jardín: árboles y camino */}
          <circle cx="240" cy="90" r="34" />
          <circle cx="280" cy="140" r="24" />
          <circle cx="60" cy="236" r="20" />
          <rect x="160" y="250" width="40" height="36" rx="10" />
          {/* entrada: tapete y perchero */}
          <rect x="44" y="470" width="44" height="90" rx="12" />
          <circle cx="290" cy="560" r="16" />
          {/* base: plataforma de carga */}
          <circle cx="660" cy="490" r="54" fill="none" stroke="#ffffff" strokeWidth="6" />
          <circle cx="660" cy="490" r="30" fill="none" stroke="#ffffff" strokeWidth="4" />
          <rect x="880" y="380" width="70" height="190" rx="14" />
          <rect x="400" y="520" width="150" height="40" rx="14" />
        </g>
      </svg>

      {/* Nombres de las habitaciones: tocar una muestra sus detalles */}
      {Object.entries(ROOMS).map(([id, r]) => (
        <button
          key={id}
          onClick={() => {
            sfx.move();
            onSelectRoom(id);
          }}
          aria-pressed={selectedRoom === id}
          className={`os-focus absolute px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-[13px] font-semibold backdrop-blur transition-colors ${
            selectedRoom === id ? 'bg-white text-[#2a17a8]' : 'bg-white/15 text-white hover:bg-white/25'
          }`}
          style={{ left: pct(r.x + 18, 1000), top: pct(r.y + 16, 620) }}
        >
          {r.name}
        </button>
      ))}

      {/* Dispositivos */}
      {devices.map((d) => {
        const at = DEVICE_SPOT[d.id];
        if (!at) return null;
        const v = deviceView(d);
        const Icon = v.icon;
        const offline = d.status === 'OFFLINE';
        return (
          <button
            key={d.id}
            onClick={() => toggle(d)}
            title={`${d.name}: ${v.text}. Toca para cambiar.`}
            aria-label={`${d.name}: ${v.text}`}
            className="os-focus absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 group"
            style={{ left: pct(at.x, 1000), top: pct(at.y, 620) }}
          >
            <span
              className={`w-8 h-8 sm:w-11 sm:h-11 rounded-full grid place-items-center transition-all group-hover:scale-110 ${
                offline
                  ? 'bg-[#2a1f55] text-[var(--os-mute)] ring-2 ring-[var(--os-alert)]'
                  : v.on
                    ? 'bg-white text-[#3b1fc2] shadow-[0_0_22px_rgba(255,255,255,0.65)]'
                    : 'bg-[#1b1250]/70 text-white/80 ring-1 ring-white/30'
              }`}
            >
              <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
            </span>
            <span className="hidden sm:inline px-2 py-0.5 rounded-full bg-[#120a35]/60 text-[11px] text-white whitespace-nowrap">
              {offline ? 'Sin conexión' : v.text}
            </span>
          </button>
        );
      })}

      {/* El robot */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 transition-[left,top] ease-in-out motion-reduce:transition-none pointer-events-none"
        style={{ left: pct(spot.x, 1000), top: pct(spot.y, 620), transitionDuration: `${transitionMs}ms` }}
      >
        <span
          className={`absolute inset-0 -m-3 rounded-full blur-md ${alarm ? 'bg-[var(--os-alert)]/60' : 'bg-[var(--os-signal)]/50'}`}
        />
        {caption && (
          <span className="absolute left-1/2 -translate-x-1/2 -top-8 px-2.5 py-1 rounded-full bg-white text-[#2a17a8] text-[11px] font-semibold whitespace-nowrap shadow-lg">
            {caption}
          </span>
        )}
        <RobotMascot size={56} bob={false} mood={alarm ? 'alert' : 'ok'} className="relative w-9 h-10 sm:w-14 sm:h-[62px]" />
      </div>
    </div>
  );
};

/* ── Lo que dice RX-1 ── */
const Assistant = ({ twin, onSelectRoom }) => {
  const { devices, metrics } = useSystem();
  const { role } = useAuth();
  const { openApp } = useDesktop();
  const toggle = useDeviceToggle();

  const room = ROOM_NAMES[twin.robot.currentRoom] || 'la base de carga';
  const proc = twin.robot.runningProcess;
  const alerts = twin.globalAlerts.count;
  const lowBattery = metrics.batteryPercent < 25;
  const mood = alerts ? 'alert' : lowBattery ? 'low' : 'ok';

  const lightsOn = devices.filter((d) => d.type === 'light' && d.status === 'ON');
  const door = devices.find((d) => d.type === 'lock');

  let message;
  if (alerts) message = `Tengo ${alerts} alerta${alerts > 1 ? 's' : ''} sin resolver. Te recomiendo revisarlas.`;
  else if (lowBattery) message = `Me queda ${metrics.batteryPercent} % de batería. Pronto iré a la base de carga.`;
  else if (proc) message = `Estoy en ${room} atendiendo ${proc.name.replace(/_/g, ' ')}.`;
  else message = `Estoy en ${room} esperando instrucciones.`;

  const actions = [];
  if (alerts && role !== 'GUEST') actions.push({ label: 'Ver alertas', run: () => openApp('logs-alerts') });
  if (role !== 'GUEST') actions.push({ label: 'Revisar el sistema', run: () => openApp('diagnostico') });
  if (lightsOn.length) actions.push({ label: `Apagar ${lightsOn.length === 1 ? 'la luz' : `las ${lightsOn.length} luces`}`, run: () => lightsOn.forEach(toggle) });
  if (door && door.status !== 'BLOQUEADA') actions.push({ label: 'Cerrar la puerta', run: () => toggle(door) });
  actions.push({ label: `Ir a ${room}`, run: () => onSelectRoom(twin.robot.currentRoom || 'base') });

  return (
    <section className="relative flex items-end gap-3" aria-label="Asistente RX-1">
      <RobotMascot size={112} mood={mood} className="shrink-0 -mb-2" />
      <div className="flex-1 min-w-0">
        <div className="relative px-4 py-3 rounded-2xl rounded-bl-sm bg-gradient-to-br from-[var(--os-blue)] to-[var(--os-violet)] text-white shadow-[0_14px_34px_rgba(91,63,240,0.35)]">
          <p className="text-[13px] font-semibold text-white/75">RX-1</p>
          <p className="text-[15px] leading-snug" aria-live="polite">{message}</p>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {actions.slice(0, 3).map((a) => (
            <button
              key={a.label}
              onClick={a.run}
              className="os-focus px-3 h-8 rounded-full bg-white hover:bg-[var(--os-panel-2)] border border-[var(--os-line)] text-[13px] text-[var(--os-ink)]"
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ── Detalle de una habitación ── */
const RoomPanel = ({ twin, roomId, onClose }) => {
  const toggle = useDeviceToggle();
  const { devices, metrics, isCharging, chargeRobot, startCharging, stopCharging } = useSystem();
  const r = ROOMS[roomId];
  const state = twin.rooms[roomId] || { processes: [] };
  const roomDevices = devices.filter((d) => DEVICE_ROOM[d.id] === roomId);
  const tasks = (state.processes || []).filter((p) => p.state !== 'TERMINATED');
  const robotHere = twin.robot.currentRoom === roomId;

  return (
    <section className="os-swap rounded-3xl p-5 bg-white border border-[var(--os-line)] shadow-[0_20px_50px_rgba(60,40,160,0.10)]" aria-label={`Habitación ${r.name}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="os-display text-2xl font-bold italic">{r.name}</h2>
          <p className="text-sm text-[var(--os-mute)]">
            {robotHere ? 'RX-1 está aquí ahora.' : 'RX-1 no está en esta habitación.'}
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} className="os-focus text-sm text-[var(--os-signal)] hover:underline px-2 py-1 rounded-full">
            Seguir a RX-1
          </button>
        )}
      </div>

      {roomId !== 'base' && (
        <button
          type="button"
          onClick={chargeRobot}
          className="os-focus mt-4 w-full flex items-center justify-center gap-2 rounded-xl border border-[#ead8e2] bg-[#fff9fc] px-3 py-2.5 text-sm font-semibold text-[#927487] transition hover:bg-[#fdf1f6]"
        >
          <BatteryCharging className="h-4 w-4 text-[#e5bfd0]" />
          Enviar RX-1 a la base de carga
        </button>
      )}

      <h3 className="mt-4 mb-2 text-sm font-semibold">Dispositivos</h3>
      {roomDevices.length === 0 ? (
        <p className="text-sm text-[var(--os-mute)]">No hay dispositivos en esta habitación.</p>
      ) : (
        <ul className="space-y-2">
          {roomDevices.map((d) => {
            const v = deviceView(d);
            const Icon = v.icon;
            return (
              <li key={d.id}>
                <button
                  onClick={() => toggle(d)}
                  className="os-focus w-full flex items-center gap-3 p-2.5 rounded-2xl bg-[var(--os-panel-2)] hover:bg-[#ebe6ff] text-left"
                >
                  <span className={`w-9 h-9 rounded-full grid place-items-center ${v.on ? 'bg-[var(--os-signal)] text-white' : 'bg-white text-[var(--os-mute)]'}`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate">{d.name}</span>
                    <span className="block text-xs text-[var(--os-mute)]">{v.text}</span>
                  </span>
                  <span
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors ${v.on ? 'bg-[var(--os-signal)]' : 'bg-[#d9d3f5]'}`}
                    aria-hidden="true"
                  >
                    <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${v.on ? 'translate-x-5' : ''}`} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {roomId === 'base' && (
        <div className="mt-4 rounded-2xl border border-[#eee0e7] bg-gradient-to-br from-white via-white to-[#fffafd] p-4 shadow-[0_6px_18px_rgba(190,150,170,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <BatteryCharging className="h-4 w-4 text-[#e5bfd0]" />
                Carga de RX-1
              </div>
              <p className="mt-1 text-xs text-[var(--os-mute)]">
                {robotHere
                  ? (isCharging ? 'Cargando poco a poco en la base…' : 'RX-1 está en la base. Puedes iniciar la carga cuando quieras.')
                  : 'La carga estará disponible cuando RX-1 llegue a la base.'}
              </p>
            </div>
            <span className="text-lg font-bold tabular-nums">{metrics.batteryPercent}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#f7eff3]">
            <div className="h-full rounded-full bg-gradient-to-r from-[#f0dce6] to-[#e5bfd0] transition-all duration-500" style={{ width: `${metrics.batteryPercent}%` }} />
          </div>
          <button
            type="button"
            disabled={!robotHere || (!isCharging && metrics.batteryPercent >= 100)}
            onClick={isCharging ? stopCharging : startCharging}
            className="os-focus mt-3 w-full rounded-xl border border-[#ead8e2] bg-white px-3 py-2 text-sm font-semibold text-[#927487] transition hover:bg-[#fff7fa] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isCharging ? 'Detener carga' : metrics.batteryPercent >= 100 ? 'Batería completa' : 'Iniciar carga'}
          </button>
        </div>
      )}

      <h3 className="mt-4 mb-2 text-sm font-semibold">Tareas del robot aquí</h3>
      {tasks.length === 0 ? (
        <p className="text-sm text-[var(--os-mute)]">Ninguna tarea asignada.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {tasks.map((p) => (
            <li key={p.id} className="px-3 py-1 rounded-full bg-[var(--os-panel-2)] text-xs">
              {p.name.replace(/_/g, ' ')}{' '}
              <span className={p.state === 'RUNNING' ? 'text-[var(--os-ok)]' : 'text-[var(--os-mute)]'}>
                {p.state === 'RUNNING' ? 'en curso' : p.state === 'READY' ? 'en cola' : p.state === 'WAITING' ? 'en espera' : 'nueva'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

/* ── Resumen de la casa ── */
const Summary = () => {
  const { devices, metrics } = useSystem();
  const { role } = useAuth();
  const temp = devices.find((d) => d.type === 'climate')?.temperature;
  const door = devices.find((d) => d.type === 'lock');
  const lights = devices.filter((d) => d.type === 'light' && d.status === 'ON').length;
  const online = devices.filter((d) => d.status !== 'OFFLINE').length;

  const items = [
    { icon: Thermometer, label: 'Temperatura', value: temp !== undefined ? `${temp} °C` : 'Sin dato' },
    { icon: door?.status === 'BLOQUEADA' ? ShieldCheck : LockOpen, label: 'Puerta', value: door?.status === 'BLOQUEADA' ? 'Cerrada' : 'Abierta', warn: door?.status !== 'BLOQUEADA' },
    { icon: Lightbulb, label: 'Luces', value: lights ? `${lights} encendida${lights > 1 ? 's' : ''}` : 'Apagadas' },
    { icon: BatteryMedium, label: 'Batería de RX-1', value: `${metrics.batteryPercent} %`, warn: metrics.batteryPercent < 25 },
  ];
  if (role !== 'GUEST') items.push({ icon: Cpu, label: 'Sistema CPU', value: `CPU ${metrics.cpuUsage} % · ${online}/${devices.length} equipos`, stable: true });

  return (
    <ul className="flex flex-wrap gap-2" aria-label="Resumen de la casa">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <li key={it.label} className={`flex items-center gap-2.5 pl-2 pr-4 py-2 rounded-full bg-white border border-[var(--os-line)] shadow-[0_4px_14px_rgba(60,40,160,0.06)] ${it.stable ? 'w-[240px] shrink-0' : ''}`}>
            <span className={`w-8 h-8 rounded-full grid place-items-center ${it.warn ? 'bg-[var(--os-alert)] text-white' : 'bg-[var(--os-panel-2)] text-[var(--os-signal)]'}`}>
              <Icon className="w-4 h-4" />
            </span>
            <span className="leading-tight">
              <span className="block text-[11px] text-[var(--os-mute)]">{it.label}</span>
              <span className={`block text-sm font-semibold ${it.stable ? 'whitespace-nowrap tabular-nums' : ''}`}>{it.value}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
};

export const HomeScreen = () => {
  const { role } = useAuth();
  const twin = useTwinSnapshot();
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="absolute inset-0 pt-14 pb-32 overflow-y-auto">
      <div className="mx-auto max-w-[1500px] px-4 sm:px-8 grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)] items-start">
        <div className="space-y-5 min-w-0">
          <header>
            <h1 className="os-display text-3xl sm:text-5xl font-bold italic tracking-tight">
              {greeting(now)}, {ROLE_NAME[role].toLowerCase()}
            </h1>
            <p className="mt-1 text-sm sm:text-base text-[var(--os-mute)]">
              Toca un dispositivo para encenderlo o apagarlo, o una habitación para ver qué pasa ahí.
            </p>
          </header>
          <Summary />
          <div className="rounded-[32px] p-3 sm:p-4 bg-[var(--os-panel-2)] border border-[var(--os-line)] shadow-[0_30px_80px_rgba(60,40,160,0.12)]">
            <HousePlan twin={twin} selectedRoom={selectedRoom} onSelectRoom={setSelectedRoom} />
          </div>
        </div>

        <aside className="space-y-5 lg:pt-24">
          <Assistant twin={twin} onSelectRoom={setSelectedRoom} />
          <RoomPanel
            key={selectedRoom || 'robot'}
            twin={twin}
            roomId={selectedRoom || twin.robot.currentRoom || 'base'}
            onClose={selectedRoom ? () => setSelectedRoom(null) : null}
          />
        </aside>
      </div>
    </div>
  );
};

export default HomeScreen;
