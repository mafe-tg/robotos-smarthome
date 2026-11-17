/**
 * src/lib/persistence.js
 * 
 * Servicio centralizado de persistencia para RobotOS SmartHome.
 * - Desacopla las operaciones de Supabase del hilo de renderizado (Fire-and-Forget).
 * - Implementa cola de reintentos local (Offline Queue) persistida en localStorage.
 * - Evita duplicados mediante generación de UUIDs e idempotencia (upsert).
 * - Sincroniza logs, historial de fallos y eventos estructurados del sistema.
 */

import { supabase } from './supabase.js';

const QUEUE_STORAGE_KEY = 'robotos_persistence_queue_v1';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Genera un UUID v4 compatible con el tipo UUID de Postgres
 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Garantiza que un ID sea un UUID válido para Postgres
 */
export function ensureValidUUID(id) {
  if (id && UUID_REGEX.test(id)) return id;
  return generateUUID();
}

/**
 * Gestor de Cola de Reintentos en Segundo Plano
 */
class PersistenceQueueManager {
  constructor() {
    this.queue = this.loadQueue();
    this.isFlushing = false;
    this.initNetworkListener();
  }

  loadQueue() {
    try {
      if (typeof localStorage === 'undefined') return [];
      const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  saveQueue() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.queue.slice(-100)));
    } catch {
      // Ignorar saturación de almacenamiento local
    }
  }

  initNetworkListener() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.flush();
      });

      // Intento periódico cada 8 segundos si hay elementos pendientes
      setInterval(() => {
        if (this.queue.length > 0 && !this.isFlushing) {
          this.flush();
        }
      }, 8000);
    }
  }

  enqueue(item) {
    this.queue.push({
      ...item,
      id: item.id || generateUUID(),
      retries: 0,
      timestamp: Date.now(),
    });
    this.saveQueue();
    // Intentar vaciar en segundo plano
    this.flush();
  }

  async flush() {
    if (this.isFlushing || this.queue.length === 0) return;
    this.isFlushing = true;

    try {
      const batchSize = 10;
      const batch = this.queue.slice(0, batchSize);
      const remaining = this.queue.slice(batchSize);
      const succeededIds = new Set();

      for (const task of batch) {
        try {
          const { error } = await this.executeTask(task);
          if (!error) {
            succeededIds.add(task.id);
          } else {
            console.warn(`[Persistence] Fallo en ${task.type} (${task.table}):`, error.message);
            task.retries = (task.retries || 0) + 1;
            if (task.retries >= 5) {
              // Descartar tras 5 intentos fallidos
              succeededIds.add(task.id);
            }
          }
        } catch (err) {
          console.warn(`[Persistence] Excepción en ${task.type}:`, err);
          task.retries = (task.retries || 0) + 1;
          if (task.retries >= 5) succeededIds.add(task.id);
        }
      }

      this.queue = [...batch.filter((t) => !succeededIds.has(t.id)), ...remaining];
      this.saveQueue();
    } finally {
      this.isFlushing = false;
    }
  }

  async executeTask(task) {
    const { table, action, payload, match, onConflict } = task;
    if (action === 'insert') {
      return await supabase.from(table).insert(payload);
    }
    if (action === 'upsert') {
      return await supabase.from(table).upsert(payload, { onConflict: onConflict || 'id' });
    }
    if (action === 'update') {
      return await supabase.from(table).update(payload).match(match || {});
    }
    if (action === 'delete') {
      return await supabase.from(table).delete().match(match || {});
    }
    return { error: new Error(`Acción desconocida: ${action}`) };
  }
}

export const persistenceQueue = new PersistenceQueueManager();

// ─── 1. Registro de Eventos Estructurados (system_events) ───────────────────

