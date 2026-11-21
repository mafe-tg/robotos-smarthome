/**
 * Gemelo digital con el diseño nuevo.
 *
 * - El plano de la casa es el mismo de la pantalla principal: RX-1 va a la
 *   habitación del proceso en RUNNING.
 * - "Reproducir el planificador" ejecuta simular() de Sofia (Prioridad o Round
 *   Robin) sobre copias de los procesos activos y mueve a RX-1 tick a tick según
 *   el diagrama de Gantt. La velocidad depende de la CPU y de la batería.
 * - Muestra qué proceso controla cada dispositivo (causa y efecto).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Square, Minus, Plus } from 'lucide-react';
import { useSystem } from '../../../context/SystemContext';
import { useAuth } from '../../../context/AuthContext';
import { PROCESS_ROOM, GUEST_VISIBLE_DEVICES } from '../../../components/twin/TwinEngine';
import { Proceso, ESTADOS } from '../../../../procesos-cpu/src/proceso.js';
import { ALGORITMOS } from '../../../../procesos-cpu/src/scheduler.js';
import { simular } from '../../../../procesos-cpu/src/cpu.js';
import { PRIORITY_MAP } from '../../../data/mockData';
import { emitSystemEvent } from '../../../lib/persistence';
import { HousePlan, useTwinSnapshot, ROOM_NAMES } from '../HomeScreen';
import { RobotMascot } from '../RobotMascot';
import { useDesktop } from '../DesktopContext';

// Colores para distinguir cada proceso en la línea de tiempo
const PALETTE = ['#6b4dff', '#2f6bff', '#25b5d8', '#ff4fd8', '#9b5cff', '#12a66a', '#f59e0b', '#e5345b'];

const STATE_LABEL = { RUNNING: 'en curso', READY: 'en cola', WAITING: 'en espera', NEW: 'nuevo', TERMINATED: 'terminado' };

const card = 'rounded-3xl bg-white border border-[var(--os-line)] shadow-[0_14px_36px_rgba(60,40,160,0.08)]';

export const TwinApp = () => {
  const { processes, systemSettings, metrics, addLog } = useSystem();
  const { role } = useAuth();
  const { notify } = useDesktop();
  const isGuest = role === 'GUEST';
  const twin = useTwinSnapshot();

  const [algo, setAlgo] = useState(systemSettings?.scheduler_algorithm || ALGORITMOS.PRIORIDAD);
  const [quantum, setQuantum] = useState(systemSettings?.rr_quantum || 2);
  const [timeline, setTimeline] = useState(null); // [{ tick, pid, nombre }]
  const [cursor, setCursor] = useState(null);
  const [playing, setPlaying] = useState(false);
  const timer = useRef(null);
  const playingRef = useRef(false);

  const intervalMs = twin.robot.moveIntervalMs || 1000;

  const colorOf = useMemo(() => {
    const map = {};
    (timeline || []).forEach((t) => {
      if (!(t.nombre in map)) map[t.nombre] = PALETTE[Object.keys(map).length % PALETTE.length];
    });
    return map;
  }, [timeline]);

  const stop = useCallback(() => {
    clearTimeout(timer.current);
    playingRef.current = false;
    setPlaying(false);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const play = () => {
    if (playing) return stop();
    const activos = processes.filter((p) => p.state !== ESTADOS.TERMINATED);
    if (!activos.length) {
      notify?.('No hay procesos activos', 'Crea o reanuda un proceso para reproducir el planificador.', 'warning');
      return undefined;
    }
    const clones = activos.map((p) => {
      const obj = new Proceso({
        nombre: p.name,
        prioridad: PRIORITY_MAP[p.priority] || p.prioridadNum || 3,
        memoriaRequerida: p.memoryKb || 64,
        cpuRequerida: p.cpu || 5,
        tiempoTotal: p.tiempoTotal || 4,
      });
      obj.pid = p.pid;
      if (p.state === ESTADOS.READY || p.state === ESTADOS.RUNNING) obj.admitir();
      else if (p.state === ESTADOS.WAITING) {
        obj.admitir();
        obj.pausar();
      }
      return obj;
    });
    const { linea } = simular(clones, { algoritmo: algo, quantum: Number(quantum) || 2 });
    if (!linea?.length) {
      notify?.('La simulación no produjo ticks', 'Revisa que haya procesos listos.', 'warning');
      return undefined;
    }

    setTimeline(linea);
    setCursor(0);
    setPlaying(true);
    playingRef.current = true;
    const label = algo === ALGORITMOS.ROUND_ROBIN ? `Round Robin (quantum ${quantum})` : 'Prioridad';
    addLog({ level: 'INFO', source: 'TWIN_DIGITAL', message: `Gemelo: reproducción con ${label}, ${linea.length} ticks a ${intervalMs} ms por tick.` });
    emitSystemEvent({
      event_type: 'TWIN_PLAYBACK',
      source: 'TWIN_DIGITAL',
      description: `Reproducción del planificador con ${label}`,
      details: { algoritmo: algo, quantum, ticks: linea.length, interval_ms: intervalMs },
    });

    let i = 0;
    const step = () => {
      if (!playingRef.current) return;
      i += 1;
      if (i >= linea.length) {
        playingRef.current = false;
        setPlaying(false);
        setCursor(null);
        addLog({ level: 'INFO', source: 'TWIN_DIGITAL', message: `Gemelo: reproducción terminada (${linea.length} ticks).` });
        return;
      }
      setCursor(i);
      timer.current = setTimeout(step, intervalMs);
    };
    timer.current = setTimeout(step, intervalMs);
    return undefined;
  };

  const current = timeline && cursor !== null ? timeline[cursor] : null;
  const playbackRoom = current ? PROCESS_ROOM[current.nombre] || 'base' : null;
  const room = playbackRoom || twin.robot.currentRoom || 'base';
  const proc = current ? { name: current.nombre, pid: current.pid } : twin.robot.runningProcess;

  const effects = (twin.deviceStates || []).filter((d) => !isGuest || GUEST_VISIBLE_DEVICES.has(d.id));
  const rooms = Object.entries(twin.rooms || {}).filter(([, r]) => r.processes?.some((p) => p.state !== 'TERMINATED'));

  return (
    <div className="os-light min-h-full bg-[#f7f6ff] text-[var(--os-ink)] p-4 sm:p-5 space-y-4">
      {/* Reproductor del planificador */}
      {!isGuest && (
        <section className={`${card} p-4 flex flex-wrap items-center gap-3`}>
          <div className="mr-auto min-w-[200px]">
            <h3 className="os-display text-lg font-bold italic">Reproducir el planificador</h3>
            <p className="text-sm text-[var(--os-mute)]">RX-1 se mueve tick a tick según el diagrama de Gantt del kernel.</p>
          </div>
          <div className="flex rounded-full bg-[var(--os-panel-2)] p-1" role="radiogroup" aria-label="Algoritmo">
            {[
              [ALGORITMOS.PRIORIDAD, 'Prioridad'],
              [ALGORITMOS.ROUND_ROBIN, 'Round Robin'],
            ].map(([value, label]) => (
              <button
                key={value}
                role="radio"
                aria-checked={algo === value}
                disabled={playing}
                onClick={() => setAlgo(value)}
                className={`os-focus h-8 px-4 rounded-full text-sm ${algo === value ? 'bg-white shadow font-semibold text-[var(--os-signal)]' : 'text-[var(--os-mute)]'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {algo === ALGORITMOS.ROUND_ROBIN && (
            <div className="flex items-center gap-1 rounded-full bg-[var(--os-panel-2)] p-1" aria-label="Quantum">
              <button disabled={playing} onClick={() => setQuantum((q) => Math.max(1, q - 1))} className="os-focus w-7 h-7 rounded-full grid place-items-center hover:bg-white" aria-label="Menos quantum">
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="text-sm px-1 tabular-nums">Quantum {quantum}</span>
              <button disabled={playing} onClick={() => setQuantum((q) => Math.min(20, q + 1))} className="os-focus w-7 h-7 rounded-full grid place-items-center hover:bg-white" aria-label="Más quantum">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <button
            onClick={play}
            className={`os-focus h-10 px-5 rounded-full text-sm font-semibold flex items-center gap-2 text-white ${
              playing ? 'bg-[var(--os-alert)]' : 'bg-gradient-to-r from-[var(--os-blue)] to-[var(--os-violet)]'
            }`}
          >
            {playing ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {playing ? 'Detener' : 'Reproducir'}
          </button>

          {timeline && (
            <div className="basis-full">
              <div className="flex gap-0.5 overflow-x-auto pb-1" aria-label="Línea de tiempo del planificador">
                {timeline.map((t, i) => (
                  <span
                    key={i}
                    title={`Tick ${t.tick}: ${t.nombre}`}
                    className={`shrink-0 h-7 min-w-[22px] rounded-md grid place-items-center text-[10px] text-white tabular-nums transition-transform ${
                      i === cursor ? 'scale-110 ring-2 ring-[var(--os-ink)]' : cursor !== null && i > cursor ? 'opacity-35' : ''
                    }`}
                    style={{ background: colorOf[t.nombre] }}
                  >
                    {t.tick}
                  </span>
                ))}
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--os-mute)]">
                {Object.entries(colorOf).map(([name, color]) => (
                  <li key={name} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                    {name.replace(/_/g, ' ')}
                  </li>
                ))}
                <li>Velocidad: {intervalMs} ms por tick (CPU {metrics.cpuUsage} %, batería {metrics.batteryPercent} %)</li>
              </ul>
            </div>
          )}
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className={`${card} p-3`}>
          <HousePlan
            twin={twin}
            selectedRoom={null}
            onSelectRoom={() => {}}
            robotRoom={room}
            transitionMs={playing ? Math.round(intervalMs * 0.85) : 1400}
            caption={current ? `Tick ${current.tick}: ${current.nombre.replace(/_/g, ' ')}` : null}
          />
        </section>

        <aside className="space-y-4">
          <section className={`${card} p-4 flex items-center gap-3`}>
            <RobotMascot size={64} mood={twin.globalAlerts.count ? 'alert' : 'ok'} />
            <div className="text-sm">
              <p className="font-semibold">RX-1 en {ROOM_NAMES[room]}</p>
              <p className="text-[var(--os-mute)]">
                {proc ? `${proc.name.replace(/_/g, ' ')} (PID ${proc.pid})` : 'Sin proceso en ejecución'}
              </p>
              <p className="text-[var(--os-mute)]">Se mueve cada {intervalMs} ms</p>
            </div>
          </section>

          {!isGuest && (
            <section className={`${card} p-4`}>
              <h3 className="text-sm font-semibold mb-2">Procesos por habitación</h3>
              {rooms.length === 0 ? (
                <p className="text-sm text-[var(--os-mute)]">No hay procesos activos.</p>
              ) : (
                <ul className="space-y-2">
                  {rooms.map(([id, r]) => (
                    <li key={id}>
                      <p className="text-xs font-semibold text-[var(--os-mute)]">{ROOM_NAMES[id]}</p>
                      <ul className="mt-1 flex flex-wrap gap-1.5">
                        {r.processes
                          .filter((p) => p.state !== 'TERMINATED')
                          .map((p) => (
                            <li key={p.id} className="px-2.5 py-0.5 rounded-full bg-[var(--os-panel-2)] text-xs">
                              {p.name.replace(/_/g, ' ')}{' '}
                              <span className={p.state === 'RUNNING' ? 'text-[var(--os-ok)]' : 'text-[var(--os-mute)]'}>
                                {STATE_LABEL[p.state] || p.state}
                              </span>
                            </li>
                          ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className={`${card} p-4`}>
            <h3 className="text-sm font-semibold mb-2">Causa y efecto</h3>
            <ul className="space-y-1.5 text-sm">
              {effects.map((d) => (
                <li key={d.id} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.dotColor }} />
                  <span className="truncate">{d.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-[var(--os-mute)]">
                    {!isGuest && d.responsibleProcess ? `por ${d.responsibleProcess.replace(/_/g, ' ')}` : d.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default TwinApp;
