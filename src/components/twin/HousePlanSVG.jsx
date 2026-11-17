/**
 * HousePlanSVG.jsx — Plano SVG 2D de la casa de RobotOS SmartHome
 *
 * Muestra las habitaciones, dispositivos, el robot con movimiento animado,
 * y los avisos reactivos de fallos inyectados (Pérdida de comunicación, Deadlock,
 * Sobrecarga de CPU, Corrupción de memoria, Acceso no autorizado).
 */
import React from 'react';
import { STATE_COLORS, ROOM_FILL, GUEST_VISIBLE_DEVICES } from './TwinEngine';

// ─── Layout de habitaciones (viewBox 800×500) ────────────────────────────────
const ROOMS_LAYOUT = {
  salon:    { x: 10,  y: 10,  w: 310, h: 240, label: 'Salón',         labelX: 165, labelY: 32, icon: '🛋️' },
  cocina:   { x: 330, y: 10,  w: 230, h: 240, label: 'Cocina',        labelX: 445, labelY: 32, icon: '🍳' },
  exterior: { x: 570, y: 10,  w: 220, h: 240, label: 'Exterior',      labelX: 680, labelY: 32, icon: '🌿' },
  entrada:  { x: 10,  y: 260, w: 390, h: 230, label: 'Entrada',       labelX: 205, labelY: 282,icon: '🚪' },
  base:     { x: 410, y: 260, w: 380, h: 230, label: 'Base de Carga', labelX: 600, labelY: 282,icon: '🔋' },
};

// ─── Posición centro de cada dispositivo ────────────────────────────────────
const DEVICE_POSITIONS = {
  d1: { cx: 100, cy: 140 },  // Luces Salón
  d6: { cx: 240, cy: 185 },  // Termostato
  d2: { cx: 445, cy: 150 },  // Luces Cocina
  d3: { cx: 160, cy: 375 },  // Sensor Movimiento
  d5: { cx: 300, cy: 420 },  // Cerradura
  d4: { cx: 650, cy: 140 },  // Cámara
};

// ─── Centro del robot en cada habitación ────────────────────────────────────
export const ROBOT_ROOM_POS = {
  salon:    { cx: 190, cy: 190 },
  cocina:   { cx: 440, cy: 190 },
  exterior: { cx: 670, cy: 185 },
  entrada:  { cx: 220, cy: 430 },
  base:     { cx: 595, cy: 405 },
};

// ─── Leyenda ────────────────────────────────────────────────────────────────
const LEGEND_ITEMS = [
  { color: STATE_COLORS.RUNNING,    label: 'RUNNING'   },
  { color: STATE_COLORS.READY,      label: 'READY'     },
  { color: STATE_COLORS.WAITING,    label: 'WAITING'   },
  { color: STATE_COLORS.NEW,        label: 'NEW'       },
  { color: STATE_COLORS.FALLA,      label: 'FALLA'     },
  { color: STATE_COLORS.TERMINATED, label: 'TERMINADO' },
];

