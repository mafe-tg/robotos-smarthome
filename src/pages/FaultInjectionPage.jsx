/**
 * FaultInjectionPage.jsx — Pantalla "Inyección de Fallos" (Fault Injection Engine)
 *
 * Funcionalidades clave:
 * 1. Catálogo completo de 7 fallos (Dispositivos, Procesos, Memoria, Concurrencia/Deadlock).
 * 2. Tres modos de inyección: Aislado, Combinado y Progresivo.
 * 3. Parámetros configurables: objetivo (target), intensidad (Baja/Media/Alta) y duración.
 * 4. Escenarios reproducibles: presets del sistema y guardado/repetición de escenarios propios.
 * 5. Monitor en vivo de autorrecuperación paso a paso con registro de eventos.
 * 6. Historial detallado con tiempos de detección (ms) y tiempos de recuperación (s/ms).
 *
 * Exclusivo para rol ADMIN (protegido con checkPermission).
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSystem } from '../context/SystemContext';
import { useAuth } from '../context/AuthContext';
import { FAULT_CATALOG, FAULT_CATEGORIES, INTENSITY_LEVELS } from '../features/faults/faultCatalog';
import {
  getSavedScenarios,
  saveCustomScenario,
  deleteCustomScenario,
  setLastExecutedScenario,
  getLastExecutedScenario,
} from '../features/faults/faultScenarios';
import {
  getInjectionHistory,
  clearInjectionHistory,
  executeSingleFault,
  executeCombinedFaults,
  executeProgressiveFault,
} from '../features/faults/faultEngine';
import { SHARED_RESOURCES } from '../features/faults/deadlockModule';
import { fetchFaultHistory } from '../lib/persistence';

export const FaultInjectionPage = ({ onNavigate }) => {
  const systemContext = useSystem();
  const { devices, processes, memoryBlocks, alerts, addLog } = systemContext;
  const { role, checkPermission } = useAuth();

  const isAdmin = role === 'ADMIN';

  const formatTargetDisplay = (tgt) => {
    if (!tgt) return 'Sistema';
    if (typeof tgt === 'object') {
      const pA = processes?.find((p) => p.name === tgt.processA || String(p.pid) === tgt.processA)?.name || tgt.processA || 'P1';
      const pB = processes?.find((p) => p.name === tgt.processB || String(p.pid) === tgt.processB)?.name || tgt.processB || 'P2';
      return `${pA} ⇄ ${pB}`;
    }
    const dev = devices?.find((d) => d.id === tgt || d.name === tgt);
    if (dev) return dev.name;
    const proc = processes?.find((p) => p.name === tgt || String(p.pid) === tgt);
    if (proc) return proc.name;
    const blk = memoryBlocks?.find((b) => b.id === tgt || b.owner === tgt);
    if (blk) return `${blk.owner} (${blk.id})`;
    return String(tgt);
  };

  const formatModeDisplay = (m) => {
    if (m === 'ISOLATED' || m === 'Aislado') return 'Aislado';
    if (m === 'COMBINED' || m === 'Combinado') return 'Combinado';
    if (m === 'PROGRESSIVE' || m === 'Progresivo') return 'Progresivo';
    return m || 'Aislado';
  };

  // ─── Estados de Navegación y Modos ─────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('catalog'); // 'catalog' | 'scenarios' | 'history'
  const [injectionMode, setInjectionMode] = useState('ISOLATED'); // 'ISOLATED' | 'COMBINED' | 'PROGRESSIVE'
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // ─── Configuración del Fallo Seleccionado ──────────────────────────────────
  const [selectedFaultId, setSelectedFaultId] = useState('comm_loss');
  const [targetConfig, setTargetConfig] = useState({});
  const [intensityConfig, setIntensityConfig] = useState({});
  const [durationConfig, setDurationConfig] = useState({});

  // ─── Modo Combinado: Selección Múltiple ────────────────────────────────────
  const [combinedSelectedFaults, setCombinedSelectedFaults] = useState([
    'sensor_disconnected',
    'comm_loss',
  ]);

  // ─── Modo Progresivo: Estado ──────────────────────────────────────────────
  const [progressiveStage, setProgressiveStage] = useState(null);

  // ─── Historial y Monitoreo Activo ──────────────────────────────────────────
  const [history, setHistory] = useState(getInjectionHistory());
  const [activeInjections, setActiveInjections] = useState([]);
  const activeHandlesRef = useRef([]);

  // Carga inicial del historial de fallos desde Supabase
  useEffect(() => {
    let isMounted = true;
    fetchFaultHistory().then((remoteHistory) => {
      if (isMounted && remoteHistory && remoteHistory.length > 0) {
        setHistory((prev) => {
          const existingIds = new Set(prev.map((h) => h.id));
          const toAdd = remoteHistory.filter((rh) => !existingIds.has(rh.id));
          const merged = [...prev, ...toAdd];
          try {
            localStorage.setItem('robotos_fault_injection_history_v1', JSON.stringify(merged.slice(0, 50)));
          } catch {}
          return merged;
        });
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // ─── Gestión de Escenarios ────────────────────────────────────────────────
  const [scenarios, setScenarios] = useState(getSavedScenarios());
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState('');
  const [newScenarioDesc, setNewScenarioDesc] = useState('');
  const [lastScenario, setLastScenario] = useState(getLastExecutedScenario());

  // ─── Filtrado de Catálogo ─────────────────────────────────────────────────
  const filteredCatalog = useMemo(() => {
    if (selectedCategory === 'ALL') return FAULT_CATALOG;
    return FAULT_CATALOG.filter((f) => f.category === selectedCategory);
  }, [selectedCategory]);

  // ─── Inicialización de Parámetros por Defecto ──────────────────────────────
  useEffect(() => {
    const initTargets = {};
    const initIntensities = {};
    const initDurations = {};

    FAULT_CATALOG.forEach((f) => {
      initTargets[f.id] = f.defaultTarget;
      initIntensities[f.id] = f.defaultIntensity;
      initDurations[f.id] = f.defaultDuration;
    });

    setTargetConfig((prev) => ({ ...initTargets, ...prev }));
    setIntensityConfig((prev) => ({ ...initIntensities, ...prev }));
    setDurationConfig((prev) => ({ ...initDurations, ...prev }));
  }, []);

  // ─── Manejador de Inyección Aislada ───────────────────────────────────────
  const handleInjectSingle = (faultId) => {
    if (!checkPermission('ADMIN', `Inyectar fallo: ${faultId}`, addLog)) return;

    const target = targetConfig[faultId] || FAULT_CATALOG.find((f) => f.id === faultId)?.defaultTarget;
    const intensity = intensityConfig[faultId] || 'Media';
    const duration = durationConfig[faultId] || 7;

    const faultConfig = { faultId, target, intensity, duration, mode: 'ISOLATED' };
    setLastExecutedScenario({ name: `Fallo Aislado: ${faultId}`, faults: [faultConfig], mode: 'ISOLATED' });
    setLastScenario(getLastExecutedScenario());

    const activeItem = {
      id: `act_${Date.now()}`,
      faultId,
      faultName: FAULT_CATALOG.find((f) => f.id === faultId)?.name,
      target: formatTargetDisplay(target),
      intensity,
      duration,
      mode: 'Aislado',
      startTime: Date.now(),
      status: 'INYECTADO',
      step: 0,
    };

    setActiveInjections((prev) => [activeItem, ...prev]);

    const handle = executeSingleFault({
      faultId,
      target,
      intensity,
      duration,
      mode: 'ISOLATED',
      systemContext,
      onProgress: (prog) => {
        setHistory(getInjectionHistory());
        setActiveInjections((prev) =>
          prev.map((item) =>
            item.faultId === faultId
              ? { ...item, status: prog.status, step: prog.currentStepIndex || item.step }
              : item
          )
        );
      },
    });

    if (handle) activeHandlesRef.current.push(handle);

    // Limpiar de monitor activo al terminar la duración
    setTimeout(() => {
      setActiveInjections((prev) => prev.filter((item) => item.id !== activeItem.id));
      setHistory(getInjectionHistory());
    }, duration * 1000 + 500);
  };

  // ─── Manejador de Inyección Combinada ──────────────────────────────────────
  const handleInjectCombined = () => {
    if (!checkPermission('ADMIN', 'Inyectar escenario combinado de fallos', addLog)) return;
    if (combinedSelectedFaults.length === 0) {
      alert('Selecciona al menos un fallo para el modo combinado.');
      return;
    }

    const faultList = combinedSelectedFaults.map((fId) => ({
      faultId: fId,
      target: targetConfig[fId] || FAULT_CATALOG.find((f) => f.id === fId)?.defaultTarget,
      intensity: intensityConfig[fId] || 'Alta',
      duration: durationConfig[fId] || 8,
    }));

    setLastExecutedScenario({
      name: `Combinado (${combinedSelectedFaults.length} fallos)`,
      faults: faultList,
      mode: 'COMBINED',
    });
    setLastScenario(getLastExecutedScenario());

    const newActiveItems = faultList.map((cfg) => ({
      id: `act_${Date.now()}_${cfg.faultId}`,
      faultId: cfg.faultId,
      faultName: FAULT_CATALOG.find((f) => f.id === cfg.faultId)?.name,
      target: formatTargetDisplay(cfg.target),
      intensity: cfg.intensity,
      duration: cfg.duration,
      mode: 'Combinado',
      startTime: Date.now(),
      status: 'INYECTADO',
      step: 0,
    }));

    setActiveInjections((prev) => [...newActiveItems, ...prev]);

    const handle = executeCombinedFaults({
      faultList,
      systemContext,
      onProgress: () => {
        setHistory(getInjectionHistory());
      },
    });

    if (handle) activeHandlesRef.current.push(handle);

    const maxDuration = Math.max(...faultList.map((f) => f.duration));
    setTimeout(() => {
      setActiveInjections([]);
      setHistory(getInjectionHistory());
    }, maxDuration * 1000 + 800);
  };

  // ─── Manejador de Inyección Progresiva ─────────────────────────────────────
  const handleInjectProgressive = () => {
    if (!checkPermission('ADMIN', 'Inyectar prueba de estrés progresivo', addLog)) return;

    const primaryFaultId = selectedFaultId || 'cpu_overload';
    const target = targetConfig[primaryFaultId] || 'routine_engine';
    const duration = 12;

    setLastExecutedScenario({
      name: `Progresivo: ${primaryFaultId}`,
      faults: [{ faultId: primaryFaultId, target, intensity: 'Alta', duration }],
      mode: 'PROGRESSIVE',
    });
    setLastScenario(getLastExecutedScenario());

    const activeItem = {
      id: `act_prog_${Date.now()}`,
      faultId: primaryFaultId,
      faultName: FAULT_CATALOG.find((f) => f.id === primaryFaultId)?.name,
      target: formatTargetDisplay(target),
      intensity: 'Progresiva (1→2→3)',
      duration,
      mode: 'Progresivo',
      startTime: Date.now(),
      status: 'INYECTADO',
      step: 0,
    };

    setActiveInjections((prev) => [activeItem, ...prev]);

    const handle = executeProgressiveFault({
      primaryFaultId,
      target,
      totalDuration: duration,
      systemContext,
      onStageChange: (stageNum, stageLabel) => {
        setProgressiveStage({ stageNum, stageLabel });
      },
      onProgress: () => {
        setHistory(getInjectionHistory());
      },
    });

    if (handle) activeHandlesRef.current.push(handle);

    setTimeout(() => {
      setActiveInjections([]);
      setProgressiveStage(null);
      setHistory(getInjectionHistory());
    }, duration * 1000 + 800);
  };

  // ─── Ejecutar / Repetir Escenario Guardado ──────────────────────────────────
  const handleExecuteScenario = (scenario) => {
    if (!checkPermission('ADMIN', `Ejecutar escenario: ${scenario.name}`, addLog)) return;

    setLastExecutedScenario(scenario);
    setLastScenario(scenario);

    if (scenario.mode === 'COMBINED') {
      executeCombinedFaults({
        faultList: scenario.faults,
        systemContext,
        onProgress: () => setHistory(getInjectionHistory()),
      });
    } else if (scenario.mode === 'PROGRESSIVE') {
      const first = scenario.faults[0] || {};
      executeProgressiveFault({
        primaryFaultId: first.faultId || 'cpu_overload',
        target: first.target || 'routine_engine',
        totalDuration: first.duration || 12,
        systemContext,
        onStageChange: (num, lbl) => setProgressiveStage({ stageNum: num, stageLabel: lbl }),
        onProgress: () => setHistory(getInjectionHistory()),
      });
    } else {
      scenario.faults.forEach((f) => {
        executeSingleFault({
          ...f,
          systemContext,
          onProgress: () => setHistory(getInjectionHistory()),
        });
      });
    }
  };

  // ─── Guardar Escenario Personalizado ──────────────────────────────────────
  const handleSaveCurrentScenario = () => {
    if (!newScenarioName.trim()) {
      alert('Escribe un nombre para el escenario.');
      return;
    }

    let faultsToSave = [];
    if (injectionMode === 'COMBINED') {
      faultsToSave = combinedSelectedFaults.map((fId) => ({
        faultId: fId,
        target: targetConfig[fId] || FAULT_CATALOG.find((f) => f.id === fId)?.defaultTarget,
        intensity: intensityConfig[fId] || 'Alta',
        duration: durationConfig[fId] || 8,
      }));
    } else {
      faultsToSave = [
        {
          faultId: selectedFaultId,
          target: targetConfig[selectedFaultId] || FAULT_CATALOG.find((f) => f.id === selectedFaultId)?.defaultTarget,
          intensity: intensityConfig[selectedFaultId] || 'Media',
          duration: durationConfig[selectedFaultId] || 7,
        },
      ];
    }

    saveCustomScenario({
      name: newScenarioName,
      description: newScenarioDesc,
      mode: injectionMode,
      faults: faultsToSave,
    });

    setScenarios(getSavedScenarios());
    setShowSaveModal(false);
    setNewScenarioName('');
    setNewScenarioDesc('');
  };

  // ─── Forzar Recuperación Inmediata ─────────────────────────────────────────
  const handleForceAllRecovery = () => {
    if (!checkPermission('ADMIN', 'Forzar recuperación inmediata de fallos', addLog)) return;

    // Restaurar dispositivos
    if (systemContext.setDevices) {
      systemContext.setDevices((prev) =>
        prev.map((d) => ({
          ...d,
          status:
            d.type === 'light'
              ? 'ON'
              : d.type === 'climate'
              ? '22.5 °C'
              : d.type === 'lock'
              ? 'BLOQUEADA'
              : 'ONLINE',
        }))
      );
    }

    // Restaurar procesos
    if (systemContext.setProcesses) {
      systemContext.setProcesses((prev) =>
        prev.map((p) =>
          p.state === 'WAITING' ? { ...p, state: 'READY', cpu: 6 } : p
        )
      );
    }

    // Restaurar CPU
    if (systemContext.setCpuUsageOverride) {
      systemContext.setCpuUsageOverride(null);
    }

    // Restaurar memoria
    if (systemContext.setMemoryBlocks) {
      systemContext.setMemoryBlocks((prev) =>
        prev.map((b) => ({ ...b, corrupted: false }))
      );
    }

    // Resolver todas las alertas
    if (systemContext.setAlerts) {
      systemContext.setAlerts((prev) =>
        prev.map((a) => ({ ...a, state: 'Resuelta' }))
      );
    }

    addLog({
      level: 'INFO',
      source: 'EMERGENCY_RECOVERY',
      message: '[REINICIO MAESTRO] Recuperación forzada por el administrador. Todos los subsistemas restablecidos a valores nominales.',
    });

    setActiveInjections([]);
    setProgressiveStage(null);
    setHistory(getInjectionHistory());
  };

  return (
    <div className="space-y-6">
      {/* ─── 1. Encabezado de la Pantalla ──────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center space-x-2">
            <span className="text-amber-400">⚡</span>
            <span>Motor de Inyección de Fallos & Resiliencia</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800">
              FAULT INJECTION ENGINE
            </span>
          </h2>
          <p className="text-xs text-slate-400">
            Pruebas de tolerancia a fallos, diagnóstico reactivo del Kernel y autorrecuperación automática sin colapsos.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-400">
            Rol: <strong className="text-white">{role}</strong>
          </div>
          {activeInjections.length > 0 && (
            <div className="px-3 py-1.5 rounded-xl bg-red-950/60 border border-red-700/60 text-xs font-mono text-red-300 animate-pulse flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400 animate-ping"></span>
              <span>{activeInjections.length} fallo(s) activo(s)</span>
            </div>
          )}
        </div>
      </div>

      {/* Alerta de restricción si no es ADMIN */}
      {!isAdmin && (
        <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/40 text-xs text-amber-200 font-mono">
          <strong>Modo Observador:</strong> Tu rol actual ({role}) solo permite consultar el catálogo y el historial. La inyección de fallos y configuración de escenarios requiere privilegios de <strong>ADMIN</strong>.
        </div>
      )}

      {/* ─── 2. Barra de Modos de Inyección ────────────────────────────────── */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div>
            <div className="text-xs font-bold text-white uppercase tracking-wider">
              Modo de Inyección Activo
            </div>
            <div className="text-[11px] text-slate-400">
              Selecciona la estrategia de estrés para evaluar la resiliencia del sistema operativo.
            </div>
          </div>

          {/* Segmented Control de Modos */}
          <div className="flex rounded-xl border border-slate-700 bg-slate-950 p-1 text-xs font-mono">
            <button
              onClick={() => setInjectionMode('ISOLATED')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                injectionMode === 'ISOLATED'
                  ? 'bg-cyan-600 text-white font-bold shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🎯 Aislado
            </button>
            <button
              onClick={() => setInjectionMode('COMBINED')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                injectionMode === 'COMBINED'
                  ? 'bg-purple-600 text-white font-bold shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🌪️ Combinado
            </button>
            <button
              onClick={() => setInjectionMode('PROGRESSIVE')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                injectionMode === 'PROGRESSIVE'
                  ? 'bg-amber-600 text-white font-bold shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📈 Progresivo
            </button>
          </div>
        </div>

        {/* Explicación del Modo Activo */}
        <div className="text-xs font-mono text-slate-300 flex items-center justify-between">
          <span>
            {injectionMode === 'ISOLATED' && (
              <>
                <strong>Modo Aislado:</strong> Inyecta un solo fallo a la vez para medir su tiempo exacto de detección y verificar su rutina de autorrecuperación individual.
              </>
            )}
            {injectionMode === 'COMBINED' && (
              <>
                <strong>Modo Combinado:</strong> Dispara múltiples fallos simultáneamente (hardware, procesos, memoria y concurrencia) para evaluar la robustez multivectorial.
              </>
            )}
            {injectionMode === 'PROGRESSIVE' && (
              <>
                <strong>Modo Progresivo:</strong> La intensidad se incrementa automáticamente cada 3.5 segundos (Nivel 1: 30% → Nivel 2: 65% → Nivel 3: 100%) antes de autorrecuperar.
              </>
            )}
          </span>

          {lastScenario && (
            <button
              onClick={() => handleExecuteScenario(lastScenario)}
              className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-[11px] font-bold transition-all shrink-0 ml-4 cursor-pointer"
              title="Volver a ejecutar el último escenario con los mismos parámetros"
            >
              🔁 Repetir último escenario
            </button>
          )}
        </div>
      </div>

      {/* ─── 3. Navegación Secundaria (Catálogo, Escenarios, Historial) ────── */}
      <div className="flex border-b border-slate-800 text-xs font-mono">
        <button
          onClick={() => setActiveTab('catalog')}
          className={`px-4 py-2.5 font-bold transition-all border-b-2 cursor-pointer ${
            activeTab === 'catalog'
              ? 'border-cyan-400 text-cyan-400 bg-cyan-950/20'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          📦 Catálogo de Fallos ({FAULT_CATALOG.length})
        </button>
        <button
          onClick={() => setActiveTab('scenarios')}
          className={`px-4 py-2.5 font-bold transition-all border-b-2 cursor-pointer ${
            activeTab === 'scenarios'
              ? 'border-purple-400 text-purple-400 bg-purple-950/20'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          📋 Escenarios & Presets ({scenarios.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2.5 font-bold transition-all border-b-2 cursor-pointer ${
            activeTab === 'history'
              ? 'border-amber-400 text-amber-400 bg-amber-950/20'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          ⏱️ Historial & Métricas ({history.length})
        </button>
      </div>

      {/* ─── 4. Monitor de Inyecciones Activas en Tiempo Real ───────────────── */}
      {activeInjections.length > 0 && (
        <div className="p-4 rounded-2xl bg-slate-900 border border-red-800/60 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400 animate-ping"></span>
              <span>Monitor de Recuperación Reactiva en Tiempo Real</span>
            </h3>
            <button
              onClick={handleForceAllRecovery}
              className="px-3 py-1 rounded-lg bg-red-950 hover:bg-red-900 text-red-200 border border-red-700 text-[11px] font-bold cursor-pointer transition-all"
            >
              🚨 Forzar Recuperación Inmediata de Todos
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeInjections.map((act) => (
              <div
                key={act.id}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs font-mono"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{act.faultName}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/60 text-amber-300 border border-amber-800/60">
                    {act.status}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  Objetivo: <strong className="text-cyan-300">{formatTargetDisplay(act.target)}</strong> · Modo:{' '}
                  {formatModeDisplay(act.mode)} · Intensidad: {act.intensity}
                </div>
                {/* Barra de progreso de autorrecuperación */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>Secuencia de Autorrecuperación:</span>
                    <span>Paso {act.step} de 4</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-700"
                      style={{ width: `${(act.step / 4) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {progressiveStage && (
            <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-700/60 text-xs font-mono text-amber-300 flex items-center justify-between">
              <span>📈 <strong>Escalamiento Progresivo Activo:</strong> {progressiveStage.stageLabel}</span>
              <span className="animate-pulse">Aumentando carga del Kernel...</span>
            </div>
          )}
        </div>
      )}

      {/* ─── 5. PESTAÑA: CATÁLOGO DE FALLOS ─────────────────────────────────── */}
      {activeTab === 'catalog' && (
        <div className="space-y-4">
          {/* Filtros de Categoría */}
          <div className="flex flex-wrap items-center gap-2">
            {['ALL', ...Object.values(FAULT_CATEGORIES)].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-slate-800 text-cyan-400 border border-cyan-500/40 shadow-sm'
                    : 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {cat === 'ALL' ? 'Todos los Fallos' : cat}
              </button>
            ))}

            {/* Botón de Inyección en Lote si es Modo Combinado */}
            {injectionMode === 'COMBINED' && (
              <button
                onClick={handleInjectCombined}
                className="ml-auto px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs font-mono tracking-wide shadow-lg shadow-purple-600/30 transition-all cursor-pointer"
              >
                ⚡ Inyectar Escenario Combinado ({combinedSelectedFaults.length})
              </button>
            )}

            {/* Botón de Inicio si es Modo Progresivo */}
            {injectionMode === 'PROGRESSIVE' && (
              <button
                onClick={handleInjectProgressive}
                className="ml-auto px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs font-mono tracking-wide shadow-lg shadow-amber-600/30 transition-all cursor-pointer"
              >
                📈 Iniciar Estrés Progresivo
              </button>
            )}
          </div>

          {/* Grid de Tarjetas de Fallo */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCatalog.map((fault) => {
              const isSelectedForCombo = combinedSelectedFaults.includes(fault.id);

              return (
                <div
                  key={fault.id}
                  className={`p-5 rounded-2xl bg-slate-900 border transition-all flex flex-col justify-between space-y-4 shadow-lg ${
                    isSelectedForCombo && injectionMode === 'COMBINED'
                      ? 'border-purple-500/80 shadow-purple-950/40 bg-purple-950/10'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Encabezado de la tarjeta */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-2xl">{fault.icon}</span>
                        <div>
                          <h3 className="text-sm font-bold text-white">{fault.name}</h3>
                          <span
                            className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border ${fault.badgeColor}`}
                          >
                            {fault.category}
                          </span>
                        </div>
                      </div>

                      {/* Checkbox para Modo Combinado */}
                      {injectionMode === 'COMBINED' && (
                        <input
                          type="checkbox"
                          checked={isSelectedForCombo}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setCombinedSelectedFaults((prev) => [...prev, fault.id]);
                            } else {
                              setCombinedSelectedFaults((prev) => prev.filter((id) => id !== fault.id));
                            }
                          }}
                          className="w-4 h-4 rounded text-purple-600 focus:ring-0 cursor-pointer"
                        />
                      )}
                    </div>

                    <p className="text-xs text-slate-400">{fault.description}</p>

                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] font-mono text-slate-300">
                      <span className="text-amber-400 font-bold">Impacto SO:</span> {fault.impact}
                    </div>

                    {/* ── Parámetros Configurables ── */}
                    <div className="space-y-2 pt-1 border-t border-slate-800/80">
                      <div className="text-[10px] font-mono text-slate-500 uppercase">
                        Configuración de Inyección
                      </div>

                      {/* Selector de Objetivo (Target) */}
                      <div>
                        <label className="block text-[10px] font-mono text-slate-400 mb-0.5">
                          Objetivo del Fallo:
                        </label>
                        {fault.targetType === 'device' && (
                          <select
                            value={targetConfig[fault.id] || fault.defaultTarget}
                            onChange={(e) =>
                              setTargetConfig((prev) => ({ ...prev, [fault.id]: e.target.value }))
                            }
                            className="w-full bg-slate-950 text-xs font-mono text-cyan-300 rounded-lg p-1.5 border border-slate-800 focus:outline-none"
                          >
                            {devices.map((d) => (
                              <option key={d.id} value={d.id} className="bg-slate-900 text-white">
                                {d.name} ({d.zone})
                              </option>
                            ))}
                          </select>
                        )}

                        {fault.targetType === 'process' && (
                          <select
                            value={targetConfig[fault.id] || fault.defaultTarget}
                            onChange={(e) =>
                              setTargetConfig((prev) => ({ ...prev, [fault.id]: e.target.value }))
                            }
                            className="w-full bg-slate-950 text-xs font-mono text-cyan-300 rounded-lg p-1.5 border border-slate-800 focus:outline-none"
                          >
                            {processes.map((p) => (
                              <option key={p.id} value={p.name} className="bg-slate-900 text-white">
                                {p.name} (PID {p.pid} - {p.state})
                              </option>
                            ))}
                          </select>
                        )}

                        {fault.targetType === 'memory_owner' && (
                          <select
                            value={targetConfig[fault.id] || fault.defaultTarget}
                            onChange={(e) =>
                              setTargetConfig((prev) => ({ ...prev, [fault.id]: e.target.value }))
                            }
                            className="w-full bg-slate-950 text-xs font-mono text-purple-300 rounded-lg p-1.5 border border-slate-800 focus:outline-none"
                          >
                            {memoryBlocks.map((b) => (
                              <option key={b.owner} value={b.owner} className="bg-slate-900 text-white">
                                Bloque: {b.owner} ({b.size} KB)
                              </option>
                            ))}
                          </select>
                        )}

                        {fault.targetType === 'dual_process' && (
                          <div className="grid grid-cols-2 gap-1 text-[10px] font-mono">
                            <select
                              value={targetConfig[fault.id]?.processA || 'lock_guard'}
                              onChange={(e) =>
                                setTargetConfig((prev) => ({
                                  ...prev,
                                  [fault.id]: { ...(prev[fault.id] || {}), processA: e.target.value },
                                }))
                              }
                              className="bg-slate-950 text-fuchsia-300 rounded-lg p-1 border border-slate-800"
                            >
                              {processes.map((p) => (
                                <option key={p.id} value={p.name}>
                                  P1: {p.name}
                                </option>
                              ))}
                            </select>
                            <select
                              value={targetConfig[fault.id]?.processB || 'routine_engine'}
                              onChange={(e) =>
                                setTargetConfig((prev) => ({
                                  ...prev,
                                  [fault.id]: { ...(prev[fault.id] || {}), processB: e.target.value },
                                }))
                              }
                              className="bg-slate-950 text-fuchsia-300 rounded-lg p-1 border border-slate-800"
                            >
                              {processes.map((p) => (
                                <option key={p.id} value={p.name}>
                                  P2: {p.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      {/* Selectores de Intensidad y Duración */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-mono text-slate-400 mb-0.5">
                            Intensidad:
                          </label>
                          <select
                            value={intensityConfig[fault.id] || fault.defaultIntensity}
                            onChange={(e) =>
                              setIntensityConfig((prev) => ({ ...prev, [fault.id]: e.target.value }))
                            }
                            className="w-full bg-slate-950 text-xs font-mono text-slate-200 rounded-lg p-1.5 border border-slate-800 focus:outline-none"
                          >
                            {INTENSITY_LEVELS.map((lvl) => (
                              <option key={lvl.value} value={lvl.value}>
                                {lvl.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono text-slate-400 mb-0.5">
                            Duración:
                          </label>
                          <select
                            value={durationConfig[fault.id] || fault.defaultDuration}
                            onChange={(e) =>
                              setDurationConfig((prev) => ({ ...prev, [fault.id]: Number(e.target.value) }))
                            }
                            className="w-full bg-slate-950 text-xs font-mono text-slate-200 rounded-lg p-1.5 border border-slate-800 focus:outline-none"
                          >
                            <option value={4}>4 segundos</option>
                            <option value={7}>7 segundos</option>
                            <option value={10}>10 segundos</option>
                            <option value={15}>15 segundos</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Botón de Inyección Directa (Modo Aislado) */}
                  <div className="pt-2 border-t border-slate-800">
                    <button
                      onClick={() => {
                        setSelectedFaultId(fault.id);
                        handleInjectSingle(fault.id);
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-slate-950 hover:bg-red-950/60 text-red-300 border border-red-800/50 hover:border-red-600 text-xs font-mono font-bold transition-all shadow-sm flex items-center justify-center space-x-1.5 cursor-pointer"
                    >
                      <span>⚡ Inyectar Fallo Aislado</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── 6. PESTAÑA: ESCENARIOS & PRESETS ─────────────────────────────────── */}
      {activeTab === 'scenarios' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">Escenarios Reproducibles de Prueba</h3>
              <p className="text-xs text-slate-400">
                Secuencias de fallos predeterminadas y personalizadas para evaluar el comportamiento del sistema.
              </p>
            </div>
            <button
              onClick={() => setShowSaveModal(true)}
              className="px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-bold tracking-wide transition-all shadow-md cursor-pointer"
            >
              + Guardar Configuración Actual como Escenario
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scenarios.map((scen) => (
              <div
                key={scen.id}
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg space-y-3 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white">{scen.name}</h4>
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/60">
                        Modo {formatModeDisplay(scen.mode)} · {scen.faults?.length || 1} fallo(s)
                      </span>
                    </div>

                    {!scen.isPreset && (
                      <button
                        onClick={() => {
                          if (confirm(`¿Eliminar escenario "${scen.name}"?`)) {
                            deleteCustomScenario(scen.id);
                            setScenarios(getSavedScenarios());
                          }
                        }}
                        className="text-slate-500 hover:text-red-400 text-xs"
                        title="Eliminar escenario"
                      >
                        🗑️
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-slate-400 mt-2">{scen.description}</p>

                  {/* Lista de fallos en el escenario */}
                  <div className="mt-3 space-y-1">
                    <div className="text-[10px] font-mono text-slate-500">Composición:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {scen.faults?.map((f, i) => {
                        const def = FAULT_CATALOG.find((cat) => cat.id === f.faultId);
                        return (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-950 text-slate-300 border border-slate-800"
                          >
                            {def?.icon} {def?.name} ({f.intensity})
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-500">
                    {scen.isPreset ? 'Preset del Sistema' : 'Creado por Administrador'}
                  </span>
                  <button
                    onClick={() => handleExecuteScenario(scen)}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-xs font-mono font-bold tracking-wide shadow-md transition-all cursor-pointer"
                  >
                    ▶ Ejecutar Escenario
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── 7. PESTAÑA: HISTORIAL & MÉTRICAS ────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">Historial de Inyecciones & Telemetría</h3>
              <p className="text-xs text-slate-400">
                Registro de tiempos de detección diagnóstica y tiempos de autorrecuperación para cada evento.
              </p>
            </div>
            {history.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('¿Limpiar todo el historial de inyecciones?')) {
                    clearInjectionHistory();
                    setHistory([]);
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-all"
              >
                Limpiar Historial
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-slate-900 border border-slate-800 text-slate-500 text-xs font-mono">
              No hay registros de inyecciones previas. Dispara un fallo desde el catálogo para generar telemetría.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900 shadow-lg">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider bg-slate-950/60">
                    <th className="py-3 px-3">Hora</th>
                    <th className="py-3 px-3">Fallo / Incidente</th>
                    <th className="py-3 px-3">Modo</th>
                    <th className="py-3 px-3">Objetivo</th>
                    <th className="py-3 px-3">T. Detección</th>
                    <th className="py-3 px-3">T. Recuperación</th>
                    <th className="py-3 px-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {history.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-950/40 transition-colors">
                      <td className="py-3 px-3 text-slate-400">{rec.timestamp}</td>
                      <td className="py-3 px-3 font-semibold text-white flex items-center space-x-1.5">
                        <span>{rec.icon || '⚡'}</span>
                        <span>{rec.faultName}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-800 text-slate-300 border border-slate-700">
                          {formatModeDisplay(rec.mode)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-cyan-300 font-medium truncate max-w-xs">
                        {formatTargetDisplay(rec.target)}
                      </td>
                      <td className="py-3 px-3 text-amber-400 font-bold">
                        {rec.detectionTimeMs ? `${rec.detectionTimeMs} ms` : 'En análisis...'}
                      </td>
                      <td className="py-3 px-3 text-emerald-400 font-bold">
                        {rec.recoveryTimeMs ? `${(rec.recoveryTimeMs / 1000).toFixed(2)} s` : 'Recuperando...'}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            rec.status === 'RECUPERADO'
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                              : rec.status === 'RECUPERANDO'
                              ? 'bg-amber-950/80 text-amber-300 border border-amber-800 animate-pulse'
                              : 'bg-red-950/80 text-red-300 border border-red-800'
                          }`}
                        >
                          {rec.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── MODAL: GUARDAR ESCENARIO PERSONALIZADO ─────────────────────────── */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white">Guardar Escenario de Prueba</h3>
            <p className="text-xs text-slate-400">
              Crea un escenario con la configuración y los fallos actualmente activos en el motor.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-mono text-slate-300 mb-1">
                  Nombre del Escenario:
                </label>
                <input
                  type="text"
                  placeholder="ej. Test Concurrencia y Red Salón"
                  value={newScenarioName}
                  onChange={(e) => setNewScenarioName(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-300 mb-1">
                  Descripción (Opcional):
                </label>
                <textarea
                  rows={2}
                  placeholder="Comportamiento esperado y condiciones de la prueba..."
                  value={newScenarioDesc}
                  onChange={(e) => setNewScenarioDesc(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="text-[11px] font-mono text-slate-500 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                Modo seleccionado: <strong className="text-cyan-400">{injectionMode}</strong> ·{' '}
                {injectionMode === 'COMBINED'
                  ? `${combinedSelectedFaults.length} fallos en lote`
                  : `Fallo activo: ${selectedFaultId}`}
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveCurrentScenario}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-bold transition-all"
              >
                Guardar Escenario
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
