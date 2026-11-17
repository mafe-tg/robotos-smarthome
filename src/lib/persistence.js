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
