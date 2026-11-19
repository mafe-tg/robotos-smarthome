/**
 * Benchmark Center de RobotOS (Fase 6).
 *
 * Módulo para comparar cuantitativamente algoritmos de:
 * 1. Planificación de CPU: Prioridad vs Round Robin (con quantum 2 y 4).
 *    Métricas: tiempo de espera promedio, tiempo de retorno promedio,
 *    tiempo de respuesta promedio, cambios de contexto y uso de CPU.
 * 2. Memoria Virtual (Paginación): FIFO vs LRU.
 *    Métricas: fallos de página (page faults), aciertos (hits), tasa de fallos
 *    y detección demostrada de la Anomalía de Belády.
 * 3. Tiempo Real (RTOS): EDF vs Rate Monotonic (RM).
 *    Métricas: deadlines cumplidos, deadlines perdidos, tasa de cumplimiento,
 *    utilización y tiempo de respuesta promedio.
 */

import { Proceso } from "../../procesos-cpu/src/proceso.js";
import { ALGORITMOS } from "../../procesos-cpu/src/scheduler.js";
import { simular } from "../../procesos-cpu/src/cpu.js";
import { PAGE_ALGORITHMS, simulatePageReplacement } from "./MemoryManager.js";
import { RT_ALGORITHMS, simulateRealTime } from "./RealTimeScheduler.js";

/** Procesos demo representativos de un robot domótico */
export const PROCESOS_DEMO_BENCHMARK = [
  { nombre: "Robot-Vision", prioridad: 1, cpuRequerida: 35, tiempoTotal: 6, memoriaRequerida: 4 },
  { nombre: "Sensor-Nav", prioridad: 2, cpuRequerida: 20, tiempoTotal: 4, memoriaRequerida: 2 },
  { nombre: "Audio-DSP", prioridad: 1, cpuRequerida: 25, tiempoTotal: 5, memoriaRequerida: 3 },
  { nombre: "Home-Backup", prioridad: 3, cpuRequerida: 15, tiempoTotal: 8, memoriaRequerida: 2 },
];

/** Secuencia de páginas canónica del libro (Silberschatz / Tanenbaum) */
export const SECUENCIA_LIBRO_PAGINAS = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1];

/** Secuencia clásica que demuestra la Anomalía de Belády en FIFO */
export const SECUENCIA_BELADY = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];

/** Tareas periódicas demo para RTOS (utilización alta ~0.97) */
export const TAREAS_DEMO_RTOS = [
  { name: "Controlador-Motor", period: 5, computation: 2, deadline: 5 },
  { name: "Lidar-Scan", period: 7, computation: 4, deadline: 7 },
];

/**
 * Clona una lista de definiciones de procesos para que cada simulación
 * comience con instancias limpias en estado NEW.
 */
function instanciarProcesos(defs) {
  return defs.map(
    (d) =>
      new Proceso({
        nombre: d.nombre,
        prioridad: d.prioridad,
        cpuRequerida: d.cpuRequerida,
        tiempoTotal: d.tiempoTotal,
        memoriaRequerida: d.memoriaRequerida ?? 2,
      })
  );
}

/**
 * Calcula cambios de contexto y tiempo de respuesta a partir de la línea de tiempo.
 */
function calcularMetricasAvanzadas(linea, metricasBasicas) {
  let cambiosContexto = 0;
  let ultimoPid = null;
  const primerTickPorPid = new Map();

  for (const turno of linea) {
    if (ultimoPid !== null && ultimoPid !== turno.pid) {
      cambiosContexto += 1;
    }
    if (!primerTickPorPid.has(turno.pid)) {
      primerTickPorPid.set(turno.pid, turno.tick);
    }
    ultimoPid = turno.pid;
  }

  const tiemposRespuesta = metricasBasicas.map((m) => {
    const primerTick = primerTickPorPid.get(m.pid) ?? 0;
    return {
      pid: m.pid,
      nombre: m.nombre,
      tiempoRespuesta: primerTick, // Desde tick 0 hasta que corre por primera vez
    };
  });

  const sumaRespuesta = tiemposRespuesta.reduce((acc, r) => acc + r.tiempoRespuesta, 0);
  const tiempoRespuestaPromedio =
    tiemposRespuesta.length > 0 ? Math.round((sumaRespuesta / tiemposRespuesta.length) * 100) / 100 : 0;

  return {
    cambiosContexto,
    tiempoRespuestaPromedio,
    tiemposRespuesta,
  };
}

