// src/proceso.js
// Define qué es un "proceso" en RobotOS SmartHome, sus estados y
// qué cambios de estado están permitidos.
//
// Analogía: un proceso es una tarea de la casa inteligente
// (por ejemplo "Vigilancia"). Igual que una tarea del hogar, pasa por
// etapas: se anota, espera turno, se hace, a veces se pausa y al final termina.

// Los cinco estados mínimos que pide el profesor.
export const ESTADOS = Object.freeze({
  NEW: "NEW", // recién creado, todavía no entra al sistema
  READY: "READY", // listo, esperando su turno en la CPU
  RUNNING: "RUNNING", // usando la CPU en este momento
  WAITING: "WAITING", // pausado o esperando algo
  TERMINATED: "TERMINATED", // terminó, no puede volver a empezar
});

// Desde cada estado, a cuáles se puede pasar.
// OJO: el profesor da los estados y las operaciones, pero NO este mapa.
// Es una propuesta basada en el modelo clásico de sistemas operativos.
export const TRANSICIONES_PERMITIDAS = Object.freeze({
  NEW: ["READY", "TERMINATED"],
  READY: ["RUNNING", "WAITING", "TERMINATED"],
  RUNNING: ["READY", "WAITING", "TERMINATED"],
  WAITING: ["READY", "TERMINATED"],
  TERMINATED: [],
});

// Contador para asignar un número de identificación (pid) a cada proceso.
let contadorPid = 0;

// Sirve para que las pruebas y la demo siempre empiecen en pid 1.
export function reiniciarContadorPid() {
  contadorPid = 0;
}

// Comprueba que un valor sea un número válido; si no, lanza un error claro.
function validarNumero(valor, campo, { min, max, entero = false }) {
  if (typeof valor !== "number" || Number.isNaN(valor)) {
    throw new Error(`${campo} debe ser un número`);
  }
  if (entero && !Number.isInteger(valor)) {
    throw new Error(`${campo} debe ser un número entero`);
  }
  if (valor < min) {
    throw new Error(`${campo} debe ser mayor o igual a ${min}`);
  }
  if (max !== undefined && valor > max) {
    throw new Error(`${campo} debe ser menor o igual a ${max}`);
  }
}

export class Proceso {
  // Datos que pide el profesor al crear un proceso:
  // nombre, prioridad, memoria requerida y CPU requerida.
  // Se agrega tiempoTotal (cuántos "ticks" necesita para terminar),
  // necesario para simular la ejecución.
  constructor({ nombre, prioridad, memoriaRequerida, cpuRequerida, tiempoTotal }) {
    if (typeof nombre !== "string" || nombre.trim() === "") {
      throw new Error("El nombre es obligatorio");
    }
    validarNumero(prioridad, "La prioridad", { min: 1, entero: true });
    validarNumero(memoriaRequerida, "La memoria requerida", { min: 0 });
    validarNumero(cpuRequerida, "La CPU requerida", { min: 0, max: 100 });
    validarNumero(tiempoTotal, "El tiempo total", { min: 1, entero: true });

    contadorPid += 1;
    this.pid = contadorPid;
    this.nombre = nombre.trim();
    this.prioridad = prioridad; // 1 = más urgente
    this.memoriaRequerida = memoriaRequerida; // en MB (valor de ejemplo)
    this.cpuRequerida = cpuRequerida; // porcentaje de CPU mientras se ejecuta
    this.tiempoTotal = tiempoTotal;
    this.tiempoRestante = tiempoTotal;
    this.estado = ESTADOS.NEW;
    this.creadoEn = new Date();
  }

  // Único lugar donde cambia el estado. Si el cambio no está permitido, falla.
  cambiarEstado(nuevoEstado) {
    const permitidos = TRANSICIONES_PERMITIDAS[this.estado];
    if (!permitidos.includes(nuevoEstado)) {
      throw new Error(
        `Transición no permitida: ${this.estado} -> ${nuevoEstado} (proceso ${this.pid} "${this.nombre}")`
      );
    }
    this.estado = nuevoEstado;
  }

  // Operaciones con nombres entendibles (las que pide el profesor).
  admitir() {
    this.cambiarEstado(ESTADOS.READY); // NEW -> READY
  }
  ejecutar() {
    this.cambiarEstado(ESTADOS.RUNNING); // READY -> RUNNING
  }
  expropiar() {
    this.cambiarEstado(ESTADOS.READY); // RUNNING -> READY (se acabó su turno)
  }
  pausar() {
    this.cambiarEstado(ESTADOS.WAITING); // READY/RUNNING -> WAITING
  }
  reanudar() {
    this.cambiarEstado(ESTADOS.READY); // WAITING -> READY
  }
  finalizar() {
    this.cambiarEstado(ESTADOS.TERMINATED); // cualquiera -> TERMINATED
  }
}