/**
 * Registra un evento estructurado del sistema en Supabase (system_events).
 * Compatible con la integración del kernel de Sofia.
 *
 * @param {object} event
 * @param {string} [event.id] UUID opcional (se genera automáticamente si no se provee)
 * @param {string} event.event_type Tipo de evento (ej: 'PROCESS_STATE_CHANGE', 'MEMORY_ALLOC')
 * @param {string} [event.source='KERNEL'] Módulo origen
 * @param {string} [event.severity='INFO'] Nivel de severidad
 * @param {string} [event.description=''] Resumen textual
 * @param {object} [event.details={}] Carga estructurada en JSON
 */
export async function emitSystemEvent(event) {
  if (!event || !event.event_type) return null;

  const eventId = ensureValidUUID(event.id);
  const payload = {
    id: eventId,
    event_type: event.event_type,
    source: event.source || 'KERNEL',
    severity: event.severity || 'INFO',
    description: event.description || '',
    details: typeof event.details === 'object' && event.details !== null ? event.details : { raw: event.details },
    created_at: event.created_at || new Date().toISOString(),
  };

  // Enviar de forma asíncrona sin bloquear la UI
  (async () => {
    try {
      const { error } = await supabase.from('system_events').insert(payload);
      if (error) {
        persistenceQueue.enqueue({
          type: 'EMIT_SYSTEM_EVENT',
          table: 'system_events',
          action: 'insert',
          payload,
        });
      }
    } catch {
      persistenceQueue.enqueue({
        type: 'EMIT_SYSTEM_EVENT',
        table: 'system_events',
        action: 'insert',
        payload,
      });
    }
  })();

  return payload;
}

// ─── 2. Registro y Consulta de Logs (logs) ──────────────────────────────────

/**
 * Guarda una entrada en la tabla logs de Supabase en segundo plano.
 */
export function persistLog({ level = 'INFO', source = 'SYSTEM', message }) {
  if (!message) return;

  const payload = {
    level: level.toUpperCase(),
    source: source.toUpperCase(),
    message: String(message),
    created_at: new Date().toISOString(),
  };

  (async () => {
    try {
      const { error } = await supabase.from('logs').insert(payload);
      if (error) {
        persistenceQueue.enqueue({
          type: 'PERSIST_LOG',
          table: 'logs',
          action: 'insert',
          payload,
        });
      }
    } catch {
      persistenceQueue.enqueue({
        type: 'PERSIST_LOG',
        table: 'logs',
        action: 'insert',
        payload,
      });
    }
  })();
}

/**
 * Recupera los logs recientes desde Supabase.
 */
export async function fetchRecentLogs(limit = 100) {
  try {
    const { data, error } = await supabase
      .from('logs')
      .select('*')
      .order('id', { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data.map((l) => ({
      id: `supa_${l.id}`,
      timestamp: new Date(l.created_at).toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      created_at: l.created_at,
      level: l.level,
      source: l.source.toUpperCase(),
      message: l.message,
    }));
  } catch (err) {
    console.warn('[Persistence] Error obteniendo logs de Supabase:', err);
    return [];
  }
}

// ─── 3. Persistencia y Consulta de Fallos (fault_injections) ────────────────

const FAULT_ICONS = {
  sensor_disconnected: '🔌',
  comm_loss: '📡',
  unauthorized_access: '🛡️',
  process_hang: '⏱️',
  cpu_overload: '🔥',
  mem_corruption: '💥',
  deadlock: '🔒',
};

/**
 * Guarda o actualiza un registro del motor de fallos en Supabase.
 */
export function persistFaultInjection(record) {
  if (!record) return;

  const injectionId = ensureValidUUID(record.id);

  const payload = {
    id: injectionId,
    fault_id: record.faultId || 'generic_fault',
    fault_name: record.faultName || 'Fallo del Sistema',
    category: record.category || 'DEVICES',
    mode: record.mode || 'Aislado',
    target: String(record.target || 'Sistema'),
    intensity: record.intensity || 'Media',
    duration_seconds: Number(record.duration) || 7,
    detection_time_ms: record.detectionTimeMs !== undefined ? record.detectionTimeMs : null,
    recovery_time_ms: record.recoveryTimeMs !== undefined ? record.recoveryTimeMs : null,
    steps: Array.isArray(record.stepsLogs) ? record.stepsLogs : (record.steps || []),
    status: record.status || 'RECUPERADO',
    created_at: record.created_at || new Date().toISOString(),
  };

  (async () => {
    try {
      const { error } = await supabase
        .from('fault_injections')
        .upsert(payload, { onConflict: 'id' });

      if (error) {
        persistenceQueue.enqueue({
          type: 'PERSIST_FAULT_INJECTION',
          table: 'fault_injections',
          action: 'upsert',
          onConflict: 'id',
          payload,
        });
      }
    } catch {
      persistenceQueue.enqueue({
        type: 'PERSIST_FAULT_INJECTION',
        table: 'fault_injections',
        action: 'upsert',
        onConflict: 'id',
        payload,
      });
    }
  })();
}

/**
 * Recupera el historial de fallos desde Supabase.
 */
export async function fetchFaultHistory(limit = 50) {
  try {
    const { data, error } = await supabase
      .from('fault_injections')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      faultId: row.fault_id,
      faultName: row.fault_name,
      category: row.category,
      icon: FAULT_ICONS[row.fault_id] || '⚡',
      mode: row.mode,
      target: row.target,
      intensity: row.intensity,
      duration: row.duration_seconds,
      timestamp: new Date(row.created_at).toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      created_at: row.created_at,
      detectionTimeMs: row.detection_time_ms,
      recoveryTimeMs: row.recovery_time_ms,
      status: row.status,
      currentStepIndex: Array.isArray(row.steps) ? row.steps.length : 0,
      stepsLogs: row.steps || [],
    }));
  } catch (err) {
    console.warn('[Persistence] Error obteniendo historial de fallos de Supabase:', err);
    return [];
  }
}

