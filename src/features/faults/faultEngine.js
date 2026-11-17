/**
 * faultEngine.js — Orquestador del Motor de Inyección y Autorrecuperación
 *
 * Responsabilidades:
 * 1. Ejecutar inyecciones en los 3 modos: AISLADO, COMBINADO, PROGRESIVO.
 * 2. Medir tiempos exactos:
 *    - Tiempo de Detección (ms) desde la inyección hasta la alarma diagnóstica.
 *    - Tiempo de Recuperación (s/ms) hasta que el subsistema se restablece.
 * 3. Ejecutar las rutinas de autorrecuperación paso a paso con bitácoras detalladas en logs.
 * 4. Gestionar el historial persistente de inyecciones.
 */

import { FAULT_CATALOG } from './faultCatalog';
import {
  injectDeadlockRAG,
  detectDeadlockInRAG,
  resolveDeadlockByPriority,
} from './deadlockModule';
import {
  generateUUID,
  persistFaultInjection,
  fetchFaultHistory,
  persistSecurityEvent,
} from '../../lib/persistence';

const HISTORY_KEY = 'robotos_fault_injection_history_v1';

// ─── Historial de Inyecciones ───────────────────────────────────────────────
export function getInjectionHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveInjectionRecord(record) {
  try {
    const current = getInjectionHistory();
    const updated = [record, ...current.filter((r) => r.id !== record.id)].slice(0, 50); // Últimos 50 registros
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    // Persistencia asíncrona en Supabase
    persistFaultInjection(record);
    return updated;
  } catch {
    persistFaultInjection(record);
    return [];
  }
}

export function updateInjectionRecord(recordId, updates) {
  try {
    const current = getInjectionHistory();
    let updatedRecord = null;
    const updated = current.map((r) => {
      if (r.id === recordId) {
        updatedRecord = { ...r, ...updates };
        return updatedRecord;
      }
      return r;
    });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    // Persistencia asíncrona en Supabase
    if (updatedRecord) {
      persistFaultInjection(updatedRecord);
    }
    return updated;
  } catch {
    return [];
  }
}

export function clearInjectionHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {}
}

// ─── Ejecución de Inyecciones ───────────────────────────────────────────────

/**
 * Inyecta un fallo individual y programa su secuencia de autorrecuperación paso a paso.
 *
 * @param {object} param0
 * @param {string} param0.faultId - Identificador del catálogo
 * @param {any} param0.target - Dispositivo o Proceso objetivo
 * @param {string} param0.intensity - 'Baja' | 'Media' | 'Alta'
 * @param {number} param0.duration - Duración en segundos
 * @param {string} param0.mode - 'ISOLATED' | 'COMBINED' | 'PROGRESSIVE'
 * @param {object} param0.systemContext - Contexto completo de RobotOS
 * @param {Function} param0.onProgress - Callback para actualización en vivo de la UI
 */
