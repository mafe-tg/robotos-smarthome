import test from "node:test";
import assert from "node:assert/strict";
import { simulateRealTime, RT_ALGORITHMS } from "../../src/resources/RealTimeScheduler.js";

// Caso clásico (Liu y Layland): utilización 0.97. EDF lo cumple y Rate Monotonic no.
const CLASICO = [
  { name: "A", period: 5, computation: 2 },
  { name: "B", period: 7, computation: 4 },
];

test("rechaza tareas, deadlines, algoritmos y horizontes inválidos", () => {
  assert.throws(() => simulateRealTime([], "EDF"), /al menos una tarea/);
  assert.throws(() => simulateRealTime([{ period: 4, computation: 1 }], "EDF"), /necesita un nombre/);
  assert.throws(
    () => simulateRealTime([{ name: "A", period: 4, computation: 1 }, { name: "A", period: 5, computation: 1 }], "EDF"),
    /repetido/
  );
  assert.throws(() => simulateRealTime([{ name: "A", period: 0, computation: 1 }], "EDF"), /período/);
  assert.throws(() => simulateRealTime([{ name: "A", period: 4, computation: 0 }], "EDF"), /computation/);
  assert.throws(() => simulateRealTime([{ name: "A", period: 4, computation: 1, deadline: 5 }], "EDF"), /deadline/);
  assert.throws(() => simulateRealTime([{ name: "A", period: 4, computation: 3, deadline: 2 }], "EDF"), /no puede ser mayor/);
  assert.throws(() => simulateRealTime(CLASICO, "SJF"), /inválido/);
  assert.throws(() => simulateRealTime(CLASICO, "EDF", 0), /horizonte/);
  assert.throws(() => simulateRealTime(CLASICO, "EDF", 999999), /supera el máximo/);
  assert.throws(
    () => simulateRealTime([{ name: "A", period: 97, computation: 1 }, { name: "B", period: 89, computation: 1 }], "EDF"),
    /supera el máximo/
  );
});

test("el horizonte por defecto es el hiperperíodo y se calcula la utilización", () => {
  const r = simulateRealTime(CLASICO, RT_ALGORITHMS.EDF);
  assert.equal(r.horizon, 35);
  assert.ok(Math.abs(r.utilization - (2 / 5 + 4 / 7)) < 1e-12);
  assert.ok(r.utilization > r.rmBound, "supera la cota de Rate Monotonic para 2 tareas");
  assert.ok(r.utilization <= 1, "pero EDF todavía puede planificarlo");
});

test("EDF cumple todos los deadlines del caso clásico", () => {
  const r = simulateRealTime(CLASICO, "EDF");
  assert.equal(r.released, 12);
  assert.equal(r.completed, 12);
  assert.equal(r.missed, 0);
  assert.equal(r.schedulable, true);
  assert.equal(r.misses.length, 0);
});

test("Rate Monotonic pierde el primer trabajo de B en el tick 7", () => {
  const r = simulateRealTime(CLASICO, "RM");
  assert.equal(r.missed, 1);
  assert.equal(r.schedulable, false);
  assert.deepEqual(r.misses, [{ task: "B", job: 1, release: 0, deadline: 7 }]);
  const b = r.tasks.find((t) => t.name === "B");
  assert.equal(b.missed, 1);
  assert.equal(b.completed + b.missed, b.released);
});

test("con carga holgada ambos algoritmos cumplen todo y obtienen lo mismo", () => {
  const tareas = [
    { name: "sensor", period: 4, computation: 1 },
    { name: "camara", period: 6, computation: 2 },
  ];
  const edf = simulateRealTime(tareas, "EDF");
  const rm = simulateRealTime(tareas, "RM");
  assert.equal(edf.horizon, 12);
  assert.equal(edf.missed, 0);
  assert.equal(rm.missed, 0);
  assert.equal(edf.completed, rm.completed);
});

test("la línea de tiempo cubre todo el horizonte y las cuentas cuadran", () => {
  for (const algoritmo of ["EDF", "RM"]) {
    const r = simulateRealTime(CLASICO, algoritmo);
    assert.equal(r.timeline[0].start, 0);
    assert.equal(r.timeline.at(-1).end, r.horizon);
    for (let i = 1; i < r.timeline.length; i += 1) assert.equal(r.timeline[i].start, r.timeline[i - 1].end);
    const ocupados = r.timeline.filter((s) => s.task !== null).reduce((suma, s) => suma + (s.end - s.start), 0);
    assert.equal(ocupados, r.cpuBusyTicks);
    assert.equal(r.completed + r.missed + r.pending, r.released);
  }
});

test("con un horizonte corto los trabajos sin plazo vencido quedan pendientes, no perdidos", () => {
  const r = simulateRealTime([{ name: "T", period: 10, computation: 3 }], "EDF", 12);
  assert.equal(r.released, 2);
  assert.equal(r.completed, 1);
  assert.equal(r.missed, 0);
  assert.equal(r.pending, 1);
});

test("una sobrecarga (utilización mayor a 1) pierde deadlines con los dos algoritmos", () => {
  const sobrecarga = [
    { name: "A", period: 2, computation: 2 },
    { name: "B", period: 3, computation: 2 },
  ];
  for (const algoritmo of ["EDF", "RM"]) {
    const r = simulateRealTime(sobrecarga, algoritmo);
    assert.ok(r.utilization > 1);
    assert.ok(r.missed > 0);
    assert.equal(r.schedulable, false);
    assert.ok(r.missRate > 0 && r.missRate <= 1);
  }
});

test("un deadline menor que el período se respeta", () => {
  // Con deadline 2 y computation 2, la tarea debe correr de inmediato en cada período.
  const r = simulateRealTime([{ name: "rapida", period: 5, computation: 2, deadline: 2 }, { name: "lenta", period: 5, computation: 2 }], "EDF");
  assert.equal(r.missed, 0);
  assert.deepEqual(r.timeline.slice(0, 2).map((s) => s.task), ["rapida", "lenta"]);
});

test("el resultado es el mismo en cada corrida", () => {
  assert.deepEqual(simulateRealTime(CLASICO, "RM"), simulateRealTime(CLASICO, "RM"));
});
