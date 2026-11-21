/**
 * Piezas fijas del escritorio: barra superior, dock, menú de apps, notificaciones
 * y avisos emergentes.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot, Bell, Lock, Search, Power, RotateCcw, Users, CheckCircle2, AlertTriangle, Info, X,
  Volume2, VolumeX, LayoutGrid, House as HomeIcon,
} from 'lucide-react';
import { useSystem } from '../../context/SystemContext';
import { useAuth } from '../../context/AuthContext';
import { APPS, APP_GROUPS, DOCK_APPS, getApp, roleAllows } from './apps';

const ROLE_NAME = { ADMIN: 'Administrador', USER: 'Residente', GUEST: 'Invitado' };
const ROLE_NEEDED = { USER: 'Residente', ADMIN: 'Administrador' };

const STATUS_TEXT = {
  RUNNING: 'Kernel activo',
  DEGRADED: 'Kernel degradado',
  BOOTING: 'Arrancando',
  OFF: 'Kernel apagado',
  SHUTTING_DOWN: 'Apagando',
  HALTED: 'Kernel detenido',
};

/** Cierra un panel desplegable al hacer clic fuera o al pulsar Escape. */
function useDismiss(open, onClose, ref) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (e.target.closest?.('[data-launcher-toggle],[data-notif-toggle]')) return;
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, ref]);
}

const Clock = () => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 10);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="tabular-nums" title={now.toLocaleDateString('es-CO', { dateStyle: 'full' })}>
      {now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
};

export const TopBar = ({ kernelStatus, notifOpen, onToggleLauncher, onToggleNotif, sound, onToggleSound }) => {
  const { activeAlertsCount } = useSystem();
  const { user, role } = useAuth();
  const kernelOk = kernelStatus === 'RUNNING';
  const pill = 'flex items-center gap-2 h-9 px-3 rounded-full bg-white/90 border border-[var(--os-line)] backdrop-blur shadow-[0_4px_14px_rgba(60,40,160,0.06)]';

  return (
    <header className="absolute top-0 inset-x-0 h-14 z-[60] flex items-center justify-between gap-2 px-3 sm:px-6 pointer-events-none bg-white/85 backdrop-blur border-b border-[var(--os-line)] sm:bg-transparent sm:backdrop-blur-none sm:border-b-0">
      <button
        data-launcher-toggle
        onClick={onToggleLauncher}
        className="os-focus pointer-events-auto flex items-center gap-2 h-9 pl-1 pr-4 rounded-full bg-white/90 border border-[var(--os-line)] hover:bg-[var(--os-panel-2)] shadow-[0_4px_14px_rgba(60,40,160,0.06)]"
        aria-label="Abrir todas las apps"
      >
        <span className="w-7 h-7 rounded-full grid place-items-center bg-gradient-to-br from-[var(--os-blue)] to-[var(--os-violet)] text-white">
          <Bot className="w-4 h-4" />
        </span>
        <span className="os-display font-bold italic text-[15px]">RobotOS</span>
      </button>

      <div className="pointer-events-auto flex items-center gap-2 text-[13px]">
        {role !== 'GUEST' && (
          <span className={`${pill} hidden md:flex`} title="Estado del kernel">
            <span className={`w-2 h-2 rounded-full ${kernelOk ? 'bg-[var(--os-ok)]' : 'bg-[var(--os-alert)]'}`} />
            {STATUS_TEXT[kernelStatus] || kernelStatus}
          </span>
        )}
        <span className={`${pill} !px-1 !gap-0`}>
          <button
            onClick={onToggleSound}
            aria-pressed={sound}
            aria-label={sound ? 'Silenciar sonidos' : 'Activar sonidos'}
            className="os-focus w-7 h-7 rounded-full grid place-items-center hover:bg-[var(--os-panel-2)]"
          >
            {sound ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-[var(--os-mute)]" />}
          </button>
          <button
            data-notif-toggle
            onClick={onToggleNotif}
            aria-expanded={notifOpen}
            aria-label={`Notificaciones: ${activeAlertsCount} alertas activas`}
            className={`os-focus relative w-7 h-7 rounded-full grid place-items-center ${notifOpen ? 'bg-[var(--os-panel-2)]' : 'hover:bg-[var(--os-panel-2)]'}`}
          >
            <Bell className="w-4 h-4" />
            {activeAlertsCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-[var(--os-alert)] text-white text-[10px] font-bold grid place-items-center">
                {activeAlertsCount}
              </span>
            )}
          </button>
        </span>
        <span className={`${pill} hidden sm:flex !pl-1`} title={user?.email}>
          <span className="w-7 h-7 rounded-full grid place-items-center bg-gradient-to-br from-[var(--os-pink)] to-[var(--os-violet)] text-white text-xs font-bold">
            {ROLE_NAME[role][0]}
          </span>
          {ROLE_NAME[role]}
        </span>
        <span className={`${pill} font-semibold`}><Clock /></span>
      </div>
    </header>
  );
};

