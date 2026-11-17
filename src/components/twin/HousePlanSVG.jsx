/**
 * HousePlanSVG.jsx — Plano SVG 2D de la casa de RobotOS SmartHome
 *
 * Dibuja las habitaciones, los dispositivos con sus estados reales,
 * la posición actual del robot y las alertas de fallo.
 *
 * Solo recibe twinState derivado de TwinEngine; no lee SystemContext directamente.
 * Fase 1: plano estático con estados reactivos. Fase 2 añadirá movimiento del robot.
 */
import React from 'react';

// ─── Layout de habitaciones en el SVG (viewBox 800×540) ─────────────────────
const ROOMS_LAYOUT = {
  salon: {
    x: 10, y: 10, w: 310, h: 250,
    label: 'Salón',
    labelX: 165, labelY: 32,
    icon: '🛋️',
  },
  cocina: {
    x: 330, y: 10, w: 230, h: 250,
    label: 'Cocina',
    labelX: 445, labelY: 32,
    icon: '🍳',
  },
  exterior: {
    x: 570, y: 10, w: 220, h: 250,
    label: 'Exterior',
    labelX: 680, labelY: 32,
    icon: '🌿',
  },
  entrada: {
    x: 10, y: 270, w: 390, h: 260,
    label: 'Entrada',
    labelX: 205, labelY: 292,
    icon: '🚪',
  },
  base: {
    x: 410, y: 270, w: 380, h: 260,
    label: 'Base de Carga',
    labelX: 600, labelY: 292,
    icon: '🔋',
  },
};

// ─── Posición de cada dispositivo dentro de su habitación ───────────────────
const DEVICE_POSITIONS = {
  d1: { cx: 100, cy: 140 },  // Luces Salón — centro del salón
  d6: { cx: 240, cy: 180 },  // Termostato — esquina salón
  d2: { cx: 445, cy: 150 },  // Luces Cocina — centro cocina
  d3: { cx: 160, cy: 380 },  // Sensor Movimiento — entrada
  d5: { cx: 300, cy: 430 },  // Cerradura — puerta principal
  d4: { cx: 650, cy: 140 },  // Cámara — exterior
};

// ─── Posición del robot en cada habitación ────────────────────────────────────
const ROBOT_POSITIONS = {
  salon:    { cx: 180, cy: 200 },
  cocina:   { cx: 440, cy: 200 },
  exterior: { cx: 670, cy: 200 },
  entrada:  { cx: 220, cy: 450 },
  base:     { cx: 595, cy: 430 },
};

// ─── Colores de habitación por estado dominante ───────────────────────────────
const ROOM_FILL = {
  RUNNING:    '#0F2A1A',
  READY:      '#1C1A09',
  WAITING:    '#1C1109',
  NEW:        '#0A1225',
  TERMINATED: '#111827',
  FALLA:      '#1F0A0A',
};
const ROOM_STROKE = {
  RUNNING:    '#10B981',
  READY:      '#F59E0B',
  WAITING:    '#F97316',
  NEW:        '#3B82F6',
  TERMINATED: '#374151',
  FALLA:      '#EF4444',
};

