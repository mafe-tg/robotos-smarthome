/**
 * TwinPage.jsx — Pantalla "Gemelo Digital" de RobotOS SmartHome
 *
 * Fase 2: movimiento del robot con animación CSS, reproducción tick a tick
 * del scheduler de Sofia (simular()), correcciones de batería y GUEST.
 *
 * Autora: Mafe (feature/gemelo-mafe)
 */
import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useSystem } from '../context/SystemContext';
import { useAuth } from '../context/AuthContext';
import { deriveTwinState, PROCESS_ROOM, GUEST_VISIBLE_DEVICES } from '../components/twin/TwinEngine';
import { HousePlanSVG, ROBOT_ROOM_POS } from '../components/twin/HousePlanSVG';
import { RobotPanel } from '../components/twin/RobotPanel';

// Importamos la lógica oficial de Sofia (sin modificar sus archivos)
import { ESTADOS, Proceso } from '../../procesos-cpu/src/proceso.js';
import { ALGORITMOS } from '../../procesos-cpu/src/scheduler.js';
import { simular } from '../../procesos-cpu/src/cpu.js';
import { PRIORITY_MAP } from '../data/mockData';

// ─── Dispositivos visibles por zona para GUEST ───────────────────────────────
const GUEST_ROOM_FILTER = new Set(['salon', 'cocina']);

