/**
 * TwinPage.jsx — Pantalla "Gemelo Digital" de RobotOS SmartHome
 *
 * Fase 1: plano de la casa con estados reales del SO, robot en su base.
 * Fase 2 (pendiente): movimiento tick a tick del scheduler.
 *
 * Autora: Mafe (feature/gemelo-mafe)
 */
import React, { useMemo } from 'react';
import { useSystem } from '../context/SystemContext';
import { useAuth } from '../context/AuthContext';
import { deriveTwinState } from '../components/twin/TwinEngine';
import { HousePlanSVG } from '../components/twin/HousePlanSVG';
import { RobotPanel } from '../components/twin/RobotPanel';
import { ESTADOS } from '../../procesos-cpu/src/proceso.js';

export const TwinPage = () => {
  const {
    processes,
    devices,
    alerts,
    memoryStats,
    energyReport,
    systemSettings,
  } = useSystem();

  const { role } = useAuth();

  // ── Derivar el estado del gemelo (función pura, sin efectos secundarios) ──
  const twinState = useMemo(
    () =>
      deriveTwinState({
        processes,
        devices,
        alerts,
        memoryStats,
        energyReport,
        systemSettings,
      }),
    [processes, devices, alerts, memoryStats, energyReport, systemSettings]
  );

  // ── Proceso RUNNING actual ────────────────────────────────────────────────
  const runningProcess = processes.find((p) => p.state === ESTADOS.RUNNING);
  const activeAlerts   = alerts.filter((a) => a.state === 'Activa');

  return (
    <div className="space-y-5">
      {/* ── Encabezado ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            🤖 Gemelo Digital
            <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60">
              FASE 1
            </span>
          </h2>
          <p className="text-xs text-slate-400">
            Representación virtual de RobotOS SmartHome — estado en tiempo real del sistema operativo.
          </p>
        </div>

        {/* Estado global rápido */}
        <div className="flex items-center gap-3 flex-wrap">
          {runningProcess && (
            <div className="px-3 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-700/50 text-xs font-mono text-emerald-300">
              <span className="text-emerald-500">▶ RUNNING: </span>
              {runningProcess.name}
            </div>
          )}
          {activeAlerts.length > 0 && (
            <div className="px-3 py-1.5 rounded-xl bg-red-950/40 border border-red-700/50 text-xs font-mono text-red-300 animate-pulse">
              ⚠️ {activeAlerts.length} alerta{activeAlerts.length > 1 ? 's' : ''} activa{activeAlerts.length > 1 ? 's' : ''}
            </div>
          )}
          <div className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-400">
            Rol: <span className="font-bold">{role}</span>
          </div>
        </div>
      </div>

      {/* ── Aviso fase 1 ── */}
      <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-800/40 text-xs text-cyan-300 font-mono">
        <span className="font-bold">Fase 1 activa:</span> El plano muestra los estados en tiempo real. El movimiento del robot
        tick a tick (con el scheduler de Sofia) se agrega en la Fase 2.
      </div>

      {/* ── Contenido principal ── */}
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Plano de la casa — panel grande */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Plano de la Casa RobotOS</h3>
            <div className="text-[11px] font-mono text-slate-500">
              Scheduler: <span className="text-cyan-400">{systemSettings?.scheduler_algorithm || 'PRIORIDAD'}</span>
              {systemSettings?.rr_quantum && systemSettings.scheduler_algorithm === 'ROUND_ROBIN' &&
                <span className="text-slate-400"> (Q={systemSettings.rr_quantum})</span>
              }
            </div>
          </div>
          <HousePlanSVG twinState={twinState} />

          {/* ── Tabla de causa-efecto activa ── */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wide">
              Efectos activos en el gemelo
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {twinState?.deviceStates?.map((dev) => (
                <div
                  key={dev.id}
                  className="flex items-center gap-2 text-[11px] font-mono text-slate-400"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: dev.dotColor }}
                  />
                  <span className="text-white">{dev.icon}</span>
                  <span className="truncate">{dev.name}</span>
                  <span className="ml-auto shrink-0" style={{ color: dev.dotColor }}>
                    {dev.status}
                  </span>
                  {dev.responsibleProcess && (
                    <span className="shrink-0 opacity-60">← {dev.responsibleProcess}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Panel del robot — lateral derecho */}
        <div className="lg:w-56 shrink-0 space-y-4">
          <h3 className="text-sm font-bold text-white">Estado del Robot</h3>
          <RobotPanel robot={twinState?.robot} summary={twinState?.summary} />

          {/* Resumen de procesos por habitación */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wide">
              Procesos por zona
            </h4>
            {Object.entries(twinState?.rooms || {}).map(([roomId, room]) => {
              if (!room.processes?.length) return null;
              const stateColor = {
                RUNNING: '#10B981', READY: '#F59E0B',
                WAITING: '#F97316', NEW: '#3B82F6',
                TERMINATED: '#475569', FALLA: '#EF4444',
              }[room.hasAlert ? 'FALLA' : room.dominantState] || '#475569';

              const roomNames = {
                salon: 'Salón', cocina: 'Cocina',
                entrada: 'Entrada', base: 'Base', exterior: 'Exterior',
              };

              return (
                <div key={roomId} className="text-[11px] font-mono">
                  <div className="flex items-center gap-1 text-slate-500 mb-0.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: stateColor }}
                    />
                    {roomNames[roomId]}
                  </div>
                  {room.processes.map((p) => (
                    <div key={p.id} className="pl-3 flex justify-between">
                      <span className="text-slate-400 truncate">{p.name}</span>
                      <span style={{ color: stateColor }} className="ml-1 shrink-0">{p.state}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Alertas activas */}
          {activeAlerts.length > 0 && (
            <div className="p-3 rounded-xl bg-red-950/20 border border-red-700/40 space-y-1">
              <div className="text-xs font-bold text-red-400 uppercase">Alertas activas</div>
              {activeAlerts.map((a, i) => (
                <div key={i} className="text-[10px] font-mono text-red-300 truncate">
                  ⚠️ {a.title}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
