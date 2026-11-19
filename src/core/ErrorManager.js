/**
 * Registro y clasificación centralizada de errores del kernel.
 */
export const ERROR_LEVELS = Object.freeze({
  INFO: "INFO",
  WARNING: "WARNING",
  ERROR: "ERROR",
  CRITICAL: "CRITICAL",
});

export class RobotOSError extends Error {
  constructor(message, { code = "ROBOTOS_ERROR", level = ERROR_LEVELS.ERROR, source = "KERNEL", cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "RobotOSError";
    this.code = code;
    this.level = level;
    this.source = source;
  }
}

export class ErrorManager {
  constructor({ maxEntries = 200, onError = null } = {}) {
    this.maxEntries = maxEntries;
    this.onError = onError;
    this.errors = [];
  }

  report(error, metadata = {}) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    const entry = {
      id: `ERR-${Date.now()}-${this.errors.length + 1}`,
      message: normalized.message,
      name: normalized.name,
      code: normalized.code || metadata.code || "UNEXPECTED_ERROR",
      level: normalized.level || metadata.level || ERROR_LEVELS.ERROR,
      source: normalized.source || metadata.source || "KERNEL",
      timestamp: new Date().toISOString(),
      details: metadata.details || null,
    };
    this.errors.unshift(entry);
    this.errors = this.errors.slice(0, this.maxEntries);
    if (typeof this.onError === "function") this.onError({ ...entry });
    return { ...entry };
  }

  getRecent(limit = 20) {
    return this.errors.slice(0, Math.max(0, limit)).map((entry) => ({ ...entry }));
  }

  clear() {
    this.errors = [];
  }
}
