import React, { createContext, useContext, useState, useMemo } from 'react';
import {
  INITIAL_PROCESSES,
  INITIAL_MEMORY_BLOCKS,
  INITIAL_FILE_SYSTEM,
  INITIAL_DEVICES,
  INITIAL_LOGS,
  INITIAL_ALERTS,
} from '../data/mockData';

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
    setAlerts((prev) =>
      prev.map((al) => {
        if (al.id === alertId) {
          addLog({
            level: 'INFO',
            source: 'ALERT_DAEMON',
            message: `Alerta "${al.title}" marcada como Resuelta por el operador.`,
          });
          return { ...al, state: 'Resuelta' };
        }
        return al;
      })
    );
  };

  // ==========================================
  // OPERACIONES DE PROCESOS Y MEMORIA
  // ==========================================

  /**
   * Crear proceso:
   * 1. Verifica si hay bloques de memoria suficientes.
   * 2. Si no hay, emite alerta de memoria insuficiente y registra en logs sin crearlo.
   * 3. Si hay, asigna los bloques requeridos, genera PID y arranca en estado NEW.
   */
  const createProcess = ({ name, priority = 'Media', memoryBlocksCount = 2, cpu = 5 }) => {
    const requestedBlocks = Number(memoryBlocksCount);
    const availableBlocks = memoryBlocks.filter((b) => b.state === 'FREE').length;
    const cleanName = name.trim().toLowerCase().replace(/\s+/g, '_');

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

    // Paleta de colores para procesos de usuario
    const userColors = ['#06B6D4', '#3B82F6', '#8B5CF6', '#10B981', '#EC4899', '#F97316'];
    const chosenColor = userColors[Math.floor(Math.random() * userColors.length)];

    // Asignación de los bloques de memoria
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

    // Asignación de PID automático único
    const maxPid = processes.reduce((max, p) => (p.pid > max ? p.pid : max), 100);
    const newPid = maxPid + 1;

    const newProcess = {
      id: `p_${Date.now()}`,
      pid: newPid,
      name: cleanName,
      state: 'NEW', // Inicia en estado NEW
      priority,
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
      message: `Nuevo proceso creado: PID ${newPid} [${cleanName}] (Prioridad: ${priority}, Memoria: ${requestedBlocks} bloques [${requestedBlocks * 16}MB], CPU: ${cpu}%, Estado inicial: NEW).`,
    });

    addLog({
      level: 'INFO',
      source: 'MEM_MANAGER',
      message: `Asignados ${requestedBlocks} bloques de memoria física a "${cleanName}" (PID ${newPid}).`,
    });

    return { success: true, process: newProcess };
  };

  /**
   * Ejecutar: NEW o READY -> RUNNING
   */
  const executeProcess = (processId) => {
    setProcesses((prev) =>
      prev.map((p) => {
        if (p.id === processId && (p.state === 'NEW' || p.state === 'READY')) {
          addLog({
            level: 'INFO',
            source: 'SCHEDULER',
            message: `Proceso PID ${p.pid} (${p.name}) puesto en ejecución [${p.state}] -> [RUNNING].`,
          });
          return { ...p, state: 'RUNNING' };
        }
        return p;
      })
    );
  };

  /**
   * Pausar: RUNNING -> WAITING
   */
  const pauseProcess = (processId) => {
    setProcesses((prev) =>
      prev.map((p) => {
        if (p.id === processId && p.state === 'RUNNING') {
          addLog({
            level: 'INFO',
            source: 'SCHEDULER',
            message: `Proceso PID ${p.pid} (${p.name}) pausado [RUNNING] -> [WAITING].`,
          });
          return { ...p, state: 'WAITING' };
        }
        return p;
      })
    );
  };

  /**
   * Reanudar: WAITING -> READY
   */
  const resumeProcess = (processId) => {
    setProcesses((prev) =>
      prev.map((p) => {
        if (p.id === processId && p.state === 'WAITING') {
          addLog({
            level: 'INFO',
            source: 'SCHEDULER',
            message: `Proceso PID ${p.pid} (${p.name}) reanudado [WAITING] -> [READY].`,
          });
          return { ...p, state: 'READY' };
        }
        return p;
      })
    );
  };

  /**
   * Finalizar: cualquier estado pasa a TERMINATED y LIBERA SU MEMORIA
   */
  const terminateProcess = (processId) => {
    const targetProcess = processes.find((p) => p.id === processId);
    if (!targetProcess || targetProcess.state === 'TERMINATED') return;

    // 1. Cambiar estado a TERMINATED
    setProcesses((prev) =>
      prev.map((p) => (p.id === processId ? { ...p, state: 'TERMINATED', cpu: 0 } : p))
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
    setDevices((prev) =>
      prev.map((d) => {
        if (d.id === id) {
          let nextStatus = d.status;

          switch (d.type) {
            case 'light':
              nextStatus = d.status === 'ON' ? 'OFF' : 'ON';
              break;
            case 'motion':
              nextStatus = d.status === 'EN REPOSO' ? 'DETECTADO' : 'EN REPOSO';
              break;
            case 'camera':
              nextStatus = d.status === 'ONLINE' ? 'OFFLINE' : 'ONLINE';
              break;
            case 'lock':
              nextStatus = d.status === 'BLOQUEADA' ? 'DESBLOQUEADA' : 'BLOQUEADA';
              break;
            case 'climate':
              const nextTemp = d.temperature >= 24 ? 20.0 : +(d.temperature + 1.5).toFixed(1);
              nextStatus = `${nextTemp} °C`;
              return { ...d, status: nextStatus, temperature: nextTemp };
            default:
              nextStatus = d.status === 'ON' ? 'OFF' : 'ON';
          }

          addLog({
            level: 'INFO',
            source: 'IOT_MANAGER',
            message: `Dispositivo "${d.name}" conmutado a estado: ${nextStatus}.`,
          });
          return { ...d, status: nextStatus };
        }
        return d;
      })
    );
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
        p.name === 'temp_manager' ? { ...p, state: 'WAITING', color: '#F59E0B' } : p
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
          ? { ...p, state: 'RUNNING', priority: 'Crítica', color: '#EF4444' }
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
      message: '[REACCIÓN KERNEL] Protocolo de intrusión: "surveillance_proc" (PID 103) elevado a prioridad CRÍTICA y estado RUNNING.',
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
