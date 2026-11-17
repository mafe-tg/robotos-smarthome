/**
 * Secuencia de arranque de RobotOS. Ejecuta comprobaciones y arranca el kernel.
 */
export class BootManager {
  constructor({ kernel, checks = [], onStep = null } = {}) {
    if (!kernel) throw new Error("BootManager necesita una instancia de KernelCore");
    this.kernel = kernel;
    this.checks = checks;
    this.onStep = onStep;
    this.booted = false;
    this.lastReport = null;
  }

  async boot() {
    const report = { startedAt: new Date().toISOString(), checks: [], success: false };
    try {
      this.kernel.initialize();
      this.onStep?.({ step: "KERNEL_INITIALIZED" });

      for (const check of this.checks) {
        const name = check.name || "system-check";
        try {
          const result = await check.run();
          if (result === false) throw new Error("La comprobación devolvió false");
          report.checks.push({ name, success: true });
          this.onStep?.({ step: "CHECK_PASSED", name });
        } catch (error) {
          report.checks.push({ name, success: false, message: error.message });
          this.kernel.reportError(error, { source: "BOOT_MANAGER", code: "BOOT_CHECK_FAILED" });
          throw new Error(`Falló la comprobación "${name}": ${error.message}`);
        }
      }

      this.kernel.start();
      report.success = true;
      this.booted = true;
      this.onStep?.({ step: "BOOT_COMPLETED" });
      return report;
    } catch (error) {
      this.kernel.reportError(error, { source: "BOOT_MANAGER", code: "BOOT_FAILED" });
      report.error = error.message;
      return report;
    } finally {
      report.finishedAt = new Date().toISOString();
      this.lastReport = report;
    }
  }
}
