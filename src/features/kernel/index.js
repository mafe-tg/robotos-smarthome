/**
 * Punto de entrada del kernel de RobotOS para el resto del proyecto.
 * Funciones claras: boot(), restart(), shutdown(), getState().
 *
 * Los eventos salen con el formato { tipo, origen, detalle, fecha } hacia la función
 * onEvent que se pase en la PRIMERA llamada a boot(); así otro módulo los puede guardar.
 */
import { KernelCore } from "../../core/KernelCore.js";
import { BootManager } from "../../core/BootManager.js";

let kernel = null;
let bootManager = null;

/** Arranca RobotOS. Opciones (solo se usan la primera vez): { onEvent, onLog, checks }. */
export function boot({ onEvent = null, onLog = null, checks = [] } = {}) {
  if (!kernel) {
    kernel = new KernelCore({ onEvent, onLog });
    bootManager = new BootManager({ kernel, checks });
  }
  return bootManager.boot();
}

/** Reinicia RobotOS: vuelve a ejecutar el ciclo de arranque. */
export function restart(reason) {
  if (!bootManager) throw new Error("RobotOS aún no se ha arrancado: usa boot() primero");
  return bootManager.restart(reason);
}

/** Apaga RobotOS. */
export function shutdown(reason) {
  if (!kernel) throw new Error("RobotOS aún no se ha arrancado: usa boot() primero");
  return kernel.shutdown(reason);
}

/** Estado actual del sistema (status, uptime e historial de transiciones). */
export function getState() {
  return kernel ? kernel.state.snapshot() : { status: "OFF" };
}

/** Historial de arranques (reportes de boot). */
export function getBootHistory() {
  return bootManager ? [...bootManager.history] : [];
}

/** Acceso a la instancia del kernel, para que otros módulos se conecten a él. */
export function getKernel() {
  return kernel;
}

/** Descarta la instancia actual (útil en pruebas). */
export function resetKernel() {
  kernel = null;
  bootManager = null;
}
