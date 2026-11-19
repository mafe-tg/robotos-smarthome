/**
 * Memoria virtual con paginación para RobotOS.
 *
 * - La RAM se divide en MARCOS (frames) de tamaño fijo, compartidos por todos los procesos.
 * - Cada proceso tiene una TABLA DE PÁGINAS: página -> marco (o "no presente").
 * - Si se accede a una página que no está en RAM ocurre un PAGE FAULT. Si no hay marco libre,
 *   se reemplaza una página víctima según el algoritmo: FIFO (la más antigua en RAM)
 *   o LRU (la que lleva más tiempo sin usarse).
 *
 * Cada acceso, page fault y reemplazo se publica como evento (origen MEMORY) para que quede registrado.
 */

export const PAGE_ALGORITHMS = Object.freeze({ FIFO: "FIFO", LRU: "LRU" });

const DEFAULT_FRAMES = 8;
const DEFAULT_PAGE_SIZE_MB = 1;

function validarAlgoritmo(algorithm) {
  if (!Object.values(PAGE_ALGORITHMS).includes(algorithm)) {
    throw new Error(`Algoritmo de reemplazo inválido: ${algorithm}. Usa FIFO o LRU`);
  }
  return algorithm;
}

function validarMarcos(frames) {
  if (!Number.isInteger(frames) || frames < 1) {
    throw new Error("La cantidad de marcos debe ser un entero mayor o igual a 1");
  }
  return frames;
}

export class MemoryManager {
  constructor({
    eventEngine = null,
    frames = DEFAULT_FRAMES,
    algorithm = PAGE_ALGORITHMS.FIFO,
    pageSizeMb = DEFAULT_PAGE_SIZE_MB,
  } = {}) {
    if (!(pageSizeMb > 0)) throw new Error("El tamaño de página debe ser mayor a 0");
    this.eventEngine = eventEngine;
    this.algorithm = validarAlgoritmo(algorithm);
    this.totalFrames = validarMarcos(frames);
    this.pageSizeMb = pageSizeMb;
    this.reset();
  }

  /** Vacía toda la memoria: marcos, tablas de páginas y contadores. */
  reset() {
    this.frames = Array.from({ length: this.totalFrames }, () => null);
    this.tables = new Map();
    this.clock = 0; // reloj lógico: cada acceso y cada carga lo avanzan
    this.stats = { accesses: 0, pageFaults: 0, hits: 0, replacements: 0 };
  }

