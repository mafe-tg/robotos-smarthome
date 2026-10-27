// src/index.js
// Demo: crea procesos de ejemplo de la casa inteligente y los ejecuta
// con cada algoritmo. Se corre con:  npm run demo
//
// IMPORTANTE: los valores de prioridad, memoria, CPU y tiempo de abajo son
// EJEMPLOS inventados para la demo. No son requisitos del profesor.

import { Proceso, reiniciarContadorPid } from "./proceso.js";
import { simular, dibujarLinea } from "./cpu.js";
import { ALGORITMOS } from "./scheduler.js";

// Procesos tomados de la descripción de RobotOS SmartHome.
function crearProcesosDemo() {
  reiniciarContadorPid();
  return [
    new Proceso({ nombre: "Control de iluminación", prioridad: 3, memoriaRequerida: 64, cpuRequerida: 10, tiempoTotal: 3 }),
    new Proceso({ nombre: "Gestión de temperatura", prioridad: 2, memoriaRequerida: 96, cpuRequerida: 20, tiempoTotal: 4 }),
    new Proceso({ nombre: "Vigilancia", prioridad: 1, memoriaRequerida: 256, cpuRequerida: 45, tiempoTotal: 5 }),
    new Proceso({ nombre: "Automatización de rutinas", prioridad: 3, memoriaRequerida: 48, cpuRequerida: 15, tiempoTotal: 2 }),
    new Proceso({ nombre: "Monitoreo de consumo energético", prioridad: 4, memoriaRequerida: 32, cpuRequerida: 8, tiempoTotal: 3 }),
  ];
}

function mostrar(titulo, resultado) {
  console.log(`\n=== ${titulo} ===`);
  console.log(dibujarLinea(resultado.linea));
  console.table(resultado.metricas);
  console.log(`Duración total: ${resultado.duracionTotal} ticks`);
  console.log(`Uso de CPU promedio: ${resultado.usoCpuPromedio}%`);
  if (resultado.omitidos.length > 0) {
    console.log("Procesos omitidos (no estaban listos):", resultado.omitidos);
  }
}

// Demo 1: PRIORIDAD
mostrar("Planificación por PRIORIDAD", simular(crearProcesosDemo(), { algoritmo: ALGORITMOS.PRIORIDAD }));

// Demo 2: ROUND ROBIN con quantum 2
mostrar(
  "Planificación ROUND ROBIN (quantum = 2)",
  simular(crearProcesosDemo(), { algoritmo: ALGORITMOS.ROUND_ROBIN, quantum: 2 })
);

// Demo 3: un proceso pausado no entra al planificador
const conPausa = crearProcesosDemo();
conPausa[4].admitir();
conPausa[4].pausar(); // "Monitoreo de consumo energético" queda en WAITING
mostrar("PRIORIDAD con un proceso pausado", simular(conPausa, { algoritmo: ALGORITMOS.PRIORIDAD }));

// Demo 4: una transición inválida es rechazada
console.log("\n=== Transición inválida ===");
const prueba = crearProcesosDemo()[0];
try {
  prueba.ejecutar(); // está en NEW, no puede pasar directo a RUNNING
} catch (error) {
  console.log("Error esperado:", error.message);
}
