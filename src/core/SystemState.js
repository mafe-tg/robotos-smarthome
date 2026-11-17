/**
 * Estado global del sistema operativo RobotOS.
 * Mantiene el ciclo de vida y permite consultar si el kernel está operativo.
 */
export const SYSTEM_STATUS = Object.freeze({
  OFF: "OFF",
  BOOTING: "BOOTING",
  RUNNING: "RUNNING",
  DEGRADED: "DEGRADED",
  SHUTTING_DOWN: "SHUTTING_DOWN",
  HALTED: "HALTED",
});

const ALLOWED = Object.freeze({
  OFF: ["BOOTING"],
  BOOTING: ["RUNNING", "DEGRADED", "HALTED"],
  RUNNING: ["DEGRADED", "SHUTTING_DOWN", "HALTED"],
  DEGRADED: ["RUNNING", "SHUTTING_DOWN", "HALTED"],
  SHUTTING_DOWN: ["OFF", "HALTED"],
  HALTED: ["BOOTING"],
});

export class SystemState {
  constructor() {
    this.status = SYSTEM_STATUS.OFF;
    this.startedAt = null;
    this.lastTransitionAt = new Date().toISOString();
    this.history = [];
  }

  transition(nextStatus, reason = "Cambio de estado solicitado") {
    if (!Object.values(SYSTEM_STATUS).includes(nextStatus)) {
      throw new Error(`Estado del sistema desconocido: ${nextStatus}`);
    }
    if (!ALLOWED[this.status].includes(nextStatus)) {
      throw new Error(`Transición de sistema no permitida: ${this.status} -> ${nextStatus}`);
    }
    const previous = this.status;
    this.status = nextStatus;
    this.lastTransitionAt = new Date().toISOString();
    if (nextStatus === SYSTEM_STATUS.RUNNING && !this.startedAt) {
      this.startedAt = this.lastTransitionAt;
    }
    if (nextStatus === SYSTEM_STATUS.OFF) this.startedAt = null;
    this.history.push({ previous, next: nextStatus, reason, at: this.lastTransitionAt });
    return this.snapshot();
  }

  isOperational() {
    return this.status === SYSTEM_STATUS.RUNNING;
  }

  snapshot() {
    return {
      status: this.status,
      startedAt: this.startedAt,
      lastTransitionAt: this.lastTransitionAt,
      uptimeMs: this.startedAt && this.isOperational()
        ? Math.max(0, Date.now() - new Date(this.startedAt).getTime())
        : 0,
      history: this.history.map((entry) => ({ ...entry })),
    };
  }
}
