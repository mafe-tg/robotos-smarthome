/**
 * Interfaz controlada entre las aplicaciones y el kernel (system calls).
 * Los módulos registran servicios; las aplicaciones invocan nombres públicos.
 */
import { RobotOSError } from "./ErrorManager.js";

export class SystemCalls {
  constructor({ isOperational = () => true, eventEngine = null } = {}) {
    this.handlers = new Map();
    this.isOperational = isOperational;
    this.eventEngine = eventEngine;
  }

  register(name, handler) {
    if (!name || typeof name !== "string") throw new Error("El nombre de la system call es obligatorio");
    if (typeof handler !== "function") throw new Error(`El handler de ${name} debe ser una función`);
    if (this.handlers.has(name)) throw new Error(`La system call ${name} ya está registrada`);
    this.handlers.set(name, handler);
    return () => this.handlers.delete(name);
  }

  async invoke(name, ...args) {
    if (!this.isOperational()) {
      throw new RobotOSError("El kernel no está operativo", {
        code: "KERNEL_NOT_READY", source: "SYSTEM_CALL",
      });
    }
    const handler = this.handlers.get(name);
    if (!handler) {
      throw new RobotOSError(`System call no reconocida: ${name}`, {
        code: "UNKNOWN_SYSCALL", source: "SYSTEM_CALL",
      });
    }
    this.eventEngine?.emit("syscall:before", { name, args });
    try {
      const result = await handler(...args);
      this.eventEngine?.emit("syscall:after", { name, success: true });
      return result;
    } catch (error) {
      this.eventEngine?.emit("syscall:after", { name, success: false, message: error.message });
      throw error;
    }
  }

  list() {
    return [...this.handlers.keys()];
  }
}