export const TwinPage = () => {
  const {
    processes,
    devices,
    alerts,
    memoryStats,
    energyReport,
    systemSettings,
    metrics,
    addLog,
  } = useSystem();

  const { role } = useAuth();
  const isGuest = role === 'GUEST';

  // ── Derivar estado visual (función pura, sin efectos) ───────────────────────
  const twinState = useMemo(
    () =>
      deriveTwinState({
        processes,
        devices,
        alerts,
        memoryStats,
        energyReport,
        systemSettings,
        batteryPercent: metrics?.batteryPercent ?? 84,  // ← batería real del SO
        cpuUsage:       metrics?.cpuUsage       ?? 28,
      }),
    [processes, devices, alerts, memoryStats, energyReport, systemSettings, metrics]
  );

  // ── Estado del robot: posición actual en el plano ───────────────────────────
  const [robotRoom, setRobotRoom] = useState('base');

  // Cuando no hay reproducción activa, el robot sigue al proceso RUNNING
  const isPlayingRef = useRef(false);
  useEffect(() => {
    if (isPlayingRef.current) return; // la reproducción tiene prioridad
    const battery = metrics?.batteryPercent ?? 84;
    if (battery < 15) {
      setRobotRoom('base'); // batería crítica → vuelve a la base
      return;
    }
    const running = processes.find((p) => p.state === ESTADOS.RUNNING);
    if (running) {
      setRobotRoom(PROCESS_ROOM[running.name] || 'base');
    }
  }, [processes, metrics]);

  // ── Reproducción tick a tick ─────────────────────────────────────────────────
  const [isPlaying,       setIsPlaying]       = useState(false);
  const [playbackTick,    setPlaybackTick]     = useState(null);
  const [playbackProcess, setPlaybackProcess]  = useState(null);
  const [playbackAlgo,    setPlaybackAlgo]     = useState(
    systemSettings?.scheduler_algorithm || ALGORITMOS.PRIORIDAD
  );
  const [playbackQuantum, setPlaybackQuantum]  = useState(
    systemSettings?.rr_quantum || 2
  );
  const timeoutRef = useRef(null);

  // Sincronizar algoritmo con system_settings cuando lleguen de Supabase
  useEffect(() => {
    if (!isPlaying) {
      setPlaybackAlgo(systemSettings?.scheduler_algorithm || ALGORITMOS.PRIORIDAD);
      setPlaybackQuantum(systemSettings?.rr_quantum || 2);
    }
  }, [systemSettings, isPlaying]);

  const stopPlayback = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    isPlayingRef.current = false;
    setIsPlaying(false);
    setPlaybackTick(null);
    setPlaybackProcess(null);
  }, []);

  const handlePlayback = useCallback(() => {
    if (isPlaying) { stopPlayback(); return; }

    // Instanciar objetos Proceso de Sofia (clones, sin tocar el estado del dashboard)
    const activos = processes.filter((p) => p.state !== ESTADOS.TERMINATED);
    if (activos.length === 0) {
      alert('No hay procesos activos para simular.');
      return;
    }

    const clones = activos.map((p) => {
      const numPriority = PRIORITY_MAP[p.priority] || p.prioridadNum || 3;
      const obj = new Proceso({
        nombre:          p.name,
        prioridad:       numPriority,
        memoriaRequerida: p.memoryKb || 64,
        cpuRequerida:    p.cpu || 5,
        tiempoTotal:     p.tiempoTotal || 4,
      });
      obj.pid = p.pid;
      // Sincronizar estado
      if (p.state === ESTADOS.READY || p.state === ESTADOS.RUNNING) obj.admitir();
      else if (p.state === ESTADOS.WAITING) { obj.admitir(); obj.pausar(); }
      return obj;
    });

    const result = simular(clones, {
      algoritmo: playbackAlgo,
      quantum:   Number(playbackQuantum) || 2,
    });

    const { linea } = result;
    if (!linea || linea.length === 0) {
      alert('La simulación no produjo ticks. Verifica los procesos activos.');
      return;
    }

    // Velocidad según CPU y batería (del TwinEngine)
    const intervalMs = twinState?.robot?.moveIntervalMs || 1000;

    // Log de inicio
    addLog({
      level: 'INFO',
      source: 'TWIN_DIGITAL',
      message: `[GEMELO] Reproducción iniciada — Algoritmo: ${playbackAlgo}${playbackAlgo === ALGORITMOS.ROUND_ROBIN ? ` (Q=${playbackQuantum})` : ''}, Ticks: ${linea.length}, Intervalo: ${intervalMs} ms/tick.`,
    });

    isPlayingRef.current = true;
    setIsPlaying(true);

    // Avanzar tick a tick
    let idx = 0;
    const step = () => {
      if (idx >= linea.length || !isPlayingRef.current) {
        // Fin de la reproducción
        isPlayingRef.current = false;
        setIsPlaying(false);
        setPlaybackTick(null);
        setPlaybackProcess(null);
        setRobotRoom('base');

        addLog({
          level: 'INFO',
          source: 'TWIN_DIGITAL',
          message: `[GEMELO] Reproducción finalizada — ${linea.length} ticks completados con algoritmo ${playbackAlgo}.`,
        });
        return;
      }

      const item = linea[idx];
      // Encontrar habitación del proceso en este tick
      const proc = processes.find((p) => p.pid === item.pid);
      const room = proc ? (PROCESS_ROOM[proc.name] || 'base') : 'base';

      setPlaybackTick(item.tick);
      setPlaybackProcess(item.nombre);
      setRobotRoom(room);
      idx++;
      timeoutRef.current = setTimeout(step, intervalMs);
    };

    timeoutRef.current = setTimeout(step, 100);
  }, [isPlaying, processes, playbackAlgo, playbackQuantum, twinState, addLog, stopPlayback]);

  // Limpiar timeout al desmontar
  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  // ── Métricas derivadas ───────────────────────────────────────────────────────
  const runningProcess = processes.find((p) => p.state === ESTADOS.RUNNING);
  const activeAlerts   = alerts.filter((a) => a.state === 'Activa');
  const battery        = metrics?.batteryPercent ?? 84;
  const intervalMs     = twinState?.robot?.moveIntervalMs || 1000;

  // ── Dispositivos filtrados para GUEST ────────────────────────────────────────
  const visibleDeviceStates = isGuest
    ? (twinState?.deviceStates || []).filter((d) => GUEST_VISIBLE_DEVICES.has(d.id))
    : twinState?.deviceStates || [];

  // twinState parcial para GUEST (oculta rooms de Entrada y Exterior)
  const twinStateForCanvas = isGuest
    ? { ...twinState, deviceStates: visibleDeviceStates }
    : twinState;

  return (
    <div className="space-y-5">
      {/* ── Encabezado ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            🤖 Gemelo Digital
            <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60">
              FASE 2
            </span>
          </h2>
          <p className="text-xs text-slate-400">
            Representación virtual en tiempo real — el robot sigue al proceso RUNNING y puede reproducir el scheduler de Sofia.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {runningProcess && !isPlaying && (
            <div className="px-3 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-700/50 text-xs font-mono text-emerald-300">
              ▶ RUNNING: {runningProcess.name}
            </div>
          )}
          {isPlaying && (
            <div className="px-3 py-1.5 rounded-xl bg-cyan-950/40 border border-cyan-700/50 text-xs font-mono text-cyan-300 animate-pulse">
              ⏯ Tick {playbackTick} · {playbackProcess}
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

      {/* ── Aviso GUEST ── */}
      {isGuest && (
        <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/40 text-xs text-amber-200 font-mono">
          <strong>Modo Invitado:</strong> Vista limitada a dispositivos del Salón y Cocina.
          Los procesos del kernel y el reproductor del scheduler no están disponibles.
        </div>
      )}

      {/* ── Reproductor del Scheduler (ADMIN y USER) ── */}
      {!isGuest && (
        <div className="p-4 rounded-2xl bg-slate-900 border border-cyan-800/30 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <div className="text-xs font-bold text-white">🎬 Reproducir en el gemelo</div>
              <div className="text-[11px] text-slate-500">
                Ejecuta <code className="bg-slate-800 px-1 rounded">simular()</code> de Sofia y mueve el robot tick a tick según el Gantt.
              </div>
            </div>

            {/* Selector de algoritmo */}
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
              <label className="text-[11px] font-mono text-slate-400">Algoritmo:</label>
              <select
                value={playbackAlgo}
                onChange={(e) => setPlaybackAlgo(e.target.value)}
                disabled={isPlaying}
                className="bg-transparent text-xs font-mono font-bold text-cyan-400 focus:outline-none cursor-pointer disabled:opacity-50"
              >
                <option value={ALGORITMOS.PRIORIDAD}   className="bg-slate-900 text-white">Prioridad</option>
                <option value={ALGORITMOS.ROUND_ROBIN} className="bg-slate-900 text-white">Round Robin</option>
              </select>
            </div>

            {/* Quantum (solo Round Robin) */}
            {playbackAlgo === ALGORITMOS.ROUND_ROBIN && (
              <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                <label className="text-[11px] font-mono text-slate-400">Quantum:</label>
                <input
                  type="number" min={1} max={20}
                  value={playbackQuantum}
                  onChange={(e) => setPlaybackQuantum(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={isPlaying}
                  className="w-12 bg-transparent text-xs font-mono font-bold text-cyan-400 focus:outline-none text-center disabled:opacity-50"
                />
              </div>
            )}

            {/* Velocidad calculada */}
            <div className="text-[11px] font-mono text-slate-500">
              Velocidad: <span className="text-cyan-400">{intervalMs} ms/tick</span>
              <span className="ml-1 text-slate-600">
                (CPU {metrics?.cpuUsage ?? 28}% · Bat. {battery}%)
              </span>
            </div>

            {/* Botón principal */}
            <button
              onClick={handlePlayback}
              className={`ml-auto px-5 py-2.5 rounded-xl font-bold text-xs tracking-wide transition-all shadow-lg flex items-center gap-2 cursor-pointer ${
                isPlaying
                  ? 'bg-red-700 hover:bg-red-600 text-white shadow-red-800/30'
                  : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-cyan-700/30'
              }`}
            >
              {isPlaying ? '⏹ Detener' : '▶ Reproducir en el gemelo'}
            </button>
          </div>

          {/* Barra de progreso del tick */}
          {isPlaying && playbackTick !== null && (
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-slate-500">Tick actual:</span>
              <span className="text-cyan-400 font-bold">{playbackTick}</span>
              <span className="text-slate-500">·</span>
              <span className="text-emerald-400">{playbackProcess}</span>
              <span className="text-slate-500 ml-2">→ zona:</span>
              <span className="text-white capitalize">
                {{ salon: 'Salón', cocina: 'Cocina', entrada: 'Entrada', base: 'Base', exterior: 'Exterior' }[robotRoom] || robotRoom}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Layout principal ── */}
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Plano de la casa */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Plano de la Casa RobotOS</h3>
            <div className="text-[11px] font-mono text-slate-500">
              Scheduler: <span className="text-cyan-400">{systemSettings?.scheduler_algorithm || 'PRIORIDAD'}</span>
              {systemSettings?.scheduler_algorithm === 'ROUND_ROBIN' &&
                <span className="text-slate-400"> (Q={systemSettings.rr_quantum})</span>}
            </div>
          </div>

          <HousePlanSVG
            twinState={twinStateForCanvas}
            robotRoom={robotRoom}
            transitionMs={isPlaying ? intervalMs * 0.85 : 900}
            role={role}
            playbackTick={isPlaying ? playbackTick : null}
            playbackProcess={isPlaying ? playbackProcess : null}
          />

          {/* Tabla de causa-efecto activa */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wide">
              Efectos activos en el gemelo
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {visibleDeviceStates.map((dev) => (
                <div key={dev.id} className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dev.dotColor }} />
                  <span className="text-white">{dev.icon}</span>
                  <span className="truncate">{dev.name}</span>
                  <span className="ml-auto shrink-0" style={{ color: dev.dotColor }}>{dev.status}</span>
                  {!isGuest && dev.responsibleProcess && (
                    <span className="shrink-0 opacity-50">← {dev.responsibleProcess}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Panel lateral del robot */}
        <div className="lg:w-56 shrink-0 space-y-4">
          <h3 className="text-sm font-bold text-white">Estado del Robot</h3>
          <RobotPanel robot={twinState?.robot} summary={twinState?.summary} />

          {/* Procesos por zona (oculto para GUEST) */}
          {!isGuest && (
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wide">Procesos por zona</h4>
              {Object.entries(twinState?.rooms || {}).map(([roomId, room]) => {
                if (!room.processes?.length) return null;
                const color = room.hasAlert ? '#EF4444'
                  : ({ RUNNING: '#10B981', READY: '#F59E0B', WAITING: '#F97316',
                       NEW: '#3B82F6', TERMINATED: '#475569' }[room.dominantState] || '#475569');
                const label = { salon:'Salón', cocina:'Cocina', entrada:'Entrada', base:'Base', exterior:'Ext.' }[roomId] || roomId;

                return (
                  <div key={roomId} className="text-[11px] font-mono">
                    <div className="flex items-center gap-1 text-slate-500 mb-0.5">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                      {label}
                    </div>
                    {room.processes.map((p) => (
                      <div key={p.id} className="pl-3 flex justify-between">
                        <span className="text-slate-400 truncate">{p.name}</span>
                        <span style={{ color }} className="ml-1 shrink-0">{p.state}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* Alertas activas */}
          {activeAlerts.length > 0 && (
            <div className="p-3 rounded-xl bg-red-950/20 border border-red-700/40 space-y-1">
              <div className="text-xs font-bold text-red-400 uppercase">Alertas activas</div>
              {activeAlerts.map((a, i) => (
                <div key={i} className="text-[10px] font-mono text-red-300 truncate">⚠️ {a.title}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