export const HousePlanSVG = ({ twinState }) => {
  if (!twinState) return null;

  const { rooms, deviceStates, robot, globalAlerts } = twinState;
  const robotPos = ROBOT_POSITIONS[robot?.currentRoom] || ROBOT_POSITIONS.base;

  return (
    <div className="w-full">
      <svg
        viewBox="0 0 800 540"
        className="w-full rounded-2xl border border-slate-800 bg-slate-950"
        aria-label="Plano de la casa RobotOS SmartHome — Gemelo Digital"
        style={{ maxHeight: '62vh' }}
      >
        {/* ── Definiciones de filtros ── */}
        <defs>
          <filter id="glow-green" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-red" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <radialGradient id="light-on" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FEF9C3" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#FEF9C3" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="robot-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#06B6D4" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ── Alerta global: destello rojo en fachada ── */}
        {globalAlerts?.hasUnauthorized && (
          <rect x="0" y="0" width="800" height="540" fill="rgba(239,68,68,0.06)" rx="16">
            <animate attributeName="opacity" values="1;0;1" dur="0.5s" repeatCount="indefinite" />
          </rect>
        )}

        {/* ── Habitaciones ── */}
        {Object.entries(ROOMS_LAYOUT).map(([roomId, layout]) => {
          const room = rooms?.[roomId] || {};
          const state = room.hasAlert ? 'FALLA' : (room.dominantState || 'TERMINATED');
          const fill   = ROOM_FILL[state]   || ROOM_FILL.TERMINATED;
          const stroke = ROOM_STROKE[state] || ROOM_STROKE.TERMINATED;
          const isRunning = state === 'RUNNING';

          return (
            <g key={roomId}>
              {/* Fondo de habitación */}
              <rect
                x={layout.x} y={layout.y} width={layout.w} height={layout.h}
                rx="10" fill={fill} stroke={stroke} strokeWidth={isRunning ? 2.5 : 1.5}
              >
                {isRunning && (
                  <animate attributeName="stroke-opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
                )}
              </rect>

              {/* Luz ambiente si hay luz encendida */}
              {room.hasLightOn && (
                <rect
                  x={layout.x + 1} y={layout.y + 1}
                  width={layout.w - 2} height={layout.h - 2}
                  rx="9" fill="url(#light-on)" pointerEvents="none"
                />
              )}

              {/* Etiqueta de la habitación */}
              <text
                x={layout.labelX} y={layout.labelY}
                textAnchor="middle" fontSize="13" fontWeight="700"
                fill={stroke} fontFamily="ui-monospace, monospace" opacity="0.9"
              >
                {layout.icon} {layout.label}
              </text>

              {/* Procesos de la habitación */}
              {room.processes?.map((proc, i) => (
                <g key={proc.id}>
                  <rect
                    x={layout.x + 8 + i * 110} y={layout.y + 42}
                    width={100} height={22} rx="4"
                    fill="#0F172A" stroke={ROOM_STROKE[proc.state] || '#374151'} strokeWidth="1"
                  />
                  <text
                    x={layout.x + 58 + i * 110} y={layout.y + 57}
                    textAnchor="middle" fontSize="9" fill="#CBD5E1" fontFamily="monospace"
                  >
                    {proc.name}
                  </text>
                  {/* Punto de estado */}
                  <circle
                    cx={layout.x + 14 + i * 110} cy={layout.y + 53}
                    r="4" fill={ROOM_STROKE[proc.state] || '#374151'}
                  >
                    {proc.state === 'RUNNING' && (
                      <animate attributeName="opacity" values="1;0.3;1" dur="1s" repeatCount="indefinite" />
                    )}
                  </circle>
                </g>
              ))}

              {/* Alerta de habitación */}
              {room.hasAlert && (
                <text
                  x={layout.x + layout.w - 16} y={layout.y + 20}
                  textAnchor="middle" fontSize="14"
                >
                  ⚠️
                  <animate attributeName="opacity" values="1;0.2;1" dur="0.7s" repeatCount="indefinite" />
                </text>
              )}
            </g>
          );
        })}

        {/* ── Dispositivos ── */}
        {deviceStates?.map((dev) => {
          const pos = DEVICE_POSITIONS[dev.id];
          if (!pos) return null;

          return (
            <g key={dev.id}>
              {/* Halo de luz si está ON */}
              {dev.type === 'light' && dev.status === 'ON' && (
                <circle cx={pos.cx} cy={pos.cy} r="38" fill="url(#light-on)" />
              )}
              {/* Halo de alerta para sensor */}
              {dev.type === 'motion' && dev.status === 'DETECTADO' && (
                <circle cx={pos.cx} cy={pos.cy} r="32" fill="rgba(245,158,11,0.15)">
                  <animate attributeName="r" values="28;38;28" dur="1s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.6;0.1;0.6" dur="1s" repeatCount="indefinite" />
                </circle>
              )}

              {/* Fondo del dispositivo */}
              <circle
                cx={pos.cx} cy={pos.cy} r="22"
                fill={dev.dimmed ? '#0F172A' : '#1E293B'}
                stroke={dev.dotColor} strokeWidth="2"
                opacity={dev.dimmed ? 0.5 : 1}
              >
                {dev.pulsing && (
                  <animate attributeName="stroke-opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite" />
                )}
              </circle>

              {/* Ícono del dispositivo */}
              <text
                x={pos.cx} y={pos.cy + 6}
                textAnchor="middle" fontSize="18"
                opacity={dev.dimmed ? 0.4 : 1}
              >
                {dev.icon}
              </text>

              {/* Punto indicador de estado */}
              <circle
                cx={pos.cx + 15} cy={pos.cy - 15} r="5"
                fill={dev.dotColor} stroke="#0F172A" strokeWidth="1.5"
              />

              {/* Etiqueta del dispositivo */}
              <text
                x={pos.cx} y={pos.cy + 36}
                textAnchor="middle" fontSize="8" fill="#94A3B8" fontFamily="monospace"
              >
                {dev.type === 'climate' ? dev.status : dev.name.split(' ')[0]}
              </text>

              {/* Estado del proceso responsable (mini-badge) */}
              {dev.responsibleProcess && dev.procState !== 'RUNNING' && (
                <rect
                  x={pos.cx - 22} y={pos.cy + 40}
                  width={44} height={12} rx="3"
                  fill={ROOM_STROKE[dev.procState] + '25'}
                  stroke={ROOM_STROKE[dev.procState] + '80'}
                  strokeWidth="0.8"
                />
              )}
              {dev.responsibleProcess && dev.procState !== 'RUNNING' && (
                <text
                  x={pos.cx} y={pos.cy + 49}
                  textAnchor="middle" fontSize="7"
                  fill={ROOM_STROKE[dev.procState] || '#94A3B8'} fontFamily="monospace"
                >
                  {dev.procState}
                </text>
              )}

              {/* Icono de desconexión si OFFLINE */}
              {dev.isOffline && (
                <text x={pos.cx - 12} y={pos.cy - 10} fontSize="12">❌</text>
              )}

              {/* Tooltip accesible */}
              <title>{dev.tooltip}</title>
            </g>
          );
        })}

        {/* ── Robot ── */}
        <g>
          {/* Halo del robot */}
          <circle cx={robotPos.cx} cy={robotPos.cy} r="30" fill="url(#robot-glow)" />
          {/* Sombra / base */}
          <ellipse cx={robotPos.cx} cy={robotPos.cy + 26} rx="18" ry="6" fill="#000" opacity="0.3" />
          {/* Cuerpo */}
          <rect x={robotPos.cx - 14} y={robotPos.cy - 20} width="28" height="34" rx="7"
            fill="#0E7490" stroke="#06B6D4" strokeWidth="2">
            <animate attributeName="stroke-opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
          </rect>
          {/* Cabeza */}
          <rect x={robotPos.cx - 11} y={robotPos.cy - 36} width="22" height="18" rx="5"
            fill="#155E75" stroke="#06B6D4" strokeWidth="1.5" />
          {/* Ojos */}
          <circle cx={robotPos.cx - 5} cy={robotPos.cy - 29} r="3.5" fill="#BAE6FD">
            <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite" />
          </circle>
          <circle cx={robotPos.cx + 5} cy={robotPos.cy - 29} r="3.5" fill="#BAE6FD">
            <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" begin="0.4s" repeatCount="indefinite" />
          </circle>
          {/* Antena */}
          <line x1={robotPos.cx} y1={robotPos.cy - 36} x2={robotPos.cx} y2={robotPos.cy - 44}
            stroke="#06B6D4" strokeWidth="2" />
          <circle cx={robotPos.cx} cy={robotPos.cy - 46} r="3" fill="#22D3EE">
            <animate attributeName="opacity" values="1;0.1;1" dur="1s" repeatCount="indefinite" />
          </circle>
          {/* Piernas */}
          <rect x={robotPos.cx - 12} y={robotPos.cy + 15} width="10" height="14" rx="3" fill="#0E7490" />
          <rect x={robotPos.cx + 2}  y={robotPos.cy + 15} width="10" height="14" rx="3" fill="#0E7490" />
          {/* Tooltip */}
          <title>
            Robot — {robot?.robotStatus || 'IDLE'}
            {robot?.runningProcess ? ` | Ejecutando: ${robot.runningProcess.name}` : ''}
          </title>
        </g>

        {/* ── Leyenda ── */}
        <g transform="translate(10, 500)">
          {[
            { color: '#10B981', label: 'RUNNING' },
            { color: '#F59E0B', label: 'READY'   },
            { color: '#F97316', label: 'WAITING'  },
            { color: '#3B82F6', label: 'NEW'      },
            { color: '#EF4444', label: 'FALLA'    },
            { color: '#475569', label: 'TERMINADO'},
          ].map((item, i) => (
            <g key={item.label} transform={`translate(${i * 125}, 0)`}>
              <circle cx="6" cy="6" r="5" fill={item.color} />
              <text x="14" y="10" fontSize="9" fill="#94A3B8" fontFamily="monospace">{item.label}</text>
            </g>
          ))}
        </g>

        {/* ── Pérdida de comunicación ── */}
        {globalAlerts?.hasCommLoss && (
          <text x="400" y="520" textAnchor="middle" fontSize="11" fill="#EF4444" fontFamily="monospace">
            ⚠️ PÉRDIDA DE COMUNICACIÓN DETECTADA
            <animate attributeName="opacity" values="1;0.3;1" dur="0.8s" repeatCount="indefinite" />
          </text>
        )}
      </svg>
    </div>
  );
};
