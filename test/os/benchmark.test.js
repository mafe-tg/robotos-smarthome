import test from "node:test";
import assert from "node:assert/strict";
import {
  runCPUBenchmark,
  runMemoryBenchmark,
  runRTOSBenchmark,
  runFullBenchmark,
  SECUENCIA_BELADY,
  SECUENCIA_LIBRO_PAGINAS,
} from "../../src/resources/BenchmarkCenter.js";

test("Benchmark CPU compara Prioridad y Round Robin con métricas válidas", () => {
  const reporte = runCPUBenchmark();
  assert.equal(reporte.tipo, "CPU_SCHEDULING");
  assert.equal(reporte.resultados.length, 3); // Prioridad, RR q=2, RR q=4

  for (const res of reporte.resultados) {
    assert.ok(res.duracionTotal > 0);
    assert.ok(typeof res.esperaPromedio === "number" && res.esperaPromedio >= 0);
    assert.ok(typeof res.retornoPromedio === "number" && res.retornoPromedio > 0);
    assert.ok(typeof res.cambiosContexto === "number" && res.cambiosContexto >= 0);
    assert.ok(res.linea.length === res.duracionTotal);
  }

  // RR con quantum 2 suele tener más cambios de contexto que Prioridad
  const prioridad = reporte.resultados.find((r) => r.algoritmo === "PRIORIDAD");
  const rr2 = reporte.resultados.find((r) => r.quantum === 2);
  assert.ok(rr2.cambiosContexto >= prioridad.cambiosContexto);
  assert.ok(reporte.resumen.ganadorEspera);
});

test("Benchmark de Memoria compara FIFO vs LRU para secuencia canónica", () => {
  const reporte = runMemoryBenchmark({ references: SECUENCIA_LIBRO_PAGINAS, frameCounts: [3] });
  assert.equal(reporte.tipo, "VIRTUAL_MEMORY_PAGING");
  const comp3 = reporte.comparativaPorMarcos[0];
  assert.equal(comp3.marcos, 3);
  // Secuencia de libro: con 3 marcos, FIFO=15, LRU=12
  assert.equal(comp3.fifo.pageFaults, 15);
  assert.equal(comp3.lru.pageFaults, 12);
  assert.equal(comp3.mejor, "LRU");
});

test("Benchmark de Memoria detecta y demuestra la Anomalía de Belády en FIFO", () => {
  const reporte = runMemoryBenchmark({ references: SECUENCIA_BELADY });
  const belady = reporte.analisisBelady;
  assert.equal(belady.demostrable, true);
  // En la secuencia de Belády [1,2,3,4,1,2,5,1,2,3,4,5]:
  // FIFO con 3 marcos da 9 fallos. Con 4 marcos da 10 fallos (¡aumentan los fallos!).
  assert.equal(belady.fifo3Marcos, 9);
  assert.equal(belady.fifo4Marcos, 10);
  assert.ok(belady.fifo4Marcos > belady.fifo3Marcos);

  // En cambio, LRU no sufre la anomalía: 3 marcos = 10, 4 marcos = 8 (disminuye)
  assert.equal(belady.lru3Marcos, 10);
  assert.equal(belady.lru4Marcos, 8);
  assert.ok(belady.lru4Marcos < belady.lru3Marcos);
});

test("Benchmark RTOS compara EDF y Rate Monotonic", () => {
  const reporte = runRTOSBenchmark();
  assert.equal(reporte.tipo, "REAL_TIME_SCHEDULING");
  assert.ok(reporte.utilizacion > 0.9); // alta utilización

  // EDF cumple todos los plazos en este caso
  assert.equal(reporte.edf.deadlinesPerdidos, 0);
  assert.equal(reporte.edf.tasaCumplimiento, 100);

  // Rate Monotonic pierde al menos un deadline al superar el límite
  assert.ok(reporte.rm.deadlinesPerdidos > 0);
  assert.equal(reporte.ganador, "EDF (Dinámico)");
});

test("runFullBenchmark genera reporte unificado de los 3 subsistemas", () => {
  const suite = runFullBenchmark();
  assert.ok(suite.fecha);
  assert.ok(suite.cpu && suite.cpu.resultados.length > 0);
  assert.ok(suite.memoria && suite.memoria.comparativaPorMarcos.length > 0);
  assert.ok(suite.rtos && suite.rtos.edf && suite.rtos.rm);
});