export function executeSingleFault({
  faultId,
  target,
  intensity = 'Media',
  duration = 7,
  mode = 'ISOLATED',
  systemContext,
  onProgress,
}) {
  const faultDef = FAULT_CATALOG.find((f) => f.id === faultId);
  if (!faultDef) return null;

  const {
    devices,
    setDevices,
    processes,
    setProcesses,
    memoryBlocks,
    setMemoryBlocks,
    memoryStats,
    setMemoryStats,
    memoryManager,
    alerts,
    setAlerts,
    addAlert,
    resolveAlert,
    addLog,
    setCpuUsageOverride,
  } = systemContext;

  const injectionId = generateUUID();
  const startTime = performance.now();

  // Simulación de latencia de interrupción y detección por el kernel (180ms - 420ms)
  const detectionLatencyMs = Math.round(180 + Math.random() * 240);

  // Resolución de nombres amigables en español
  const resolveTargetName = (t) => {
    if (!t) return 'Sistema';
    if (typeof t === 'object') return `${t.processA || 'Proceso A'} ⇄ ${t.processB || 'Proceso B'}`;
    const dev = devices?.find((d) => d.id === t || d.name === t);
    if (dev) return dev.name;
    const proc = processes?.find((p) => p.name === t || String(p.pid) === t);
    if (proc) return proc.name;
    return String(t);
  };

  const MODE_SPANISH = {
    ISOLATED: 'Aislado',
    COMBINED: 'Combinado',
    PROGRESSIVE: 'Progresivo',
    Aislado: 'Aislado',
    Combinado: 'Combinado',
    Progresivo: 'Progresivo',
  };

  const resolvedTarget = resolveTargetName(target);
  const resolvedMode = MODE_SPANISH[mode] || mode;

  // Registro inicial en el historial
  const initialRecord = {
    id: injectionId,
    faultId,
    faultName: faultDef.name,
    category: faultDef.category,
    icon: faultDef.icon,
    mode: resolvedMode,
    target: resolvedTarget,
    intensity,
    duration,
    timestamp: new Date().toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    detectionTimeMs: null,
    recoveryTimeMs: null,
    status: 'INYECTADO', // INYECTADO -> DETECTADO -> RECUPERANDO -> RECUPERADO
    currentStepIndex: 0,
    stepsLogs: [],
  };

  saveInjectionRecord(initialRecord);
  if (onProgress) onProgress(initialRecord);

  // Almacén temporal de timeouts para cancelación si se fuerza recuperación
  const activeTimeouts = [];
  const addTimeout = (fn, delay) => {
    const tid = setTimeout(fn, delay);
    activeTimeouts.push(tid);
    return tid;
  };

  // Variable para ID de alerta creada
  let createdAlertId = null;

  // ── 1. FASE DE IMPACTO INICIAL ───────────────────────────────────────────
  addLog({
    level: 'ERROR',
    source: 'FAULT_INJECTOR',
    message: `[INYECCIÓN INICIADA] Modo ${mode}: Fallo "${faultDef.name}" aplicado a objetivo [${initialRecord.target}] (Intensidad: ${intensity}, Duración: ${duration}s).`,
  });

  // Aplicar cambios directos al sistema según el fallo
  let targetDevice = null;
  let targetProcess = null;

  if (faultId === 'sensor_disconnected') {
    const devId = target || 'd6';
    targetDevice = devices.find((d) => d.id === devId) || devices[0];
    if (setDevices) {
      setDevices((prev) =>
        prev.map((d) => (d.id === devId ? { ...d, status: 'OFFLINE' } : d))
      );
    }
    // Si es clima, temp_manager pasa a WAITING
    if (targetDevice?.type === 'climate' && setProcesses) {
      setProcesses((prev) =>
        prev.map((p) =>
          p.name === 'temp_manager' ? { ...p, state: 'WAITING', color: '#F59E0B' } : p
        )
      );
    }
  } else if (faultId === 'comm_loss') {
    const devId = target || 'd5';
    targetDevice = devices.find((d) => d.id === devId) || devices[0];
    if (setDevices) {
      setDevices((prev) =>
        prev.map((d) => (d.id === devId ? { ...d, status: 'OFFLINE' } : d))
      );
    }
  } else if (faultId === 'unauthorized_access') {
    const devId = target || 'd5';
    targetDevice = devices.find((d) => d.id === devId) || devices[0];
    if (setDevices) {
      setDevices((prev) =>
        prev.map((d) => (d.type === 'lock' ? { ...d, status: 'BLOQUEADA' } : d))
      );
    }
    persistSecurityEvent({
      event_type: 'UNAUTHORIZED_ACCESS',
      severity: 'CRITICAL',
      description: `Inyección de fallo (${resolvedMode}): intento de acceso no autorizado en "${targetDevice?.name || 'Entrada'}".`,
      deviceName: targetDevice?.name || null,
    });
    if (setProcesses) {
      setProcesses((prev) =>
        prev.map((p) =>
          p.name === 'surveillance_proc'
            ? { ...p, state: 'RUNNING', priority: 'Crítica', prioridadNum: 1, color: '#EF4444' }
            : p
        )
      );
    }
  } else if (faultId === 'process_hang') {
    const procName = target || 'temp_manager';
    targetProcess = processes.find((p) => p.name === procName) || processes[0];
    if (setProcesses) {
      setProcesses((prev) =>
        prev.map((p) =>
          p.name === procName ? { ...p, state: 'WAITING', color: '#3B82F6' } : p
        )
      );
    }
  } else if (faultId === 'cpu_overload') {
    const procName = target || 'routine_engine';
    targetProcess = processes.find((p) => p.name === procName) || processes[0];
    if (setCpuUsageOverride) {
      setCpuUsageOverride(98);
    }
    if (setProcesses) {
      setProcesses((prev) =>
        prev.map((p) => (p.name === procName ? { ...p, cpu: 75 } : p))
      );
    }
  } else if (faultId === 'memory_corruption') {
    const ownerName = target || 'surveillance_proc';
    if (setMemoryBlocks) {
      setMemoryBlocks((prev) =>
        prev.map((b) => (b.owner === ownerName ? { ...b, corrupted: true } : b))
      );
    }
  } else if (faultId === 'deadlock') {
    const procAName = target?.processA || 'lock_guard';
    const procBName = target?.processB || 'routine_engine';
    if (setProcesses) {
      setProcesses((prev) =>
        prev.map((p) =>
          p.name === procAName || p.name === procBName
            ? { ...p, state: 'WAITING', color: '#C026D3' }
            : p
        )
      );
    }
  }

  // ── 2. FASE DE DETECCIÓN (T + detectionLatencyMs) ────────────────────────
  addTimeout(() => {
    const detectionTimeMs = Math.round(performance.now() - startTime);

    // Crear alerta en el sistema
    let alertTitle = `Fallo: ${faultDef.name}`;
    let alertDetails = `Detección en objetivo ${initialRecord.target}. Intensidad: ${intensity}.`;

    if (faultId === 'sensor_disconnected') {
      alertTitle = 'Sensor Desconectado';
      alertDetails = `El sensor "${targetDevice?.name || 'I2C'}" no responde en el bus I2C.`;
    } else if (faultId === 'comm_loss') {
      alertTitle = 'Pérdida de Comunicación';
      alertDetails = `Pérdida de enlace Zigbee con nodo "${targetDevice?.name || 'Cerradura'}".`;
    } else if (faultId === 'unauthorized_access') {
      alertTitle = 'Acceso No Autorizado';
      alertDetails = `3 intentos fallidos de PIN en cerrojo "${targetDevice?.name || 'Entrada'}".`;
    } else if (faultId === 'process_hang') {
      alertTitle = 'Proceso Colgado';
      alertDetails = `Watchdog detectó timeout de latido (>3000ms) en "${targetProcess?.name || 'proceso'}".`;
    } else if (faultId === 'cpu_overload') {
      alertTitle = 'Sobrecarga Crítica de CPU';
      alertDetails = 'Consumo de CPU alcanzó el 98% con degradación de tiempos de respuesta.';
    } else if (faultId === 'memory_corruption') {
      alertTitle = 'Corrupción de Memoria';
      alertDetails = `Error de paridad y fallo de checksum CRC en bloque de "${target || 'RAM'}".`;
    } else if (faultId === 'deadlock') {
      alertTitle = 'Deadlock de Concurrencia';
      alertDetails = `Espera circular detectada entre "${target?.processA || 'lock_guard'}" y "${target?.processB || 'routine_engine'}".`;
    }

    if (addAlert) {
      createdAlertId = `alert_${Date.now()}`;
      addAlert({
        id: createdAlertId,
        title: alertTitle,
        details: alertDetails,
        severity: faultId === 'unauthorized_access' || faultId === 'deadlock' ? 'critical' : 'error',
      });
    }

    addLog({
      level: 'WARNING',
      source: 'DIAGNOSTIC_DAEMON',
      message: `[DIAGNÓSTICO POSITIVO] ${alertTitle}: ${alertDetails} (Latencia de detección: ${detectionTimeMs} ms).`,
    });

    const updated = {
      detectionTimeMs,
      status: 'DETECTADO',
      stepsLogs: [`Detección confirmada en ${detectionTimeMs} ms`],
    };
    updateInjectionRecord(injectionId, updated);
    if (onProgress) onProgress({ ...initialRecord, ...updated });
  }, detectionLatencyMs);

  // ── 3. FASE DE AUTORRECUPERACIÓN ESCALONADA ──────────────────────────────
  const durationMs = duration * 1000;
  const stepIntervalMs = durationMs / 4;

  // Paso 1 de recuperación
  addTimeout(() => {
    const stepMsg = faultDef.recoverySteps[0] || 'Diagnóstico y aislamiento del fallo';
    addLog({
      level: 'INFO',
      source: 'AUTO_RECOVERY',
      message: `[AUTORRECUPERACIÓN 1/4] ${stepMsg}...`,
    });
    updateInjectionRecord(injectionId, {
      status: 'RECUPERANDO',
      currentStepIndex: 1,
      stepsLogs: [stepMsg],
    });
    if (onProgress) onProgress({ status: 'RECUPERANDO', currentStepIndex: 1 });
  }, stepIntervalMs);

  // Paso 2 de recuperación
  addTimeout(() => {
    const stepMsg = faultDef.recoverySteps[1] || 'Aplicando protocolo de mitigación';
    addLog({
      level: 'INFO',
      source: 'AUTO_RECOVERY',
      message: `[AUTORRECUPERACIÓN 2/4] ${stepMsg}...`,
    });
    updateInjectionRecord(injectionId, {
      status: 'RECUPERANDO',
      currentStepIndex: 2,
    });
    if (onProgress) onProgress({ status: 'RECUPERANDO', currentStepIndex: 2 });
  }, stepIntervalMs * 2);

  // Paso 3 de recuperación
  addTimeout(() => {
    const stepMsg = faultDef.recoverySteps[2] || 'Verificación de integridad de señal';
    addLog({
      level: 'INFO',
      source: 'AUTO_RECOVERY',
      message: `[AUTORRECUPERACIÓN 3/4] ${stepMsg}...`,
    });
    updateInjectionRecord(injectionId, {
      status: 'RECUPERANDO',
      currentStepIndex: 3,
    });
    if (onProgress) onProgress({ status: 'RECUPERANDO', currentStepIndex: 3 });
  }, stepIntervalMs * 3);

  // Paso 4: Restauración Completa
  addTimeout(() => {
    // Restaurar el estado del sistema
    if (faultId === 'sensor_disconnected') {
      const devId = target || 'd6';
      if (setDevices) {
        setDevices((prev) =>
          prev.map((d) =>
            d.id === devId
              ? { ...d, status: d.type === 'climate' ? '22.5 °C' : 'EN REPOSO' }
              : d
          )
        );
      }
      if (setProcesses) {
        setProcesses((prev) =>
          prev.map((p) =>
            p.name === 'temp_manager' ? { ...p, state: 'READY', color: '#F59E0B' } : p
          )
        );
      }
    } else if (faultId === 'comm_loss') {
      const devId = target || 'd5';
      if (setDevices) {
        setDevices((prev) =>
          prev.map((d) =>
            d.id === devId
              ? { ...d, status: d.type === 'lock' ? 'BLOQUEADA' : 'ONLINE' }
              : d
          )
        );
      }
    } else if (faultId === 'unauthorized_access') {
      if (setProcesses) {
        setProcesses((prev) =>
          prev.map((p) =>
            p.name === 'surveillance_proc'
              ? { ...p, state: 'READY', priority: 'Media', prioridadNum: 3, color: '#3B82F6' }
              : p
          )
        );
      }
    } else if (faultId === 'process_hang') {
      const procName = target || 'temp_manager';
      if (setProcesses) {
        setProcesses((prev) =>
          prev.map((p) =>
            p.name === procName ? { ...p, state: 'READY', color: '#F59E0B' } : p
          )
        );
      }
    } else if (faultId === 'cpu_overload') {
      const procName = target || 'routine_engine';
      if (setCpuUsageOverride) {
        setCpuUsageOverride(null); // Vuelve a valor normal
      }
      if (setProcesses) {
        setProcesses((prev) =>
          prev.map((p) => (p.name === procName ? { ...p, cpu: 6 } : p))
        );
      }
    } else if (faultId === 'memory_corruption') {
      const ownerName = target || 'surveillance_proc';
      if (memoryManager) {
        memoryManager.free(ownerName);
        memoryManager.allocate(ownerName, 128);
        if (setMemoryBlocks) setMemoryBlocks([...memoryManager.blocks]);
        if (setMemoryStats) setMemoryStats(memoryManager.stats());
      } else if (setMemoryBlocks) {
        setMemoryBlocks((prev) =>
          prev.map((b) => (b.owner === ownerName ? { ...b, corrupted: false } : b))
        );
      }
    } else if (faultId === 'deadlock') {
      const procAName = target?.processA || 'lock_guard';
      const procBName = target?.processB || 'routine_engine';

      // Usar deadlockModule para resolver
      const dummyRAG = injectDeadlockRAG(procAName, procBName).rag;
      const resolution = resolveDeadlockByPriority(processes, [procAName, procBName], dummyRAG);

      addLog({
        level: 'INFO',
        source: 'DEADLOCK_RESOLVER',
        message: `[DEADLOCK RESUELTO] ${resolution.explanation}`,
      });

      if (setProcesses) {
        setProcesses((prev) =>
          prev.map((p) => {
            if (p.name === procAName) return { ...p, state: 'RUNNING', color: '#EC4899' };
            if (p.name === procBName) return { ...p, state: 'READY', color: '#06B6D4' };
            return p;
          })
        );
      }
    }

    // Resolver alerta
    if (setAlerts) {
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === createdAlertId || a.title?.includes(faultDef.name)
            ? { ...a, state: 'Resuelta' }
            : a
        )
      );
    }

    const totalRecoveryTimeMs = Math.round(performance.now() - startTime);
    const recoverySeconds = (totalRecoveryTimeMs / 1000).toFixed(2);

    addLog({
      level: 'INFO',
      source: 'AUTO_RECOVERY',
      message: `[RECUPERACIÓN EXITOSA] Fallo "${faultDef.name}" neutralizado. Tiempo total de recuperación: ${recoverySeconds} s. Subsistema normalizado.`,
    });

    const finalRecord = {
      status: 'RECUPERADO',
      recoveryTimeMs: totalRecoveryTimeMs,
      currentStepIndex: 4,
    };
    updateInjectionRecord(injectionId, finalRecord);
    if (onProgress) onProgress(finalRecord);
  }, durationMs);

  return {
    injectionId,
    cancel: () => {
      activeTimeouts.forEach(clearTimeout);
    },
  };
}

