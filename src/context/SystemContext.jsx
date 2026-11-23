import React, { createContext, useContext, useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
import {
  persistLog,
  emitSystemEvent,
  syncProcess,
  syncMemorySnapshot,
  syncFileUpsert,
  syncFileDelete,
  syncDeviceStatus,
  deviceConnectionStatus,
  persistSecurityEvent,
} from '../lib/persistence';

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

// ─── Firmas para detectar cambios y sincronizarlos con Supabase (Fase B) ───
// Se comparan con el estado anterior para registrar solo lo que cambió,
// venga de la interfaz o del motor de inyección de fallos.
const processSignature = (p) => `${p.state}|${p.prioridadNum}`;
const processSignatures = (list) => new Map(list.map((p) => [p.pid, processSignature(p)]));
const memorySignature = (blocks, withCorruption = true) =>
  [...blocks]
    .sort((a, b) => a.start - b.start)
    .map((b) => `${b.owner}@${b.start}+${b.size}${withCorruption && b.corrupted ? '!' : ''}`)
    .join(',');
const deviceStatuses = (list) => new Map(list.map((d) => [d.id, d.status]));

export const SystemProvider = ({ children }) => {
  const [batteryPercent, setBatteryPercent] = useState(84);
  const [isCharging, setIsCharging] = useState(false);
  // Enviar RX-1 a la base no inicia la carga automáticamente.
  const chargeRobot = useCallback(() => {
    setIsCharging(false);
    setRobotTargetRoom('base');
  }, []);
  const startCharging = useCallback(() => {
    setRobotTargetRoom((current) => current || 'base');
    setIsCharging(true);
  }, []);
  const stopCharging = useCallback(() => setIsCharging(false), []);
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
  // Última zona atendida: mantiene sincronizados el robot, el plano y su panel de ubicación.
  const [robotTargetRoom, setRobotTargetRoom] = useState(null);

  // La batería solo aumenta mientras RX-1 está en la base y el usuario inicia la carga.
  useEffect(() => {
    if (!isCharging) return undefined;
    if (robotTargetRoom && robotTargetRoom !== 'base') {
      setIsCharging(false);
      return undefined;
    }
    const timer = setInterval(() => {
      setBatteryPercent((current) => Math.min(100, current + 1));
    }, 1500);
    return () => clearInterval(timer);
  }, [isCharging, robotTargetRoom]);

  useEffect(() => {
    if (batteryPercent >= 100 && isCharging) setIsCharging(false);
  }, [batteryPercent, isCharging]);

  // 6. Logs y Alertas (incluye logs de la tabla Supabase)
  const [logs, setLogs] = useState(INITIAL_SUPABASE_LOGS);
  const [alerts, setAlerts] = useState(INITIAL_ALERTS);

  // 7. Modificador dinámico de CPU para inyección de fallos
  const [cpuUsageOverride, setCpuUsageOverride] = useState(null);

  // 8. Estado anterior, para detectar qué cambió y guardarlo en Supabase (Fase B)
  const prevProcessesRef = useRef(processSignatures(INITIAL_PROCESSES));
  const prevMemoryRef = useRef({
    signature: memorySignature(memoryManagerRef.current ? memoryManagerRef.current.blocks : []),
    blocks: memoryManagerRef.current ? memoryManagerRef.current.blocks.map((b) => ({ ...b })) : [],
  });
  const prevDevicesRef = useRef(deviceStatuses(INITIAL_DEVICES));

  // Carga asíncrona desde Supabase al montar el componente
  useEffect(() => {
    let isMounted = true;

    const loadSupabaseData = async () => {
      try {
        const [memRes, filesRes, logsRes, clipsRes, energyDevRes, energyUsageRes, procRes] = await Promise.all([
          supabase.from('memory_blocks').select('*').order('start_kb', { ascending: true }),
          supabase.from('files').select('*'),
          supabase.from('logs').select('*').order('id', { ascending: false }).limit(100),
          supabase.from('surveillance_clips').select('*'),
          supabase.from('energy_devices').select('*'),
          supabase.from('energy_usage').select('*'),
          supabase.from('processes').select('*').order('pid', { ascending: true }),
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
          // Lo que viene de Supabase no es un cambio nuevo: no se vuelve a guardar
          prevMemoryRef.current = {
            signature: memorySignature(mm.blocks),
            blocks: mm.blocks.map((b) => ({ ...b })),
          };
          setMemoryBlocks([...mm.blocks]);
          setMemoryStats(mm.stats());
        }

        // 1b. Recuperar los procesos guardados en Supabase (estado, prioridad y
        // procesos creados por el usuario en sesiones anteriores)
        if (procRes.data && procRes.data.length > 0) {
          setProcesses((prev) => {
            const byPid = new Map(procRes.data.map((r) => [r.pid, r]));
            const merged = prev.map((p) => {
              const row = byPid.get(p.pid);
              if (!row) return p;
              byPid.delete(p.pid);
              return {
                ...p,
                state: row.state,
                prioridadNum: row.priority,
                priority: PRIORITY_LABEL[row.priority] || p.priority,
                cpu: Number(row.cpu_usage),
                memoryKb: row.memory_kb,
                memory: row.memory_kb,
                tiempoTotal: row.total_ticks,
              };
            });
            for (const row of byPid.values()) {
              merged.push({
                id: `p_db_${row.pid}`,
                pid: row.pid,
                name: row.name,
                state: row.state,
                priority: PRIORITY_LABEL[row.priority] || 'Media',
                prioridadNum: row.priority,
                tiempoTotal: row.total_ticks,
                memoryKb: row.memory_kb,
                memory: row.memory_kb,
                cpu: Number(row.cpu_usage),
                color: getOwnerColor(row.name),
                isSystem: row.is_system,
                description: row.is_system
                  ? 'Proceso del sistema'
                  : 'Proceso de usuario recuperado de Supabase',
              });
            }
            prevProcessesRef.current = processSignatures(merged);
            return merged;
          });
        }

        // 2. Alimentar VirtualFileSystem (Supabase es la fuente de verdad)
        if (filesRes.data && filesRes.data.length > 0) {
          const vfs = vfsRef.current;
          vfs.files.clear();
          for (const f of filesRes.data) {
            vfs.write(f.path, f.content || '', { size: f.size_bytes });
          }
          setVfsFiles(filesRes.data);
          setVfsStats({ usedBytes: vfs.used(), capacityBytes: vfs.capacity });
        }

        // 3. Alimentar SurveillanceStorage
        if (clipsRes.data && clipsRes.data.length > 0) {
          const ss = surveillanceStorageRef.current;
          ss.clips.clear();
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

  // ==========================================
  // SINCRONIZACIÓN CON SUPABASE (FASE B)
  // Cada efecto compara el estado nuevo con el anterior y guarda solo lo
  // que cambió. Así se registran tanto las acciones de la interfaz como
  // las del motor de inyección de fallos, sin tocar cada función.
  // ==========================================

  // Procesos: creación, cambio de estado y cambio de prioridad
  useEffect(() => {
    const prev = prevProcessesRef.current;
    for (const p of processes) {
      const signature = processSignature(p);
      const old = prev.get(p.pid);
      if (old === signature) continue;

      syncProcess(p);

      if (old === undefined) {
        emitSystemEvent({
          event_type: 'PROCESS_CREATED',
          source: 'PROCESS_MGR',
          description: `Proceso ${p.name} (PID ${p.pid}) creado en estado ${p.state}`,
          details: {
            pid: p.pid,
            name: p.name,
            state: p.state,
            priority: p.prioridadNum,
            memory_kb: p.memoryKb ?? p.memory,
            cpu: p.cpu,
            total_ticks: p.tiempoTotal,
          },
        });
        continue;
      }

      const [oldState, oldPriority] = old.split('|');
      if (oldState !== p.state) {
        emitSystemEvent({
          event_type: 'PROCESS_STATE_CHANGE',
          source: 'SCHEDULER',
          severity: p.state === ESTADOS.TERMINATED ? 'WARNING' : 'INFO',
          description: `Proceso ${p.name} (PID ${p.pid}): ${oldState} -> ${p.state}`,
          details: { pid: p.pid, name: p.name, previous_state: oldState, new_state: p.state },
        });
      }
      if (oldPriority !== String(p.prioridadNum)) {
        emitSystemEvent({
          event_type: 'PROCESS_PRIORITY_CHANGE',
          source: 'SCHEDULER',
          description: `Proceso ${p.name} (PID ${p.pid}): prioridad ${oldPriority} -> ${p.prioridadNum}`,
          details: {
            pid: p.pid,
            name: p.name,
            previous_priority: Number(oldPriority),
            new_priority: p.prioridadNum,
          },
        });
      }
    }
    prevProcessesRef.current = processSignatures(processes);
  }, [processes]);

  // Memoria: asignación, liberación y detección de corrupción de bloques
  useEffect(() => {
    const signature = memorySignature(memoryBlocks);
    const previous = prevMemoryRef.current;
    if (signature === previous.signature) return;

    const before = new Map(previous.blocks.map((b) => [b.owner, b]));
    const after = new Map(memoryBlocks.map((b) => [b.owner, b]));
    const moved = [];

    for (const [owner, b] of after) {
      const old = before.get(owner);
      if (!old) {
        emitSystemEvent({
          event_type: 'MEMORY_ALLOCATE',
          source: 'MEM_MANAGER',
          description: `Asignados ${b.size} KB a ${owner} en [${b.start}..${b.start + b.size - 1} KB]`,
          details: { action: 'ALLOCATE', owner, start_kb: b.start, size_kb: b.size },
        });
        continue;
      }
      if (old.start !== b.start) moved.push({ owner, from_kb: old.start, to_kb: b.start, size_kb: b.size });
      if (!old.corrupted && b.corrupted) {
        emitSystemEvent({
          event_type: 'MEMORY_CORRUPTION',
          source: 'MEM_MANAGER',
          severity: 'ERROR',
          description: `Bloque de ${owner} marcado como corrupto`,
          details: { action: 'CORRUPT', owner, start_kb: b.start, size_kb: b.size },
        });
      } else if (old.corrupted && !b.corrupted) {
        emitSystemEvent({
          event_type: 'MEMORY_RECOVERED',
          source: 'MEM_MANAGER',
          description: `Bloque de ${owner} recuperado`,
          details: { action: 'RECOVER', owner, start_kb: b.start, size_kb: b.size },
        });
      }
    }

    for (const [owner, b] of before) {
      if (!after.has(owner)) {
        emitSystemEvent({
          event_type: 'MEMORY_FREE',
          source: 'MEM_MANAGER',
          description: `Liberados ${b.size} KB de ${owner}`,
          details: { action: 'FREE', owner, start_kb: b.start, freed_kb: b.size },
        });
      }
    }

    if (moved.length > 0) {
      emitSystemEvent({
        event_type: 'MEMORY_COMPACT',
        source: 'MEM_MANAGER',
        description: `Compactación: ${moved.length} bloque(s) reubicados`,
        details: { action: 'COMPACT', moved_blocks: moved },
      });
    }

    // Guardar la foto del mapa solo si cambió la distribución (no por la marca de corrupción)
    if (memorySignature(memoryBlocks, false) !== memorySignature(previous.blocks, false)) {
      syncMemorySnapshot(memoryBlocks);
    }

    prevMemoryRef.current = { signature, blocks: memoryBlocks.map((b) => ({ ...b })) };
  }, [memoryBlocks]);

  // Dispositivos: cambios de estado (encendido, bloqueo, conexión)
  useEffect(() => {
    const prev = prevDevicesRef.current;
    for (const d of devices) {
      const old = prev.get(d.id);
      if (old === undefined || old === d.status) continue;
      syncDeviceStatus(d);
      emitSystemEvent({
        event_type: 'DEVICE_STATUS_CHANGE',
        source: 'IOT_MANAGER',
        severity: d.status === 'OFFLINE' ? 'WARNING' : 'INFO',
        description: `${d.name}: ${old} -> ${d.status}`,
        details: {
          device_id: d.id,
          device_name: d.name,
          type: d.type,
          zone: d.zone,
          old_status: old,
          new_status: d.status,
          connection: deviceConnectionStatus(d),
        },
      });
    }
    prevDevicesRef.current = deviceStatuses(devices);
  }, [devices]);

  const activeAlertsCount = alerts.filter((a) => a.state === 'Activa').length;

  // Telemetría del sistema vinculada al estado de memoria de Dana, VFS, dispositivos y EnergyMonitor
  // Consumo dinámico de energía, CPU y almacenamiento VFS según el estado de cada dispositivo
  const deviceImpact = useMemo(() => {
    let deviceWatts = 0;
    let deviceCpu = 0;
    let deviceStorageBytes = 0;

    for (const d of devices) {
      if (d.type === 'light') {
        if (d.status === 'ON') {
          deviceWatts += 25; // 25W por lámpara encendida
          deviceCpu += 2.5;  // I/O de iluminación
          deviceStorageBytes += 60_000;
        }
      } else if (d.type === 'camera') {
        if (d.status === 'ONLINE') {
          deviceWatts += 45; // 45W cámara con video stream
          deviceCpu += 11;   // Procesamiento de imagen y encoding
          deviceStorageBytes += 650_000; // Buffer de clips en VFS
        } else {
          deviceWatts += 2;
        }
      } else if (d.type === 'motion') {
        if (d.status === 'DETECTADO') {
          deviceWatts += 18; // Sensor activo con RF
          deviceCpu += 7;    // Interrupción de evento
          deviceStorageBytes += 180_000; // Registro en VFS
        } else {
          deviceWatts += 2;
        }
      } else if (d.type === 'climate') {
        const temp = Number(d.temperature) || 20;
        const active = temp >= 21.5 || temp <= 19;
        deviceWatts += active ? 140 : 25; // Compresor HVAC
        deviceCpu += active ? 5 : 2;
        deviceStorageBytes += 80_000;
      } else if (d.type === 'lock') {
        if (d.status === 'DESBLOQUEADA') {
          deviceWatts += 15;
          deviceCpu += 3;
        } else {
          deviceWatts += 3;
        }
        deviceStorageBytes += 40_000;
      } else {
        // Otros sensores periféricos (humedad, etc.)
        deviceWatts += 5;
        deviceCpu += 1;
        deviceStorageBytes += 30_000;
      }
    }

    return { deviceWatts, deviceCpu, deviceStorageBytes };
  }, [devices]);

  // CPU: carga base del robot (12 %) + procesos en RUNNING + carga I/O de dispositivos
  const runningCpu = processes
    .filter((p) => p.state === ESTADOS.RUNNING)
    .reduce((sum, p) => sum + (Number(p.cpu) || 0), 0);

  const totalCpuUsage = cpuUsageOverride !== null
    ? cpuUsageOverride
    : Math.min(100, Math.round(5 + runningCpu + deviceImpact.deviceCpu));

  // Potencia en Watts: base del robot (45W) + dispositivos activos + carga de CPU (0.5W por %)
  const totalPowerWatts = Math.round(45 + deviceImpact.deviceWatts + (totalCpuUsage * 0.5));

  // Almacenamiento VFS dinámico: base de partición raíz + telemetría y buffers de dispositivos activos
  const dynamicVfsUsedBytes = Math.min(
    vfsStats.capacityBytes * 0.95,
    (vfsStats.usedBytes || 3_800_000) + deviceImpact.deviceStorageBytes
  );

  const metrics = {
    cpuUsage: totalCpuUsage,
    ramUsageKB: memoryStats.usedKb,
    ramTotalKB: memoryStats.totalKb,
    ramUsageMB: Math.round((memoryStats.usedKb / 1024) * 10) / 10,
    ramTotalMB: 1,
    storageUsageBytes: dynamicVfsUsedBytes,
    storageCapacityBytes: vfsStats.capacityBytes,
    storageUsageMB: +(dynamicVfsUsedBytes / 1_000_000).toFixed(2),
    storageTotalMB: +(vfsStats.capacityBytes / 1_000_000).toFixed(1),
    batteryPercent,
    powerDrawWatts: totalPowerWatts,
    energyKwh: energyReport.totalKwh,
    energyCosto: energyReport.costoEstimado,
    robotStatus: activeAlertsCount > 0 ? 'EN ALERTA' : 'OPERATIVO',
  };

  // Historial continuo de telemetría de 60 segundos (CPU, RAM y Potencia) para el Monitor y gráficos
  const [telemetryHistory, setTelemetryHistory] = useState(() => {
    const pts = [];
    const baseC = totalCpuUsage || 5;
    const baseR = memoryStats.totalKb ? Math.round((memoryStats.usedKb / memoryStats.totalKb) * 100) : 78;
    for (let i = 59; i >= 0; i--) {
      const varC = Math.round(Math.sin(i / 2) * 2);
      pts.push({
        t: 59 - i,
        cpu: Math.max(5, Math.min(100, baseC + varC)),
        ram: baseR,
        power: Math.round(45 + baseC * 0.5),
      });
    }
    return pts;
  });

  const latestMetricsRef = useRef({ cpu: totalCpuUsage, ramKb: memoryStats.usedKb, power: totalPowerWatts });
  latestMetricsRef.current = { cpu: totalCpuUsage, ramKb: memoryStats.usedKb, power: totalPowerWatts };

  useEffect(() => {
    const sample = () => {
      const cur = latestMetricsRef.current;
      const ramPct = memoryStats.totalKb
        ? Math.round((cur.ramKb / memoryStats.totalKb) * 100)
        : 78;
      setTelemetryHistory((prev) => [
        ...prev.slice(-59),
        {
          cpu: cur.cpu,
          ram: ramPct,
          power: cur.power,
        },
      ].map((d, i) => ({ ...d, t: i })));
    };

    sample();
    const timer = setInterval(sample, 1000);
    return () => clearInterval(timer);
  }, [totalCpuUsage, memoryStats.usedKb, totalPowerWatts, memoryStats.totalKb]);

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

    // Persistencia asíncrona en Supabase (segundo plano)
    persistLog({
      level: safeLevel,
      source,
      message,
    });
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
        message: `[MEMORIA INSUFICIENTE] Rechazada creación de "${cleanName}". Solicitados: ${reqKb} KB, Libre total: ${stats.freeKb} KB. ${stats.freeKb >= reqKb ? '(el espacio libre está distribuido en bloques pequeños)' : ''}`,
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
   * Reanudar: WAITING -> RUNNING
   * Al reanudarse, el proceso vuelve de inmediato a ejecución (RUNNING) sin quedarse estancado en lista.
   */
  const resumeProcess = (processId) => {
    const target = processes.find((p) => p.id === processId);
    if (!target || target.state !== ESTADOS.WAITING) return;

    setProcesses((prev) =>
      prev.map((p) => (p.id === processId ? { ...p, state: ESTADOS.RUNNING } : p))
    );

    addLog({
      level: 'INFO',
      source: 'SCHEDULER',
      message: `Proceso PID ${target.pid} (${target.name}) reanudado y en ejecución [WAITING] -> [RUNNING].`,
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

    syncFileUpsert({ path: normPath, content: fileData.content, size_bytes: fileData.size });
    emitSystemEvent({
      event_type: 'FILE_CREATE',
      source: 'VFS',
      description: `Archivo creado: ${normPath}`,
      details: { operation: 'CREATE', path: normPath, size_bytes: fileData.size },
    });

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

    if (normOld !== normNew) syncFileDelete(normOld);
    syncFileUpsert({ path: normNew, content: fileData.content, size_bytes: fileData.size });
    emitSystemEvent({
      event_type: normOld !== normNew ? 'FILE_RENAME' : 'FILE_WRITE',
      source: 'VFS',
      description:
        normOld !== normNew ? `Archivo renombrado: ${normOld} -> ${normNew}` : `Archivo modificado: ${normNew}`,
      details: {
        operation: normOld !== normNew ? 'RENAME' : 'WRITE',
        path: normNew,
        previous_path: normOld,
        size_bytes: fileData.size,
      },
    });

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
      const isClip = !!surveillanceStorageRef.current?.clips.has(normPath);
      if (isClip) {
        surveillanceStorageRef.current.clips.delete(normPath);
        setSurveillanceClips((prev) => prev.filter((c) => c.path !== normPath));
      }

      syncFileDelete(normPath, { isClip });
      emitSystemEvent({
        event_type: 'FILE_DELETE',
        source: 'VFS',
        severity: 'WARNING',
        description: `Archivo eliminado: ${normPath}`,
        details: { operation: 'DELETE', path: normPath, was_clip: isClip },
      });

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

    const deviceRooms = { d1: 'salon', d2: 'cocina', d3: 'entrada', d4: 'exterior', d5: 'entrada', d6: 'salon' };
    setRobotTargetRoom(deviceRooms[id] || 'base');

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

    // El proceso asociado refleja el trabajo real del dispositivo: al apagarlo
    // deja de consumir CPU y queda en espera; al encenderlo vuelve a ejecutarse.
    const processByDevice = {
      d1: 'lighting_daemon',
      d2: 'routine_engine',
      d3: 'surveillance_proc',
      d4: 'surveillance_proc',
      d5: 'lock_guard',
      d6: 'temp_manager',
    };
    const processName = processByDevice[id];
    if (processName) {
      const active =
        (target.type === 'light' && nextStatus === 'ON') ||
        (target.type === 'camera' && nextStatus === 'ONLINE') ||
        (target.type === 'motion' && nextStatus === 'DETECTADO') ||
        (target.type === 'lock' && nextStatus !== 'OFFLINE') ||
        target.type === 'climate';
      setProcesses((prev) =>
        prev.map((proc) =>
          proc.name === processName
            ? { ...proc, state: active ? ESTADOS.RUNNING : ESTADOS.WAITING }
            : proc
        )
      );
    }

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

    persistSecurityEvent({
      event_type: 'DEVICE_STOPPED',
      severity: 'WARNING',
      description: `Dispositivo "${target.name}" detenido por el administrador.`,
      deviceName: target.name,
    });

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

    persistSecurityEvent({
      event_type: 'UNAUTHORIZED_ACCESS',
      severity: 'CRITICAL',
      description: '3 intentos erróneos consecutivos de desbloqueo; cerradura asegurada y vigilancia elevada a prioridad crítica.',
      deviceName: 'Cerradura Puerta Principal',
    });

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
        chargeRobot,
        startCharging,
        stopCharging,
        isCharging,
        telemetryHistory,
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
        robotTargetRoom,
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
        setProcesses,
        setDevices,
        setMemoryBlocks,
        setMemoryStats,
        setAlerts,
        cpuUsageOverride,
        setCpuUsageOverride,
        memoryManager: memoryManagerRef.current,
      }}
    >
      {children}
    </SystemContext.Provider>
  );
};

export const useSystem = () => useContext(SystemContext);
