/**
 * Configuración: perfil, sistema (reinicio y apagado), memoria, escritorio y
 * datos del proyecto.
 */
import React, { useState } from 'react';
import { UserRound, Power, MemoryStick, Monitor, Info, RotateCcw } from 'lucide-react';
import { useSystem } from '../../../context/SystemContext';
import { useAuth } from '../../../context/AuthContext';
import { getKernel } from '../../terminal/kernelBridge';
import { useDesktop } from '../DesktopContext';
import { APP_MEMORY_KB } from '../apps';

const SECTIONS = [
  { id: 'perfil', name: 'Perfil', icon: UserRound },
  { id: 'sistema', name: 'Sistema', icon: Power },
  { id: 'memoria', name: 'Memoria', icon: MemoryStick },
  { id: 'escritorio', name: 'Escritorio', icon: Monitor },
  { id: 'acerca', name: 'Acerca de', icon: Info },
];

const PROFILES = [
  { role: 'ADMIN', name: 'Administrador', detail: 'Todo el sistema, incluida la inyección de fallos.' },
  { role: 'USER', name: 'Residente', detail: 'Uso diario y herramientas del sistema.' },
  { role: 'GUEST', name: 'Invitado', detail: 'Solo la casa: control, dispositivos y gemelo.' },
];

const btn = 'os-focus h-9 px-4 rounded-full text-sm flex items-center gap-2';

const Row = ({ label, children }) => (
  <div className="flex items-center justify-between gap-4 py-2.5 border-b border-[var(--os-line)]/60 text-sm">
    <span className="text-[var(--os-mute)]">{label}</span>
    <span className="text-right">{children}</span>
  </div>
);

const formatUptime = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
};

