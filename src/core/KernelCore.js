/**
 * Núcleo del sistema: coordina estado, eventos, errores y llamadas al sistema.
 */
import { SystemState, SYSTEM_STATUS } from "./SystemState.js";
import { EventEngine } from "./EventEngine.js";
import { ErrorManager } from "./ErrorManager.js";
import { SystemCalls } from "./SystemCalls.js";

export class KernelCore {
  constructor({ onLog = null } = {}) {
    this.state = new SystemState();
    this.errors = new ErrorManager({
      onError: (entry) => {
        onLog?.({ level: entry.level, source: entry.source, message: `[${entry.code}] ${entry.message}` });
        this.events?.emit("kernel:error", entry);
      },
    });
    this.events = new EventEngine({
      errorHandler: (error, metadata) => this.errors.report(error, metadata),
    });
    this.syscalls = new SystemCalls({
      isOperational: () => this.state.isOperational(),
      eventEngine: this.events,
    });
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) return this.state.snapshot();
    if (this.state.status === SYSTEM_STATUS.OFF || this.state.status === SYSTEM_STATUS.HALTED) {
      this.state.transition(SYSTEM_STATUS.BOOTING, "Inicialización del kernel");
    }
    this.initialized = true;
    this.events.emit("kernel:initialized", { version: "1.0.0" });
    return this.state.snapshot();
  }

  start() {
    if (!this.initialized) this.initialize();
    if (this.state.status === SYSTEM_STATUS.BOOTING || this.state.status === SYSTEM_STATUS.DEGRADED) {
      const snapshot = this.state.transition(SYSTEM_STATUS.RUNNING, "Kernel listo");
      this.events.emit("kernel:started", snapshot);
      return snapshot;
    }
    if (this.state.status === SYSTEM_STATUS.RUNNING) return this.state.snapshot();
    throw new Error(`No se puede iniciar el kernel desde ${this.state.status}`);
  }

  shutdown(reason = "Apagado solicitado") {
    if (this.state.status === SYSTEM_STATUS.RUNNING || this.state.status === SYSTEM_STATUS.DEGRADED) {
      this.state.transition(SYSTEM_STATUS.SHUTTING_DOWN, reason);
      this.events.emit("kernel:shutdown", { reason });
      return this.state.transition(SYSTEM_STATUS.OFF, reason);
    }
    throw new Error(`No se puede apagar el kernel desde ${this.state.status}`);
  }

  reportError(error, metadata) {
    const entry = this.errors.report(error, metadata);
    if (entry.level === "CRITICAL" && this.state.status === SYSTEM_STATUS.RUNNING) {
      this.state.transition(SYSTEM_STATUS.DEGRADED, `Error crítico: ${entry.code}`);
    }
    return entry;
  }
}
