import React, { createContext, useContext, useState, useMemo } from 'react';
import {
  INITIAL_PROCESSES,
  INITIAL_MEMORY_BLOCKS,
  INITIAL_FILE_SYSTEM,
  INITIAL_DEVICES,
  INITIAL_LOGS,
  INITIAL_ALERTS,
  PRIORITY_MAP,
  PRIORITY_LABEL,
} from '../data/mockData';

// Importación directa de la máquina de estados oficial de la integrante 1
import { ESTADOS, TRANSICIONES_PERMITIDAS } from '../../procesos-cpu/src/proceso.js';

const SystemContext = createContext();

export const SystemProvider = ({ children }) => {
  // 1. Procesos
  const [processes, setProcesses] = useState(INITIAL_PROCESSES);

  // 2. Memoria (64 Bloques físicos de 16MB cada uno = 1024MB total)
  const [memoryBlocks, setMemoryBlocks] = useState(INITIAL_MEMORY_BLOCKS);

  // 3. Sistema de archivos (/system, /apps, /users, /drivers, /config, /logs)
  const [fileSystem, setFileSystem] = useState(INITIAL_FILE_SYSTEM);

  // 4. Dispositivos del hogar
  const [devices, setDevices] = useState(INITIAL_DEVICES);

  // 5. Logs y Alertas
  const [logs, setLogs] = useState(INITIAL_LOGS);
  const [alerts, setAlerts] = useState(INITIAL_ALERTS);

  // Métricas calculadas dinámicamente según el estado real de la memoria y alertas
  const freeBlocksCount = useMemo(
    () => memoryBlocks.filter((b) => b.state === 'FREE').length,
    [memoryBlocks]
  );
  const usedBlocksCount = useMemo(
    () => memoryBlocks.filter((b) => b.state !== 'FREE').length,
    [memoryBlocks]
  );

  const activeAlertsCount = alerts.filter((a) => a.state === 'Activa').length;

  // Telemetría del sistema vinculada al estado de memoria
  const metrics = {
    cpuUsage: 28,
    ramUsageMB: usedBlocksCount * 16,
    ramTotalMB: 1024,
    storageUsageGB: 26.8,
    storageTotalGB: 64,
    batteryPercent: 84,
    powerDrawWatts: 115,
    robotStatus: activeAlertsCount > 0 ? 'EN ALERTA' : 'OPERATIVO',
  };

  const getNowTimestamp = () => {
    const d = new Date();
    return d.toTimeString().split(' ')[0];
  };

  const addLog = ({ level = 'INFO', source = 'SYSTEM', message }) => {
    const newLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      timestamp: getNowTimestamp(),
      level, // INFO | WARN | ERROR
      source,
      message,
    };
    setLogs((prev) => [newLogEntry, ...prev.slice(0, 99)]);
  };

  const addAlert = ({ title, details, severity = 'error' }) => {
    const newAlert = {
      id: `alert_${Date.now()}`,
      timestamp: getNowTimestamp(),
      title,
      details,
      severity,
      state: 'Activa',
    };
    setAlerts((prev) => [newAlert, ...prev]);

    addLog({
      level: severity === 'warning' ? 'WARN' : 'ERROR',
      source: 'ALERT_DAEMON',
      message: `[ALERTA EMITIDA] ${title}: ${details}`,
    });
  };

  const resolveAlert = (alertId) => {
    const targetAlert = alerts.find((a) => a.id === alertId);
    if (!targetAlert || targetAlert.state === 'Resuelta') return;

    setAlerts((prev) =>
      prev.map((al) => (al.id === alertId ? { ...al, state: 'Resuelta' } : al))
    );

    addLog({
      level: 'INFO',
      source: 'ALERT_DAEMON',
      message: `Alerta "${targetAlert.title}" marcada como Resuelta por el operador.`,
    });
  };

  // ==========================================
  // OPERACIONES DE PROCESOS Y MEMORIA
  // ==========================================

  /**
   * Crear proceso:
   * 1. Verifica memoria disponible.
   * 2. Inicia en estado NEW y requiere tiempoTotal (duración en ticks).
   * 3. Asigna PID correlativo y mapea prioridad numérica.
   */
  const createProcess = ({
    name,
    priority = 'Media',
    memoryBlocksCount = 2,
    cpu = 5,
    tiempoTotal = 4,
  }) => {
    const requestedBlocks = Number(memoryBlocksCount);
    const availableBlocks = memoryBlocks.filter((b) => b.state === 'FREE').length;
    const cleanName = name.trim().toLowerCase().replace(/\s+/g, '_');
    const ticks = Math.max(1, Number(tiempoTotal) || 4);

    // Validación de memoria suficiente
    if (requestedBlocks > availableBlocks) {
      addAlert({
        title: 'Fallo de Memoria: Espacio Insuficiente',
        details: `Imposible crear el proceso "${cleanName}". Se solicitaron ${requestedBlocks} bloques pero solo quedan ${availableBlocks} disponibles.`,
        severity: 'error',
      });

      addLog({
        level: 'ERROR',
        source: 'MEM_MANAGER',
        message: `[MEMORIA INSUFICIENTE] Rechazada creación de "${cleanName}". Solicitados: ${requestedBlocks} bloques (${requestedBlocks * 16}MB), Disponibles: ${availableBlocks} bloques (${availableBlocks * 16}MB).`,
      });

      return { success: false, reason: 'MEM_INSUFFICIENT' };
    }

    const userColors = ['#06B6D4', '#3B82F6', '#8B5CF6', '#10B981', '#EC4899', '#F97316'];
    const chosenColor = userColors[Math.floor(Math.random() * userColors.length)];

    // Asignación de bloques de memoria
    let allocatedSoFar = 0;
    setMemoryBlocks((prev) =>
      prev.map((b) => {
        if (b.state === 'FREE' && allocatedSoFar < requestedBlocks) {
          allocatedSoFar++;
          return {
            ...b,
            state: 'ALLOCATED',
            processName: cleanName,
            color: chosenColor,
          };
        }
        return b;
      })
    );

    const maxPid = processes.reduce((max, p) => (p.pid > max ? p.pid : max), 100);
    const newPid = maxPid + 1;
    const numPriority = PRIORITY_MAP[priority] || (typeof priority === 'number' ? priority : 3);
    const labelPriority = PRIORITY_LABEL[numPriority] || priority;

    const newProcess = {
      id: `p_${Date.now()}`,
      pid: newPid,
      name: cleanName,
      state: ESTADOS.NEW, // Inicia en estado NEW según la máquina de estados oficial
      priority: labelPriority,
      prioridadNum: numPriority,
      tiempoTotal: ticks,
      memoryBlocks: requestedBlocks,
      memory: requestedBlocks * 16,
      cpu: Number(cpu),
      color: chosenColor,
      isSystem: false,
      description: 'Proceso de usuario creado dinámicamente',
    };

    setProcesses((prev) => [...prev, newProcess]);

    addLog({
      level: 'INFO',
      source: 'PROCESS_MGR',
      message: `Nuevo proceso creado: PID ${newPid} [${cleanName}] (Prioridad: ${labelPriority} [Nivel ${numPriority}], Duración: ${ticks} ticks, Memoria: ${requestedBlocks} blq [${requestedBlocks * 16}MB], CPU: ${cpu}%, Estado: NEW).`,
    });

    addLog({
      level: 'INFO',
      source: 'MEM_MANAGER',
      message: `Asignados ${requestedBlocks} bloques de memoria física a "${cleanName}" (PID ${newPid}).`,
    });

    return { success: true, process: newProcess };
  };

  /**
   * Admitir proceso: NEW -> READY
   * Paso obligatorio antes de que un proceso pueda ejecutarse.
   */
  const admitProcess = (processId) => {
    const target = processes.find((p) => p.id === processId);
    if (!target || target.state !== ESTADOS.NEW) return;

    setProcesses((prev) =>
      prev.map((p) => (p.id === processId ? { ...p, state: ESTADOS.READY } : p))
    );

    addLog({
      level: 'INFO',
      source: 'SCHEDULER',
      message: `Proceso PID ${target.pid} (${target.name}) admitido al sistema [NEW] -> [READY].`,
    });
  };

  /**
   * Ejecutar: READY -> RUNNING
   * Solo aplicable desde READY (un proceso NEW debe ser admitido primero).
   */
  const executeProcess = (processId) => {
    const target = processes.find((p) => p.id === processId);
    if (!target || target.state !== ESTADOS.READY) return;

    setProcesses((prev) =>
      prev.map((p) => (p.id === processId ? { ...p, state: ESTADOS.RUNNING } : p))
    );

    addLog({
      level: 'INFO',
      source: 'SCHEDULER',
      message: `Proceso PID ${target.pid} (${target.name}) puesto en ejecución [READY] -> [RUNNING].`,
    });
  };

  /**
   * Pausar: RUNNING o READY -> WAITING
   */
  const pauseProcess = (processId) => {
    const target = processes.find((p) => p.id === processId);
    if (!target || (target.state !== ESTADOS.RUNNING && target.state !== ESTADOS.READY)) return;

    setProcesses((prev) =>
      prev.map((p) => (p.id === processId ? { ...p, state: ESTADOS.WAITING } : p))
    );

    addLog({
      level: 'INFO',
      source: 'SCHEDULER',
      message: `Proceso PID ${target.pid} (${target.name}) pausado [${target.state}] -> [WAITING].`,
    });
  };

  /**
   * Reanudar: WAITING -> READY
   */
  const resumeProcess = (processId) => {
    const target = processes.find((p) => p.id === processId);
    if (!target || target.state !== ESTADOS.WAITING) return;

    setProcesses((prev) =>
      prev.map((p) => (p.id === processId ? { ...p, state: ESTADOS.READY } : p))
    );

    addLog({
      level: 'INFO',
      source: 'SCHEDULER',
      message: `Proceso PID ${target.pid} (${target.name}) reanudado [WAITING] -> [READY].`,
    });
  };

  /**
   * Finalizar: Cualquier estado activo -> TERMINATED y libera memoria
   */
  const terminateProcess = (processId) => {
    const targetProcess = processes.find((p) => p.id === processId);
    if (!targetProcess || targetProcess.state === ESTADOS.TERMINATED) return;

    // 1. Cambiar estado a TERMINATED
    setProcesses((prev) =>
      prev.map((p) => (p.id === processId ? { ...p, state: ESTADOS.TERMINATED, cpu: 0 } : p))
    );

    // 2. Liberar sus bloques de memoria
    let freedCount = 0;
    setMemoryBlocks((prev) =>
      prev.map((b) => {
        if (b.state === 'ALLOCATED' && b.processName === targetProcess.name) {
          freedCount++;
          return { ...b, state: 'FREE', processName: null, color: '#1E293B' };
        }
        return b;
      })
    );

    addLog({
      level: 'WARN',
      source: 'PROCESS_MGR',
      message: `Proceso PID ${targetProcess.pid} (${targetProcess.name}) finalizado -> Estado: TERMINATED.`,
    });

    addLog({
      level: 'INFO',
      source: 'MEM_MANAGER',
      message: `Memoria liberada: devueltos ${targetProcess.memoryBlocks || freedCount} bloques a la reserva disponible (Proceso "${targetProcess.name}").`,
    });
  };

  // Operaciones de Memoria directas
  const freeMemoryBlock = (blockId) => {
    const block = memoryBlocks.find((b) => b.id === blockId);
    if (!block || block.state === 'KERNEL') {
      addLog({
        level: 'WARN',
        source: 'MEM_MANAGER',
        message: `Intento de liberar bloque de Kernel o inexistente (#${blockId}). Operación denegada.`,
      });
      return false;
    }

    setMemoryBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, state: 'FREE', processName: null, color: '#1E293B' } : b))
    );

    addLog({
      level: 'INFO',
      source: 'MEM_MANAGER',
      message: `Bloque #${blockId} liberado manualmente y devuelto a la reserva disponible.`,
    });
    return true;
  };

  // Operaciones de Archivos (CRUD)
  const createFile = (folder, { name, size = '10 KB' }) => {
    if (!fileSystem[folder]) return;
    const newFile = {
      id: `f_${Date.now()}`,
      name,
      size,
      modified: new Date().toISOString().replace('T', ' ').substring(0, 16),
      permissions: 'rw-r--r--',
    };

    setFileSystem((prev) => ({
      ...prev,
      [folder]: [...prev[folder], newFile],
    }));

    addLog({
      level: 'INFO',
      source: 'VFS',
      message: `Archivo creado en ${folder}: "${name}" (${size}).`,
    });
  };

  const updateFile = (folder, fileId, newName) => {
    if (!fileSystem[folder]) return;
    setFileSystem((prev) => ({
      ...prev,
      [folder]: prev[folder].map((f) =>
        f.id === fileId
          ? {
              ...f,
              name: newName,
              modified: new Date().toISOString().replace('T', ' ').substring(0, 16),
            }
          : f
      ),
    }));

    addLog({
      level: 'INFO',
      source: 'VFS',
      message: `Archivo modificado en ${folder} (ID: ${fileId}) renombrado a "${newName}".`,
    });
  };

  const deleteFile = (folder, fileId) => {
    const file = fileSystem[folder]?.find((f) => f.id === fileId);
    if (!file) return;

    setFileSystem((prev) => ({
      ...prev,
      [folder]: prev[folder].filter((f) => f.id !== fileId),
    }));

    addLog({
      level: 'WARN',
      source: 'VFS',
      message: `Archivo eliminado en ${folder}: "${file.name}".`,
    });
  };

  // Control de dispositivos
  const toggleDevice = (id) => {
    const target = devices.find((d) => d.id === id);
    if (!target) return;

    let nextStatus = target.status;
    let nextTemp = target.temperature;

    switch (target.type) {
      case 'light':
        nextStatus = target.status === 'ON' ? 'OFF' : 'ON';
        break;
      case 'motion':
        nextStatus = target.status === 'EN REPOSO' ? 'DETECTADO' : 'EN REPOSO';
        break;
      case 'camera':
        nextStatus = target.status === 'ONLINE' ? 'OFFLINE' : 'ONLINE';
        break;
      case 'lock':
        nextStatus = target.status === 'BLOQUEADA' ? 'DESBLOQUEADA' : 'BLOQUEADA';
        break;
      case 'climate':
        nextTemp = target.temperature >= 24 ? 20.0 : +(target.temperature + 1.5).toFixed(1);
        nextStatus = `${nextTemp} °C`;
        break;
      default:
        nextStatus = target.status === 'ON' ? 'OFF' : 'ON';
    }

    setDevices((prev) =>
      prev.map((d) =>
        d.id === id
          ? { ...d, status: nextStatus, ...(d.type === 'climate' ? { temperature: nextTemp } : {}) }
          : d
      )
    );

    addLog({
      level: 'INFO',
      source: 'IOT_MANAGER',
      message: `Dispositivo "${target.name}" conmutado a estado: ${nextStatus}.`,
    });
  };

  // Simulaciones de fallos
  const simulateSensorDisconnected = () => {
    addAlert({
      title: 'Sensor Desconectado',
      details: 'El sensor de temperatura en Salón no responde en el bus I2C (Hardware Offline).',
      severity: 'warning',
    });

    setProcesses((prev) =>
      prev.map((p) =>
        p.name === 'temp_manager' ? { ...p, state: ESTADOS.WAITING, color: '#F59E0B' } : p
      )
    );

    addLog({
      level: 'ERROR',
      source: 'HARDWARE_BUS',
      message: '[FALLO DETECTADO] Dispositivo sensor_temp_01 desconectado físicamente del bus I2C.',
    });

    addLog({
      level: 'WARN',
      source: 'REACTOR',
      message: '[REACCIÓN KERNEL] Proceso "temp_manager" (PID 102) puesto en estado WAITING por falta de telemetría.',
    });
  };

  const simulateCommLoss = () => {
    addAlert({
      title: 'Pérdida de Comunicación',
      details: 'Pérdida de enlace inalámbrico Zigbee con Cerradura Puerta Principal.',
      severity: 'error',
    });

    setDevices((prev) =>
      prev.map((d) => (d.id === 'd5' ? { ...d, status: 'OFFLINE' } : d))
    );

    addLog({
      level: 'ERROR',
      source: 'NETWORK_STACK',
      message: '[FALLO DETECTADO] Pérdida de paquetes en nodo Zigbee 0x4A1F (Cerradura Puerta Principal).',
    });

    addLog({
      level: 'WARN',
      source: 'REACTOR',
      message: '[REACCIÓN KERNEL] Dispositivo "Cerradura Puerta Principal" conmutado a estado OFFLINE.',
    });

    addLog({
      level: 'INFO',
      source: 'NETWORK_STACK',
      message: '[REINTENTO CONEXIÓN] Iniciando reintento de handshake con nodo 0x4A1F (Reintento 1/3)... Fallido (Timeout 3000ms).',
    });
  };

  const simulateUnauthorizedAccess = () => {
    addAlert({
      title: 'Acceso No Autorizado',
      details: 'Detección de intento de apertura forzada o PIN erróneo en Entrada.',
      severity: 'critical',
    });

    setProcesses((prev) =>
      prev.map((p) =>
        p.name === 'surveillance_proc'
          ? { ...p, state: ESTADOS.RUNNING, priority: 'Crítica', prioridadNum: 1, color: '#EF4444' }
          : p
      )
    );

    setDevices((prev) =>
      prev.map((d) => (d.type === 'lock' ? { ...d, status: 'BLOQUEADA' } : d))
    );

    addLog({
      level: 'ERROR',
      source: 'SECURITY_CORE',
      message: '[FALLO DETECTADO] 3 intentos erróneos consecutivos de desbloqueo en Cerradura Puerta Principal.',
    });

    addLog({
      level: 'WARN',
      source: 'REACTOR',
      message: '[REACCIÓN KERNEL] Protocolo de intrusión: "surveillance_proc" (PID 103) elevado a prioridad CRÍTICA (Nivel 1) y estado RUNNING.',
    });

    addLog({
      level: 'INFO',
      source: 'REACTOR',
      message: '[REACCIÓN HARDWARE] Cerrojo electrónico asegurado forzosamente: Estado fijado en BLOQUEADA.',
    });
  };

  return (
    <SystemContext.Provider
      value={{
        metrics,
        processes,
        memoryBlocks,
        freeBlocksCount,
        usedBlocksCount,
        fileSystem,
        devices,
        logs,
        alerts,
        activeAlertsCount,
        addLog,
        addAlert,
        resolveAlert,
        createProcess,
        admitProcess,
        executeProcess,
        pauseProcess,
        resumeProcess,
        terminateProcess,
        freeMemoryBlock,
        createFile,
        updateFile,
        deleteFile,
        toggleDevice,
        simulateSensorDisconnected,
        simulateCommLoss,
        simulateUnauthorizedAccess,
      }}
    >
      {children}
    </SystemContext.Provider>
  );
};

export const useSystem = () => useContext(SystemContext);
