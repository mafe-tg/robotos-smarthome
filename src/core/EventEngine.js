/**
 * Bus de eventos interno: permite que los módulos publiquen y escuchen eventos.
 */
export class EventEngine {
  constructor({ errorHandler = null } = {}) {
    this.listeners = new Map();
    this.errorHandler = errorHandler;
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
}
