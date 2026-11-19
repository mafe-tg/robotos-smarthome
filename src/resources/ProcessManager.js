/**
 * Administración de procesos de RobotOS.
 * Reutiliza la clase Proceso y sus transiciones ya existentes en procesos-cpu.
 */
import { Proceso, ESTADOS } from "../../procesos-cpu/src/proceso.js";

export class ProcessManager {
  constructor({ eventEngine = null, memoryLimitKb = Infinity } = {}) {
    this.processes = new Map();
    this.eventEngine = eventEngine;
    this.memoryLimitKb = memoryLimitKb;
    this.nextId = 1;
  }

  get usedMemoryKb() {
    return [...this.processes.values()]
      .filter((process) => process.estado !== ESTADOS.TERMINATED)
      .reduce((total, process) => total + process.memoriaRequerida, 0);
  }

  create(data) {
    const required = Number(data.memoriaRequerida);
    if (this.usedMemoryKb + required > this.memoryLimitKb) {
      throw new Error("Memoria insuficiente para crear el proceso");
    }
    const process = new Proceso(data);
    process.managerId = this.nextId++;
    this.processes.set(process.managerId, process);
    this.eventEngine?.emit("process:created", this.toJSON(process));
    return process;
  }

  get(id) {
    return this.processes.get(Number(id)) || null;
  }

  transition(id, action) {
    const process = this.get(id);
    if (!process) throw new Error(`Proceso ${id} no encontrado`);
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

  list({ state } = {}) {
    return [...this.processes.values()]
      .filter((process) => !state || process.estado === state)
      .map((process) => this.toJSON(process));
  }

  toJSON(process) {
    return {
      id: process.managerId,
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