export const SettingsApp = () => {
  const [section, setSection] = useState('perfil');
  const { role, switchRole, checkPermission } = useAuth();
  const { memoryStats, memoryBlocks, compactMemory, addLog, processes } = useSystem();
  const { restart, shutdown, prefs = {}, setPrefs, notify, windows = [] } = useDesktop();
  const bridge = getKernel();
  const snap = bridge.kernel.state.snapshot();

  const ramPct = memoryStats.totalKb ? (memoryStats.usedKb / memoryStats.totalKb) * 100 : 0;
  const appKb = windows.length * APP_MEMORY_KB;

  const compact = () => {
    if (!checkPermission('ADMIN', 'Compactar la memoria RAM', addLog)) return;
    const r = compactMemory();
    notify?.(r?.alreadyCompact ? 'La memoria ya estaba compacta' : 'Memoria compactada', r?.message || '', r?.alreadyCompact ? 'info' : 'ok');
  };

  return (
    <div className="h-full flex flex-col sm:flex-row os-light os-applight bg-[#f7f6ff] text-[var(--os-ink)]" style={{ fontFamily: 'var(--os-font)' }}>
      <nav className="flex sm:block gap-1 overflow-x-auto sm:w-44 shrink-0 p-2 border-b sm:border-b-0 sm:border-r border-[var(--os-line)]" aria-label="Secciones">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const active = s.id === section;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              aria-current={active ? 'page' : undefined}
              className={`os-focus shrink-0 sm:w-full h-9 px-3 sm:px-2.5 rounded-full flex items-center gap-2.5 text-sm text-left whitespace-nowrap ${active ? 'bg-white/10 font-semibold' : 'hover:bg-white/5 text-[var(--os-mute)]'}`}
            >
              <Icon className={`w-4 h-4 ${active ? 'text-[var(--os-signal)]' : ''}`} /> {s.name}
            </button>
          );
        })}
      </nav>

      <div className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 max-w-2xl">
        {section === 'perfil' && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Perfil</h2>
            <p className="text-sm text-[var(--os-mute)]">
              El perfil decide qué apps puedes abrir y qué acciones puedes hacer. Si cambias a un perfil con menos permisos, se cierran las apps que ya no puede usar.
            </p>
            <div className="space-y-2" role="radiogroup" aria-label="Perfil activo">
              {PROFILES.map((p) => (
                <label
                  key={p.role}
                  className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer ${role === p.role ? 'border-[var(--os-signal)] bg-[var(--os-signal)]/10' : 'border-[var(--os-line)] hover:bg-white/5'}`}
                >
                  <input
                    type="radio"
                    name="perfil"
                    checked={role === p.role}
                    onChange={() => switchRole(p.role)}
                    className="mt-1 accent-[var(--os-signal)]"
                  />
                  <span>
                    <span className="block text-sm font-semibold">{p.name}</span>
                    <span className="block text-sm text-[var(--os-mute)]">{p.detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        )}

        {section === 'sistema' && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Sistema</h2>
            <div>
              <Row label="Estado del kernel"><span className="os-mono">{snap.status}</span></Row>
              <Row label="Tiempo activo">{formatUptime(snap.uptimeMs)}</Row>
              <Row label="Arranques en esta sesión">{bridge.boot?.history?.length ?? 1}</Row>
              <Row label="Llamadas al sistema registradas">{bridge.kernel.syscalls.list().length}</Row>
              <Row label="Procesos activos">{processes.filter((p) => p.state !== 'TERMINATED').length}</Row>
            </div>
            <p className="text-sm text-[var(--os-mute)]">
              Reiniciar cierra las apps, detiene el kernel y vuelve a ejecutar toda la secuencia de arranque.
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={restart} className={`${btn} bg-white/5 hover:bg-white/10`}>
                <RotateCcw className="w-4 h-4" /> Reiniciar
              </button>
              <button onClick={shutdown} className={`${btn} bg-[var(--os-alert)]/90 text-white hover:bg-[var(--os-alert)]`}>
                <Power className="w-4 h-4" /> Apagar
              </button>
            </div>
          </section>
        )}

        {section === 'memoria' && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Memoria</h2>
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>{memoryStats.usedKb} KB en uso</span>
                <span className="text-[var(--os-mute)]">{memoryStats.freeKb} KB libres de {memoryStats.totalKb} KB</span>
              </div>
              {/* Mapa de la RAM: cada franja es un bloque asignado */}
              <div className="relative h-6 rounded-full bg-[var(--os-night)] border border-[var(--os-line)] overflow-hidden" role="img" aria-label={`RAM usada al ${Math.round(ramPct)} %`}>
                {memoryBlocks.map((b, i) => (
                  <span
                    key={`${b.start}-${i}`}
                    title={`${b.owner}: ${b.size} KB desde ${b.start} KB`}
                    className={`absolute top-0 bottom-0 border-r border-[var(--os-night)] ${b.owner?.startsWith('app_') ? 'bg-[var(--os-signal)]' : 'bg-[var(--os-ok)]/70'}`}
                    style={{ left: `${(b.start / memoryStats.totalKb) * 100}%`, width: `${(b.size / memoryStats.totalKb) * 100}%` }}
                  />
                ))}
              </div>
              <p className="mt-2 text-xs text-[var(--os-mute)] flex flex-wrap gap-x-4 gap-y-1">
                <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[var(--os-ok)]/70 mr-1.5 align-middle" />Procesos del sistema y de usuario</span>
                <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[var(--os-signal)] mr-1.5 align-middle" />Ventanas abiertas ({appKb} KB)</span>
              </p>
            </div>
            <p className="text-sm text-[var(--os-mute)]">
              Cada ventana reserva {APP_MEMORY_KB} KB. Si la RAM queda en huecos sueltos, compactarla los une para que quepan procesos nuevos.
            </p>
            <button onClick={compact} className={`${btn} bg-white/5 hover:bg-white/10`} title="Solo el administrador">
              Compactar memoria
            </button>
          </section>
        )}

        {section === 'escritorio' && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Escritorio</h2>
            <label className="flex items-start gap-3 p-4 rounded-2xl border border-[var(--os-line)] cursor-pointer hover:bg-white/5">
              <input
                type="checkbox"
                checked={prefs.sound !== false}
                onChange={(e) => setPrefs?.({ sound: e.target.checked })}
                className="mt-1 accent-[var(--os-signal)]"
              />
              <span>
                <span className="block text-sm font-semibold">Sonidos de la interfaz</span>
                <span className="block text-sm text-[var(--os-mute)]">
                  RX-1 suena al arrancar, al abrir y cerrar apps y al tocar dispositivos.
                </span>
              </span>
            </label>
          </section>
        )}

        {section === 'acerca' && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">RobotOS 2.4</h2>
            <p className="text-sm text-[var(--os-mute)]">
              Prototipo de sistema operativo para un robot que administra una casa inteligente. Proyecto final de Sistemas Operacionales, Politécnico Grancolombiano.
            </p>
            <div>
              <Row label="Danna Sofia Ruiz Gonzales">Kernel, procesos, hilos, memoria virtual, sincronización y tiempo real</Row>
              <Row label="María Fernanda Tuta Gómez">Escritorio, gemelo digital, fallos, seguridad, dispositivos, persistencia y terminal</Row>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default SettingsApp;
