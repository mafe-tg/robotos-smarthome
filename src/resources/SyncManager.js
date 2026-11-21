/**
 * Sincronización e IPC para RobotOS.
 *
 * - MUTEX: un solo hilo a la vez es dueño. Los demás esperan en una cola FIFO.
 * - SEMÁFORO: contador de permisos. acquire() resta uno (o espera si no hay) y release() suma uno
 *   (o despierta al primero de la cola).
 * - CANAL IPC: cola de mensajes entre hilos. receive() sobre un canal vacío deja al hilo esperando
 *   hasta que otro hilo haga send().
 *
 * Cuando un hilo debe esperar, pasa a WAITING (ThreadManager.block) y vuelve a READY al despertarlo
 * (ThreadManager.unblock). El "dueño" de todo es el tid del hilo.
 *
 * DEADLOCK: se arma el grafo de asignación de recursos de los mutex en el formato del módulo de
 * María Fernanda (src/features/faults/deadlockModule.js) y se usan sus funciones
 * detectDeadlockInRAG() y resolveDeadlockByPriority() sin modificarlas. Los semáforos no entran en la
 * detección porque no tienen un dueño único.
 *
 * Cada operación se publica como evento: origen SYNC (mutex, semáforos, deadlock) o IPC (canales).
 */
import { detectDeadlockInRAG, resolveDeadlockByPriority } from "../features/faults/deadlockModule.js";

export const SYNC_TYPES = Object.freeze({ MUTEX: "MUTEX", SEMAPHORE: "SEMAPHORE" });

const DEFAULT_CHANNEL_CAPACITY = 10;
const PREFIJO_HILO = "hilo-";

const etiqueta = (owner) => `${PREFIJO_HILO}${owner}`;
const duenoDe = (label) => Number(String(label).slice(PREFIJO_HILO.length));

function validarNombre(name, que) {
  if (typeof name !== "string" || !name.trim()) throw new Error(`El nombre ${que} es obligatorio`);
  return name.trim();
}

export class SyncManager {
  constructor({ eventEngine = null, threadManager = null, channelCapacity = DEFAULT_CHANNEL_CAPACITY } = {}) {
    if (!Number.isInteger(channelCapacity) || channelCapacity < 1) {
      throw new Error("La capacidad del canal debe ser un entero mayor o igual a 1");
    }
    this.eventEngine = eventEngine;
    this.threadManager = threadManager;
    this.channelCapacity = channelCapacity;
    this.reset();
    // Si un hilo termina (normal o a la fuerza) se liberan sus mutex y se le saca de todas las colas.
    this.eventEngine?.on("thread:terminated", (event) => this.abort(event.payload.tid));
  }

  /** Borra todos los recursos, canales y colas (reinicio del kernel). */
  reset() {
    this.resources = new Map(); // nombre -> mutex o semáforo
    this.channels = new Map(); // nombre -> canal IPC
  }

