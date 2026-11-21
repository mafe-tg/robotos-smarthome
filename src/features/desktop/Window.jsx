/**
 * Ventana del escritorio: se mueve desde la barra de título, cambia de tamaño
 * desde la esquina y muestra el PID del proceso que la ejecuta.
 */
import React, { useRef } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';

const TOP_BAR = 56;
const DOCK = 112;
const MIN_W = 420;
const MIN_H = 280;

class AppBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    this.props.onCrash?.(error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-base font-semibold text-[var(--os-ink)]">{this.props.appName} dejó de responder</p>
          <p className="text-sm text-[var(--os-mute)] max-w-md">
            El resto del sistema sigue funcionando. Detalle: {this.state.error.message}
          </p>
          <button
            onClick={this.props.onClose}
            className="os-focus mt-2 px-4 py-2 rounded-full bg-[var(--os-signal)] text-[var(--os-on-signal)] text-sm font-semibold"
          >
            Cerrar la app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const Window = ({
  win,
  app,
  process,
  focused,
  compact,
  onFocus,
  onClose,
  onMinimize,
  onToggleMaximize,
  onMove,
  onCrash,
  children,
}) => {
  const dragRef = useRef(null);
  const Icon = app.icon;
  const maximized = win.maximized || compact;

  const startDrag = (e, mode) => {
    if (maximized && mode === 'move') return;
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    onFocus();
    const start = { x: e.clientX, y: e.clientY, win: { ...win } };
    dragRef.current = start;

    const move = (ev) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (mode === 'move') {
        const x = Math.min(Math.max(start.win.x + dx, -start.win.w + 120), window.innerWidth - 120);
        const y = Math.min(Math.max(start.win.y + dy, TOP_BAR), window.innerHeight - 40);
        onMove({ x, y });
      } else {
        onMove({
          w: Math.max(MIN_W, start.win.w + dx),
          h: Math.max(MIN_H, start.win.h + dy),
        });
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      dragRef.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const style = maximized
    ? { left: 8, top: TOP_BAR, width: 'calc(100% - 16px)', height: `calc(100% - ${TOP_BAR + DOCK}px)`, zIndex: win.z }
    : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z };

  const stateLabel = process?.state ? process.state : 'iniciando';

  return (
    <section
      role="dialog"
      aria-label={app.name}
      className={`os-window os-window-open absolute flex flex-col overflow-hidden ${focused ? 'is-focused' : ''} ${
        win.minimized ? 'hidden' : ''
      } `}
      style={style}
      onPointerDown={onFocus}
    >
      <header
        className="h-11 shrink-0 flex items-center gap-3 pl-4 pr-1.5 bg-gradient-to-r from-[var(--os-panel-2)] to-[var(--os-panel)] border-b border-[var(--os-line)] select-none cursor-default"
        onPointerDown={(e) => startDrag(e, 'move')}
        onDoubleClick={compact ? undefined : onToggleMaximize}
      >
        <Icon className={`w-4 h-4 shrink-0 ${focused ? 'text-[var(--os-signal)]' : 'text-[var(--os-mute)]'}`} />
        <h2 className="os-display text-[15px] font-bold italic truncate">{app.name}</h2>
        <span
          className="os-mono text-[11px] text-[var(--os-mute)] truncate hidden sm:inline"
          title="Cada ventana es un proceso del kernel"
        >
          {process ? `PID ${process.pid}, ${stateLabel}, ${process.memoryKb} KB` : 'creando proceso'}
        </span>
        <div className="ml-auto flex items-center" onPointerDown={(e) => e.stopPropagation()}>
          <button onClick={onMinimize} className="os-focus w-8 h-8 grid place-items-center rounded-full text-[var(--os-mute)] hover:bg-white/5 hover:text-white" aria-label="Minimizar">
            <Minus className="w-4 h-4" />
          </button>
          {!compact && (
            <button onClick={onToggleMaximize} className="os-focus w-8 h-8 grid place-items-center rounded-full text-[var(--os-mute)] hover:bg-white/5 hover:text-white" aria-label={win.maximized ? 'Restaurar tamaño' : 'Maximizar'}>
              {win.maximized ? <Copy className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
            </button>
          )}
          <button onClick={onClose} className="os-focus w-8 h-8 grid place-items-center rounded-full text-[var(--os-mute)] hover:bg-[var(--os-alert)] hover:text-white" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className={`flex-1 min-h-0 overflow-auto ${app.flush ? 'bg-[#f7f6ff]' : 'os-light os-skin p-5'}`}>
        <AppBoundary appName={app.name} onClose={onClose} onCrash={onCrash}>
          {children}
        </AppBoundary>
      </div>

      {!maximized && (
        <div
          className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize"
          onPointerDown={(e) => startDrag(e, 'resize')}
          aria-hidden="true"
        />
      )}
    </section>
  );
};
