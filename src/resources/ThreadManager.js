/**
 * Gestor de hilos (threads) para cada proceso.
 * Simula estados y planificación Round Robin; no crea hilos nativos del navegador.
 *
 * Usa el mismo vocabulario de estados que los procesos (WAITING en vez de BLOCKED).
 * Si recibe un processManager, los hilos quedan ligados a sus procesos:
 *  - solo se crean hilos para procesos que existen y no están terminados;
 *  - al terminar un proceso (evento process:terminate) sus hilos terminan.
 * Sin processManager funciona aislado (como en las pruebas unitarias).
 */
import { ESTADOS } from "../../procesos-cpu/src/proceso.js";

export const THREAD_STATES = Object.freeze({
  NEW: "NEW",
  READY: "READY",
  RUNNING: "RUNNING",
  WAITING: "WAITING",
  TERMINATED: "TERMINATED",
});

export class ThreadManager {
  constructor({ eventEngine = null, quantum = 2, processManager = null } = {}) {
    if (!Number.isInteger(quantum) || quantum < 1) throw new Error("Quantum inválido");
    this.eventEngine = eventEngine;
    this.quantum = quantum;
    this.processManager = processManager;
    this.threads = new Map();
    this.nextId = 1;
    this.readyQueue = [];
    // Los dos managers deben compartir el mismo bus de eventos para que esto funcione.
    this.eventEngine?.on("process:terminate", (event) => this.#terminateThreadsOf(event.payload.pid));
  }

  create({ processId, name, priority = 5, burst = 1 } = {}) {
    if (processId === undefined || processId === null) throw new Error("El hilo debe pertenecer a un proceso");
    if (typeof name !== "string" || !name.trim()) throw new Error("El nombre del hilo es obligatorio");
    if (!Number.isInteger(burst) || burst < 1) throw new Error("burst debe ser un entero positivo");
    if (this.processManager) {
      const process = this.processManager.get(processId);
      if (!process) throw new Error(`Proceso ${processId} no encontrado`);
      if (process.estado === ESTADOS.TERMINATED) throw new Error(`El proceso ${processId} ya terminó`);
    }
    const thread = {
      tid: this.nextId++, processId, name: name.trim(), priority,
      burst, remaining: burst, state: THREAD_STATES.NEW,
    };
    this.threads.set(thread.tid, thread);
    this.eventEngine?.emit("thread:created", { ...thread });
    return { ...thread };
  }

  admit(tid) {
    const thread = this.#require(tid, THREAD_STATES.NEW);
    thread.state = THREAD_STATES.READY;
    this.readyQueue.push(thread.tid);
    this.#emit("thread:admitted", thread);
    return { ...thread };
  }

  block(tid) {
    const thread = this.#require(tid, THREAD_STATES.READY, THREAD_STATES.RUNNING);
    thread.state = THREAD_STATES.WAITING;
    this.readyQueue = this.readyQueue.filter((id) => id !== thread.tid);
    this.#emit("thread:blocked", thread);
    return { ...thread };
  }

  unblock(tid) {
    const thread = this.#require(tid, THREAD_STATES.WAITING);
    thread.state = THREAD_STATES.READY;
    this.readyQueue.push(thread.tid);
    this.#emit("thread:unblocked", thread);
    return { ...thread };
  }

  terminate(tid) {
    const thread = this.#require(tid, THREAD_STATES.NEW, THREAD_STATES.READY, THREAD_STATES.RUNNING, THREAD_STATES.WAITING);
    thread.state = THREAD_STATES.TERMINATED;
    this.readyQueue = this.readyQueue.filter((id) => id !== thread.tid);
    this.#emit("thread:terminated", thread);
    return { ...thread };
  }

  /** Ejecuta un turno del hilo siguiente y devuelve el resultado del turno. */
  scheduleNext() {
    while (this.readyQueue.length) {
      const tid = this.readyQueue.shift();
      const thread = this.threads.get(tid);
      if (!thread || thread.state !== THREAD_STATES.READY) continue;
      thread.state = THREAD_STATES.RUNNING;
      const executed = Math.min(this.quantum, thread.remaining);
      thread.remaining -= executed;
      thread.state = thread.remaining === 0 ? THREAD_STATES.TERMINATED : THREAD_STATES.READY;
      if (thread.state === THREAD_STATES.READY) this.readyQueue.push(thread.tid);
      this.#emit("thread:scheduled", thread, { executed });
      return { thread: { ...thread }, executed, finished: thread.state === THREAD_STATES.TERMINATED };
    }
    return null;
  }

  list({ processId } = {}) {
    return [...this.threads.values()]
      .filter((thread) => processId === undefined || thread.processId === processId)
      .map((thread) => ({ ...thread }));
  }

  /** Vacía todos los hilos (reinicio del kernel). */
  reset() {
    this.threads.clear();
    this.readyQueue = [];
    this.nextId = 1;
  }

  #terminateThreadsOf(processId) {
    for (const thread of [...this.threads.values()]) {
      if (thread.processId === processId && thread.state !== THREAD_STATES.TERMINATED) {
        this.terminate(thread.tid);
      }
    }
  }

  #require(tid, ...allowedStates) {
    const thread = this.threads.get(Number(tid));
    if (!thread) throw new Error(`Hilo ${tid} no encontrado`);
    if (!allowedStates.includes(thread.state)) {
      throw new Error(`Operación no permitida para hilo ${tid} en estado ${thread.state}`);
    }
    return thread;
  }

  #emit(type, thread, extra = {}) {
    this.eventEngine?.emit(type, { ...thread, ...extra });
  }
}