/**
 * Modo Combinado: Inyecta múltiples fallos simultáneamente
 */
export function executeCombinedFaults({
  faultList,
  systemContext,
  onProgress,
}) {
  const handles = [];
  faultList.forEach((faultConfig, idx) => {
    setTimeout(() => {
      const handle = executeSingleFault({
        ...faultConfig,
        mode: 'COMBINED',
        systemContext,
        onProgress: (update) => {
          if (onProgress) onProgress({ index: idx, ...update });
        },
      });
      if (handle) handles.push(handle);
    }, idx * 400); // Pequeña cascada de 400ms para realismo
  });

  return {
    cancelAll: () => handles.forEach((h) => h.cancel()),
  };
}

/**
 * Modo Progresivo: Inyecta fallos aumentando la intensidad escalonadamente
 */
export function executeProgressiveFault({
  primaryFaultId = 'cpu_overload',
  target = 'routine_engine',
  totalDuration = 12,
  systemContext,
  onStageChange,
  onProgress,
}) {
  const { addLog } = systemContext;
  const stages = [
    { level: 'Nivel 1 (Baja 30%)', delay: 0, intensity: 'Baja' },
    { level: 'Nivel 2 (Media 65%)', delay: 3500, intensity: 'Media' },
    { level: 'Nivel 3 (Alta 100%)', delay: 7000, intensity: 'Alta' },
  ];

  stages.forEach((stage, idx) => {
    setTimeout(() => {
      addLog({
        level: 'WARN',
        source: 'PROGRESSIVE_ENGINE',
        message: `[ESTRÉS PROGRESIVO] Escalando a ${stage.level}. Intensidad de fallo incrementada.`,
      });
      if (onStageChange) onStageChange(idx + 1, stage.level);
    }, stage.delay);
  });

  return executeSingleFault({
    faultId: primaryFaultId,
    target,
    intensity: 'Alta',
    duration: totalDuration,
    mode: 'PROGRESSIVE',
    systemContext,
    onProgress,
  });
}
