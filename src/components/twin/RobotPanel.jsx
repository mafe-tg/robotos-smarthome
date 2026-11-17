/**
 * RobotPanel.jsx — Panel lateral del cuerpo del robot
 *
 * Muestra las métricas internas del robot en formato de diagrama corporal SVG.
 * Solo lee datos de TwinEngine; no escribe estado.
 */
import React from 'react';

export const RobotPanel = ({ robot, summary }) => {
  const { batteryPct, ramPct, cpuBusy, cpuUsage, hasActiveAlert, robotStatus,
          cpuColor, ramColor, batteryColor, alertColor,
          runningProcess, currentRoom } = robot || {};

  const statusLabel = {
    WORKING:  { text: 'TRABAJANDO', color: '#10B981' },
    CHARGING: { text: 'CARGANDO — BATERÍA CRÍTICA', color: '#EF4444' },
    ALERT:    { text: 'EN ALERTA',  color: '#EF4444' },
    IDLE:     { text: 'EN REPOSO',  color: '#64748B' },
  }[robotStatus] || { text: 'EN REPOSO', color: '#64748B' };

  const roomLabel = {
    salon:    'Salón',
    cocina:   'Cocina',
    entrada:  'Entrada',
    base:     'Base de carga',
    exterior: 'Exterior',
  }[currentRoom] || 'Base';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 w-full">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-bold text-white">🤖 RobotOS Unit</div>
          <div className="text-[10px] font-mono text-slate-500">SmartHome Bot v2.4</div>
        </div>
        <div
          className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono border"
          style={{ color: statusLabel.color, borderColor: statusLabel.color + '60', backgroundColor: statusLabel.color + '15' }}
        >
          {statusLabel.text}
        </div>
      </div>

      {/* SVG del robot */}
      <svg viewBox="0 0 120 180" className="w-full max-w-[120px] mx-auto" aria-label="Diagrama corporal del robot">
        {/* Cabeza / CPU */}
        <rect x="35" y="8" width="50" height="38" rx="8"
          fill="#1E293B" stroke={cpuColor} strokeWidth="2.5" />
        {/* Ojos — parpadean si alerta */}
        <circle cx="52" cy="24" r="7" fill={cpuBusy ? cpuColor : '#334155'} opacity={cpuBusy ? '1' : '0.5'}>
          {cpuBusy && <animate attributeName="opacity" values="1;0.4;1" dur="1.2s" repeatCount="indefinite" />}
        </circle>
        <circle cx="68" cy="24" r="7" fill={cpuBusy ? cpuColor : '#334155'} opacity={cpuBusy ? '1' : '0.5'}>
          {cpuBusy && <animate attributeName="opacity" values="1;0.4;1" dur="1.2s" begin="0.3s" repeatCount="indefinite" />}
        </circle>
        {/* Boca / estado */}
        <rect x="46" y="38" width="28" height="4" rx="2"
          fill={hasActiveAlert ? '#EF4444' : '#334155'}>
          {hasActiveAlert && <animate attributeName="opacity" values="1;0.3;1" dur="0.6s" repeatCount="indefinite" />}
        </rect>
        {/* Antena */}
        <line x1="60" y1="8" x2="60" y2="2" stroke={cpuColor} strokeWidth="2" />
        <circle cx="60" cy="2" r="3" fill={cpuColor}>
          <animate attributeName="opacity" values="1;0.2;1" dur="2s" repeatCount="indefinite" />
        </circle>
        {/* Etiqueta CPU */}
        <text x="60" y="30" textAnchor="middle" fontSize="7" fill="#94A3B8" fontFamily="monospace">
          {cpuUsage ? `${cpuUsage}%` : 'CPU'}
        </text>

        {/* Torso / RAM */}
        <rect x="25" y="52" width="70" height="52" rx="6"
          fill="#1E293B" stroke={ramColor} strokeWidth="2" />
        {/* Barra de RAM */}
        <rect x="30" y="62" width="60" height="8" rx="3" fill="#0F172A" />
        <rect x="30" y="62" width={Math.round(60 * (ramPct / 100))} height="8" rx="3" fill={ramColor} />
        <text x="60" y="69" textAnchor="middle" fontSize="6" fill="#E2E8F0" fontFamily="monospace">RAM {ramPct}%</text>
        {/* Corazón / energía */}
        <text x="60" y="92" textAnchor="middle" fontSize="18">
          {robot?.batteryCritical ? '🔋' : '❤️'}
        </text>
        {/* Latido del corazón */}
        <text x="60" y="92" textAnchor="middle" fontSize="18" opacity="0">
          <animate attributeName="opacity" values="0;0.4;0" dur="1s" repeatCount="indefinite" />
          {robot?.batteryCritical ? '🔋' : '❤️'}
        </text>
        {/* Etiqueta scheduler */}
        <text x="60" y="104" textAnchor="middle" fontSize="6" fill="#64748B" fontFamily="monospace">
          {summary?.algorithm || 'PRIORIDAD'}
        </text>

        {/* Brazo izquierdo */}
        <rect x="5" y="55" width="18" height="38" rx="6"
          fill="#1E293B" stroke={alertColor} strokeWidth="1.5" />
        <text x="14" y="77" textAnchor="middle" fontSize="10">⚠️</text>

        {/* Brazo derecho */}
        <rect x="97" y="55" width="18" height="38" rx="6"
          fill="#1E293B" stroke="#334155" strokeWidth="1.5" />
        <text x="106" y="74" textAnchor="middle" fontSize="8">🔧</text>

        {/* Piernas */}
        <rect x="34" y="110" width="22" height="40" rx="5"
          fill="#1E293B" stroke={robot?.batteryCritical ? '#EF4444' : '#334155'} strokeWidth="1.5" />
        <rect x="64" y="110" width="22" height="40" rx="5"
          fill="#1E293B" stroke={robot?.batteryCritical ? '#EF4444' : '#334155'} strokeWidth="1.5" />

        {/* Pies */}
        <ellipse cx="45" cy="150" rx="14" ry="6" fill="#334155"
          stroke={robot?.batteryCritical ? '#EF4444' : '#475569'} strokeWidth="1.5" />
        <ellipse cx="75" cy="150" rx="14" ry="6" fill="#334155"
          stroke={robot?.batteryCritical ? '#EF4444' : '#475569'} strokeWidth="1.5" />
      </svg>

      {/* Métricas compactas */}
      <div className="space-y-2">
        <Metric label="CPU" value={`${cpuUsage ?? 28}%`} color={cpuColor} pct={cpuUsage ?? 28} />
        <Metric label="Batería" value={`${batteryPct ?? 0}%`} color={batteryColor} pct={batteryPct} />
        <Metric label="RAM" value={`${ramPct ?? 0}%`} color={ramColor} pct={ramPct} />
        <div className="flex justify-between text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-800">
          <span>Ubicación:</span>
          <span className="text-cyan-400 font-bold">{roomLabel}</span>
        </div>
        {runningProcess && (
          <div className="flex justify-between text-[10px] font-mono text-slate-500">
            <span>Proceso:</span>
            <span className="text-emerald-400 truncate max-w-[80px]">{runningProcess.name}</span>
          </div>
        )}
      </div>
    </div>
  );
};

const Metric = ({ label, value, color, pct }) => (
  <div>
    <div className="flex justify-between text-[10px] font-mono mb-0.5">
      <span className="text-slate-500">{label}</span>
      <span style={{ color }} className="font-bold">{value}</span>
    </div>
    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct ?? 0}%`, backgroundColor: color }} />
    </div>
  </div>
);