const DockItem = ({ label, name, pid, active, open, locked, onClick, children, ...rest }) => (
  <li className="shrink-0">
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`os-focus group flex flex-col items-center gap-1 w-[62px] sm:w-[76px] pt-1.5 pb-1 rounded-2xl transition-colors ${
        active ? 'bg-[var(--os-panel-2)]' : 'hover:bg-[var(--os-panel-2)]'
      }`}
      {...rest}
    >
      <span
        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl grid place-items-center transition-transform group-hover:-translate-y-0.5 ${
          active
            ? 'bg-[var(--os-ink)] text-white'
            : locked
              ? 'bg-[var(--os-panel-2)] text-[var(--os-mute)]'
              : 'bg-gradient-to-br from-[var(--os-blue)] to-[var(--os-violet)] text-white'
        }`}
      >
        {children}
      </span>
      <span className={`text-[10px] sm:text-[11px] leading-tight text-center ${locked ? 'text-[var(--os-mute)]' : 'text-[var(--os-ink)]'} ${active ? 'font-semibold' : ''}`}>{name}</span>
      <span className={`os-mono text-[10px] leading-none h-3 ${open ? 'text-[var(--os-signal)]' : 'text-transparent'}`}>
        {open && pid ? `PID ${pid}` : '.'}
      </span>
    </button>
  </li>
);

/** Dock inferior: la casa, las apps favoritas, las ventanas abiertas y todas las apps. */
export const Dock = ({ windows, focusedWid, homeVisible, onHome, onOpenApp, onWindowButton, onToggleLauncher, launcherOpen }) => {
  const { role } = useAuth();
  const { processes } = useSystem();
  const openIds = windows.map((w) => w.appId);
  const extra = windows.filter((w) => !DOCK_APPS.includes(w.appId)).map((w) => w.appId);
  const ids = [...DOCK_APPS, ...extra];

  return (
    <nav className="absolute bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 z-[60] max-w-[calc(100vw-16px)]" aria-label="Dock">
      <ul className="flex items-center gap-0.5 p-1.5 rounded-[26px] bg-white/90 border border-[var(--os-line)] backdrop-blur-xl shadow-[0_20px_50px_rgba(60,40,160,0.18)] overflow-x-auto">
        <DockItem label="La casa" name="Casa" active={homeVisible} open={false} onClick={onHome}>
          <HomeIcon className="w-5 h-5" />
        </DockItem>
        <li className="shrink-0 w-px h-10 bg-[var(--os-line)] mx-0.5" aria-hidden="true" />
        {ids.map((id) => {
          const app = getApp(id);
          const Icon = app.icon;
          const win = windows.find((w) => w.appId === id);
          const allowed = roleAllows(role, app.minRole);
          return (
            <DockItem
              key={id}
              label={allowed ? app.name : `${app.name} (bloqueada)`}
              name={app.short || app.name}
              pid={win ? processes.find((p) => p.id === win.procId)?.pid : null}
              locked={!allowed}
              open={openIds.includes(id)}
              active={win && win.wid === focusedWid && !win.minimized}
              onClick={() => (win ? onWindowButton(win.wid) : onOpenApp(id))}
            >
              {allowed ? <Icon className="w-5 h-5" /> : <Lock className="w-4 h-4 opacity-70" />}
            </DockItem>
          );
        })}
        <li className="shrink-0 w-px h-10 bg-[var(--os-line)] mx-0.5" aria-hidden="true" />
        <DockItem label="Todas las apps" name="Apps" active={launcherOpen} open={false} onClick={onToggleLauncher} data-launcher-toggle>
          <LayoutGrid className="w-5 h-5" />
        </DockItem>
      </ul>
    </nav>
  );
};

export const Launcher = ({ open, onClose, onOpenApp, onSwitchUser, onRestart, onShutdown }) => {
  const { role } = useAuth();
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  useDismiss(open, onClose, ref);

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return APPS;
    return APPS.filter((a) => `${a.name} ${a.hint}`.toLowerCase().includes(q));
  }, [query]);

  if (!open) return null;

  const launch = (app) => {
    onClose();
    onOpenApp(app.id);
  };

  return (
    <div
      ref={ref}
      className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[70] w-[min(640px,calc(100vw-16px))] max-h-[calc(100vh-130px)] flex flex-col rounded-3xl border border-[var(--os-line)] bg-[var(--os-panel)] shadow-2xl"
      role="menu"
      aria-label="Menú de RobotOS"
    >
      <div className="p-3 border-b border-[var(--os-line)]">
        <label className="flex items-center gap-2 px-3 h-10 rounded-2xl bg-[var(--os-night)] border border-[var(--os-line)] focus-within:border-[var(--os-signal)]">
          <Search className="w-4 h-4 text-[var(--os-mute)]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && filtered[0] && launch(filtered[0])}
            placeholder="Buscar una app"
            aria-label="Buscar una app"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-[var(--os-mute)]"
          />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {APP_GROUPS.map((g) => {
          const apps = filtered.filter((a) => a.group === g.id);
          if (apps.length === 0) return null;
          return (
            <section key={g.id}>
              <h3 className="px-2 mb-1.5 text-xs font-semibold text-[var(--os-mute)]">{g.name}</h3>
              <div className="grid sm:grid-cols-2 gap-1">
                {apps.map((app) => {
                  const Icon = app.icon;
                  const allowed = roleAllows(role, app.minRole);
                  return (
                    <button
                      key={app.id}
                      role="menuitem"
                      onClick={() => launch(app)}
                      className="os-focus flex items-start gap-3 p-2.5 rounded-2xl text-left hover:bg-[var(--os-panel-2)]"
                    >
                      <span className={`mt-0.5 w-8 h-8 shrink-0 rounded-full grid place-items-center ${allowed ? 'bg-gradient-to-br from-[var(--os-blue)] to-[var(--os-violet)] text-white' : 'bg-transparent text-[var(--os-mute)]'}`}>
                        {allowed ? <Icon className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                      </span>
                      <span className="min-w-0">
                        <span className={`block text-sm font-medium ${allowed ? '' : 'text-[var(--os-mute)]'}`}>{app.name}</span>
                        <span className="block text-xs text-[var(--os-mute)] leading-snug">
                          {allowed ? app.hint : `Requiere el perfil ${ROLE_NEEDED[app.minRole]}`}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
        {filtered.length === 0 && <p className="px-2 py-6 text-sm text-[var(--os-mute)] text-center">Ninguna app coincide con "{query}".</p>}
      </div>

      <footer className="p-2 border-t border-[var(--os-line)] flex flex-wrap items-center gap-1">
        <span className="px-2 text-sm mr-auto">
          Perfil: <span className="font-semibold">{ROLE_NAME[role]}</span>
        </span>
        <button onClick={() => { onClose(); onSwitchUser(); }} className="os-focus h-8 px-2.5 rounded-full flex items-center gap-1.5 text-sm hover:bg-[var(--os-panel-2)]">
          <Users className="w-4 h-4" /> Cambiar de perfil
        </button>
        <button onClick={() => { onClose(); onRestart(); }} className="os-focus h-8 px-2.5 rounded-full flex items-center gap-1.5 text-sm hover:bg-[var(--os-panel-2)]">
          <RotateCcw className="w-4 h-4" /> Reiniciar
        </button>
        <button onClick={() => { onClose(); onShutdown(); }} className="os-focus h-8 px-2.5 rounded-full flex items-center gap-1.5 text-sm hover:bg-[var(--os-alert)] hover:text-white">
          <Power className="w-4 h-4" /> Apagar
        </button>
      </footer>
    </div>
  );
};

export const NotificationPanel = ({ open, onClose, onOpenApp }) => {
  const { alerts, resolveAlert, logs } = useSystem();
  const { role } = useAuth();
  const ref = useRef(null);
  useDismiss(open, onClose, ref);
  if (!open) return null;

  const active = alerts.filter((a) => a.state === 'Activa');
  const recent = logs.filter((l) => l.level === 'ERROR' || l.level === 'WARNING').slice(0, 4);

  return (
    <div
      ref={ref}
      className="absolute top-14 right-3 sm:right-6 z-[70] w-[min(380px,calc(100vw-16px))] max-h-[calc(100vh-150px)] overflow-y-auto rounded-3xl border border-[var(--os-line)] bg-[var(--os-panel)] shadow-2xl"
      aria-label="Notificaciones"
    >
      <div className="p-4 space-y-3">
        <h3 className="text-sm font-semibold">Alertas activas</h3>
        {active.length === 0 ? (
          <p className="text-sm text-[var(--os-mute)] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[var(--os-ok)]" /> Todo en orden. No hay alertas activas.
          </p>
        ) : (
          active.map((a) => (
            <article key={a.id} className="p-3 rounded-2xl bg-[var(--os-night)] border border-[var(--os-line)]">
              <p className="text-sm font-medium flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-[var(--os-alert)]" /> {a.title}
              </p>
              <p className="mt-1 text-xs text-[var(--os-mute)] leading-relaxed">{a.details}</p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] os-mono text-[var(--os-mute)]">{a.timestamp}</span>
                {role !== 'GUEST' && (
                  <button onClick={() => resolveAlert(a.id)} className="os-focus text-xs px-2 py-1 rounded bg-[var(--os-panel-2)] hover:bg-[#ebe6ff]">
                    Marcar como resuelta
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </div>

      {role !== 'GUEST' && recent.length > 0 && (
        <div className="p-4 border-t border-[var(--os-line)] space-y-2">
          <h3 className="text-sm font-semibold">Últimos avisos del sistema</h3>
          {recent.map((l, i) => (
            <p key={l.id || i} className="text-xs text-[var(--os-mute)] leading-relaxed">
              <span className="os-mono">{l.timestamp}</span> {l.message}
            </p>
          ))}
        </div>
      )}

      {role !== 'GUEST' && (
        <div className="p-2 border-t border-[var(--os-line)]">
          <button
            onClick={() => { onClose(); onOpenApp('logs-alerts'); }}
            className="os-focus w-full h-9 rounded-full text-sm hover:bg-[var(--os-panel-2)]"
          >
            Abrir el visor de eventos
          </button>
        </div>
      )}
    </div>
  );
};

const TOAST_ICON = { error: AlertTriangle, warning: AlertTriangle, ok: CheckCircle2, info: Info };
const TOAST_COLOR = {
  error: 'text-[var(--os-alert)]',
  warning: 'text-[var(--os-signal)]',
  ok: 'text-[var(--os-ok)]',
  info: 'text-[var(--os-mute)]',
};

export const Toasts = ({ toasts, onDismiss }) => (
  <div className="absolute bottom-24 right-4 z-[65] w-[min(360px,calc(100vw-32px))] space-y-2" aria-live="polite">
    {toasts.map((t) => {
      const Icon = TOAST_ICON[t.kind] || Info;
      return (
        <div key={t.id} className="os-window-open flex gap-3 p-3 rounded-2xl border border-[var(--os-line)] bg-[var(--os-panel)] shadow-2xl">
          <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${TOAST_COLOR[t.kind]}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{t.title}</p>
            {t.body && <p className="mt-0.5 text-xs text-[var(--os-mute)] leading-relaxed">{t.body}</p>}
          </div>
          <button onClick={() => onDismiss(t.id)} className="os-focus self-start text-[var(--os-mute)] hover:text-white" aria-label="Cerrar aviso">
            <X className="w-4 h-4" />
          </button>
        </div>
      );
    })}
  </div>
);
