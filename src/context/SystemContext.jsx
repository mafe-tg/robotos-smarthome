import React, { createContext, useContext, useState, useMemo, useEffect, useRef } from 'react';
import {
  INITIAL_PROCESSES,
  INITIAL_SUPABASE_MEMORY_BLOCKS,
  INITIAL_SUPABASE_FILES,
  INITIAL_SUPABASE_CLIPS,
  INITIAL_ENERGY_DEVICES,
  INITIAL_ENERGY_USAGE,
  INITIAL_SUPABASE_LOGS,
  INITIAL_DEVICES,
  INITIAL_ALERTS,
  PRIORITY_MAP,
  PRIORITY_LABEL,
} from '../data/mockData';

// Importación directa de la máquina de estados oficial de la integrante 1
import { ESTADOS, TRANSICIONES_PERMITIDAS } from '../../procesos-cpu/src/proceso.js';

// Importación directa de las clases oficiales de Dana (integrante 2) sin modificar su archivo
import {
  MemoryManager,
  VirtualFileSystem,
  LogManager,
  SurveillanceStorage,
  EnergyMonitor,
  LEVELS,
} from '../../memory-storage/memoryStorage.js';

// Cliente de Supabase
import { supabase } from '../lib/supabase';

const SystemContext = createContext();

// Colores consistentes para los propietarios de memoria
const OWNER_COLORS = {
  lighting_daemon: '#10B981',
  surveillance_proc: '#3B82F6',
  lock_guard: '#EC4899',
  temp_manager: '#F59E0B',
  routine_engine: '#06B6D4',
  energy_monitor: '#8B5CF6',
  luces: '#10B981',
  seguridad: '#3B82F6',
  clima: '#F59E0B',
  camaras: '#8B5CF6',
  dashboard: '#06B6D4',
};

const getOwnerColor = (owner) => OWNER_COLORS[owner] || '#06B6D4';

