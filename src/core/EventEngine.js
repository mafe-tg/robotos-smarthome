/**
 * Bus de eventos interno: permite que los módulos publiquen y escuchen eventos.
 * Además entrega cada evento, en el formato común { tipo, origen, detalle, fecha },
 * a una función opcional (onEvent) para que otro módulo lo guarde (por ejemplo, en Supabase).
 */

/** Convierte un evento interno al formato común del proyecto. */
export function toRobotEvent(event) {
  const [prefix] = String(event.type).split(":");
  return {
    tipo: event.type,
    origen: prefix.toUpperCase(),
    detalle: event.payload,
    fecha: event.timestamp,
  };
}

export class EventEngine {
  constructor({ errorHandler = null, onEvent = null } = {}) {
    this.listeners = new Map();
    this.errorHandler = errorHandler;
    this.onEvent = onEvent;
    this.sinkFailures = 0;
    this.sequence = 0;
  }

  on(eventName, handler) {
    if (typeof eventName !== "string" || !eventName.trim()) {
      throw new Error("El nombre del evento es obligatorio");
    }
    if (typeof handler !== "function") throw new Error("El listener debe ser una función");
    if (!this.listeners.has(eventName)) this.listeners.set(eventName, new Set());
    this.listeners.get(eventName).add(handler);
    return () => this.off(eventName, handler);
  }

  once(eventName, handler) {
    const unsubscribe = this.on(eventName, (payload) => {
      unsubscribe();
      handler(payload);
    });
    return unsubscribe;
  }

  off(eventName, handler) {
    const bucket = this.listeners.get(eventName);
    if (!bucket) return false;
    const removed = bucket.delete(handler);
    if (bucket.size === 0) this.listeners.delete(eventName);
    return removed;
  }

  emit(eventName, payload = {}) {
    const event = {
      id: ++this.sequence,
      type: eventName,
      payload,
      timestamp: new Date().toISOString(),
    };
    // Primero se entrega a onEvent, para que el orden coincida con el orden de emisión.
    this.#deliver(event);
    const listeners = [...(this.listeners.get(eventName) || [])];
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        if (this.errorHandler) this.errorHandler(error, { source: "EVENT_ENGINE", eventName });
      }
    }
    return event;
  }

  listenerCount(eventName) {
    return this.listeners.get(eventName)?.size || 0;
  }

  #deliver(event) {
    if (!this.onEvent) return;
    try {
      this.onEvent(toRobotEvent(event));
    } catch {
      // Un consumidor que falla no debe tumbar el kernel ni provocar un bucle de errores.
      this.sinkFailures += 1;
    }
  }
}