// ─── 4. Sincronización del estado operativo (Fase B) ────────────────────────
// Procesos, memoria, archivos, dispositivos y eventos de seguridad.

const PRIORITY_NUM = { 'Crítica': 1, Alta: 2, Media: 3, Baja: 4 };
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/**
 * Intenta ejecutar la operación de inmediato; si falla, la deja en la cola
 * de reintentos para que el sistema nunca se bloquee por Supabase.
 */
function sendOrQueue(task) {
  (async () => {
    try {
      const { error } = await persistenceQueue.executeTask(task);
      if (error) persistenceQueue.enqueue(task);
    } catch {
      persistenceQueue.enqueue(task);
    }
  })();
}

/** Convierte un proceso del dashboard a una fila de la tabla processes. */
export function processToRow(p) {
  const total = Math.max(1, Number(p.tiempoTotal) || 1);
  return {
    pid: Number(p.pid),
    name: String(p.name),
    priority: clamp(Number(p.prioridadNum) || PRIORITY_NUM[p.priority] || 3, 1, 4),
    state: p.state,
    cpu_usage: clamp(Number(p.cpu) || 0, 0, 100),
    memory_kb: Math.max(0, Number(p.memoryKb ?? p.memory) || 0),
    total_ticks: total,
    remaining_ticks: p.state === 'TERMINATED' ? 0 : total,
    is_system: !!p.isSystem,
  };
}

/** Crea o actualiza un proceso en la tabla processes (clave: pid). */
export function syncProcess(p) {
  if (!p || p.pid === undefined) return;
  sendOrQueue({
    type: 'SYNC_PROCESS',
    table: 'processes',
    action: 'upsert',
    onConflict: 'pid',
    payload: processToRow(p),
  });
}

/**
 * Guarda una "foto" del mapa de memoria en memory_blocks.
 * Espera 400 ms para agrupar cambios seguidos y ejecuta las escrituras en
 * orden: primero inserta los bloques nuevos y después borra los antiguos,
 * así la tabla nunca queda vacía si algo falla a mitad de camino.
 */
let memoryChain = Promise.resolve();
let memoryTimer = null;
let pendingMemoryRows = null;

