import React from 'react';
import { useSystem } from '../context/SystemContext';
import { useAuth } from '../context/AuthContext';
import { MetricCard } from '../components/overview/MetricCard';
import { ResourceCharts } from '../components/overview/ResourceCharts';
import { PRIORITY_MAP } from '../data/mockData';

export const OverviewPage = ({ onNavigate }) => {
  const { metrics, processes, devices, alerts, logs, toggleDevice, addLog } = useSystem();
  const { role, checkPermission } = useAuth();

  const processStateCounts = processes.reduce((acc, p) => {
    acc[p.state] = (acc[p.state] || 0) + 1;
    return acc;
  }, {});

  const activeAlert = alerts.find((a) => a.state === 'Activa');

  // GUEST solo debe ver Salón y Cocina
  const isGuest = role === 'GUEST';
  const displayedDevices = isGuest
    ? devices.filter((d) => d.zone === 'Salón' || d.zone === 'Cocina')
    : devices;

  const handleDeviceClick = (device) => {
    if (isGuest && (device.zone !== 'Salón' && device.zone !== 'Cocina')) {
      checkPermission('USER', `Control de dispositivo perimetral "${device.name}"`, addLog);
      return;
    }
    toggleDevice(device.id);
  };

  const handleNavigateWithAuth = (targetScreen, requiredRole, actionDesc) => {
    if (checkPermission(requiredRole, actionDesc, addLog)) {
      onNavigate(targetScreen);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header de bienvenida */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white">Centro de Control</h2>
          <p className="text-xs text-slate-400">
            {isGuest
              ? 'Vista de Invitado: Monitoreo restringido a Salón y Cocina.'
              : 'Telemetría en tiempo real de RobotOS y supervisión del ecosistema doméstico.'}
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs font-mono text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl self-start sm:self-auto">
          <span className={`w-2 h-2 rounded-full ${isGuest ? 'bg-amber-400' : 'bg-cyan-400 animate-pulse'}`}></span>
          <span>{isGuest ? 'PERFIL INVITADO (SALÓN Y COCINA)' : 'SINCRONIZADO CON KERNEL'}</span>
        </div>
      </div>

      {/* Banner explicativo para GUEST */}
      {isGuest && (
        <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/40 flex items-center space-x-3 text-xs text-amber-200">
          <span className="text-xl">ℹ️</span>
          <div>
            <strong className="font-semibold text-white">Acceso Limitado a Áreas Comunes (Salón y Cocina):</strong>{' '}
            Como invitado, solo tienes visibilidad y control sobre luces y climatización de estas dos zonas. Los dispositivos de Entrada, exteriores, telemetría y bitácoras del Kernel requieren rol residente (USER) o administrador (ADMIN).
          </div>
        </div>
      )}

      {/* Banner de Alerta Crítica Activa (solo visible para ADMIN y USER) */}
      {!isGuest && activeAlert && (
        <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg shadow-red-950/20">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-red-500/20 text-red-400">
              <svg className="w-5 h-5 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-black uppercase text-red-400 tracking-wider">ALERTA ACTIVA:</span>
                <span className="text-sm font-semibold text-white">{activeAlert.title}</span>
              </div>
              <p className="text-xs text-red-200/80">{activeAlert.details}</p>
            </div>
          </div>
          <button
            onClick={() => handleNavigateWithAuth('logs-alerts', 'USER', 'Acceso a Centro de Alertas')}
            className="text-xs font-semibold bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg transition-colors shrink-0"
          >
            Ver en Centro de Alertas →
          </button>
        </div>
      )}

      {/* MÉTRICAS DE HARDWARE Y GRÁFICAS (OCULTAS PARA GUEST) */}
      {!isGuest && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Uso de CPU"
              value={`${metrics.cpuUsage}%`}
              subValue="4 Cores @ 2.4GHz"
              percentage={metrics.cpuUsage}
              color="cyan"
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
              }
            />

            <MetricCard
              title="Memoria RAM"
              value={`${metrics.ramUsageMB} MB`}
              subValue={`de ${metrics.ramTotalMB} MB`}
              percentage={Math.round((metrics.ramUsageMB / metrics.ramTotalMB) * 100)}
              color="purple"
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              }
            />

            <MetricCard
              title="Almacenamiento VFS"
              value={`${metrics.storageUsageGB} GB`}
              subValue={`de ${metrics.storageTotalGB} GB`}
              percentage={Math.round((metrics.storageUsageGB / metrics.storageTotalGB) * 100)}
              color="amber"
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
              }
            />

            <MetricCard
              title="Energía & Batería"
              value={`${metrics.batteryPercent}%`}
              subValue={`${metrics.powerDrawWatts} W consumo`}
              percentage={metrics.batteryPercent}
              status="Alimentación AC + Batería"
              color="emerald"
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              }
            />
          </div>

          <ResourceCharts
            cpuUsage={metrics.cpuUsage}
            ramUsageMB={metrics.ramUsageMB}
            ramTotalMB={metrics.ramTotalMB}
            storageUsageGB={metrics.storageUsageGB}
            storageTotalGB={metrics.storageTotalGB}
          />
        </>
      )}

      {/* DISPOSITIVOS DEL HOGAR */}
      <div className={`grid grid-cols-1 ${isGuest ? 'lg:grid-cols-1' : 'lg:grid-cols-2'} gap-6`}>
        {/* Panel de Dispositivos */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                {isGuest ? 'Dispositivos de Áreas Comunes (Salón y Cocina)' : 'Estado de Dispositivos IoT'}
              </h3>
              <p className="text-xs text-slate-400">
                {isGuest ? 'Controles accesibles para invitados' : 'Lectura en tiempo real del ecosistema del hogar'}
              </p>
            </div>
            <button
              onClick={() => onNavigate('devices')}
              className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              Ver Todos →
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {displayedDevices.map((dev) => (
              <div
                key={dev.id}
                className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-slate-200">{dev.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Zona: {dev.zone} | {dev.type}
                  </div>
                </div>

                <button
                  onClick={() => handleDeviceClick(dev)}
                  className={`text-xs font-mono font-bold px-3 py-1 rounded-lg border transition-all ${
                    dev.status === 'ON' || dev.status === 'BLOQUEADA' || dev.status === 'ONLINE'
                      ? 'bg-emerald-950 text-emerald-400 border-emerald-800/80 shadow-sm'
                      : dev.status === 'DETECTADO'
                      ? 'bg-amber-950 text-amber-400 border-amber-800/80 animate-pulse'
                      : dev.status === 'OFFLINE'
                      ? 'bg-red-950 text-red-400 border-red-800/80'
                      : dev.type === 'climate'
                      ? 'bg-cyan-950 text-cyan-400 border-cyan-800/80'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                  title={dev.type === 'motion' ? 'Simular movimiento' : 'Conmutar estado'}
                >
                  {dev.type === 'motion' ? 'Simular movimiento' : dev.status}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* PANELES DE PROCESOS Y LOGS (SOLO PARA ADMIN Y USER) */}
        {!isGuest && (
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white tracking-wide">Procesos de RobotOS</h3>
                <p className="text-xs text-slate-400">Total: {processes.length} procesos registrados</p>
              </div>
              <button
                onClick={() => handleNavigateWithAuth('processes', 'USER', 'Acceso a Procesos & Scheduler')}
                className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                Ver Scheduler →
              </button>
            </div>

            {/* Badges de conteo por estado */}
            <div className="grid grid-cols-5 gap-2 text-center">
              <div className="p-2 rounded-xl bg-slate-950 border border-blue-900/40">
                <div className="text-xs font-bold text-blue-400">{processStateCounts.NEW || 0}</div>
                <div className="text-[10px] font-mono text-slate-400">NEW</div>
              </div>
              <div className="p-2 rounded-xl bg-slate-950 border border-yellow-900/40">
                <div className="text-xs font-bold text-yellow-400">{processStateCounts.READY || 0}</div>
                <div className="text-[10px] font-mono text-slate-400">READY</div>
              </div>
              <div className="p-2 rounded-xl bg-slate-950 border border-emerald-900/40">
                <div className="text-xs font-bold text-emerald-400">{processStateCounts.RUNNING || 0}</div>
                <div className="text-[10px] font-mono text-slate-400">RUNNING</div>
              </div>
              <div className="p-2 rounded-xl bg-slate-950 border border-orange-900/40">
                <div className="text-xs font-bold text-orange-400">{processStateCounts.WAITING || 0}</div>
                <div className="text-[10px] font-mono text-slate-400">WAITING</div>
              </div>
              <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-xs font-bold text-slate-400">{processStateCounts.TERMINATED || 0}</div>
                <div className="text-[10px] font-mono text-slate-400">TERM</div>
              </div>
            </div>

            {/* Lista de procesos con PID, Nombre, PRIORIDAD destacada, CPU y Estado */}
            <div className="space-y-2 pt-2">
              {processes.slice(0, 4).map((proc) => (
                <div
                  key={proc.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 gap-2 text-xs"
                >
                  <div className="flex items-center space-x-2.5">
                    <span className="font-mono text-slate-500 font-semibold">PID {proc.pid}</span>
                    <span className="font-medium text-slate-200">{proc.name}</span>
                  </div>

                  <div className="flex items-center space-x-2 self-end sm:self-auto">
                    {/* Badge de Prioridad para ver cuando surveillance_proc sube a Crítica */}
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                        proc.priority === 'Crítica'
                          ? 'bg-red-950 text-red-400 border border-red-800/90 shadow-sm shadow-red-950 animate-pulse'
                          : proc.priority === 'Alta'
                          ? 'bg-amber-950 text-amber-400 border border-amber-800/60'
                          : proc.priority === 'Media'
                          ? 'bg-blue-950/80 text-blue-400 border border-blue-800/60'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      Prioridad: {proc.priority} ({PRIORITY_MAP[proc.priority] || proc.prioridadNum || 3})
                    </span>

                    <span className="text-[11px] font-mono text-slate-400">{proc.cpu}% CPU</span>

                    {/* Badge de Estado */}
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        proc.state === 'RUNNING'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                          : proc.state === 'WAITING'
                          ? 'bg-orange-950 text-orange-400 border border-orange-800/60'
                          : proc.state === 'READY'
                          ? 'bg-yellow-950 text-yellow-400 border border-yellow-800/60'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {proc.state}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Últimos registros de bitácora SIN CORTES (texto completo multilínea) */}
            <div className="pt-2 border-t border-slate-800/60">
              <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-2">Últimos Logs del Sistema</div>
              <div className="space-y-2 font-mono text-xs">
                {logs.slice(0, 3).map((log) => (
                  <div key={log.id} className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/60 leading-relaxed break-words">
                    <span className="text-slate-500">[{log.timestamp}]</span>{' '}
                    <span
                      className={`font-semibold ${
                        log.level === 'ERROR'
                          ? 'text-red-400'
                          : log.level === 'WARN'
                          ? 'text-amber-400'
                          : 'text-cyan-400'
                      }`}
                    >
                      {log.source}:
                    </span>{' '}
                    <span className="text-slate-300">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
