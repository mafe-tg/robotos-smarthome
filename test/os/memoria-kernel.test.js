import test from "node:test";
import assert from "node:assert/strict";
import {
  boot,
  shutdown,
  createProcess,
  accessPage,
  setPageAlgorithm,
  getMemoryState,
  runScheduler,
  resetKernel,
} from "../../src/features/kernel/index.js";

const proceso = (extra = {}) => ({
  nombre: "proceso-prueba",
  prioridad: 2,
  memoriaRequerida: 4,
  cpuRequerida: 10,
  tiempoTotal: 4,
  ...extra,
});

async function arrancar() {
  resetKernel();
  const eventos = [];
  const reporte = await boot({ onEvent: (e) => eventos.push(e) });
  assert.equal(reporte.success, true);
  return eventos;
}

test("accessPage falla si el kernel no se ha arrancado, y getMemoryState devuelve null", async () => {
  resetKernel();
  await assert.rejects(() => accessPage(1, 0), /no se ha arrancado/);
  assert.equal(getMemoryState(), null);
});

test("un proceso nuevo recibe su tabla de páginas (1 página por MB)", async () => {
  await arrancar();
  const p = await createProcess(proceso({ memoriaRequerida: 4 }));
  const estado = getMemoryState();
  assert.equal(estado.processes.length, 1);
  assert.equal(estado.processes[0].pid, p.pid);
  assert.equal(estado.processes[0].pages, 4);
});

test("accessPage: el primer acceso es page fault y el segundo es acierto", async () => {
  await arrancar();
  const p = await createProcess(proceso());
  const primero = await accessPage(p.pid, 0);
  const segundo = await accessPage(p.pid, 0);
  assert.equal(primero.fault, true);
  assert.equal(segundo.fault, false);
  const estado = getMemoryState();
  assert.equal(estado.pageFaults, 1);
  assert.equal(estado.hits, 1);
});

test("setPageAlgorithm cambia el algoritmo y los marcos, y LRU elige como víctima la menos usada", async () => {
  await arrancar();
  const p = await createProcess(proceso({ memoriaRequerida: 4 }));
  const config = await setPageAlgorithm({ algorithm: "LRU", frames: 2 });
  assert.equal(config.algorithm, "LRU");
  assert.equal(config.frames, 2);
  assert.equal(getMemoryState().totalFrames, 2);

  await accessPage(p.pid, 0);
  await accessPage(p.pid, 1);
  await accessPage(p.pid, 0); // la 1 queda como la menos usada
  const resultado = await accessPage(p.pid, 2);
  assert.equal(resultado.victim.page, 1);
});

test("accessPage rechaza una página fuera de rango y un proceso inexistente", async () => {
  await arrancar();
  const p = await createProcess(proceso({ memoriaRequerida: 4 }));
  await assert.rejects(() => accessPage(p.pid, 4), /fuera de rango/);
  await assert.rejects(() => accessPage(9999, 0), /no tiene tabla/);
});

test("setPageAlgorithm rechaza un algoritmo inválido", async () => {
  await arrancar();
  await assert.rejects(() => setPageAlgorithm({ algorithm: "OPT" }), /inválido/);
});

test("cuando un proceso termina (runScheduler) se liberan sus marcos y su tabla", async () => {
  await arrancar();
  const p = await createProcess(proceso());
  await accessPage(p.pid, 0);
  await accessPage(p.pid, 1);
  assert.equal(getMemoryState().freeFrames, getMemoryState().totalFrames - 2);

  await runScheduler();

  const estado = getMemoryState();
  assert.equal(estado.processes.length, 0);
  assert.equal(estado.freeFrames, estado.totalFrames);
});

test("apagar y volver a arrancar el kernel deja la memoria vacía", async () => {
  await arrancar();
  const p = await createProcess(proceso());
  await accessPage(p.pid, 0);
  await shutdown("prueba");
  await boot();
  const estado = getMemoryState();
  assert.equal(estado.processes.length, 0);
  assert.equal(estado.accesses, 0);
  assert.equal(estado.freeFrames, estado.totalFrames);
});

test("los eventos de memoria llegan a onEvent con origen MEMORY", async () => {
  const eventos = await arrancar();
  const p = await createProcess(proceso());
  await accessPage(p.pid, 0);
  const memoria = eventos.filter((e) => e.origen === "MEMORY");
  assert.ok(memoria.some((e) => e.tipo === "memory:process_registered"));
  assert.ok(memoria.some((e) => e.tipo === "memory:page_fault"));
});
