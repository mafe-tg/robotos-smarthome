// test/proceso.test.js
// Pruebas de la creación de procesos, sus estados y sus transiciones.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Proceso, ESTADOS, reiniciarContadorPid } from "../src/proceso.js";

const datosBase = {
  nombre: "Control de iluminación",
  prioridad: 3,
  memoriaRequerida: 64,
  cpuRequerida: 10,
  tiempoTotal: 3,
};

test("un proceso nuevo empieza en NEW con pid 1 y tiempo restante completo", () => {
  reiniciarContadorPid();
  const p = new Proceso(datosBase);
  assert.equal(p.estado, ESTADOS.NEW);
  assert.equal(p.pid, 1);
  assert.equal(p.tiempoRestante, 3);
});

test("cada proceso nuevo recibe un pid distinto y creciente", () => {
  reiniciarContadorPid();
  const a = new Proceso(datosBase);
  const b = new Proceso(datosBase);
  assert.equal(a.pid, 1);
  assert.equal(b.pid, 2);
});

test("rechaza datos inválidos al crear un proceso", () => {
  assert.throws(() => new Proceso({ ...datosBase, nombre: "" }), /nombre/i);
  assert.throws(() => new Proceso({ ...datosBase, prioridad: 0 }), /prioridad/i);
  assert.throws(() => new Proceso({ ...datosBase, memoriaRequerida: -1 }), /memoria/i);
  assert.throws(() => new Proceso({ ...datosBase, cpuRequerida: 150 }), /CPU/);
  assert.throws(() => new Proceso({ ...datosBase, tiempoTotal: 1.5 }), /entero/);
});

test("ciclo de vida completo: NEW, READY, RUNNING, WAITING, READY, RUNNING, TERMINATED", () => {
  const p = new Proceso(datosBase);
  p.admitir();
  assert.equal(p.estado, ESTADOS.READY);
  p.ejecutar();
  assert.equal(p.estado, ESTADOS.RUNNING);
  p.pausar();
  assert.equal(p.estado, ESTADOS.WAITING);
  p.reanudar();
  assert.equal(p.estado, ESTADOS.READY);
  p.ejecutar();
  p.finalizar();
  assert.equal(p.estado, ESTADOS.TERMINATED);
});

test("un proceso READY también puede pausarse", () => {
  const p = new Proceso(datosBase);
  p.admitir();
  p.pausar();
  assert.equal(p.estado, ESTADOS.WAITING);
});

test("una transición inválida lanza error y no cambia el estado", () => {
  const p = new Proceso(datosBase);
  assert.throws(() => p.ejecutar(), /Transición no permitida/); // NEW -> RUNNING
  assert.equal(p.estado, ESTADOS.NEW);
  assert.throws(() => p.pausar(), /Transición no permitida/); // NEW -> WAITING
  assert.equal(p.estado, ESTADOS.NEW);
});

test("un proceso TERMINATED no puede volver a ningún estado", () => {
  const p = new Proceso(datosBase);
  p.finalizar(); // NEW -> TERMINATED está permitido
  assert.equal(p.estado, ESTADOS.TERMINATED);
  assert.throws(() => p.admitir(), /Transición no permitida/);
  assert.throws(() => p.ejecutar(), /Transición no permitida/);
  assert.throws(() => p.finalizar(), /Transición no permitida/);
});