export function syncMemorySnapshot(blocks) {
  pendingMemoryRows = (blocks || [])
    .filter((b) => b && b.owner && Number(b.size) > 0)
    .map((b) => ({ owner: b.owner, start_kb: Number(b.start), size_kb: Number(b.size) }));

  clearTimeout(memoryTimer);
  memoryTimer = setTimeout(() => {
    const rows = pendingMemoryRows;
    memoryChain = memoryChain.then(() => writeMemorySnapshot(rows)).catch(() => {});
  }, 400);
}

async function writeMemorySnapshot(rows) {
  try {
    let keepIds = [];
    if (rows.length > 0) {
      const { data, error } = await supabase.from('memory_blocks').insert(rows).select('id');
      if (error) {
        console.warn('[Persistence] No se pudo guardar el mapa de memoria:', error.message);
        return;
      }
      keepIds = (data || []).map((r) => r.id);
    }
    let query = supabase.from('memory_blocks').delete();
    query = keepIds.length > 0 ? query.not('id', 'in', `(${keepIds.join(',')})`) : query.gte('id', 0);
    const { error } = await query;
    if (error) console.warn('[Persistence] No se pudieron limpiar bloques antiguos:', error.message);
  } catch (err) {
    console.warn('[Persistence] Error sincronizando memoria:', err);
  }
}

/** Crea o actualiza un archivo del VFS en la tabla files (clave: path). */
export function syncFileUpsert({ path, content = '', size_bytes = 0 }) {
  if (!path) return;
  sendOrQueue({
    type: 'SYNC_FILE',
    table: 'files',
    action: 'upsert',
    onConflict: 'path',
    payload: {
      path,
      content: String(content),
      size_bytes: Math.max(0, Number(size_bytes) || 0),
      modified_at: new Date().toISOString(),
    },
  });
}

/** Elimina un archivo de la tabla files (y de surveillance_clips si era un clip). */
export function syncFileDelete(path, { isClip = false } = {}) {
  if (!path) return;
  sendOrQueue({ type: 'DELETE_FILE', table: 'files', action: 'delete', match: { path } });
  if (isClip) {
    sendOrQueue({ type: 'DELETE_CLIP', table: 'surveillance_clips', action: 'delete', match: { path } });
  }
}

/**
 * Estado de conexión de un dispositivo, en el formato de la tabla devices de
 * Santiago (online, offline, alert, maintenance).
 */
export function deviceConnectionStatus(dev) {
  if (!dev) return 'offline';
  if (dev.status === 'OFFLINE') return 'offline';
  if (dev.type === 'motion' && dev.status === 'DETECTADO') return 'alert';
  if (dev.type === 'lock' && dev.status === 'DESBLOQUEADA') return 'maintenance';
  return 'online';
}

/** Actualiza el estado de conexión y la última conexión de un dispositivo (por nombre). */
export function syncDeviceStatus(dev) {
  if (!dev || !dev.name) return;
  sendOrQueue({
    type: 'SYNC_DEVICE',
    table: 'devices',
    action: 'update',
    match: { name: dev.name },
    payload: { status: deviceConnectionStatus(dev), last_seen: new Date().toISOString() },
  });
}

// Caché nombre → UUID de la tabla devices, para enlazar los eventos de seguridad
let deviceUuidCache = null;
async function getDeviceUuid(name) {
  if (!name) return null;
  try {
    if (!deviceUuidCache) {
      const { data } = await supabase.from('devices').select('id, name');
      deviceUuidCache = new Map((data || []).map((d) => [d.name, d.id]));
    }
    return deviceUuidCache.get(name) || null;
  } catch {
    return null;
  }
}

/**
 * Registra un incidente en security_events (accesos denegados, intrusiones,
 * dispositivos detenidos por el administrador).
 */
export function persistSecurityEvent({ event_type, severity = 'WARNING', description = '', deviceName = null }) {
  if (!event_type) return;
  (async () => {
    const device_id = await getDeviceUuid(deviceName);
    sendOrQueue({
      type: 'SECURITY_EVENT',
      table: 'security_events',
      action: 'insert',
      payload: {
        id: generateUUID(),
        device_id,
        event_type,
        severity,
        description,
        user_id: null,
      },
    });
  })();
}
