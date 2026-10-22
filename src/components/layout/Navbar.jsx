import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSystem } from '../../context/SystemContext';

export const Navbar = ({ currentScreen, onNavigate }) => {
  const { user, role, switchRole, logout, checkPermission } = useAuth();
  const { metrics, activeAlertsCount, addLog } = useSystem();

  const handleAlertClick = () => {
    if (checkPermission('USER', 'Acceso a Centro de Alertas desde la Barra Superior', addLog)) {
      onNavigate('logs-alerts');
    }
  };

  const handleRoleChange = (newRole) => {
    switchRole(newRole);
    // Si cambia a GUEST y está en una pantalla restringida, redirigir al Overview
    if (newRole === 'GUEST' && (currentScreen === 'processes' || currentScreen === 'memory' || currentScreen === 'logs-alerts')) {
      onNavigate('overview');
    }
  };

  const hasActiveAlerts = activeAlertsCount > 0;

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Estado Vital del Robot: Cambia dinámicamente a EN ALERTA (rojo) si hay alertas activas */}
      <div className="flex items-center space-x-4">
        <div
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-full border transition-all ${
            hasActiveAlerts
              ? 'bg-red-950/60 border-red-500/60 shadow-lg shadow-red-950/40'
              : 'bg-slate-950/60 border-slate-800'
          }`}
        >
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                hasActiveAlerts ? 'bg-red-400' : 'bg-emerald-400'
              }`}
            ></span>
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                hasActiveAlerts ? 'bg-red-500' : 'bg-emerald-500'
              }`}
            ></span>
          </span>
          <span className="text-xs font-mono font-medium text-slate-300">
            RobotOS{' '}
            <span className={`font-bold tracking-wide ${hasActiveAlerts ? 'text-red-400' : 'text-emerald-400'}`}>
              {hasActiveAlerts ? 'EN ALERTA' : 'OPERATIVO'}
            </span>
          </span>
        </div>

        {/* Telemetría Mini (solo visible si no es GUEST) */}
        {role !== 'GUEST' && (
          <div className="hidden md:flex items-center space-x-4 text-xs font-mono text-slate-400">
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-500">CPU:</span>
              <span className="text-cyan-400 font-medium">{metrics.cpuUsage}%</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-500">BATERÍA:</span>
              <span className="text-emerald-400 font-medium">{metrics.batteryPercent}% ({metrics.powerDrawWatts}W)</span>
            </div>
          </div>
        )}
      </div>

      {/* Alertas, Selector de Rol y Perfil */}
      <div className="flex items-center space-x-4">
        {/* Badge de Alertas Activas */}
        <button
          onClick={handleAlertClick}
          className={`relative p-2 rounded-lg transition-colors ${
            hasActiveAlerts
              ? 'bg-red-950/40 text-red-400 hover:bg-red-950/80 border border-red-500/40'
              : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
          title={role === 'GUEST' ? 'Acceso restringido para invitados' : 'Ver alertas activas'}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {role !== 'GUEST' && hasActiveAlerts && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-lg shadow-red-500/50 animate-pulse">
              {activeAlertsCount}
            </span>
          )}
        </button>

        {/* Selector de Rol interactivo */}
        <div className="flex items-center space-x-2 bg-slate-950/70 border border-slate-800 px-2 py-1 rounded-lg">
          <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">ROL:</span>
          <select
            value={role}
            onChange={(e) => handleRoleChange(e.target.value)}
            className="bg-transparent text-xs font-semibold text-cyan-400 focus:outline-none cursor-pointer"
          >
            <option value="ADMIN" className="bg-slate-900 text-purple-400 font-bold">ADMIN</option>
            <option value="USER" className="bg-slate-900 text-blue-400 font-bold">USER</option>
            <option value="GUEST" className="bg-slate-900 text-amber-400 font-bold">GUEST</option>
          </select>
        </div>

        {/* Perfil & Logout */}
        {user ? (
          <div className="flex items-center space-x-3 pl-2 border-l border-slate-800">
            <div className="hidden sm:block text-right">
              <div className="text-xs font-medium text-slate-200">{user.name}</div>
              <div className="text-[10px] text-slate-500 font-mono">{user.email}</div>
            </div>
            <button
              onClick={logout}
              className="text-xs text-slate-400 hover:text-red-400 px-2.5 py-1.5 rounded-lg border border-slate-800 hover:border-red-900/50 bg-slate-800/40 transition-colors"
            >
              Salir
            </button>
          </div>
        ) : (
          <button
            onClick={() => onNavigate('login')}
            className="text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            Iniciar Sesión
          </button>
        )}
      </div>
    </header>
  );
};