export const HousePlanSVG = ({
  twinState,
  robotRoom = 'base',
  transitionMs = 900,
  role = 'ADMIN',
  playbackTick = null,
  playbackProcess = null,
}) => {
  if (!twinState) return null;

  const { rooms, deviceStates, globalAlerts } = twinState;
  const isGuest = role === 'GUEST';

  const robotPos = ROBOT_ROOM_POS[robotRoom] || ROBOT_ROOM_POS.base;

  const visibleDevices = isGuest
    ? (deviceStates || []).filter((d) => GUEST_VISIBLE_DEVICES.has(d.id))
    : (deviceStates || []);

  return (
    <div className="w-full space-y-3">
      {/* ── SVG del plano ── */}
      <svg
        viewBox="0 0 800 500"
        className="w-full rounded-2xl border border-slate-800 bg-slate-950"
        aria-label="Plano de la casa RobotOS SmartHome — Gemelo Digital"
        style={{ maxHeight: '60vh' }}
      >
        <defs>
          <filter id="glow-green" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <radialGradient id="light-on" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#FEF9C3" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#FEF9C3" stopOpacity="0"    />
          </radialGradient>
          <radialGradient id="robot-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#06B6D4" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#06B6D4" stopOpacity="0"   />
          </radialGradient>
        </defs>

        {/* Destello rojo global en acceso no autorizado */}
        {globalAlerts?.hasUnauthorized && (
          <rect x="0" y="0" width="800" height="500" fill="rgba(239,68,68,0.07)" rx="16">
            <animate attributeName="opacity" values="1;0;1" dur="0.5s" repeatCount="indefinite" />
          </rect>
        )}

        {/* ── Habitaciones ── */}
        {Object.entries(ROOMS_LAYOUT).map(([roomId, layout]) => {
          const room   = rooms?.[roomId] || {};
          const state  = room.hasAlert ? 'FALLA' : (room.dominantState || 'TERMINATED');
          const fill   = ROOM_FILL[state]        || ROOM_FILL.TERMINATED;
          const stroke = STATE_COLORS[state]     || STATE_COLORS.TERMINATED;
          const isRunning = state === 'RUNNING';
          const guestHidden = isGuest && (roomId === 'entrada' || roomId === 'exterior');

          return (
            <g key={roomId} opacity={guestHidden ? 0.25 : 1}>
              <rect
                x={layout.x} y={layout.y} width={layout.w} height={layout.h}
                rx="10" fill={fill} stroke={stroke} strokeWidth={isRunning ? 2.5 : 1.5}
              >
                {isRunning && (
                  <animate attributeName="stroke-opacity" values="1;0.35;1" dur="2s" repeatCount="indefinite" />
                )}
              </rect>

              {/* Luz ambiente */}
              {room.hasLightOn && (
                <rect x={layout.x+1} y={layout.y+1} width={layout.w-2} height={layout.h-2}
                  rx="9" fill="url(#light-on)" pointerEvents="none" />
              )}

              {/* Título de habitación */}
              <text x={layout.labelX} y={layout.labelY}
                textAnchor="middle" fontSize="13" fontWeight="700"
                fill={stroke} fontFamily="ui-monospace, monospace" opacity="0.9"
              >
                {layout.icon} {layout.label}
              </text>

              {/* Procesos (ocultos para GUEST) */}
              {!isGuest && room.processes?.map((proc, i) => (
                <g key={proc.id}>
                  <rect
                    x={layout.x + 8 + i * 110} y={layout.y + 42}
                    width={100} height={22} rx="4"
                    fill="#0F172A" stroke={STATE_COLORS[proc.state] || '#374151'} strokeWidth="1"
                  />
                  <text
                    x={layout.x + 58 + i * 110} y={layout.y + 57}
                    textAnchor="middle" fontSize="9" fill="#CBD5E1" fontFamily="monospace"
                  >
                    {proc.name}
                  </text>
                  <circle
                    cx={layout.x + 14 + i * 110} cy={layout.y + 53}
                    r="4" fill={STATE_COLORS[proc.state] || '#374151'}
                  >
                    {proc.state === 'RUNNING' && (
                      <animate attributeName="opacity" values="1;0.3;1" dur="1s" repeatCount="indefinite" />
                    )}
                  </circle>
                </g>
              ))}

              {/* Badge de falla */}
              {room.hasAlert && (
                <text x={layout.x + layout.w - 16} y={layout.y + 22}
                  textAnchor="middle" fontSize="14">
                  ⚠️
                  <animate attributeName="opacity" values="1;0.2;1" dur="0.7s" repeatCount="indefinite" />
                </text>
              )}
            </g>
          );
        })}

        {/* ── Dispositivos ── */}
        {visibleDevices.map((dev) => {
          const pos = DEVICE_POSITIONS[dev.id];
          if (!pos) return null;

          return (
            <g key={dev.id}>
              {dev.type === 'light' && dev.status === 'ON' && (
                <circle cx={pos.cx} cy={pos.cy} r="38" fill="url(#light-on)" />
              )}
              {dev.type === 'motion' && dev.status === 'DETECTADO' && (
                <circle cx={pos.cx} cy={pos.cy} r="32" fill="rgba(245,158,11,0.15)">
                  <animate attributeName="r"       values="28;40;28" dur="1s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.6;0.1;0.6" dur="1s" repeatCount="indefinite" />
                </circle>
              )}
              <circle cx={pos.cx} cy={pos.cy} r="22"
                fill={dev.dimmed ? '#0F172A' : '#1E293B'}
                stroke={dev.dotColor} strokeWidth="2"
                opacity={dev.dimmed ? 0.5 : 1}
              >
                {dev.pulsing && (
                  <animate attributeName="stroke-opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite" />
                )}
              </circle>
              <text x={pos.cx} y={pos.cy + 6} textAnchor="middle" fontSize="18"
                opacity={dev.dimmed ? 0.4 : 1}>
                {dev.icon}
              </text>
              <circle cx={pos.cx + 15} cy={pos.cy - 15} r="5"
                fill={dev.dotColor} stroke="#0F172A" strokeWidth="1.5" />
              <text x={pos.cx} y={pos.cy + 36}
                textAnchor="middle" fontSize="8" fill="#94A3B8" fontFamily="monospace">
                {dev.type === 'climate' ? dev.status : dev.name.split(' ')[0]}
              </text>
              {!isGuest && dev.responsibleProcess && dev.procState !== 'RUNNING' && (
                <>
                  <rect x={pos.cx-22} y={pos.cy+40} width={44} height={12} rx="3"
                    fill={(STATE_COLORS[dev.procState] || '#475569') + '25'}
                    stroke={(STATE_COLORS[dev.procState] || '#475569') + '80'} strokeWidth="0.8" />
                  <text x={pos.cx} y={pos.cy+49} textAnchor="middle" fontSize="7"
                    fill={STATE_COLORS[dev.procState] || '#94A3B8'} fontFamily="monospace">
                    {dev.procState}
                  </text>
                </>
              )}
              {dev.isOffline && (
                <text x={pos.cx-12} y={pos.cy-10} fontSize="12">❌</text>
              )}
              <title>{isGuest ? `${dev.icon} ${dev.name} — ${dev.status}` : dev.tooltip}</title>
            </g>
          );
        })}

        {/* ── Robot — grupo animado con CSS transform ── */}
        <g
          style={{
            transform: `translate(${robotPos.cx}px, ${robotPos.cy}px)`,
            transition: `transform ${transitionMs}ms cubic-bezier(0.4, 0, 0.2, 1)`,
          }}
        >
          {/* Halo */}
          <circle cx={0} cy={0} r="32" fill="url(#robot-glow)" />
          {/* Sombra */}
          <ellipse cx={0} cy={28} rx="18" ry="6" fill="#000" opacity="0.35" />
          {/* Cuerpo */}
          <rect x={-14} y={-20} width="28" height="36" rx="7"
            fill="#0E7490" stroke="#06B6D4" strokeWidth="2.5">
            <animate attributeName="stroke-opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
          </rect>
          {/* Cabeza */}
          <rect x={-11} y={-38} width="22" height="20" rx="5"
            fill="#155E75" stroke="#06B6D4" strokeWidth="1.5" />
          {/* Ojos */}
          <circle cx={-5} cy={-30} r="3.5" fill="#BAE6FD">
            <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite" />
          </circle>
          <circle cx={5} cy={-30} r="3.5" fill="#BAE6FD">
            <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" begin="0.4s" repeatCount="indefinite" />
          </circle>
          {/* Antena */}
          <line x1={0} y1={-38} x2={0} y2={-48} stroke="#06B6D4" strokeWidth="2" />
          <circle cx={0} cy={-50} r="3.5" fill="#22D3EE">
            <animate attributeName="opacity" values="1;0.1;1" dur="1s" repeatCount="indefinite" />
          </circle>
          {/* Piernas */}
          <rect x={-12} y={17} width="10" height="14" rx="3" fill="#0E7490" />
          <rect x={2}   y={17} width="10" height="14" rx="3" fill="#0E7490" />
          {/* Indicador de tick durante reproducción */}
          {playbackTick !== null && (
            <>
              <rect x={-28} y={-60} width="56" height="18" rx="4"
                fill="#0F172A" stroke="#06B6D4" strokeWidth="1.2" />
              <text x={0} y={-47} textAnchor="middle" fontSize="8"
                fill="#22D3EE" fontFamily="monospace" fontWeight="700">
                t{playbackTick} · {playbackProcess || ''}
              </text>
            </>
          )}
          <title>Robot RobotOS{playbackTick !== null ? ` — Tick ${playbackTick}: ${playbackProcess}` : ''}</title>
        </g>
      </svg>

      {/* ── Leyenda (debajo del SVG) ── */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 px-2">
        {LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
            {item.label}
          </div>
        ))}
      </div>

      {/* ── Avisos de fallos globales del sistema (debajo del SVG) ── */}
      {globalAlerts?.hasCommLoss && (
        <div className="px-3 py-2 rounded-xl bg-red-950/30 border border-red-700/50 text-xs font-mono text-red-300 animate-pulse">
          ⚠️ PÉRDIDA DE COMUNICACIÓN DETECTADA — Dispositivos pueden quedar sin respuesta
        </div>
      )}
      {globalAlerts?.hasDeadlock && (
        <div className="px-3 py-2 rounded-xl bg-purple-950/40 border border-purple-700/60 text-xs font-mono text-purple-300 animate-pulse">
          🔒 INTERBLOQUEO (DEADLOCK) DETECTADO — Espera circular activa entre procesos del sistema
        </div>
      )}
      {globalAlerts?.hasCpuOverload && (
        <div className="px-3 py-2 rounded-xl bg-amber-950/40 border border-amber-700/60 text-xs font-mono text-amber-300 animate-pulse">
          🔥 SOBRECARGA CRÍTICA DE CPU (&gt;90%) — Throttling reactivo y degradación de ráfagas
        </div>
      )}
      {globalAlerts?.hasMemoryCorruption && (
        <div className="px-3 py-2 rounded-xl bg-red-950/40 border border-red-700/60 text-xs font-mono text-red-300 animate-pulse">
          💥 CORRUPCIÓN DE MEMORIA — Fallo de paridad CRC en segmento de datos RAM
        </div>
      )}
    </div>
  );
};
