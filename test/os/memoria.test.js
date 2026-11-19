import test from "node:test";
import assert from "node:assert/strict";
import { EventEngine } from "../../src/core/EventEngine.js";
import { MemoryManager, simulatePageReplacement, PAGE_ALGORITHMS } from "../../src/resources/MemoryManager.js";

const SECUENCIA = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2];
const SECUENCIA_LARGA = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1];
const BELADY = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];

function crear({ frames = 3, algorithm = "FIFO", pages = 8 } = {}) {
  const eventos = [];
  const eventEngine = new EventEngine({ onEvent: (e) => eventos.push(e) });
  const memoria = new MemoryManager({ eventEngine, frames, algorithm });
  memoria.registerProcess(1, pages);
  return { memoria, eventos };
}

function correr(memoria, referencias, pid = 1) {
  return referencias.map((page) => memoria.access(pid, page));
}

test("simulatePageReplacement: FIFO y LRU dan los page faults esperados (calculados a mano)", () => {
  assert.equal(simulatePageReplacement(SECUENCIA, 3, "FIFO").pageFaults, 10);
  assert.equal(simulatePageReplacement(SECUENCIA, 3, "LRU").pageFaults, 9);
  assert.equal(simulatePageReplacement(SECUENCIA_LARGA, 3, "FIFO").pageFaults, 15);
  assert.equal(simulatePageReplacement(SECUENCIA_LARGA, 3, "LRU").pageFaults, 12);
});

test("FIFO muestra la anomalía de Belady y LRU no", () => {
  assert.equal(simulatePageReplacement(BELADY, 3, "FIFO").pageFaults, 9);
  assert.equal(simulatePageReplacement(BELADY, 4, "FIFO").pageFaults, 10);
  assert.ok(simulatePageReplacement(BELADY, 4, "LRU").pageFaults <= simulatePageReplacement(BELADY, 3, "LRU").pageFaults);
});

test("simulatePageReplacement valida sus parámetros", () => {
  assert.throws(() => simulatePageReplacement([1, 2], 0, "FIFO"), /marcos/);
  assert.throws(() => simulatePageReplacement([1, 2], 3, "OPT"), /inválido/);
  assert.throws(() => simulatePageReplacement([1, -2], 3, "FIFO"), /referencias/);
});

test("MemoryManager coincide con la simulación pura (FIFO y LRU)", () => {
  for (const algorithm of ["FIFO", "LRU"]) {
    const { memoria } = crear({ algorithm });
    correr(memoria, SECUENCIA_LARGA);
    const esperado = simulatePageReplacement(SECUENCIA_LARGA, 3, algorithm).pageFaults;
    assert.equal(memoria.getState().pageFaults, esperado, algorithm);
  }
});

test("la tabla de páginas indica en qué marco está cada página y cuáles no están presentes", () => {
  const { memoria } = crear({ pages: 5 });
  assert.equal(memoria.getState().processes[0].pages, 5);
  correr(memoria, [0, 1, 2]);
  const tabla = memoria.getState().processes[0].table;
  assert.deepEqual(tabla.filter((e) => e.present).map((e) => e.page), [0, 1, 2]);
  assert.deepEqual(tabla.filter((e) => !e.present).map((e) => e.page), [3, 4]);
  assert.deepEqual(tabla.filter((e) => e.present).map((e) => e.frame).sort(), [0, 1, 2]);
});

test("el primer acceso a una página es page fault y el segundo es acierto", () => {
  const { memoria } = crear();
  assert.equal(memoria.access(1, 2).fault, true);
  assert.equal(memoria.access(1, 2).fault, false);
  const estado = memoria.getState();
  assert.equal(estado.pageFaults, 1);
  assert.equal(estado.hits, 1);
  assert.equal(estado.accesses, 2);
});

test("con marcos llenos, FIFO reemplaza la página más antigua aunque se haya usado hace poco", () => {
  const { memoria } = crear({ algorithm: "FIFO" });
  correr(memoria, [0, 1, 2, 0]); // la 0 es la más antigua, aunque se usó de último
  const resultado = memoria.access(1, 3);
  assert.deepEqual(resultado.victim, { pid: 1, page: 0, frame: 0 });
});

test("con marcos llenos, LRU reemplaza la página menos usada recientemente", () => {
  const { memoria } = crear({ algorithm: "LRU" });
  correr(memoria, [0, 1, 2, 0]); // la 1 es la que lleva más tiempo sin usarse
  const resultado = memoria.access(1, 3);
  assert.equal(resultado.victim.page, 1);
});

test("la víctima queda marcada como no presente en su tabla de páginas", () => {
  const { memoria } = crear({ algorithm: "FIFO" });
  correr(memoria, [0, 1, 2, 3]);
  const tabla = memoria.getState().processes[0].table;
  assert.equal(tabla.find((e) => e.page === 0).present, false);
  assert.equal(tabla.find((e) => e.page === 3).present, true);
});