export const SystemProvider = ({ children }) => {
  // Instancias de los módulos de Dana (mantienen el modelo operativo en memoria viva)
  const memoryManagerRef = useRef(null);
  const vfsRef = useRef(null);
  const logManagerRef = useRef(null);
  const surveillanceStorageRef = useRef(null);
  const energyMonitorRef = useRef(null);
  const lastLogRef = useRef({ message: '', time: 0 });

  // Inicialización síncrona segura con datos semilla idénticos a Supabase
  if (!memoryManagerRef.current) {
    const mm = new MemoryManager(1024);
    mm.blocks = INITIAL_SUPABASE_MEMORY_BLOCKS.map((b) => ({
      start: b.start_kb,
      size: b.size_kb,
      owner: b.owner,
      id: b.id,
    }));
    memoryManagerRef.current = mm;

    const vfs = new VirtualFileSystem(10_000_000);
    for (const f of INITIAL_SUPABASE_FILES) {
      vfs.write(f.path, f.content || '', { size: f.size_bytes });
    }
    vfsRef.current = vfs;

    const lm = new LogManager(vfs);
    logManagerRef.current = lm;

    const ss = new SurveillanceStorage(vfs, lm);
    for (const c of INITIAL_SUPABASE_CLIPS) {
      ss.clips.set(c.path, { camera: c.camera_id, seq: c.id, protected: c.is_protected });
    }
    surveillanceStorageRef.current = ss;

    const em = new EnergyMonitor(lm, { thresholdKwh: 5.0, priceKwh: 700.0 });
    for (const d of INITIAL_ENERGY_DEVICES) {
      em.register(d.device, d.watts);
    }
    for (const u of INITIAL_ENERGY_USAGE) {
      em.recordUsage(u.device, u.seconds);
    }
    energyMonitorRef.current = em;
  }

  // 1. Procesos
  const [processes, setProcesses] = useState(INITIAL_PROCESSES);

  // 2. Memoria (Modelo de Dana: 1024 KB con bloques de tamaño variable)
  const [memoryBlocks, setMemoryBlocks] = useState(
    memoryManagerRef.current ? [...memoryManagerRef.current.blocks] : []
  );
  const [memoryStats, setMemoryStats] = useState(
    memoryManagerRef.current
      ? memoryManagerRef.current.stats()
      : { totalKb: 1024, usedKb: 800, freeKb: 224, usagePct: 78.1, blocks: 6 }
  );

  // 3. Sistema de archivos VFS & Clips de Vigilancia
  const [vfsFiles, setVfsFiles] = useState(INITIAL_SUPABASE_FILES);
  const [vfsStats, setVfsStats] = useState({
    usedBytes: vfsRef.current ? vfsRef.current.used() : 4500174,
    capacityBytes: vfsRef.current ? vfsRef.current.capacity : 10000000,
  });
  const [surveillanceClips, setSurveillanceClips] = useState(INITIAL_SUPABASE_CLIPS);

  // 4. Energía (EnergyMonitor de Dana)
  const [energyReport, setEnergyReport] = useState(
    energyMonitorRef.current
      ? energyMonitorRef.current.report()
      : { porDispositivoKwh: {}, totalKwh: 9.64, costoEstimado: 6745.2 }
  );

  // 5. Dispositivos del hogar
  const [devices, setDevices] = useState(INITIAL_DEVICES);

  // 6. Logs y Alertas (incluye logs de la tabla Supabase)
  const [logs, setLogs] = useState(INITIAL_SUPABASE_LOGS);
  const [alerts, setAlerts] = useState(INITIAL_ALERTS);

  // Carga asíncrona desde Supabase al montar el componente (solo lectura remota)
  useEffect(() => {
    let isMounted = true;

    const loadSupabaseData = async () => {
      try {
        const [memRes, filesRes, logsRes, clipsRes, energyDevRes, energyUsageRes] = await Promise.all([
          supabase.from('memory_blocks').select('*').order('start_kb', { ascending: true }),
          supabase.from('files').select('*'),
          supabase.from('logs').select('*').order('id', { ascending: false }),
          supabase.from('surveillance_clips').select('*'),
          supabase.from('energy_devices').select('*'),
          supabase.from('energy_usage').select('*'),
        ]);

        if (!isMounted) return;

        // 1. Alimentar MemoryManager
        if (memRes.data && memRes.data.length > 0) {
          const mm = memoryManagerRef.current;
          mm.blocks = memRes.data.map((b) => ({
            id: b.id,
            start: b.start_kb,
            size: b.size_kb,
            owner: b.owner,
          }));
          setMemoryBlocks([...mm.blocks]);
          setMemoryStats(mm.stats());
        }

        // 2. Alimentar VirtualFileSystem
        if (filesRes.data && filesRes.data.length > 0) {
          const vfs = vfsRef.current;
          for (const f of filesRes.data) {
            vfs.write(f.path, f.content || '', { size: f.size_bytes });
          }
          setVfsFiles(filesRes.data);
          setVfsStats({ usedBytes: vfs.used(), capacityBytes: vfs.capacity });
        }

        // 3. Alimentar SurveillanceStorage
        if (clipsRes.data && clipsRes.data.length > 0) {
          const ss = surveillanceStorageRef.current;
          for (const c of clipsRes.data) {
            ss.clips.set(c.path, {
              camera: c.camera_id,
              seq: c.id,
              protected: c.is_protected,
            });
          }
          setSurveillanceClips(clipsRes.data);
        }

        // 4. Alimentar EnergyMonitor
        if (energyDevRes.data && energyDevRes.data.length > 0) {
          const em = energyMonitorRef.current;
          for (const ed of energyDevRes.data) {
            em.register(ed.device, ed.watts);
          }
        }
        if (energyUsageRes.data && energyUsageRes.data.length > 0) {
          const em = energyMonitorRef.current;
          for (const eu of energyUsageRes.data) {
            em.recordUsage(eu.device, eu.seconds);
          }
          setEnergyReport(energyMonitorRef.current.report());
        }

        // 5. Cargar logs de la tabla Supabase con sus niveles
        if (logsRes.data && logsRes.data.length > 0) {
          const formattedSupabaseLogs = logsRes.data.map((l) => ({
            id: `supa_${l.id}`,
            timestamp: new Date(l.created_at).toLocaleTimeString('es-CO', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
            created_at: l.created_at,
            level: l.level, // DEBUG | INFO | WARNING | ERROR | CRITICAL
            source: l.source.toUpperCase(),
            message: l.message,
          }));

          setLogs((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const toAdd = formattedSupabaseLogs.filter((sl) => !existingIds.has(sl.id));
            return [...toAdd, ...prev];
          });
        }
      } catch (err) {
        console.warn('Conexión Supabase offline o parcial. Usando datos precargados:', err);
      }
    };

    loadSupabaseData();

    return () => {
      isMounted = false;
    };
  }, []);

  const activeAlertsCount = alerts.filter((a) => a.state === 'Activa').length;

  // Telemetría del sistema vinculada al estado de memoria de Dana, VFS y EnergyMonitor
  const metrics = {
    cpuUsage: 28,
    ramUsageKB: memoryStats.usedKb,
    ramTotalKB: memoryStats.totalKb,
    ramUsageMB: Math.round((memoryStats.usedKb / 1024) * 10) / 10,
    ramTotalMB: 1,
    storageUsageBytes: vfsStats.usedBytes,
    storageCapacityBytes: vfsStats.capacityBytes,
    storageUsageMB: +(vfsStats.usedBytes / 1_000_000).toFixed(2),
    storageTotalMB: +(vfsStats.capacityBytes / 1_000_000).toFixed(1),
    batteryPercent: 84,
    powerDrawWatts: 115,
    energyKwh: energyReport.totalKwh,
    energyCosto: energyReport.costoEstimado,
    robotStatus: activeAlertsCount > 0 ? 'EN ALERTA' : 'OPERATIVO',
  };

  const getNowTimestamp = () => {
    const d = new Date();
    return d.toTimeString().split(' ')[0];
  };

  const addLog = ({ level = 'INFO', source = 'SYSTEM', message }) => {
    // Evitar registros duplicados inmediatos del mismo mensaje
    const now = Date.now();
    if (
      lastLogRef.current.message === message &&
      lastLogRef.current.source === source &&
      now - lastLogRef.current.time < 500
    ) {
      return;
    }
    lastLogRef.current = { message, source, time: now };

    const validLevel = level === 'WARN' ? 'WARNING' : level.toUpperCase();
    const safeLevel = validLevel in LEVELS ? validLevel : 'INFO';

    // Registrar en el LogManager de Dana (escribe en /logs/system.log de VirtualFileSystem)
    try {
      if (logManagerRef.current) {
        logManagerRef.current.log(safeLevel, source.toLowerCase(), message);
        if (vfsRef.current) {
          setVfsStats({
            usedBytes: vfsRef.current.used(),
            capacityBytes: vfsRef.current.capacity,
          });
        }
      }
    } catch (e) {
      // Ignorar saturación
    }

    const newLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      timestamp: getNowTimestamp(),
      level: safeLevel,
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
      level: severity === 'warning' ? 'WARNING' : 'ERROR',
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
  // OPERACIONES DE PROCESOS Y MEMORIA (DANA)
  // ==========================================

  /**
   * Crear proceso:
   * Usa MemoryManager.allocate() para reservar bloques contiguos en memoria de 1024 KB.
   */
  const createProcess = ({
    name,
    priority = 'Media',
    memoryKb = 64,
    cpu = 5,
    tiempoTotal = 4,
  }) => {
    const mm = memoryManagerRef.current;
    const reqKb = Number(memoryKb) || 64;
    const cleanName = name.trim().toLowerCase().replace(/\s+/g, '_');
    const ticks = Math.max(1, Number(tiempoTotal) || 4);

    // Asignación mediante la clase de Dana
    const allocated = mm.allocate(cleanName, reqKb);

    if (!allocated) {
      const stats = mm.stats();
      addAlert({
        title: 'Fallo de Memoria: Espacio Insuficiente',
        details: `Imposible crear el proceso "${cleanName}". Se solicitaron ${reqKb} KB pero no hay bloque contiguo suficiente (Libre total: ${stats.freeKb} KB).`,
        severity: 'error',
      });

      addLog({
        level: 'ERROR',
        source: 'MEM_MANAGER',
        message: `[MEMORIA INSUFICIENTE] Rechazada creación de "${cleanName}". Solicitados: ${reqKb} KB, Libre total: ${stats.freeKb} KB. ${stats.freeKb >= reqKb ? '(Fragmentación detectada: requiere compactación)' : ''}`,
      });

      return { success: false, reason: 'MEM_INSUFFICIENT' };
    }

    const chosenColor = getOwnerColor(cleanName);

    // Sincronizar estado de memoria
    setMemoryBlocks([...mm.blocks]);
    setMemoryStats(mm.stats());

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
      memoryKb: reqKb,
      memory: reqKb,
      startKb: allocated.start,
      cpu: Number(cpu),
      color: chosenColor,
      isSystem: false,
      description: 'Proceso de usuario creado dinámicamente',
    };

    setProcesses((prev) => [...prev, newProcess]);

    addLog({
      level: 'INFO',
      source: 'PROCESS_MGR',
      message: `Nuevo proceso creado: PID ${newPid} [${cleanName}] (Prioridad: ${labelPriority} [Nivel ${numPriority}], Duración: ${ticks} ticks, Memoria: ${reqKb} KB, CPU: ${cpu}%, Estado: NEW).`,
    });

    addLog({
      level: 'INFO',
      source: 'MEM_MANAGER',
      message: `Asignado bloque de memoria física [${allocated.start}..${allocated.start + allocated.size - 1} KB] (${reqKb} KB) a "${cleanName}" (PID ${newPid}) con allocate().`,
    });

    return { success: true, process: newProcess };
  };

  /**
   * Admitir proceso: NEW -> READY
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
   * Finalizar: Cualquier estado activo -> TERMINATED y libera memoria usando free() de Dana
   */
  const terminateProcess = (processId) => {
    const targetProcess = processes.find((p) => p.id === processId);
    if (!targetProcess || targetProcess.state === ESTADOS.TERMINATED) return;

    // 1. Cambiar estado a TERMINATED
    setProcesses((prev) =>
      prev.map((p) => (p.id === processId ? { ...p, state: ESTADOS.TERMINATED, cpu: 0 } : p))
    );

    // 2. Liberar memoria usando MemoryManager.free(owner)
    const mm = memoryManagerRef.current;
    const freedKb = mm ? mm.free(targetProcess.name) : 0;
    if (mm) {
      setMemoryBlocks([...mm.blocks]);
      setMemoryStats(mm.stats());
    }

    addLog({
      level: 'WARN',
      source: 'PROCESS_MGR',
      message: `Proceso PID ${targetProcess.pid} (${targetProcess.name}) finalizado -> Estado: TERMINATED.`,
    });

    addLog({
      level: 'INFO',
      source: 'MEM_MANAGER',
      message: `Memoria liberada con free("${targetProcess.name}"): devueltos ${freedKb || targetProcess.memoryKb || 0} KB a la reserva disponible.`,
    });
  };

  /**
   * Compactar memoria RAM usando MemoryManager.compact()
   * Si no hay huecos, no ejecuta compactación y retorna aviso.
   */
  const compactMemory = () => {
    const mm = memoryManagerRef.current;
    if (!mm) return { success: false, alreadyCompact: true, message: 'Administrador de memoria no disponible' };

    // 1. Detectar si existe fragmentación (huecos entre bloques o antes del primer bloque)
    const sorted = [...mm.blocks].sort((a, b) => a.start - b.start);
    let cursor = 0;
    let hasHoles = false;

    for (const b of sorted) {
      if (b.start > cursor) {
        hasHoles = true;
        break;
      }
      cursor = b.start + b.size;
    }

    if (!hasHoles) {
      addLog({
        level: 'INFO',
        source: 'MEM_MANAGER',
        message: 'Verificación de memoria RAM: No hay fragmentación, la memoria ya está compacta.',
      });
      return {
        success: false,
        alreadyCompact: true,
        message: 'No hay fragmentación, la memoria ya está compacta.',
      };
    }

    // 2. Si hay huecos, compactar con la clase oficial de Dana
    mm.compact();
    setMemoryBlocks([...mm.blocks]);
    setMemoryStats(mm.stats());

    addLog({
      level: 'INFO',
      source: 'MEM_MANAGER',
      message: `Memoria RAM compactada: bloques reubicados de forma contigua en memoria principal (0 a ${mm.stats().usedKb} KB). Fragmentación externa eliminada.`,
    });

    return {
      success: true,
      alreadyCompact: false,
      message: `Memoria RAM compactada: bloques contiguos de 0 a ${mm.stats().usedKb} KB. Fragmentación eliminada.`,
    };
  };

  /**
   * Liberar bloque de memoria manualmente (free)
   */
  const freeMemoryBlock = (owner) => {
    const mm = memoryManagerRef.current;
    if (!mm) return false;

    const freedKb = mm.free(owner);
    if (freedKb > 0) {
      setMemoryBlocks([...mm.blocks]);
      setMemoryStats(mm.stats());

      // Si había un proceso asociado, marcarlo como TERMINATED
      setProcesses((prev) =>
        prev.map((p) => (p.name === owner ? { ...p, state: ESTADOS.TERMINATED, cpu: 0 } : p))
      );

      addLog({
        level: 'INFO',
        source: 'MEM_MANAGER',
        message: `Bloque de "${owner}" liberado manualmente con free() (${freedKb} KB devueltos a la reserva disponible).`,
      });
      return true;
    }
    return false;
  };

  // ==========================================
  // OPERACIONES CRUD EN VIRTUALFILESYSTEM (DANA)
  // ==========================================

  /**
   * Crear archivo en VFS usando write()
   */
  const createVfsFile = ({ path, content = '' }) => {
    const vfs = vfsRef.current;
    if (!vfs) return { success: false, error: 'VFS no inicializado' };

    const normPath = VirtualFileSystem.norm(path);

    if (vfs.exists(normPath)) {
      addLog({
        level: 'WARNING',
        source: 'VFS',
        message: `Intento de creación fallido: El archivo "${normPath}" ya existe.`,
      });
      return { success: false, error: 'El archivo ya existe' };
    }

    const success = vfs.write(normPath, content);
    if (!success) {
      addAlert({
        title: 'VFS: Espacio Insuficiente',
        details: `No hay espacio en disco para crear "${normPath}".`,
        severity: 'error',
      });
      addLog({
        level: 'ERROR',
        source: 'VFS',
        message: `Sin espacio en disco virtual para crear "${normPath}".`,
      });
      return { success: false, error: 'Espacio en disco insuficiente' };
    }

    const fileData = vfs.files.get(normPath);
    const newFile = {
      id: `f_${Date.now()}`,
      path: normPath,
      content: fileData.content,
      size_bytes: fileData.size,
      created_at: new Date(fileData.created).toISOString(),
      modified_at: new Date(fileData.modified).toISOString(),
    };

    setVfsFiles((prev) => [...prev, newFile]);
    setVfsStats({ usedBytes: vfs.used(), capacityBytes: vfs.capacity });

    addLog({
      level: 'INFO',
      source: 'VFS',
      message: `Archivo creado: "${normPath}" (${fileData.size} Bytes) mediante VirtualFileSystem.write().`,
    });

    return { success: true, file: newFile };
  };

  /**
   * Modificar archivo en VFS usando write() y rename() si la ruta cambió
   */
  const updateVfsFile = ({ oldPath, newPath, content }) => {
    const vfs = vfsRef.current;
    if (!vfs) return { success: false, error: 'VFS no inicializado' };

    const normOld = VirtualFileSystem.norm(oldPath);
    const normNew = VirtualFileSystem.norm(newPath);

    if (!vfs.exists(normOld)) {
      addLog({
        level: 'ERROR',
        source: 'VFS',
        message: `Modificación fallida: Archivo "${normOld}" no encontrado.`,
      });
      return { success: false, error: 'Archivo no encontrado' };
    }

    // Si cambió la ruta, renombrar primero con rename() de Dana
    if (normOld !== normNew) {
      vfs.rename(normOld, normNew);
    }

    // Sobrescribir contenido con write()
    const success = vfs.write(normNew, content);
    if (!success) {
      addLog({
        level: 'ERROR',
        source: 'VFS',
        message: `Modificación fallida por falta de espacio al escribir en "${normNew}".`,
      });
      return { success: false, error: 'Espacio insuficiente al escribir' };
    }

    const fileData = vfs.files.get(normNew);

    setVfsFiles((prev) =>
      prev.map((f) =>
        f.path === normOld
          ? {
              ...f,
              path: normNew,
              content: fileData.content,
              size_bytes: fileData.size,
              modified_at: new Date(fileData.modified).toISOString(),
            }
          : f
      )
    );

    setVfsStats({ usedBytes: vfs.used(), capacityBytes: vfs.capacity });

    addLog({
      level: 'INFO',
      source: 'VFS',
      message: `Archivo modificado: "${normNew}" ${
        normOld !== normNew ? `(renombrado desde "${normOld}")` : ''
      } (${fileData.size} Bytes) mediante VirtualFileSystem.`,
    });

    return { success: true };
  };

  /**
   * Eliminar archivo en VFS usando delete()
   */
  const deleteVfsFile = (path) => {
    const vfs = vfsRef.current;
    if (!vfs) return { success: false, error: 'VFS no inicializado' };

    const normPath = VirtualFileSystem.norm(path);

    if (!vfs.exists(normPath)) {
      addLog({
        level: 'ERROR',
        source: 'VFS',
        message: `Eliminación fallida: Archivo "${normPath}" no existe.`,
      });
      return { success: false, error: 'Archivo no encontrado' };
    }

    const deleted = vfs.delete(normPath);
    if (deleted) {
      // Si era un clip de vigilancia, remover de clips también
      if (surveillanceStorageRef.current?.clips.has(normPath)) {
        surveillanceStorageRef.current.clips.delete(normPath);
        setSurveillanceClips((prev) => prev.filter((c) => c.path !== normPath));
      }

      setVfsFiles((prev) => prev.filter((f) => f.path !== normPath));
      setVfsStats({ usedBytes: vfs.used(), capacityBytes: vfs.capacity });

      addLog({
        level: 'WARNING',
        source: 'VFS',
        message: `Archivo eliminado: "${normPath}" mediante VirtualFileSystem.delete().`,
      });

      return { success: true };
    }

    return { success: false, error: 'No se pudo eliminar el archivo' };
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

  // Detener dispositivo (exclusivo ADMIN, usado por DeviceList de Santiago)
  const stopDevice = (id) => {
    const target = devices.find((d) => d.id === id);
    if (!target) return;

    setDevices((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: 'OFFLINE' } : d))
    );

    addLog({
      level: 'WARNING',
      source: 'SECURITY_GUARD',
      message: `[DISPOSITIVO DETENIDO] "${target.name}" puesto en estado OFFLINE por administrador.`,
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
      level: 'WARNING',
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
      level: 'WARNING',
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
      level: 'WARNING',
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
        memoryStats,
        freeBlocksCount: Math.floor(memoryStats.freeKb / 16),
        usedBlocksCount: Math.floor(memoryStats.usedKb / 16),
        vfs: vfsRef.current,
        vfsStats,
        vfsFiles,
        surveillanceClips,
        energyReport,
        energyMonitor: energyMonitorRef.current,
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
        compactMemory,
        freeMemoryBlock,
        createVfsFile,
        updateVfsFile,
        deleteVfsFile,
        createFile: createVfsFile,
        updateFile: updateVfsFile,
        deleteFile: deleteVfsFile,
        toggleDevice,
        stopDevice,
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
