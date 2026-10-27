// test/cpu.test.js
// Pruebas del planificador (scheduler) y de la simulación de CPU.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Proceso, ESTADOS, reiniciarContadorPid } from "../src/proceso.js";
import { simular, dibujarLinea } from "../src/cpu.js";
import { ALGORITMOS } from "../src/scheduler.js";

// Ayuda para crear procesos cortos de prueba.
function crear(nombre, prioridad, tiempoTotal, cpuRequerida = 10) {
  return new Proceso({ nombre, prioridad, memoriaRequerida: 10, cpuRequerida, tiempoTotal });
}

function metricaDe(resultado, nombre) {
  return resultado.metricas.find((m) => m.nombre === nombre);
}

test("PRIORIDAD: se ejecuta primero el proceso con el número de prioridad más bajo", () => {
  reiniciarContadorPid();
  const a = crear("A", 3, 2);
  const b = crear("B", 1, 2);
  const c = crear("C", 2, 1);
  const r = simular([a, b, c], { algoritmo: ALGORITMOS.PRIORIDAD });
  assert.deepEqual(
    r.linea.map((t) => t.nombre),
    ["B", "B", "C", "A", "A"]
  );
});

test("PRIORIDAD: en caso de empate gana el que se creó primero", () => {
  reiniciarContadorPid();
  const a = crear("A", 2, 1);
  const b = crear("B", 2, 1);
  const r = simular([b, a], { algoritmo: ALGORITMOS.PRIORIDAD }); // se pasan en otro orden a propósito
  assert.deepEqual(
    r.linea.map((t) => t.nombre),
    ["A", "B"]
  );
});

test("PRIORIDAD: calcula bien las esperas", () => {
  reiniciarContadorPid();
  const r = simular([crear("A", 3, 2), crear("B", 1, 2), crear("C", 2, 1)], {
    algoritmo: ALGORITMOS.PRIORIDAD,
  });
  assert.equal(metricaDe(r, "B").espera, 0);
  assert.equal(metricaDe(r, "C").espera, 2);
  assert.equal(metricaDe(r, "A").espera, 3);
});

test("ROUND ROBIN: los procesos se turnan según el quantum", () => {
  reiniciarContadorPid();
  const r = simular([crear("A", 1, 3), crear("B", 1, 2)], {
    algoritmo: ALGORITMOS.ROUND_ROBIN,
    quantum: 2,
  });
  assert.deepEqual(
    r.linea.map((t) => t.nombre),
    ["A", "A", "B", "B", "A"]
  );
  assert.equal(metricaDe(r, "A").espera, 2); // terminó en el tick 5, usó 3
  assert.equal(metricaDe(r, "B").espera, 2); // terminó en el tick 4, usó 2
});

test("ROUND ROBIN: rechaza un quantum inválido", () => {
  const p = crear("A", 1, 2);
  assert.throws(
    () => simular([p], { algoritmo: ALGORITMOS.ROUND_ROBIN, quantum: 0 }),
    /quantum/
  );
});

test("al terminar la simulación todos los procesos quedan TERMINATED sin tiempo restante", () => {
  const procesos = [crear("A", 1, 3), crear("B", 2, 2)];
  simular(procesos, { algoritmo: ALGORITMOS.ROUND_ROBIN, quantum: 1 });
  for (const p of procesos) {
    assert.equal(p.estado, ESTADOS.TERMINATED);
    assert.equal(p.tiempoRestante, 0);
  }
});

test("un proceso pausado (WAITING) no entra al planificador y se informa como omitido", () => {
  reiniciarContadorPid();
  const a = crear("A", 1, 2);
  const b = crear("B", 2, 2);
  b.admitir();
  b.pausar();
  const r = simular([a, b], { algoritmo: ALGORITMOS.PRIORIDAD });
  assert.deepEqual(
    r.linea.map((t) => t.nombre),
    ["A", "A"]
  );
  assert.equal(r.omitidos.length, 1);
  assert.equal(r.omitidos[0].nombre, "B");
  assert.equal(b.estado, ESTADOS.WAITING);
});

test("el uso de CPU promedio se calcula con la CPU requerida de cada tick", () => {
  // A usa 40% durante 2 ticks y B usa 20% durante 2 ticks: (40*2 + 20*2) / 4 = 30
  const r = simular([crear("A", 1, 2, 40), crear("B", 2, 2, 20)], {
    algoritmo: ALGORITMOS.PRIORIDAD,
  });
  assert.equal(r.usoCpuPromedio, 30);
  assert.equal(r.duracionTotal, 4);
});

test("dibujarLinea muestra una fila por proceso", () => {
  const r = simular([crear("A", 1, 2), crear("B", 2, 1)], { algoritmo: ALGORITMOS.PRIORIDAD });
  const dibujo = dibujarLinea(r.linea);
  assert.equal(dibujo, "A | ██·\nB | ··█");
});
