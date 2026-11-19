/**
 * Fachada del planificador. Conserva los algoritmos ya implementados:
 * PRIORIDAD y ROUND_ROBIN, y la simulación Gantt del módulo procesos-cpu.
 */
import { ALGORITMOS } from "../../procesos-cpu/src/scheduler.js";
import { simular } from "../../procesos-cpu/src/cpu.js";

export class CPUScheduler {
  constructor({ algorithm = ALGORITMOS.PRIORIDAD, quantum = 2 } = {}) {
    this.setConfiguration({ algorithm, quantum });
  }

  setConfiguration({ algorithm = this.algorithm, quantum = this.quantum } = {}) {
    if (!Object.values(ALGORITMOS).includes(algorithm)) {
      throw new Error(`Algoritmo de CPU desconocido: ${algorithm}`);
    }
    if (algorithm === ALGORITMOS.ROUND_ROBIN && (!Number.isInteger(quantum) || quantum < 1)) {
      throw new Error("El quantum debe ser un entero mayor o igual a 1");
    }
    this.algorithm = algorithm;
    this.quantum = quantum;
  }

  run(processInstances) {
    return simular(processInstances, {
      algoritmo: this.algorithm,
      quantum: this.quantum,
    });
  }

  getConfiguration() {
    return { algorithm: this.algorithm, quantum: this.quantum };
  }
}

export { ALGORITMOS };