  #emit(type, detail) {
    this.eventEngine?.emit(type, detail);
  }

  /** Cambia el algoritmo y/o la cantidad de marcos. Cambiar los marcos vacía la RAM (las tablas se conservan). */
  configure({ algorithm, frames } = {}) {
    if (algorithm !== undefined) this.algorithm = validarAlgoritmo(algorithm);
    if (frames !== undefined && frames !== this.totalFrames) {
      this.totalFrames = validarMarcos(frames);
      this.frames = Array.from({ length: this.totalFrames }, () => null);
      for (const tabla of this.tables.values()) {
        for (const entrada of tabla.entries.values()) {
          entrada.present = false;
          entrada.frame = null;
        }
      }
    }
    const actual = this.getConfiguration();
    this.#emit("memory:configured", actual);
    return actual;
  }

  getConfiguration() {
    return { algorithm: this.algorithm, frames: this.totalFrames, pageSizeMb: this.pageSizeMb };
  }

  /** Crea la tabla de páginas de un proceso. Su tamaño en páginas sale de su memoria en MB. */
  registerProcess(pid, memoryMb) {
    if (!Number.isInteger(pid)) throw new Error("El pid debe ser un número entero");
    if (this.tables.has(pid)) throw new Error(`El proceso ${pid} ya tiene tabla de páginas`);
    if (!Number.isFinite(memoryMb) || memoryMb <= 0) {
      throw new Error("La memoria del proceso debe ser un número mayor a 0 (MB)");
    }
    const pages = Math.ceil(memoryMb / this.pageSizeMb);
    const entries = new Map();
    for (let page = 0; page < pages; page += 1) entries.set(page, { frame: null, present: false });
    this.tables.set(pid, { pages, entries, accesses: 0, pageFaults: 0 });
    this.#emit("memory:process_registered", { pid, memoryMb, pages });
    return { pid, pages };
  }

  hasProcess(pid) {
    return this.tables.has(pid);
  }

  /** Libera los marcos de un proceso y borra su tabla (cuando el proceso termina). */
  releaseProcess(pid) {
    const tabla = this.tables.get(pid);
    if (!tabla) return 0;
    let liberados = 0;
    this.frames.forEach((marco, indice) => {
      if (marco && marco.pid === pid) {
        this.frames[indice] = null;
        liberados += 1;
      }
    });
    this.tables.delete(pid);
    this.#emit("memory:released", { pid, framesFreed: liberados });
    return liberados;
  }

  /** Elige el marco víctima: el cargado hace más tiempo (FIFO) o el menos usado recientemente (LRU). */
  #elegirVictima() {
    const campo = this.algorithm === PAGE_ALGORITHMS.LRU ? "lastUsed" : "loadedAt";
    let elegido = 0;
    for (let i = 1; i < this.frames.length; i += 1) {
      if (this.frames[i][campo] < this.frames[elegido][campo]) elegido = i;
    }
    return elegido;
  }

  /** Accede a una página de un proceso. Devuelve si hubo page fault y qué marco/víctima intervino. */
  access(pid, page) {
    const tabla = this.tables.get(pid);
    if (!tabla) throw new Error(`El proceso ${pid} no tiene tabla de páginas`);
    if (!Number.isInteger(page) || page < 0 || page >= tabla.pages) {
      throw new Error(`Página ${page} fuera de rango para el proceso ${pid} (0 a ${tabla.pages - 1})`);
    }

    this.clock += 1;
    this.stats.accesses += 1;
    tabla.accesses += 1;
    const entrada = tabla.entries.get(page);

    // Acierto: la página ya está en RAM. Solo se actualiza su último uso (para LRU).
    if (entrada.present) {
      this.frames[entrada.frame].lastUsed = this.clock;
      this.stats.hits += 1;
      const resultado = { pid, page, fault: false, frame: entrada.frame, victim: null };
      this.#emit("memory:access", { ...resultado, algorithm: this.algorithm });
      return resultado;
    }

    // Page fault: la página no está en RAM.
    this.stats.pageFaults += 1;
    tabla.pageFaults += 1;
    let marco = this.frames.findIndex((m) => m === null);
    let victima = null;

    if (marco === -1) {
      marco = this.#elegirVictima();
      const sale = this.frames[marco];
      this.tables.get(sale.pid).entries.set(sale.page, { frame: null, present: false });
      victima = { pid: sale.pid, page: sale.page, frame: marco };
      this.stats.replacements += 1;
    }

    this.frames[marco] = { pid, page, loadedAt: this.clock, lastUsed: this.clock };
    entrada.frame = marco;
    entrada.present = true;

    const resultado = { pid, page, fault: true, frame: marco, victim: victima };
    this.#emit("memory:page_fault", { pid, page, frame: marco, algorithm: this.algorithm });
    if (victima) this.#emit("memory:page_replaced", { ...victima, por: { pid, page }, algorithm: this.algorithm });
    this.#emit("memory:access", { ...resultado, algorithm: this.algorithm });
    return resultado;
  }

  /** Foto del estado de la memoria, pensada para el dashboard y el Debugger. */
  getState() {
    const { accesses, pageFaults, hits, replacements } = this.stats;
    return {
      algorithm: this.algorithm,
      totalFrames: this.totalFrames,
      freeFrames: this.frames.filter((m) => m === null).length,
      frames: this.frames.map((m, frame) => (m ? { frame, pid: m.pid, page: m.page } : { frame, pid: null, page: null })),
      accesses,
      pageFaults,
      hits,
      replacements,
      faultRate: accesses === 0 ? 0 : pageFaults / accesses,
      processes: [...this.tables.entries()].map(([pid, tabla]) => ({
        pid,
        pages: tabla.pages,
        resident: [...tabla.entries.values()].filter((e) => e.present).length,
        accesses: tabla.accesses,
        pageFaults: tabla.pageFaults,
        table: [...tabla.entries.entries()].map(([page, e]) => ({ page, frame: e.frame, present: e.present })),
      })),
    };
  }
}

/**
 * Simula una secuencia de referencias a páginas y cuenta los page faults.
 * Es una función pura (no usa procesos ni eventos): sirve para el Benchmark, que compara
 * FIFO y LRU con la MISMA secuencia y la misma cantidad de marcos.
 */
export function simulatePageReplacement(references, frames, algorithm) {
  validarAlgoritmo(algorithm);
  validarMarcos(frames);
  if (!Array.isArray(references) || references.some((p) => !Number.isInteger(p) || p < 0)) {
    throw new Error("Las referencias deben ser un arreglo de números enteros >= 0");
  }

  const ram = []; // { page, loadedAt, lastUsed }
  const pasos = [];
  let pageFaults = 0;

  references.forEach((page, indice) => {
    const tiempo = indice + 1;
    const existente = ram.find((m) => m.page === page);
    let fault = false;
    let victima = null;

    if (existente) {
      existente.lastUsed = tiempo;
    } else {
      fault = true;
      pageFaults += 1;
      if (ram.length >= frames) {
        const campo = algorithm === PAGE_ALGORITHMS.LRU ? "lastUsed" : "loadedAt";
        let posicion = 0;
        for (let i = 1; i < ram.length; i += 1) if (ram[i][campo] < ram[posicion][campo]) posicion = i;
        victima = ram[posicion].page;
        ram.splice(posicion, 1);
      }
      ram.push({ page, loadedAt: tiempo, lastUsed: tiempo });
    }
    pasos.push({ page, fault, victim: victima, frames: ram.map((m) => m.page) });
  });

  return {
    algorithm,
    frames,
    accesses: references.length,
    pageFaults,
    hits: references.length - pageFaults,
    faultRate: references.length === 0 ? 0 : pageFaults / references.length,
    steps: pasos,
  };
}