/**
 * 1. BENCHMARK DE PLANIFICADORES DE CPU
 * Compara Prioridad vs Round Robin con diferentes quantums.
 */
export function runCPUBenchmark(procesosDefs = PROCESOS_DEMO_BENCHMARK, { quantums = [2, 4] } = {}) {
  const configuraciones = [
    { algoritmo: ALGORITMOS.PRIORIDAD, quantum: null, etiqueta: "Prioridad (Apropiativo)" },
    ...quantums.map((q) => ({
      algoritmo: ALGORITMOS.ROUND_ROBIN,
      quantum: q,
      etiqueta: `Round Robin (q = ${q})`,
    })),
  ];

  const resultados = configuraciones.map((cfg) => {
    const procesos = instanciarProcesos(procesosDefs);
    const sim = simular(procesos, { algoritmo: cfg.algoritmo, quantum: cfg.quantum });

    const totalRetorno = sim.metricas.reduce((s, m) => s + m.retorno, 0);
    const totalEspera = sim.metricas.reduce((s, m) => s + m.espera, 0);
    const n = sim.metricas.length || 1;

    const esperaPromedio = Math.round((totalEspera / n) * 100) / 100;
    const retornoPromedio = Math.round((totalRetorno / n) * 100) / 100;

    const avanzadas = calcularMetricasAvanzadas(sim.linea, sim.metricas);

    return {
      algoritmo: cfg.algoritmo,
      quantum: cfg.quantum,
      etiqueta: cfg.etiqueta,
      duracionTotal: sim.duracionTotal,
      esperaPromedio,
      retornoPromedio,
      tiempoRespuestaPromedio: avanzadas.tiempoRespuestaPromedio,
      cambiosContexto: avanzadas.cambiosContexto,
      usoCpuPromedio: sim.usoCpuPromedio,
      metricasPorProceso: sim.metricas,
      linea: sim.linea,
    };
  });

  // Determinar ganadores
  const menorEspera = [...resultados].sort((a, b) => a.esperaPromedio - b.esperaPromedio)[0];
  const menorRetorno = [...resultados].sort((a, b) => a.retornoPromedio - b.retornoPromedio)[0];
  const menorRespuesta = [...resultados].sort((a, b) => a.tiempoRespuestaPromedio - b.tiempoRespuestaPromedio)[0];
  const menosCambios = [...resultados].sort((a, b) => a.cambiosContexto - b.cambiosContexto)[0];

  return {
    tipo: "CPU_SCHEDULING",
    totalProcesos: procesosDefs.length,
    resultados,
    resumen: {
      ganadorEspera: menorEspera.etiqueta,
      ganadorRetorno: menorRetorno.etiqueta,
      ganadorRespuesta: menorRespuesta.etiqueta,
      ganadorEficienciaContexto: menosCambios.etiqueta,
      conclusion:
        "Prioridad favorece la culminación rápida de tareas críticas pero puede retrasar tareas de fondo. Round Robin garantiza equidad y reduce el tiempo de primera respuesta, aunque introduce mayor sobrecarga por cambios de contexto con quantums pequeños.",
    },
  };
}

/**
 * 2. BENCHMARK DE MEMORIA VIRTUAL Y REEMPLAZO DE PÁGINAS
 * Compara FIFO vs LRU para una secuencia dada y analiza la Anomalía de Belády.
 */