  #emit(type, detail) {
    this.eventEngine?.emit(type, detail);
  }

  // ─── Utilidades sobre hilos ────────────────────────────────────────────────

  #hilo(owner) {
    return this.threadManager?.list().find((t) => t.tid === owner) ?? null;
  }

  /** El dueño debe ser un tid entero. Con ThreadManager, además debe existir y poder ejecutar (READY o RUNNING). */
  #exigirDueno(owner) {
    if (!Number.isInteger(owner) || owner < 1) throw new Error("El hilo (tid) debe ser un entero mayor o igual a 1");
    if (!this.threadManager) return;
    const hilo = this.#hilo(owner);
    if (!hilo) throw new Error(`Hilo ${owner} no encontrado`);
    if (hilo.state !== "READY" && hilo.state !== "RUNNING") {
      throw new Error(`El hilo ${owner} está en estado ${hilo.state} y no puede usar recursos de sincronización`);
    }
  }

  #bloquear(owner) {
    if (this.threadManager) this.threadManager.block(owner);
  }

  /** Despierta a un hilo que estaba esperando (solo si sigue en WAITING). */
  #despertar(owner) {
    const hilo = this.#hilo(owner);
    if (hilo && hilo.state === "WAITING") this.threadManager.unblock(owner);
  }

  // ─── Mutex y semáforos ─────────────────────────────────────────────────────

  /** Crea un recurso de sincronización: { type: "MUTEX" } o { type: "SEMAPHORE", count }. */
  create({ type, name, count } = {}) {
    const nombre = validarNombre(name, "del recurso");
    if (this.resources.has(nombre)) throw new Error(`El recurso ${nombre} ya existe`);
    if (type === SYNC_TYPES.MUTEX) {
      this.resources.set(nombre, { name: nombre, type, holder: null, waiters: [] });
      this.#emit("sync:mutex_created", { name: nombre });
      return { name: nombre, type };
    }
    if (type === SYNC_TYPES.SEMAPHORE) {
      if (!Number.isInteger(count) || count < 0) throw new Error("El contador del semáforo debe ser un entero mayor o igual a 0");
      this.resources.set(nombre, { name: nombre, type, count, initial: count, waiters: [] });
      this.#emit("sync:semaphore_created", { name: nombre, count });
      return { name: nombre, type, count };
    }
    throw new Error(`Tipo de recurso inválido: ${type}. Usa MUTEX o SEMAPHORE`);
  }

  #recurso(name) {
    const recurso = this.resources.get(name);
    if (!recurso) throw new Error(`El recurso ${name} no existe`);
    return recurso;
  }

  /**
   * Un hilo pide el recurso: lock del mutex o wait del semáforo.
   * Devuelve { acquired, waiting }. Si no se puede, el hilo pasa a WAITING y queda en la cola.
   */
  acquire(name, owner) {
    this.#exigirDueno(owner);
    const recurso = this.#recurso(name);
    const base = { name, owner };

    if (recurso.type === SYNC_TYPES.MUTEX) {
      if (recurso.holder === owner) throw new Error(`El hilo ${owner} ya tiene el mutex ${name}`);
      if (recurso.holder === null) {
        recurso.holder = owner;
        this.#emit("sync:mutex_locked", base);
        return { ...base, acquired: true, waiting: false };
      }
      this.#bloquear(owner);
      recurso.waiters.push(owner);
      this.#emit("sync:mutex_wait", { ...base, holder: recurso.holder });
      return { ...base, acquired: false, waiting: true };
    }

    if (recurso.count > 0) {
      recurso.count -= 1;
      this.#emit("sync:semaphore_acquired", { ...base, count: recurso.count });
      return { ...base, acquired: true, waiting: false };
    }
    this.#bloquear(owner);
    recurso.waiters.push(owner);
    this.#emit("sync:semaphore_wait", { ...base, count: recurso.count });
    return { ...base, acquired: false, waiting: true };
  }

  /** Libera el recurso: unlock del mutex (solo su dueño) o signal del semáforo. */
  release(name, owner) {
    this.#exigirDueno(owner);
    const recurso = this.#recurso(name);

    if (recurso.type === SYNC_TYPES.MUTEX) {
      if (recurso.holder !== owner) {
        throw new Error(`El hilo ${owner} no es el dueño del mutex ${name}`);
      }
      return this.#soltarMutex(recurso, owner);
    }

    const siguiente = recurso.waiters.shift();
    if (siguiente !== undefined) {
      // El permiso pasa directo al primero de la cola, sin subir el contador.
      this.#despertar(siguiente);
      this.#emit("sync:semaphore_handoff", { name, from: owner, to: siguiente });
      return { name, owner, released: true, wokeUp: siguiente, count: recurso.count };
    }
    recurso.count += 1;
    this.#emit("sync:semaphore_released", { name, owner, count: recurso.count });
    return { name, owner, released: true, wokeUp: null, count: recurso.count };
  }

  /** Suelta un mutex: se lo pasa al primero de la cola o queda libre. */
  #soltarMutex(mutex, owner) {
    const siguiente = mutex.waiters.shift();
    if (siguiente !== undefined) {
      mutex.holder = siguiente;
      this.#despertar(siguiente);
      this.#emit("sync:mutex_handoff", { name: mutex.name, from: owner, to: siguiente });
      return { name: mutex.name, owner, released: true, wokeUp: siguiente };
    }
    mutex.holder = null;
    this.#emit("sync:mutex_unlocked", { name: mutex.name, owner });
    return { name: mutex.name, owner, released: true, wokeUp: null };
  }

  /**
   * Saca a un hilo de todo: lo quita de las colas de espera y libera los mutex que tenía.
   * Se usa cuando el hilo termina y cuando se elige como víctima de un deadlock. No hace nada si el hilo no tiene nada.
   */
  abort(owner) {
    let liberados = 0;
    for (const recurso of this.resources.values()) {
      const posicion = recurso.waiters.indexOf(owner);
      if (posicion !== -1) recurso.waiters.splice(posicion, 1);
    }
    for (const canal of this.channels.values()) {
      const posicion = canal.receivers.indexOf(owner);
      if (posicion !== -1) canal.receivers.splice(posicion, 1);
      canal.inbox.delete(owner);
    }
    for (const recurso of this.resources.values()) {
      if (recurso.type === SYNC_TYPES.MUTEX && recurso.holder === owner) {
        this.#soltarMutex(recurso, owner);
        liberados += 1;
      }
    }
    if (liberados > 0) this.#emit("sync:aborted", { owner, mutexReleased: liberados });
    return liberados;
  }

  // ─── Canales IPC ───────────────────────────────────────────────────────────

  /** Los canales se crean la primera vez que alguien los usa. */
  #canal(name) {
    const nombre = validarNombre(name, "del canal");
    if (!this.channels.has(nombre)) {
      this.channels.set(nombre, {
        name: nombre,
        capacity: this.channelCapacity,
        queue: [], // { from, message } esperando a un receptor
        receivers: [], // hilos esperando un mensaje
        inbox: new Map(), // hilo -> mensajes que ya se le entregaron mientras dormía
      });
      this.#emit("ipc:channel_created", { channel: nombre, capacity: this.channelCapacity });
    }
    return this.channels.get(nombre);
  }

  /** Envía un mensaje. Si hay un receptor esperando se le entrega y se despierta; si no, queda en la cola. */
  send(channel, owner, message) {
    this.#exigirDueno(owner);
    if (message === undefined) throw new Error("El mensaje no puede ser undefined");
    const canal = this.#canal(channel);

    const receptor = canal.receivers.shift();
    if (receptor !== undefined) {
      if (!canal.inbox.has(receptor)) canal.inbox.set(receptor, []);
      canal.inbox.get(receptor).push({ from: owner, message });
      this.#despertar(receptor);
      this.#emit("ipc:message_delivered", { channel: canal.name, from: owner, to: receptor });
      return { channel: canal.name, delivered: true, queued: false, size: canal.queue.length };
    }
    if (canal.queue.length >= canal.capacity) throw new Error(`El canal ${canal.name} está lleno`);
    canal.queue.push({ from: owner, message });
    this.#emit("ipc:message_sent", { channel: canal.name, from: owner, size: canal.queue.length });
    return { channel: canal.name, delivered: false, queued: true, size: canal.queue.length };
  }

  /**
   * Recibe un mensaje. Primero mira lo que se le entregó mientras dormía, luego la cola del canal.
   * Si no hay nada, el hilo pasa a WAITING hasta que llegue un mensaje (y vuelve a llamar a receive).
   */
  receive(channel, owner) {
    this.#exigirDueno(owner);
    const canal = this.#canal(channel);

    const entregados = canal.inbox.get(owner);
    const item = entregados?.length ? entregados.shift() : canal.queue.shift();
    if (entregados && entregados.length === 0) canal.inbox.delete(owner);
    if (item) {
      this.#emit("ipc:message_received", { channel: canal.name, to: owner, from: item.from });
      return { channel: canal.name, received: true, waiting: false, message: item.message, from: item.from };
    }
    this.#bloquear(owner);
    canal.receivers.push(owner);
    this.#emit("ipc:receive_wait", { channel: canal.name, owner });
    return { channel: canal.name, received: false, waiting: true, message: null, from: null };
  }

  // ─── Deadlock ──────────────────────────────────────────────────────────────

  /** Grafo de asignación de recursos de los mutex, en el formato de deadlockModule.js. */
  #armarRAG() {
    const rag = { allocations: {}, requests: {} };
    for (const recurso of this.resources.values()) {
      if (recurso.type !== SYNC_TYPES.MUTEX) continue;
      if (recurso.holder !== null) rag.allocations[recurso.name] = etiqueta(recurso.holder);
      for (const espera of recurso.waiters) {
        const quien = etiqueta(espera);
        rag.requests[quien] = [...(rag.requests[quien] ?? []), recurso.name];
      }
    }
    return rag;
  }

  /** Busca un ciclo de espera entre hilos usando detectDeadlockInRAG de María Fernanda. */
  detectDeadlock({ silent = false } = {}) {
    const rag = this.#armarRAG();
    const resultado = detectDeadlockInRAG(rag);
    if (!silent) {
      this.#emit("sync:deadlock_check", {
        hasDeadlock: resultado.hasDeadlock,
        cycle: resultado.cycle,
      });
    }
    return { ...resultado, rag };
  }

  /**
   * Si hay deadlock, elige la víctima con resolveDeadlockByPriority (la de menor prioridad, o sea el
   * número más alto), le quita todo lo que tiene y la termina. Los mutex que soltaba pasan a quien los esperaba.
   */
  resolveDeadlock() {
    const deteccion = this.detectDeadlock();
    if (!deteccion.hasDeadlock) return { resolved: false, hasDeadlock: false };

    const procesos = deteccion.processesInCycle.map((nombre) => {
      const hilo = this.#hilo(duenoDe(nombre));
      return { name: nombre, prioridadNum: hilo?.priority };
    });
    const decision = resolveDeadlockByPriority(procesos, deteccion.processesInCycle, deteccion.rag);

    const tidVictima = duenoDe(decision.victim.name);
    this.abort(tidVictima);
    const hilo = this.#hilo(tidVictima);
    if (hilo && hilo.state !== "TERMINATED") this.threadManager.terminate(tidVictima);

    const sigue = this.detectDeadlock({ silent: true }).hasDeadlock;
    this.#emit("sync:deadlock_resolved", {
      victim: decision.victim.name,
      survivor: decision.survivor.name,
      freedResources: decision.freedResources,
      stillDeadlocked: sigue,
      explanation: decision.explanation,
    });
    return {
      resolved: true,
      hasDeadlock: true,
      cycle: deteccion.cycle,
      victim: decision.victim,
      survivor: decision.survivor,
      freedResources: decision.freedResources,
      stillDeadlocked: sigue,
      explanation: decision.explanation,
    };
  }

  // ─── Estado ────────────────────────────────────────────────────────────────

  /** Foto del estado de la sincronización, pensada para el dashboard y el Debugger. */
  getState() {
    const { hasDeadlock, cycle } = this.detectDeadlock({ silent: true });
    return {
      resources: [...this.resources.values()].map((r) =>
        r.type === SYNC_TYPES.MUTEX
          ? { name: r.name, type: r.type, holder: r.holder, waiters: [...r.waiters] }
          : { name: r.name, type: r.type, count: r.count, initial: r.initial, waiters: [...r.waiters] }
      ),
      channels: [...this.channels.values()].map((c) => ({
        name: c.name,
        capacity: c.capacity,
        queued: c.queue.length,
        messages: c.queue.map((m) => ({ from: m.from, message: m.message })),
        waitingReceivers: [...c.receivers],
      })),
      deadlock: { hasDeadlock, cycle },
    };
  }
}
