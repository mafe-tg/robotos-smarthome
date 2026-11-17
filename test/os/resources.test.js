import { test } from "node:test";
import assert from "node:assert/strict";
import { ProcessManager } from "../../src/resources/ProcessManager.js";
import { CPUScheduler, ALGORITMOS } from "../../src/resources/CPUScheduler.js";
import { ThreadManager, THREAD_STATES } from "../../src/resources/ThreadManager.js";

const processData = (name = "Vigilancia") => ({
  nombre: name, prioridad: 1, memoriaRequerida: 64, cpuRequerida: 30, tiempoTotal: 3,
});

test("ProcessManager crea procesos, administra estados y libera memoria al terminar", () => {
  const manager = new ProcessManager({ memoryLimitKb: 100 });
  const process = manager.create(processData());
  assert.equal(manager.usedMemoryKb, 64);
  manager.transition(process.managerId, "admit");
  manager.transition(process.managerId, "execute");
  manager.transition(process.managerId, "terminate");
  assert.equal(process.estado, "TERMINATED");
  assert.equal(manager.usedMemoryKb, 0);
});

test("ProcessManager rechaza procesos cuando no hay memoria", () => {
  const manager = new ProcessManager({ memoryLimitKb: 32 });
  assert.throws(() => manager.create(processData()), /Memoria insuficiente/);
});

test("CPUScheduler acepta Round Robin y valida quantum", () => {
  const scheduler = new CPUScheduler({ algorithm: ALGORITMOS.ROUND_ROBIN, quantum: 1 });
  assert.deepEqual(scheduler.getConfiguration(), { algorithm: "ROUND_ROBIN", quantum: 1 });
  assert.throws(() => scheduler.setConfiguration({ quantum: 0 }), /quantum/);
});

test("ThreadManager planifica hilos por turnos hasta finalizarlos", () => {
  const manager = new ThreadManager({ quantum: 2 });
  const a = manager.create({ processId: 10, name: "lectura-sensor", burst: 3 });
  const b = manager.create({ processId: 10, name: "actualizar-pantalla", burst: 1 });
  manager.admit(a.tid);
  manager.admit(b.tid);
  const first = manager.scheduleNext();
  const second = manager.scheduleNext();
  const third = manager.scheduleNext();
  assert.equal(first.thread.tid, a.tid);
  assert.equal(second.thread.tid, b.tid);
  assert.equal(third.thread.tid, a.tid);
  assert.equal(third.thread.state, THREAD_STATES.TERMINATED);
});

test("ThreadManager bloquea y desbloquea hilos", () => {
  const manager = new ThreadManager();
  const thread = manager.create({ processId: 4, name: "espera-red" });
  manager.admit(thread.tid);
  manager.block(thread.tid);
  assert.equal(manager.list()[0].state, THREAD_STATES.BLOCKED);
  manager.unblock(thread.tid);
  assert.equal(manager.list()[0].state, THREAD_STATES.READY);
});
