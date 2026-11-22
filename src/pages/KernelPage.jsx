/**
 * KernelPage.jsx — Centro de Control del Kernel & Benchmark Center (Fases 6 y 7).
 *
 * Desarrollado por: Sofia (Integrante 1 - Kernel & Resource Management)
 *
 * Módulos integrados:
 *  - Pestaña 1 (Kernel Debugger): Telemetría en vivo, 8 marcos de RAM física,
 *    tabla de procesos e hilos, panel de sincronización con detección de Deadlock,
 *    y streaming de eventos { tipo, origen, detalle, fecha }.
 *  - Pestaña 2 (Benchmark Center): Comparativas cuantitativas con métricas reales:
 *    * CPU: Prioridad vs Round Robin (espera, retorno, respuesta y cambios de contexto).
 *    * Memoria: FIFO vs LRU (análisis de la Anomalía de Belády).
 *    * RTOS: EDF vs Rate Monotonic (plazos cumplidos vs perdidos).
 */

import React, { useState, useEffect, useRef } from 'react';
import { emitSystemEvent } from '../lib/persistence';
import {
  Activity,
  Cpu,
  Layers,
  Zap,
  RotateCcw,
  Play,
  Square,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  Clock,
  Database,
  ShieldAlert,
  ListOrdered,
  Server,
  Terminal as TerminalIcon,
  RefreshCw,
  Sliders,
  AlertOctagon,
  Check,
  Flame,
} from 'lucide-react';

import {
  boot,
  restart,
  shutdown,
  getState,
  getMemoryState,
  getSyncState,
  createProcess,
  createThread,
  runScheduler,
  accessPage,
  setPageAlgorithm,
  createSyncResource,
  lockResource,
  unlockResource,
  detectDeadlock,
  resolveDeadlock,
  runCPUBenchmark,
  runMemoryBenchmark,
  runRTOSBenchmark,
  runFullBenchmark,
  SECUENCIA_BELADY,
  SECUENCIA_LIBRO_PAGINAS,
} from '../features/kernel/index.js';

