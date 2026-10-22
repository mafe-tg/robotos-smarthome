import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSystem } from '../../context/SystemContext';

export const Sidebar = ({ currentScreen, onNavigate }) => {
  const { role, checkPermission } = useAuth();
  const { activeAlertsCount, addLog } = useSystem();

  const menuItems = [
    {
      id: 'overview',
      name: 'Centro de Control',
      subtitle: 'Telemetría y KPIs',
      minRole: 'GUEST',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
    },
    {
      id: 'processes',
      name: 'Procesos & Scheduler',
      subtitle: 'Gantt y Estados',
      minRole: 'USER', // GUEST no puede entrar
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
      ),
    },
    {
      id: 'memory',
      name: 'Memoria & Archivos',
      subtitle: 'Bloques y VFS',
      minRole: 'USER', // GUEST no puede entrar
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
    },
    {
      id: 'devices',
      name: 'Dispositivos Domóticos',
      subtitle: 'Sensores y Actuadores',
      minRole: 'GUEST',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      id: 'logs-alerts',
      name: 'Logs, Alertas & Test',
      subtitle: 'Diagnóstico y Sandbox',
      minRole: 'USER', // GUEST no puede entrar
      badge: role !== 'GUEST' && activeAlertsCount > 0 ? activeAlertsCount : null,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
  ];

  const handleItemClick = (item) => {
    // Si la pantalla requiere rol superior a GUEST, evaluar checkPermission
    if (item.minRole !== 'GUEST') {
      const allowed = checkPermission(item.minRole, `Navegación al módulo "${item.name}"`, addLog);
      if (!allowed) return;
    }
    onNavigate(item.id);
  };

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between h-screen sticky top-0 shrink-0">
      <div>
        {/* Brand Header */}
        <div className="h-16 px-6 flex items-center space-x-3 border-b border-slate-800 bg-slate-950/40">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-black text-sm shadow-lg shadow-cyan-500/20">
            R
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center space-x-1.5">
              <span>RobotOS</span>
              <span className="text-[10px] font-mono uppercase bg-cyan-950 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-800/60">
                v2.4
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">SmartHome OS Prototype</p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1">
          <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-slate-500 font-semibold">
            Subsistemas del Robot
          </div>

          {menuItems.map((item) => {
            const isActive = currentScreen === item.id;
            const isBlockedForGuest = role === 'GUEST' && item.minRole !== 'GUEST';

            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all group ${
                  isActive
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm'
                    : isBlockedForGuest
                    ? 'text-slate-600 hover:text-slate-400 hover:bg-slate-800/30 border border-transparent opacity-75'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span className={`${isActive ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-300'}`}>
                    {item.icon}
                  </span>
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <span className="text-xs font-semibold">{item.name}</span>
                      {isBlockedForGuest && <span className="text-[10px]">🔒</span>}
                    </div>
                    <div className="text-[10px] text-slate-500">{item.subtitle}</div>
                  </div>
                </div>

                {item.badge && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer / Login Link & RBAC Indicator */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40">
        <button
          onClick={() => onNavigate('login')}
          className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-left transition-all ${
            currentScreen === 'login'
              ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
          </svg>
          <div>
            <div className="text-xs font-semibold">Autenticación</div>
            <div className="text-[10px] text-slate-500">Supabase Auth & Roles</div>
          </div>
        </button>

        <div className="mt-3 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between text-[11px]">
          <span className="text-slate-500">Rol activo:</span>
          <span className={`font-mono font-bold ${
            role === 'ADMIN' ? 'text-purple-400' : role === 'USER' ? 'text-blue-400' : 'text-amber-400'
          }`}>
            {role}
          </span>
        </div>
      </div>
    </aside>
  );
};
