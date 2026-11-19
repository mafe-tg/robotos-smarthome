/**
 * Secuencia de arranque de RobotOS. Ejecuta comprobaciones y arranca el kernel.
 * Cada paso se publica como evento para que quede registrado.
 */
import { SYSTEM_STATUS } from "./SystemState.js";

const MAX_HISTORY = 20;

export class BootManager {
  constructor({ kernel, checks = [], onStep = null } = {}) {
    if (!kernel) throw new Error("BootManager necesita una instancia de KernelCore");
    this.kernel = kernel;
    this.checks = checks;
    this.onStep = onStep;
    this.booted = false;
    this.lastReport = null;
    this.history = [];
    this.bootCount = 0;
  }

  async boot() {
    const attempt = ++this.bootCount;
    const report = { attempt, startedAt: new Date().toISOString(), checks: [], success: false };
    const emit = (type, detail = {}) => this.kernel.events.emit(type, detail);
    try {
      emit("boot:started", { attempt });
      this.kernel.initialize();
      this.onStep?.({ step: "KERNEL_INITIALIZED" });

      for (const check of this.checks) {
        const name = check.name || "system-check";
        try {
          const result = await check.run();
          if (result === false) throw new Error("La comprobación devolvió false");
          report.checks.push({ name, success: true });
          emit("boot:check_passed", { name });
          this.onStep?.({ step: "CHECK_PASSED", name });
        } catch (error) {
          report.checks.push({ name, success: false, message: error.message });
          emit("boot:check_failed", { name, message: error.message });
          this.kernel.reportError(error, { source: "BOOT_MANAGER", code: "BOOT_CHECK_FAILED" });
          throw new Error(`Falló la comprobación "${name}": ${error.message}`);
        }
      }

      this.kernel.start();
      report.success = true;
      this.booted = true;
      emit("boot:completed", { attempt });
      this.onStep?.({ step: "BOOT_COMPLETED" });
      return report;
    } catch (error) {
      this.booted = false;
      this.kernel.reportError(error, { source: "BOOT_MANAGER", code: "BOOT_FAILED" });
      report.error = error.message;
      // Un arranque fallido deja el kernel detenido (HALTED), desde donde se puede reintentar.
      if (this.kernel.state.status === SYSTEM_STATUS.BOOTING) {
        this.kernel.halt("Arranque fallido");
      }
      emit("boot:failed", { attempt, message: error.message });
      return report;
    } finally {
      report.finishedAt = new Date().toISOString();
      this.lastReport = report;
      this.history.push(report);
      if (this.history.length > MAX_HISTORY) this.history.shift();
    }
  }

  /** Reinicia el sistema: apaga (si está encendido) y vuelve a ejecutar el ciclo de arranque completo. */
  async restart(reason = "Reinicio solicitado") {
    const status = this.kernel.state.status;
    if (status === SYSTEM_STATUS.BOOTING || status === SYSTEM_STATUS.SHUTTING_DOWN) {
      throw new Error(`No se puede reiniciar mientras el sistema está en ${status}`);
    }
    this.kernel.events.emit("boot:restart_requested", { reason, from: status });
    if (status === SYSTEM_STATUS.RUNNING || status === SYSTEM_STATUS.DEGRADED) {
      this.kernel.shutdown(reason);
    }
    this.booted = false;
    return this.boot();
  }
}
