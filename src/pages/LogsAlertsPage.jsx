import React, { useState } from 'react';
import { useSystem } from '../context/SystemContext';
import { useAuth } from '../context/AuthContext';

export const LogsAlertsPage = () => {
  const {
    logs,
    alerts,
    resolveAlert,
    simulateSensorDisconnected,
    simulateCommLoss,
    simulateUnauthorizedAccess,
    addLog,
  } = useSystem();

  const { role, checkPermission } = useAuth();
  const [selectedLevel, setSelectedLevel] = useState('ALL');

  const filteredLogs = logs.filter((l) => {
    if (selectedLevel === 'ALL') return true;
    if (selectedLevel === 'WARNING') return l.level === 'WARNING' || l.level === 'WARN';
    return l.level === selectedLevel;
  });

  // Handlers protegidos con checkPermission exclusivo para ADMIN
  const handleSimulateSensor = () => {
    if (checkPermission('ADMIN', 'Simular falla: Sensor Desconectado', addLog)) {
      simulateSensorDisconnected();
    }
  };

  const handleSimulateComm = () => {
    if (checkPermission('ADMIN', 'Simular falla: Pérdida de Comunicación', addLog)) {
      simulateCommLoss();
    }
  };

  const handleSimulateUnauthorized = () => {
    if (checkPermission('ADMIN', 'Simular falla: Acceso No Autorizado', addLog)) {
      simulateUnauthorizedAccess();
    }
  };

  const handleResolveAlert = (alertItem) => {
    if (checkPermission('ADMIN', `Resolver alerta de falla "${alertItem.title}"`, addLog)) {
      resolveAlert(alertItem.id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white">Centro de Diagnóstico, Logs & Alertas</h2>
          <p className="text-xs text-slate-400">
            Supervisión de bitácoras del Kernel, gestión de incidentes y panel de simulación de fallos.
          </p>
        </div>
        <div className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-400">
          Rol activo: <span className="font-bold">{role}</span> (Solo ADMIN tiene permisos de simulación y resolución)
        </div>
      </div>

      {/* 1. PANEL DE SIMULACIÓN DE FALLOS */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-red-400 animate-ping"></span>
              <span>Panel de Simulación de Fallos (Exclusivo ADMIN)</span>
            </h3>
            <p className="text-xs text-slate-400">
              Cada fallo dispara alertas, entradas en el log del Kernel y una reacción activa en los procesos y dispositivos.
            </p>
          </div>
          {role !== 'ADMIN' && (
            <span className="text-[11px] font-mono text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded">
              MODO SOLO LECTURA
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={handleSimulateSensor}
            className="p-4 rounded-xl bg-slate-950 border border-amber-500/40 hover:border-amber-400 hover:bg-amber-950/20 text-left transition-all group"
          >
            <div className="flex items-center space-x-2 text-amber-400 text-xs font-bold mb-1">
              <span>⚠️</span>
              <span>Sensor Desconectado</span>
            </div>
            <p className="text-[11px] text-slate-400 group-hover:text-slate-300">
              Reacción: Alerta activa y <strong>temp_manager</strong> pasa inmediatamente a estado <strong>WAITING</strong>.
            </p>
          </button>

          <button
            onClick={handleSimulateComm}
            className="p-4 rounded-xl bg-slate-950 border border-orange-500/40 hover:border-orange-400 hover:bg-orange-950/20 text-left transition-all group"
          >
            <div className="flex items-center space-x-2 text-orange-400 text-xs font-bold mb-1">
              <span>📡</span>
              <span>Pérdida de Comunicación</span>
            </div>
            <p className="text-[11px] text-slate-400 group-hover:text-slate-300">
              Reacción: Alerta activa, la <strong>Cerradura</strong> pasa a <strong>OFFLINE</strong> y se registra reintento de enlace.
            </p>
          </button>

          <button
            onClick={handleSimulateUnauthorized}
            className="p-4 rounded-xl bg-slate-950 border border-red-500/40 hover:border-red-400 hover:bg-red-950/20 text-left transition-all group"
          >
            <div className="flex items-center space-x-2 text-red-400 text-xs font-bold mb-1">
              <span>🚨</span>
              <span>Acceso No Autorizado</span>
            </div>
            <p className="text-[11px] text-slate-400 group-hover:text-slate-300">
              Reacción: <strong>surveillance_proc</strong> sube a <strong>Crítica (RUNNING)</strong> y la Cerradura se fuerza a <strong>BLOQUEADA</strong>.
            </p>
          </button>
        </div>
      </div>

      {/* 2. BANDEJA DE ALERTAS (Estados: Activa / Resuelta) */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">Bandeja de Alertas de Fallas</h3>
            <p className="text-xs text-slate-400">Alertas clasificadas en estados: Activa y Resuelta</p>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Total: <strong className="text-white">{alerts.length}</strong>
          </span>
        </div>

        <div className="space-y-2">
          {alerts.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-500 font-mono">
              No hay alertas registradas en el sistema.
            </div>
          ) : (
            alerts.map((al) => (
              <div
                key={al.id}
                className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                  al.state === 'Activa'
                    ? 'bg-red-950/20 border-red-500/40'
                    : 'bg-slate-950/40 border-slate-800 opacity-60'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <span className="text-xs font-mono text-slate-400 mt-0.5">[{al.timestamp}]</span>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-white">{al.title}</span>
                      <span
                        className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded-full ${
                          al.state === 'Activa'
                            ? 'bg-red-950 text-red-400 border border-red-800/80 animate-pulse'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {al.state}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{al.details}</p>
                  </div>
                </div>

                {al.state === 'Activa' && (
                  <button
                    onClick={() => handleResolveAlert(al)}
                    className="self-end sm:self-center text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors shrink-0"
                    title={role === 'ADMIN' ? 'Marcar alerta como resuelta' : 'Requiere rol ADMIN'}
                  >
                    Resolver
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 3. VISOR DE LOGS DEL SISTEMA CON NIVELES COMPLETOS */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">Terminal de Logs de RobotOS</h3>
            <p className="text-xs text-slate-400">Salida en vivo del Kernel, VFS, Memoria y Seguridad (Supabase + Local)</p>
          </div>
          
          {/* Selector de Nivel */}
          <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
            {['ALL', 'CRITICAL', 'ERROR', 'WARNING', 'INFO', 'DEBUG'].map((lvl) => {
              const isSel = selectedLevel === lvl;
              return (
                <button
                  key={lvl}
                  onClick={() => setSelectedLevel(lvl)}
                  className={`px-2 py-1 rounded-lg border transition-all ${
                    isSel
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {lvl}
                </button>
              );
            })}
          </div>
        </div>

        <div className="h-72 rounded-xl bg-slate-950 border border-slate-800/80 p-4 font-mono text-xs overflow-y-auto space-y-1.5">
          {filteredLogs.map((log) => (
            <div key={log.id} className="flex items-start space-x-2">
              <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
              <span
                className={`text-[9px] uppercase font-bold px-1.5 py-0.2 rounded shrink-0 border ${
                  log.level === 'CRITICAL'
                    ? 'bg-fuchsia-950 text-fuchsia-300 border-fuchsia-800 animate-pulse'
                    : log.level === 'ERROR'
                    ? 'bg-red-950 text-red-400 border-red-900/60'
                    : log.level === 'WARN' || log.level === 'WARNING'
                    ? 'bg-amber-950 text-amber-400 border-amber-900/60'
                    : log.level === 'DEBUG'
                    ? 'bg-slate-800 text-slate-400 border-slate-700'
                    : 'bg-cyan-950 text-cyan-400 border-cyan-900/60'
                }`}
              >
                {log.level}
              </span>
              <span className="text-slate-400 font-semibold shrink-0">{log.source}:</span>
              <span className="text-slate-300 break-words">{log.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
