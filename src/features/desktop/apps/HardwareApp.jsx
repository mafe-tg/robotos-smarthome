/**
 * Hardware del robot: sensores en vivo, control de actuadores y drivers.
 * Todas las órdenes pasan por system calls del kernel.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Gauge, Move, Square, RotateCcw, Power, Zap } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useSystem } from '../../../context/SystemContext';
import { getKernel } from '../../terminal/kernelBridge';
import { useHardware } from '../../hardware/useHardware';
import { useDesktop } from '../DesktopContext';
import { RobotMascot } from '../RobotMascot';

const STATUS = {
  ACTIVE: { label: 'Activo', cls: 'bg-[var(--os-ok)]/20 text-[var(--os-ok)]' },
  STOPPED: { label: 'Detenido', cls: 'bg-white/10 text-[var(--os-mute)]' },
  FAILED: { label: 'Falló', cls: 'bg-[var(--os-alert)]/20 text-[var(--os-alert)]' },
};

const btn = 'os-focus h-8 px-3 rounded-full text-[13px] flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed';

const Sparkline = ({ values, warn }) => {
  const pts = values.filter((v) => v !== null);
  if (pts.length < 2) return <div className="h-8" />;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const d = values
    .map((v, i) => (v === null ? null : `${(i / (values.length - 1)) * 100},${30 - ((v - min) / span) * 26 - 2}`))
    .filter(Boolean)
    .join(' ');
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-8" aria-hidden="true">
      <polyline points={d} fill="none" stroke={warn ? '#e5345b' : '#6b4dff'} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

export const HardwareApp = () => {
  const { snap } = useHardware();
  const { kernel } = getKernel();
  const { checkPermission } = useAuth();
  const { addLog } = useSystem();
  const { notify } = useDesktop();
  const history = useRef({});
  const [, force] = useState(0);

  // Guardar las últimas 30 lecturas de cada sensor
  useEffect(() => {
    for (const s of snap.sensors) {
      const h = history.current[s.id] || [];
      history.current[s.id] = [...h.slice(-29), s.value];
    }
    force((n) => n + 1);
  }, [snap.ticks]); // eslint-disable-line react-hooks/exhaustive-deps

  const call = async (role, action, name, ...args) => {
    if (!checkPermission(role, action, addLog)) return null;
    try {
      return await kernel.syscalls.invoke(name, ...args);
    } catch (e) {
      notify?.('El hardware no respondió', e.message, 'error');
      return null;
    }
  };

  return (
    <div className="h-full overflow-y-auto os-light os-applight bg-[#f7f6ff] text-[var(--os-ink)] p-5 space-y-6">
      {/* Estado del robot */}
      <section className="flex flex-wrap items-center gap-4 p-4 rounded-3xl bg-gradient-to-r from-[var(--os-blue)]/30 to-[var(--os-violet)]/30 border border-white/10">
        <RobotMascot size={64} bob={snap.moving} mood={snap.drivers.some((d) => d.status === 'FAILED') ? 'alert' : 'ok'} />
        <div className="flex-1 min-w-[180px]">
          <p className="os-display text-xl font-bold italic">{snap.moving ? 'RX-1 se está moviendo' : 'RX-1 está detenido'}</p>
          <p className="text-sm text-[var(--os-mute)]">
            {snap.drivers.filter((d) => d.status === 'ACTIVE').length} de {snap.drivers.length} drivers activos. Ciclo del bus número {snap.ticks}.
          </p>
          {snap.obstacleBlocked && (
            <p className="mt-1 text-xs font-medium text-amber-600">
              Movimiento pausado por proximidad a un obstáculo. Reduce la velocidad por debajo del 80 % desde los controles para continuar.
            </p>
          )}
        </div>
        <button onClick={() => call('USER', 'Mover el robot', 'sys_move', 60)} className={`${btn} bg-white text-[#2a17a8] font-semibold`}>
          <Move className="w-4 h-4" /> Mover
        </button>
        <button onClick={() => call('USER', 'Detener motores', 'sys_motors_stop')} className={`${btn} bg-white/10 hover:bg-white/20`}>
          <Square className="w-4 h-4" /> Detener motores
        </button>
      </section>

      {/* Sensores */}
      <section>
        <h3 className="text-sm font-semibold mb-2">Sensores</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {snap.sensors.map((s) => (
            <article key={s.id} className="p-4 rounded-2xl bg-[var(--os-night)] border border-white/10">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-[var(--os-mute)]">{s.name}</p>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] ${
                    s.status === 'OK' ? 'bg-[var(--os-ok)]/15 text-[var(--os-ok)]' : s.status === 'ALERTA' ? 'bg-[var(--os-alert)]/20 text-[var(--os-alert)]' : 'bg-white/10 text-[var(--os-mute)]'
                  }`}
                >
                  {s.status === 'OK' ? 'Normal' : s.status === 'ALERTA' ? 'Fuera de rango' : 'Sin driver'}
                </span>
              </div>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {s.value === null ? 'Sin lectura' : `${s.value} ${s.unit}`}
              </p>
              <Sparkline values={history.current[s.id] || []} warn={s.status === 'ALERTA'} />
            </article>
          ))}
        </div>
      </section>

      {/* Actuadores */}
      <section>
        <h3 className="text-sm font-semibold mb-2">Actuadores</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {snap.actuators.map((a) => (
            <label key={a.id} className={`block p-4 rounded-2xl border border-white/10 ${a.ready ? 'bg-[var(--os-night)]' : 'bg-[var(--os-night)]/50 opacity-60'}`}>
              <span className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  {a.id === 'aspiradora' ? <Zap className="w-4 h-4 text-[var(--os-signal)]" /> : <Gauge className="w-4 h-4 text-[var(--os-signal)]" />}
                  {a.name}
                </span>
                <span className="tabular-nums font-semibold">{a.value} {a.unit}</span>
              </span>
              <input
                type="range"
                min={a.min}
                max={a.max}
                value={a.value}
                disabled={!a.ready}
                onChange={(e) => call('USER', `Mover ${a.name}`, 'sys_actuator_set', a.id, e.target.value)}
                className="mt-3 w-full accent-[var(--os-signal)]"
                aria-label={a.name}
              />
              {!a.ready && <span className="block mt-1 text-xs text-[var(--os-alert)]">Su driver no está activo</span>}
            </label>
          ))}
        </div>
      </section>

      {/* Drivers */}
      <section>
        <h3 className="text-sm font-semibold mb-2">Drivers</h3>
        <ul className="space-y-2">
          {snap.drivers.map((d) => {
            const st = STATUS[d.status] || STATUS.STOPPED;
            return (
              <li key={d.id} className="p-4 rounded-2xl bg-[var(--os-night)] border border-white/10 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[220px]">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    {d.name}
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-normal ${st.cls}`}>{st.label}</span>
                  </p>
                  <p className="text-xs text-[var(--os-mute)] mt-0.5">
                    <span className="os-mono">{d.id}</span>, versión {d.version}, bus {d.bus}. Controla: {d.devices.join(', ')}.
                  </p>
                  <p className="text-xs text-[var(--os-mute)]">
                    Fallas: {d.failures}. Reinicios: {d.restarts}.
                    {d.status === 'FAILED' && d.recoverIn ? ` El watchdog lo recupera en ${d.recoverIn} s.` : ''}
                  </p>
                </div>
                <button onClick={() => call('USER', `Reiniciar ${d.name}`, 'sys_driver', 'restart', d.id)} className={`${btn} bg-white/10 hover:bg-white/20`}>
                  <RotateCcw className="w-4 h-4" /> Reiniciar
                </button>
                {d.status === 'ACTIVE' ? (
                  <button onClick={() => call('ADMIN', `Detener ${d.name}`, 'sys_driver', 'stop', d.id)} className={`${btn} bg-white/10 hover:bg-white/20`} title="Solo el administrador">
                    <Power className="w-4 h-4" /> Detener
                  </button>
                ) : (
                  <button onClick={() => call('ADMIN', `Cargar ${d.name}`, 'sys_driver', 'load', d.id)} className={`${btn} bg-white/10 hover:bg-white/20`} title="Solo el administrador">
                    <Power className="w-4 h-4" /> Cargar
                  </button>
                )}
                <button
                  onClick={() => call('ADMIN', `Simular falla en ${d.name}`, 'sys_driver', 'fail', d.id)}
                  disabled={d.status === 'FAILED'}
                  className={`${btn} bg-[var(--os-alert)]/80 hover:bg-[var(--os-alert)] text-white`}
                  title="Solo el administrador"
                >
                  <Zap className="w-4 h-4" /> Simular falla
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
};

export default HardwareApp;