export function runMemoryBenchmark({
  references = SECUENCIA_LIBRO_PAGINAS,
  frameCounts = [3, 4],
} = {}) {
  const resultados = [];

  for (const marcos of frameCounts) {
    const resFIFO = simulatePageReplacement(references, marcos, PAGE_ALGORITHMS.FIFO);
    const resLRU = simulatePageReplacement(references, marcos, PAGE_ALGORITHMS.LRU);

    resultados.push({
      marcos,
      fifo: {
        pageFaults: resFIFO.pageFaults,
        hits: resFIFO.hits,
        faultRate: Math.round(resFIFO.faultRate * 10000) / 100, // porcentaje
      },
      lru: {
        pageFaults: resLRU.pageFaults,
        hits: resLRU.hits,
        faultRate: Math.round(resLRU.faultRate * 10000) / 100, // porcentaje
      },
      diferencia: resFIFO.pageFaults - resLRU.pageFaults, // positivo si LRU tuvo menos fallos
      mejor:
        resLRU.pageFaults < resFIFO.pageFaults
          ? "LRU"
          : resLRU.pageFaults > resFIFO.pageFaults
          ? "FIFO"
          : "EMPATE",
    });
  }

  // Prueba específica de la Anomalía de Belády con la secuencia dedicada
  const beladyFIFO3 = simulatePageReplacement(SECUENCIA_BELADY, 3, PAGE_ALGORITHMS.FIFO);
  const beladyFIFO4 = simulatePageReplacement(SECUENCIA_BELADY, 4, PAGE_ALGORITHMS.FIFO);
  const beladyLRU3 = simulatePageReplacement(SECUENCIA_BELADY, 3, PAGE_ALGORITHMS.LRU);
  const beladyLRU4 = simulatePageReplacement(SECUENCIA_BELADY, 4, PAGE_ALGORITHMS.LRU);

  const beladyDetectada = beladyFIFO4.pageFaults > beladyFIFO3.pageFaults;

  return {
    tipo: "VIRTUAL_MEMORY_PAGING",
    longitudSecuencia: references.length,
    referencias: [...references],
    comparativaPorMarcos: resultados,
    analisisBelady: {
      demostrable: beladyDetectada,
      secuencia: SECUENCIA_BELADY,
      fifo3Marcos: beladyFIFO3.pageFaults,
      fifo4Marcos: beladyFIFO4.pageFaults,
      lru3Marcos: beladyLRU3.pageFaults,
      lru4Marcos: beladyLRU4.pageFaults,
      explicacion:
        "La Anomalía de Belády ocurre en algoritmos FIFO: asignar más memoria (4 marcos en lugar de 3) paradójicamente INCREMENTA los fallos de página (de 9 a 10). LRU, al ser un algoritmo de pila (stack algorithm), es matemáticamente inmune a esta anomalía y reduce los fallos (de 10 a 8).",
    },
  };
}

/**
 * 3. BENCHMARK DE TIEMPO REAL (RTOS)
 * Compara EDF (Earliest Deadline First) vs Rate Monotonic (RM).
 */
export function runRTOSBenchmark({ tasks = TAREAS_DEMO_RTOS, horizon } = {}) {
  const edf = simulateRealTime(tasks, RT_ALGORITHMS.EDF, horizon);
  const rm = simulateRealTime(tasks, RT_ALGORITHMS.RM, horizon);

  return {
    tipo: "REAL_TIME_SCHEDULING",
    horizon: edf.horizon,
    utilizacion: Math.round(edf.utilization * 100) / 100,
    limiteRM: Math.round(edf.rmBound * 100) / 100,
    edf: {
      algoritmo: "EDF",
      deadlinesCumplidos: edf.deadlinesMet,
      deadlinesPerdidos: edf.missed,
      tasaCumplimiento: edf.released ? Math.round((edf.deadlinesMet / edf.released) * 10000) / 100 : 100,
      tiempoRespuestaPromedio: Math.round(edf.avgResponse * 100) / 100,
      cambiosContexto: edf.contextSwitches,
      planificable: edf.schedulable,
    },
    rm: {
      algoritmo: "Rate Monotonic (RM)",
      deadlinesCumplidos: rm.deadlinesMet,
      deadlinesPerdidos: rm.missed,
      tasaCumplimiento: rm.released ? Math.round((rm.deadlinesMet / rm.released) * 10000) / 100 : 100,
      tiempoRespuestaPromedio: Math.round(rm.avgResponse * 100) / 100,
      cambiosContexto: rm.contextSwitches,
      planificable: rm.schedulable,
    },
    ganador:
      edf.missed < rm.missed
        ? "EDF (Dinámico)"
        : rm.missed < edf.missed
        ? "Rate Monotonic (Estático)"
        : "EMPATE",
    conclusion:
      "EDF asigna prioridades dinámicamente según la cercanía del plazo, logrando alcanzar hasta un 100% de utilización de CPU teórica. Rate Monotonic asigna prioridades estáticas según el período más corto, perdiendo plazos si la utilización supera el límite de Liu & Layland.",
  };
}

/**
 * 4. BENCHMARK COMPLETO (SUITE TOTAL)
 * Ejecuta los 3 módulos en una sola llamada para el reporte consolidado.
 */
export function runFullBenchmark(options = {}) {
  const cpu = runCPUBenchmark(options.procesos);
  const memoria = runMemoryBenchmark(options.memoria);
  const rtos = runRTOSBenchmark(options.rtos);

  return {
    fecha: new Date().toISOString(),
    cpu,
    memoria,
    rtos,
  };
}