const STATUS_BADGES = {
  RUNNING: { bg: 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40', dot: 'bg-emerald-400' },
  OFF: { bg: 'bg-slate-900 text-slate-400 border-slate-700', dot: 'bg-slate-500' },
  BOOTING: { bg: 'bg-cyan-950/80 text-cyan-300 border-cyan-500/40', dot: 'bg-cyan-400' },
  DEGRADED: { bg: 'bg-amber-950/80 text-amber-300 border-amber-500/40', dot: 'bg-amber-400' },
  HALTED: { bg: 'bg-red-950/80 text-red-300 border-red-500/40', dot: 'bg-red-500' },
};

const STATE_COLORS = {
  NEW: 'bg-slate-800 text-slate-300 border-slate-700',
  READY: 'bg-blue-950 text-blue-300 border-blue-700',
  RUNNING: 'bg-emerald-950 text-emerald-300 border-emerald-700',
  WAITING: 'bg-amber-950 text-amber-300 border-amber-700',
  TERMINATED: 'bg-slate-900 text-slate-500 border-slate-800',
};

export const KernelPage = ({ onNavigate }) => {
  // Pestaña activa: 'debugger' o 'benchmark'
  const [activeTab, setActiveTab] = useState('debugger');

  // Estado del Kernel
  const [kernelState, setKernelState] = useState({ status: 'OFF', uptime: 0 });
  const [memoryState, setMemoryState] = useState(null);
  const [syncState, setSyncState] = useState(null);
  const [eventLogs, setEventLogs] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState(null);

  // Estados locales para simulación y visualización
  const [demoProcesses, setDemoProcesses] = useState([]);
  const [activeAlgorithm, setActiveAlgorithm] = useState('FIFO');
  const [deadlockInfo, setDeadlockInfo] = useState({ hasDeadlock: false, cycle: [] });

  // Estado del Benchmark Center
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [benchmarkSuite, setBenchmarkSuite] = useState(null);
  const [selectedSubBenchmark, setSelectedSubBenchmark] = useState('all');

  const eventEndRef = useRef(null);

  // Auto-scroll del visor de eventos
  useEffect(() => {
    eventEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [eventLogs]);

  // Actualizar telemetría periódica
  const refreshTelemetry = () => {
    try {
      const state = getState();
      setKernelState(state);
      setMemoryState(getMemoryState());
      setSyncState(getSyncState());
    } catch {
      // Kernel apagado o no inicializado aún
    }
  };

  useEffect(() => {
    refreshTelemetry();
    const interval = setInterval(refreshTelemetry, 1500);
    return () => clearInterval(interval);
  }, []);

  // Función para capturar eventos del kernel
  const handleKernelEvent = (event) => {
    setEventLogs((prev) => [...prev.slice(-49), event]); // Guardar últimos 50 eventos
    // Integración: los eventos del laboratorio del kernel también quedan en Supabase
    emitSystemEvent({
      event_type: event.tipo,
      source: `KERNEL_LAB:${event.origen}`,
      description: typeof event.detalle === 'string' ? event.detalle : `${event.tipo} en ${event.origen}`,
      details: event,
    });
  };

  // ==========================================
  // MANEJADORES DE CICLO DE VIDA DEL KERNEL
  // ==========================================
  const handleBoot = async () => {
    setActionLoading(true);
    setActionFeedback(null);
    try {
      const res = await boot({ onEvent: handleKernelEvent });
      refreshTelemetry();
      setActionFeedback({
        type: res.success ? 'success' : 'error',
        message: res.success ? `Kernel iniciado con éxito (Intento #${res.attempt})` : `Fallo al arrancar: ${res.error}`,
      });
    } catch (err) {
      setActionFeedback({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestart = async () => {
    setActionLoading(true);
    setActionFeedback(null);
    try {
      const res = await restart('Reinicio manual desde Kernel Debugger');
      refreshTelemetry();
      setDemoProcesses([]);
      setDeadlockInfo({ hasDeadlock: false, cycle: [] });
      setActionFeedback({
        type: res.success ? 'success' : 'error',
        message: res.success ? 'Reinicio completado: ciclo de boot ejecutado limpiamente' : `Error en reinicio: ${res.error}`,
      });
    } catch (err) {
      setActionFeedback({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleShutdown = async () => {
    setActionLoading(true);
    setActionFeedback(null);
    try {
      shutdown('Apagado solicitado por usuario');
      refreshTelemetry();
      setDemoProcesses([]);
      setDeadlockInfo({ hasDeadlock: false, cycle: [] });
      setActionFeedback({ type: 'info', message: 'Kernel apagado. Estado: OFF' });
    } catch (err) {
      setActionFeedback({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  // ==========================================
  // ACCIONES DE DEMOSTRACIÓN (SUSTENTACIÓN)
  // ==========================================
  const handleLoadDemoProcesses = async () => {
    if (kernelState.status !== 'RUNNING') {
      setActionFeedback({ type: 'error', message: 'El kernel debe estar en RUNNING para crear procesos.' });
      return;
    }
    setActionLoading(true);
    try {
      const p1 = await createProcess({ nombre: 'Robot-Vision', prioridad: 1, memoriaRequerida: 4, cpuRequerida: 30, tiempoTotal: 5 });
      const p2 = await createProcess({ nombre: 'Nav-Lidar', prioridad: 2, memoriaRequerida: 3, cpuRequerida: 20, tiempoTotal: 4 });
      const p3 = await createProcess({ nombre: 'Home-Audio', prioridad: 1, memoriaRequerida: 2, cpuRequerida: 25, tiempoTotal: 3 });

      await createThread({ processId: p1.pid, name: 'H-Vision-Filter', priority: 1, burst: 3 });
      await createThread({ processId: p2.pid, name: 'H-Nav-Obstacles', priority: 2, burst: 2 });

      setDemoProcesses([p1, p2, p3]);
      refreshTelemetry();
      setActionFeedback({ type: 'success', message: 'Procesos e hilos de demostración cargados en el Kernel.' });
    } catch (err) {
      setActionFeedback({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRunScheduler = async () => {
    if (kernelState.status !== 'RUNNING') {
      setActionFeedback({ type: 'error', message: 'Inicia el kernel antes de ejecutar el scheduler.' });
      return;
    }
    setActionLoading(true);
    try {
      const res = await runScheduler();
      refreshTelemetry();
      setActionFeedback({
        type: 'success',
        message: `Planificador ejecutado (${res.duracionTotal} ticks simulados, uso CPU: ${res.usoCpuPromedio}%).`,
      });
    } catch (err) {
      setActionFeedback({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccessMemoryDemo = async () => {
    if (kernelState.status !== 'RUNNING') {
      setActionFeedback({ type: 'error', message: 'Kernel no operativo.' });
      return;
    }
    try {
      // Acceder a una página del proceso 1
      const pidTarget = demoProcesses[0]?.pid || 1;
      const randomPage = Math.floor(Math.random() * 4);
      const res = await accessPage(pidTarget, randomPage);
      refreshTelemetry();
      setActionFeedback({
        type: res.fault ? 'warning' : 'success',
        message: res.fault
          ? `Page Fault: Página ${res.page} cargada en Marco ${res.frame}${res.victim ? ` (Desalojó pág. ${res.victim})` : ''}`
          : `Acierto (Hit): Página ${res.page} ya residente en Marco ${res.frame}`,
      });
    } catch (err) {
      setActionFeedback({ type: 'error', message: err.message });
    }
  };

  const handleToggleAlgorithm = async (algo) => {
    if (kernelState.status !== 'RUNNING') return;
    try {
      await setPageAlgorithm({ algorithm: algo });
      setActiveAlgorithm(algo);
      refreshTelemetry();
      setActionFeedback({ type: 'info', message: `Algoritmo de reemplazo cambiado a ${algo}` });
    } catch (err) {
      setActionFeedback({ type: 'error', message: err.message });
    }
  };

  // Simulación interactiva de Deadlock
  const handleTriggerDeadlockDemo = async () => {
    if (kernelState.status !== 'RUNNING') {
      setActionFeedback({ type: 'error', message: 'Inicia el kernel antes de simular sincronización.' });
      return;
    }
    setActionLoading(true);
    try {
      // Asegurar proceso y dos hilos dedicados para la contención
      let p = demoProcesses[0];
      if (!p) {
        p = await createProcess({ nombre: 'Robot-Control', prioridad: 1, memoriaRequerida: 2, cpuRequerida: 10, tiempoTotal: 4 });
        setDemoProcesses((prev) => [...prev, p]);
      }
      const h1 = await createThread({ processId: p.pid, name: 'H-Vision-Lock', priority: 1, burst: 4 });
      const h2 = await createThread({ processId: p.pid, name: 'H-Nav-Lock', priority: 4, burst: 4 });

      await createSyncResource({ type: 'MUTEX', name: 'MUTEX_CAMARA' });
      await createSyncResource({ type: 'MUTEX', name: 'MUTEX_SENSORES' });

      // Hilo 1 toma Cámara
      await lockResource('MUTEX_CAMARA', h1.tid);
      // Hilo 2 toma Sensores
      await lockResource('MUTEX_SENSORES', h2.tid);

      // Ahora Hilo 1 solicita Sensores (queda bloqueado esperando a Hilo 2)
      await lockResource('MUTEX_SENSORES', h1.tid);
      // Y Hilo 2 solicita Cámara (queda bloqueado esperando a Hilo 1 -> CICLO / DEADLOCK!)
      await lockResource('MUTEX_CAMARA', h2.tid);

      const check = await detectDeadlock();
      setDeadlockInfo(check);
      refreshTelemetry();

      if (check.hasDeadlock) {
        setActionFeedback({
          type: 'error',
          message: `¡Deadlock detectado! Ciclo de espera circular entre hilos: ${check.processesInCycle?.join(' ↔ ') || 'hilo-' + h1.tid + ' ↔ hilo-' + h2.tid}`,
        });
      }
    } catch (err) {
      setActionFeedback({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolveDeadlockDemo = async () => {
    setActionLoading(true);
    try {
      const res = await resolveDeadlock();
      const check = await detectDeadlock();
      setDeadlockInfo(check);
      refreshTelemetry();

      if (res.resolved) {
        const victimName = res.victim?.name || res.victim?.tid || res.victim || 'Hilo secundario';
        const survivorName = res.survivor?.name || res.survivor?.tid || res.survivor || 'Hilo prioritario';
        setActionFeedback({
          type: 'success',
          message: `Deadlock resuelto con éxito. Víctima sacrificada: ${victimName} (menor prioridad). Sobreviviente: ${survivorName}.`,
        });
      } else {
        setActionFeedback({ type: 'info', message: 'No hay deadlock activo por resolver.' });
      }
    } catch (err) {
      setActionFeedback({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  // ==========================================
  // EJECUCIÓN DE BENCHMARKS
  // ==========================================
  const handleRunBenchmark = (tipo) => {
    setBenchmarkLoading(true);
    setTimeout(() => {
      try {
        if (tipo === 'all') {
          setBenchmarkSuite(runFullBenchmark());
        } else if (tipo === 'cpu') {
          setBenchmarkSuite((prev) => ({ ...(prev || {}), cpu: runCPUBenchmark() }));
        } else if (tipo === 'memoria') {
          setBenchmarkSuite((prev) => ({ ...(prev || {}), memoria: runMemoryBenchmark() }));
        } else if (tipo === 'rtos') {
          setBenchmarkSuite((prev) => ({ ...(prev || {}), rtos: runRTOSBenchmark() }));
        }
      } catch (err) {
        setActionFeedback({ type: 'error', message: `Error en benchmark: ${err.message}` });
      } finally {
        setBenchmarkLoading(false);
      }
    }, 150);
  };

  const statusStyle = STATUS_BADGES[kernelState.status] || STATUS_BADGES.OFF;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
      {/* HEADER PRINCIPAL */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Kernel Debugger & Benchmark Center
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
                  Core v1.0
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Subsistema de Gestión de Recursos y Núcleo
              </p>
            </div>
          </div>
        </div>

        {/* NAVEGACIÓN ENTRE PESTAÑAS */}
        <div className="flex items-center space-x-2 bg-slate-900 p-1.5 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('debugger')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'debugger'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Kernel Debugger</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('benchmark');
              if (!benchmarkSuite) handleRunBenchmark('all');
            }}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'benchmark'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Benchmark Center</span>
          </button>
        </div>
      </div>

      {/* FEEDBACK BANNER */}
      {actionFeedback && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs flex items-center justify-between transition-all ${
            actionFeedback.type === 'error'
              ? 'bg-red-950/60 border-red-800 text-red-300'
              : actionFeedback.type === 'warning'
              ? 'bg-amber-950/60 border-amber-800 text-amber-300'
              : actionFeedback.type === 'info'
              ? 'bg-blue-950/60 border-blue-800 text-blue-300'
              : 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            {actionFeedback.type === 'error' ? (
              <AlertOctagon className="w-4 h-4 text-red-400" />
            ) : actionFeedback.type === 'warning' ? (
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            )}
            <span>{actionFeedback.message}</span>
          </div>
          <button
            onClick={() => setActionFeedback(null)}
            className="text-slate-400 hover:text-white text-xs font-bold px-2 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* PESTAÑA 1: KERNEL DEBUGGER                                */}
      {/* ========================================================= */}
      {activeTab === 'debugger' && (
        <div className="space-y-6">
          {/* BARRA DE CONTROL DEL KERNEL */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-400 font-medium">Estado del Núcleo:</span>
                  <div
                    className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold border ${statusStyle.bg}`}
                  >
                    <span className={`w-2 h-2 rounded-full animate-pulse ${statusStyle.dot}`} />
                    <span>{kernelState.status}</span>
                  </div>
                </div>

                <div className="h-4 w-[1px] bg-slate-800" />

                <div className="flex items-center space-x-2 text-xs text-slate-400">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Uptime:</span>
                  <span className="font-mono text-slate-200">
                    {Math.floor((kernelState.uptime || 0) / 1000)}s
                  </span>
                </div>
              </div>

              {/* BOTONES DE CONTROL */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  disabled={actionLoading || kernelState.status === 'RUNNING'}
                  onClick={handleBoot}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 disabled:opacity-40 transition-all"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Arrancar (boot)</span>
                </button>

                <button
                  disabled={actionLoading || kernelState.status === 'OFF'}
                  onClick={handleRestart}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 disabled:opacity-40 transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reiniciar (restart)</span>
                </button>

                <button
                  disabled={actionLoading || kernelState.status === 'OFF'}
                  onClick={handleShutdown}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30 disabled:opacity-40 transition-all"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Apagar (shutdown)</span>
                </button>

                <div className="h-4 w-[1px] bg-slate-800 mx-1" />

                <button
                  disabled={actionLoading || kernelState.status !== 'RUNNING'}
                  onClick={handleLoadDemoProcesses}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-40 transition-all"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>Cargar Demo</span>
                </button>

                <button
                  disabled={actionLoading || kernelState.status !== 'RUNNING'}
                  onClick={handleRunScheduler}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-40 transition-all"
                >
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Planificar CPU</span>
                </button>
              </div>
            </div>
          </div>

          {/* GRID DE MONITORES */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* PANEL 1: MEMORIA VIRTUAL & 8 MARCOS DE RAM */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center space-x-2">
                    <Database className="w-4 h-4 text-cyan-400" />
                    <h2 className="text-sm font-bold text-white">Memoria Paginada (8 Marcos de RAM)</h2>
                  </div>
                  <div className="flex items-center space-x-1 text-[11px]">
                    <span className="text-slate-500">Algoritmo:</span>
                    <button
                      onClick={() => handleToggleAlgorithm('FIFO')}
                      className={`px-2 py-0.5 rounded font-mono font-bold ${
                        activeAlgorithm === 'FIFO'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      FIFO
                    </button>
                    <button
                      onClick={() => handleToggleAlgorithm('LRU')}
                      className={`px-2 py-0.5 rounded font-mono font-bold ${
                        activeAlgorithm === 'LRU'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      LRU
                    </button>
                  </div>
                </div>

                {/* 8 MARCOS FÍSICOS VISUALES */}
                <div className="grid grid-cols-4 gap-2 mt-4">
                  {Array.from({ length: 8 }).map((_, idx) => {
                    const marco = memoryState?.frames?.find((f) => f.frame === idx);
                    const ocupado = !!marco;
                    return (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-xl border flex flex-col justify-between transition-all ${
                          ocupado
                            ? 'bg-cyan-950/30 border-cyan-500/40 text-cyan-300'
                            : 'bg-slate-950/60 border-slate-800 text-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="font-bold">M#{idx}</span>
                          <span className={`w-1.5 h-1.5 rounded-full ${ocupado ? 'bg-cyan-400' : 'bg-slate-700'}`} />
                        </div>
                        <div className="mt-1">
                          {ocupado ? (
                            <>
                              <div className="text-[11px] font-bold text-white">PID {marco.pid}</div>
                              <div className="text-[10px] text-cyan-400">Pág: {marco.page}</div>
                            </>
                          ) : (
                            <div className="text-[10px] text-slate-600 italic">Libre</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* MÉTRICAS DE PAGINACIÓN */}
                <div className="grid grid-cols-3 gap-2 mt-4 p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 text-center">
                  <div>
                    <div className="text-[10px] text-slate-500 font-mono">PAGE FAULTS</div>
                    <div className="text-sm font-bold text-amber-400 font-mono">
                      {memoryState?.pageFaults || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 font-mono">ACIERTOS (HITS)</div>
                    <div className="text-sm font-bold text-emerald-400 font-mono">
                      {memoryState?.hits || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 font-mono">TASA FALLO</div>
                    <div className="text-sm font-bold text-cyan-400 font-mono">
                      {memoryState ? `${Math.round((memoryState.faultRate || 0) * 100)}%` : '0%'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
                <button
                  disabled={kernelState.status !== 'RUNNING'}
                  onClick={handleAccessMemoryDemo}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 flex items-center space-x-1.5 disabled:opacity-40"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>Acceso Aleatorio a RAM</span>
                </button>
              </div>
            </div>

            {/* PANEL 2: SINCRONIZACIÓN, IPC & ALERTA DE DEADLOCK */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center space-x-2">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    <h2 className="text-sm font-bold text-white">Sincronización, IPC & Deadlock</h2>
                  </div>
                  <div className="flex items-center space-x-2">
                    {deadlockInfo.hasDeadlock ? (
                      <span className="flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse">
                        <AlertOctagon className="w-3 h-3" />
                        <span>DEADLOCK ACTIVO</span>
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        SIN BLOQUEOS
                      </span>
                    )}
                  </div>
                </div>

                {/* BANNER DINÁMICO DE DEADLOCK */}
                {deadlockInfo.hasDeadlock && (
                  <div className="mt-4 p-3 rounded-xl bg-red-950/70 border border-red-700 text-xs text-red-200 space-y-2">
                    <div className="font-bold flex items-center space-x-1.5 text-red-300">
                      <AlertOctagon className="w-4 h-4" />
                      <span>Espera Circular Detectada en Grafo RAG</span>
                    </div>
                    <div className="font-mono text-[11px] text-red-300">
                      Ciclo: {deadlockInfo.processesInCycle?.join(' ➔ ') || 'Hilo 1 ↔ Hilo 2'}
                    </div>
                    <button
                      onClick={handleResolveDeadlockDemo}
                      className="w-full py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center space-x-1.5"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>Resolver Deadlock (Eliminar Víctima por Prioridad)</span>
                    </button>
                  </div>
                )}

                {/* RECURSOS DE SINCRONIZACIÓN ACTIVOS */}
                <div className="mt-4 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Mutex y Semáforos en el Kernel
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {syncState?.resources && syncState.resources.length > 0 ? (
                      syncState.resources.map((res, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono"
                        >
                          <span className="font-bold text-slate-200">{res.name}</span>
                          <span className="text-[10px] text-cyan-400">
                            Dueño: {res.owner ? `TID ${res.owner}` : 'Libre'}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            Cola: {res.waitingQueue?.length || 0}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-slate-600 italic py-2">
                        No hay mutex registrados. Usa el botón de demo abajo.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end space-x-2">
                <button
                  disabled={kernelState.status !== 'RUNNING' || deadlockInfo.hasDeadlock}
                  onClick={handleTriggerDeadlockDemo}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-950/40 hover:bg-red-900/40 text-red-300 border border-red-800/60 disabled:opacity-40 transition-all flex items-center space-x-1.5"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  <span>Provocar Deadlock Demo</span>
                </button>
              </div>
            </div>
          </div>

          {/* TABLA DE PROCESOS E HILOS Y CONSOLA DE EVENTOS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* PROCESOS E HILOS */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <ListOrdered className="w-4 h-4 text-cyan-400" />
                  <h2 className="text-sm font-bold text-white">Tabla de Procesos e Hilos</h2>
                </div>
                <span className="text-[11px] font-mono text-slate-500">
                  Total: {demoProcesses.length}
                </span>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-mono text-[10px]">
                      <th className="py-2">PID</th>
                      <th className="py-2">NOMBRE</th>
                      <th className="py-2">ESTADO</th>
                      <th className="py-2">PRIORIDAD</th>
                      <th className="py-2">RAM</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {demoProcesses.length > 0 ? (
                      demoProcesses.map((p) => (
                        <tr key={p.pid} className="hover:bg-slate-800/30">
                          <td className="py-2 font-mono font-bold text-cyan-400">{p.pid}</td>
                          <td className="py-2 font-semibold text-slate-200">{p.nombre}</td>
                          <td className="py-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                STATE_COLORS[p.estado] || STATE_COLORS.READY
                              }`}
                            >
                              {p.estado}
                            </span>
                          </td>
                          <td className="py-2 font-mono text-slate-400">{p.prioridad}</td>
                          <td className="py-2 font-mono text-slate-400">{p.memoriaRequerida} MB</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-slate-600 italic">
                          No hay procesos activos en el kernel. Pulsa "Cargar Demo" arriba.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* STREAMING DE EVENTOS EN VIVO */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center space-x-2">
                    <TerminalIcon className="w-4 h-4 text-cyan-400" />
                    <h2 className="text-sm font-bold text-white">Historial de Actividad en Vivo (EventEngine)</h2>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                    LIVE
                  </span>
                </div>

                <div className="mt-3 bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-[11px] h-48 overflow-y-auto space-y-1">
                  {eventLogs.length > 0 ? (
                    eventLogs.map((ev, i) => (
                      <div key={i} className="flex items-start space-x-2 text-slate-300">
                        <span className="text-slate-600">[{ev.fecha?.slice(11, 19)}]</span>
                        <span
                          className={`font-bold px-1 rounded text-[9px] ${
                            ev.origen === 'BOOT'
                              ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                              : ev.origen === 'MEMORY'
                              ? 'bg-purple-950 text-purple-300 border border-purple-800'
                              : ev.origen === 'SYNC'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-blue-950 text-blue-300 border border-blue-800'
                          }`}
                        >
                          {ev.origen}
                        </span>
                        <span className="text-cyan-400">{ev.tipo}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-600 italic py-4 text-center">
                      Esperando eventos del sistema... Realiza acciones para ver el streaming en vivo.
                    </div>
                  )}
                  <div ref={eventEndRef} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PESTAÑA 2: BENCHMARK CENTER                               */}
      {/* ========================================================= */}
      {activeTab === 'benchmark' && (
        <div className="space-y-6">
          {/* BARRA DE EJECUCIÓN DEL BENCHMARK */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-cyan-400" />
                Suite de Pruebas Comparativas de Rendimiento
              </h2>
              <p className="text-xs text-slate-400">
                Mide algoritmos de CPU, Paginación Virtual y RTOS bajo cargas idénticas.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                disabled={benchmarkLoading}
                onClick={() => handleRunBenchmark('all')}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center space-x-2 shadow-lg shadow-cyan-500/20 disabled:opacity-40 transition-all"
              >
                <RefreshCw className={`w-4 h-4 ${benchmarkLoading ? 'animate-spin' : ''}`} />
                <span>Ejecutar Benchmark Completo</span>
              </button>
            </div>
          </div>

          {/* 1. COMPARATIVA DE SCHEDULERS DE CPU */}
          {benchmarkSuite?.cpu && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-bold text-white">
                    1. Planificadores de CPU: Prioridad vs Round Robin
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800">
                  {benchmarkSuite.cpu.totalProcesos} Procesos Simulados
                </span>
              </div>

              {/* TABLA COMPARATIVA */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-mono text-[10px]">
                      <th className="py-2">ALGORITMO</th>
                      <th className="py-2">DURACIÓN TOTAL</th>
                      <th className="py-2">ESPERA PROMEDIO</th>
                      <th className="py-2">RETORNO PROMEDIO</th>
                      <th className="py-2">RESPUESTA PROMEDIO</th>
                      <th className="py-2">CAMBIOS CONTEXTO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {benchmarkSuite.cpu.resultados.map((res, i) => (
                      <tr key={i} className="hover:bg-slate-800/30">
                        <td className="py-2.5 font-bold text-white flex items-center space-x-2">
                          <span>{res.etiqueta}</span>
                          {res.algoritmo === 'PRIORIDAD' && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800">
                              Urgencia
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 font-mono text-slate-300">{res.duracionTotal} ticks</td>
                        <td className="py-2.5 font-mono font-bold text-amber-400">{res.esperaPromedio} ticks</td>
                        <td className="py-2.5 font-mono font-bold text-emerald-400">{res.retornoPromedio} ticks</td>
                        <td className="py-2.5 font-mono text-cyan-300">{res.tiempoRespuestaPromedio} ticks</td>
                        <td className="py-2.5 font-mono text-slate-400">{res.cambiosContexto}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* CARD DE CONCLUSIÓN */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-1">
                <div className="font-bold text-cyan-400">💡 ¿Cómo entenderlo de forma sencilla?</div>
                <p className="text-[11px] text-slate-300">
                  Compara qué método organiza mejor el trabajo: <strong className="text-purple-300">Prioridad</strong> atiende primero lo más urgente (como alarmas o cerraduras), mientras que <strong className="text-cyan-300">Round Robin</strong> es democrático y reparte turnos iguales de tiempo a cada proceso.
                </p>
                <p className="text-[11px] text-slate-400 mt-1">{benchmarkSuite.cpu.resumen.conclusion}</p>
              </div>
            </div>
          )}

          {/* 2. COMPARATIVA DE MEMORIA VIRTUAL & ANOMALÍA DE BELÁDY */}
          {benchmarkSuite?.memoria && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <Database className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-bold text-white">
                    2. Memoria Virtual (Paginación): FIFO vs LRU
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                  Secuencia Canónica (20 Accesos)
                </span>
              </div>

              {/* TABLA DE FALLOS POR MARCO */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {benchmarkSuite.memoria.comparativaPorMarcos.map((comp, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                      <span>Evaluación con {comp.marcos} Marcos de RAM</span>
                      <span className="text-[10px] text-cyan-400 font-mono">Ganador: {comp.mejor}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center pt-2">
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                        <div className="text-[10px] text-slate-500 font-mono">FIFO</div>
                        <div className="text-base font-bold text-amber-400 font-mono">
                          {comp.fifo.pageFaults} fallos
                        </div>
                        <div className="text-[10px] text-slate-400">Tasa: {comp.fifo.faultRate}%</div>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                        <div className="text-[10px] text-slate-500 font-mono">LRU</div>
                        <div className="text-base font-bold text-emerald-400 font-mono">
                          {comp.lru.pageFaults} fallos
                        </div>
                        <div className="text-[10px] text-slate-400">Tasa: {comp.lru.faultRate}%</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* CARD ESTRELLA: ANOMALÍA DE BELÁDY */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-amber-950/30 to-purple-950/30 border border-amber-600/40 space-y-2">
                <div className="flex items-center space-x-2 text-amber-300 text-xs font-bold">
                  <Flame className="w-4 h-4 text-amber-400" />
                  <span>Demostración de la Anomalía de Belády (Curiosidad de Sistemas Operativos)</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  <strong className="text-cyan-300">¿Qué significa?</strong> Normalmente más memoria RAM reduce errores, pero con el método FIFO pasa lo contrario: al darle más memoria (de 3 a 4 marcos), ¡los fallos suben de 9 a 10! En cambio, con LRU los fallos bajan a 8.
                </p>
                <p className="text-[11px] text-slate-400">
                  Secuencia evaluada: <span className="font-mono text-cyan-300">[1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5]</span>
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1 text-center font-mono text-xs">
                  <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">FIFO (3 marcos)</span>
                    <span className="font-bold text-amber-400">{benchmarkSuite.memoria.analisisBelady.fifo3Marcos} fallos</span>
                  </div>
                  <div className="p-2 rounded bg-red-950/40 border border-red-700/60">
                    <span className="text-[10px] text-red-300 block">FIFO (4 marcos) ⚠️</span>
                    <span className="font-bold text-red-400">{benchmarkSuite.memoria.analisisBelady.fifo4Marcos} fallos!</span>
                  </div>
                  <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">LRU (3 marcos)</span>
                    <span className="font-bold text-emerald-400">{benchmarkSuite.memoria.analisisBelady.lru3Marcos} fallos</span>
                  </div>
                  <div className="p-2 rounded bg-emerald-950/40 border border-emerald-700/60">
                    <span className="text-[10px] text-emerald-300 block">LRU (4 marcos) ✓</span>
                    <span className="font-bold text-emerald-400">{benchmarkSuite.memoria.analisisBelady.lru4Marcos} fallos</span>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 pt-1">
                  {benchmarkSuite.memoria.analisisBelady.explicacion}
                </p>
              </div>
            </div>
          )}

          {/* 3. COMPARATIVA DE TIEMPO REAL (RTOS) */}
          {benchmarkSuite?.rtos && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-bold text-white">
                    3. Tareas de Tiempo Real (RTOS): EDF vs Rate Monotonic
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-purple-400 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800">
                  Utilización U = {benchmarkSuite.rtos.utilizacion * 100}%
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* EDF CARD */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 font-mono">EDF (Dinámico)</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      100% CUMPLIDO
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2 text-center font-mono">
                    <div className="p-2 rounded bg-slate-900 border border-slate-800">
                      <div className="text-[9px] text-slate-500">CUMPLIDOS</div>
                      <div className="text-sm font-bold text-emerald-400">
                        {benchmarkSuite.rtos.edf.deadlinesCumplidos}
                      </div>
                    </div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800">
                      <div className="text-[9px] text-slate-500">PERDIDOS</div>
                      <div className="text-sm font-bold text-slate-400">
                        {benchmarkSuite.rtos.edf.deadlinesPerdidos}
                      </div>
                    </div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800">
                      <div className="text-[9px] text-slate-500">RESPUESTA</div>
                      <div className="text-sm font-bold text-cyan-400">
                        {benchmarkSuite.rtos.edf.tiempoRespuestaPromedio}t
                      </div>
                    </div>
                  </div>
                </div>

                {/* RATE MONOTONIC CARD */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-400 font-mono">Rate Monotonic (Estático)</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      SOBRECARGA
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2 text-center font-mono">
                    <div className="p-2 rounded bg-slate-900 border border-slate-800">
                      <div className="text-[9px] text-slate-500">CUMPLIDOS</div>
                      <div className="text-sm font-bold text-amber-400">
                        {benchmarkSuite.rtos.rm.deadlinesCumplidos}
                      </div>
                    </div>
                    <div className="p-2 rounded bg-red-950/40 border border-red-700/60">
                      <div className="text-[9px] text-red-300">PERDIDOS</div>
                      <div className="text-sm font-bold text-red-400">
                        {benchmarkSuite.rtos.rm.deadlinesPerdidos}
                      </div>
                    </div>
                    <div className="p-2 rounded bg-slate-900 border border-slate-800">
                      <div className="text-[9px] text-slate-500">RESPUESTA</div>
                      <div className="text-sm font-bold text-cyan-400">
                        {benchmarkSuite.rtos.rm.tiempoRespuestaPromedio}t
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs text-slate-400">
                {benchmarkSuite.rtos.conclusion}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