test("dos procesos comparten los mismos marcos y se reemplazan entre sí", () => {
  const { memoria } = crear({ frames: 2, pages: 4 });
  memoria.registerProcess(2, 4);
  memoria.access(1, 0);
  memoria.access(2, 0);
  const resultado = memoria.access(2, 1); // RAM llena: sale la página 0 del proceso 1 (la más antigua)
  assert.deepEqual(resultado.victim, { pid: 1, page: 0, frame: 0 });
  const estado = memoria.getState();
  assert.equal(estado.processes.find((p) => p.pid === 1).resident, 0);
  assert.equal(estado.processes.find((p) => p.pid === 2).pageFaults, 2);
});

test("liberar un proceso libera sus marcos y borra su tabla", () => {
  const { memoria } = crear({ frames: 4 });
  memoria.registerProcess(2, 4);
  correr(memoria, [0, 1]);
  memoria.access(2, 0);
  assert.equal(memoria.getState().freeFrames, 1);
  assert.equal(memoria.releaseProcess(1), 2);
  assert.equal(memoria.getState().freeFrames, 3);
  assert.equal(memoria.hasProcess(1), false);
  assert.equal(memoria.releaseProcess(99), 0);
});

test("rechaza accesos inválidos: proceso sin tabla y página fuera de rango", () => {
  const { memoria } = crear({ pages: 4 });
  assert.throws(() => memoria.access(99, 0), /no tiene tabla/);
  assert.throws(() => memoria.access(1, 4), /fuera de rango/);
  assert.throws(() => memoria.access(1, -1), /fuera de rango/);
  assert.throws(() => memoria.access(1, 1.5), /fuera de rango/);
});

test("registerProcess valida pid, memoria y duplicados; las páginas salen de los MB", () => {
  const { memoria } = crear();
  assert.throws(() => memoria.registerProcess(1, 4), /ya tiene tabla/);
  assert.throws(() => memoria.registerProcess("x", 4), /pid/);
  assert.throws(() => memoria.registerProcess(5, 0), /mayor a 0/);
  assert.equal(memoria.registerProcess(6, 2.5).pages, 3); // 2.5 MB con páginas de 1 MB = 3 páginas
});

test("configure cambia el algoritmo sin perder la RAM y valida los valores", () => {
  const { memoria } = crear({ algorithm: "FIFO" });
  correr(memoria, [0, 1]);
  memoria.configure({ algorithm: "LRU" });
  assert.equal(memoria.getConfiguration().algorithm, "LRU");
  assert.equal(memoria.getState().freeFrames, 1);
  assert.throws(() => memoria.configure({ algorithm: "OPT" }), /inválido/);
  assert.throws(() => memoria.configure({ frames: 0 }), /marcos/);
});

test("cambiar la cantidad de marcos vacía la RAM pero conserva las tablas", () => {
  const { memoria } = crear({ frames: 3 });
  correr(memoria, [0, 1, 2]);
  memoria.configure({ frames: 5 });
  const estado = memoria.getState();
  assert.equal(estado.totalFrames, 5);
  assert.equal(estado.freeFrames, 5);
  assert.equal(estado.processes[0].resident, 0);
  assert.equal(memoria.access(1, 0).fault, true);
});

test("reset deja la memoria vacía y los contadores en cero", () => {
  const { memoria } = crear();
  correr(memoria, [0, 1, 2, 3]);
  memoria.reset();
  const estado = memoria.getState();
  assert.equal(estado.accesses, 0);
  assert.equal(estado.pageFaults, 0);
  assert.equal(estado.processes.length, 0);
  assert.equal(estado.freeFrames, 3);
});

test("los eventos de memoria salen en formato { tipo, origen, detalle, fecha } con origen MEMORY", () => {
  const { memoria, eventos } = crear({ frames: 2 });
  eventos.length = 0;
  correr(memoria, [0, 1, 2]);
  assert.ok(eventos.length > 0);
  for (const evento of eventos) {
    assert.deepEqual(Object.keys(evento).sort(), ["detalle", "fecha", "origen", "tipo"]);
    assert.equal(evento.origen, "MEMORY");
    assert.ok(!Number.isNaN(Date.parse(evento.fecha)));
  }
  const tipos = eventos.map((e) => e.tipo);
  assert.equal(tipos.filter((t) => t === "memory:page_fault").length, 3);
  assert.equal(tipos.filter((t) => t === "memory:page_replaced").length, 1);
  assert.equal(tipos.filter((t) => t === "memory:access").length, 3);
});

test("getState informa tasa de fallos y reemplazos", () => {
  const { memoria } = crear({ algorithm: "FIFO" });
  correr(memoria, SECUENCIA);
  const estado = memoria.getState();
  assert.equal(estado.accesses, 13);
  assert.equal(estado.pageFaults, 10);
  assert.equal(estado.hits, 3);
  assert.equal(estado.replacements, 7); // 10 fallos - 3 marcos que estaban libres
  assert.ok(Math.abs(estado.faultRate - 10 / 13) < 1e-9);
});

test("PAGE_ALGORITHMS expone FIFO y LRU", () => {
  assert.deepEqual(Object.keys(PAGE_ALGORITHMS).sort(), ["FIFO", "LRU"]);
});
