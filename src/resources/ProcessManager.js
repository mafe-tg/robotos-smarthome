/**
 * Administración de procesos de RobotOS.
 * Reutiliza la clase Proceso y sus transiciones ya existentes en procesos-cpu.
 *
 * Un solo identificador: el pid que asigna Proceso. La tabla se indexa por pid.
 * La memoria se maneja en MB (igual que proceso.js).
 */
import { Proceso, ESTADOS } from "../../procesos-cpu/src/proceso.js";

export class ProcessManager {
  constructor({ eventEngine = null, memoryLimitMb = Infinity } = {}) {
    this.processes = new Map(); // clave: pid
    this.eventEngine = eventEngine;
    this.memoryLimitMb = memoryLimitMb;
  }

  get usedMemoryMb() {
    return [...this.processes.values()]
      .filter((process) => process.estado !== ESTADOS.TERMINATED)
      .reduce((total, process) => total + process.memoriaRequerida, 0);
  }

  create(data) {
    const required = Number(data.memoriaRequerida);
    if (this.usedMemoryMb + required > this.memoryLimitMb) {
      throw new Error("Memoria insuficiente para crear el proceso");
    }
    const process = new Proceso(data);
    // Defensa: si alguien reinició el contador de PID con procesos vivos, no se pisa uno existente.
    if (this.processes.has(process.pid)) {
      throw new Error(`PID duplicado: ${process.pid}. No se reinicia el contador de PID con procesos vivos`);
    }
    this.processes.set(process.pid, process);
    this.eventEngine?.emit("process:created", this.toJSON(process));
    return process;
  }

  get(pid) {
    return this.processes.get(Number(pid)) || null;
  }

  transition(pid, action) {
    const process = this.get(pid);
    if (!process) throw new Error(`Proceso ${pid} no encontrado`);
    const actions = {
      admit: "admitir",
      execute: "ejecutar",
      pause: "pausar",
      resume: "reanudar",
      terminate: "finalizar",
    };
    const method = actions[action];
    if (!method) throw new Error(`Acción de proceso desconocida: ${action}`);
    process[method]();
    this.eventEngine?.emit(`process:${action}`, this.toJSON(process));
    return process;
  }

  /**
   * Ejecuta el scheduler sobre los procesos NEW o READY de la tabla.
   * simular() cambia los estados por su cuenta y no emite eventos, así que
   * al terminar avisamos aquí de cada proceso que quedó TERMINATED (process:terminate).
   * onResult recibe el resultado antes de esos avisos.
   */
  run(scheduler, onResult = null) {
    const runnable = [...this.processes.values()].filter(
      (process) => process.estado === ESTADOS.NEW || process.estado === ESTADOS.READY,
    );
    const result = scheduler.run(runnable);
    onResult?.(result);
    for (const process of runnable) {
      if (process.estado === ESTADOS.TERMINATED) {
        this.eventEngine?.emit("process:terminate", this.toJSON(process));
      }
    }
    return result;
  }

  list({ state } = {}) {
    return [...this.processes.values()]
      .filter((process) => !state || process.estado === state)
      .map((process) => this.toJSON(process));
  }

  /** Vacía la tabla de procesos (reinicio del kernel). No toca el contador de PID de proceso.js. */
  reset() {
    this.processes.clear();
  }

  toJSON(process) {
    return {
      pid: process.pid,
      nombre: process.nombre,
      prioridad: process.prioridad,
      memoriaRequerida: process.memoriaRequerida,
      cpuRequerida: process.cpuRequerida,
      tiempoTotal: process.tiempoTotal,
      tiempoRestante: process.tiempoRestante,
      estado: process.estado,
    };
  }
}
