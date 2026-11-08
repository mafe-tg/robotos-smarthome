export const LEVELS = { DEBUG: 10, INFO: 20, WARNING: 30, ERROR: 40, CRITICAL: 50 };

export class MemoryManager {
  constructor(totalKb = 1024) {
    this.total = totalKb;
    this.blocks = [];
  }

  allocate(owner, sizeKb) {
    if (sizeKb <= 0) throw new Error("El tamaño debe ser positivo");
    let cursor = 0;
    const sorted = [...this.blocks].sort((a, b) => a.start - b.start);
    for (const b of sorted) {
      if (b.start - cursor >= sizeKb) return this.#insert(cursor, sizeKb, owner);
      cursor = b.start + b.size;
    }
    if (this.total - cursor >= sizeKb) return this.#insert(cursor, sizeKb, owner);
    return null;
  }

  #insert(start, size, owner) {
    const block = { start, size, owner };
    this.blocks.push(block);
    this.blocks.sort((a, b) => a.start - b.start);
    return block;
  }

  free(owner) {
    const freed = this.blocks
      .filter((b) => b.owner === owner)
      .reduce((sum, b) => sum + b.size, 0);
    this.blocks = this.blocks.filter((b) => b.owner !== owner);
    return freed;
  }

  compact() {
    let cursor = 0;
    for (const b of this.blocks) {
      b.start = cursor;
      cursor += b.size;
    }
  }

  stats() {
    const used = this.blocks.reduce((sum, b) => sum + b.size, 0);
    return {
      totalKb: this.total,
      usedKb: used,
      freeKb: this.total - used,
      usagePct: Math.round((used / this.total) * 1000) / 10,
      blocks: this.blocks.length,
    };
  }
}

export class VirtualFileSystem {
  constructor(capacityBytes = 10_000_000) {
    this.capacity = capacityBytes;
    this.files = new Map();
  }

  static norm(path) {
    return "/" + path.replace(/^\/+|\/+$/g, "");
  }

  used() {
    let total = 0;
    for (const f of this.files.values()) total += f.size;
    return total;
  }

  freeSpace() {
    return this.capacity - this.used();
  }

  write(path, content = "", { size = null, append = false } = {}) {
    path = VirtualFileSystem.norm(path);
    const old = this.files.get(path);
    if (append && old) {
      content = old.content + content;
      size = size === null ? null : old.size + size;
    }
    const newSize = size !== null ? size : new TextEncoder().encode(content).length;
    if (this.freeSpace() + (old ? old.size : 0) < newSize) return false;
    const now = Date.now();
    if (old) {
      old.content = content;
      old.size = newSize;
      old.modified = now;
    } else {
      this.files.set(path, { content, size: newSize, created: now, modified: now });
    }
    return true;
  }

  read(path) {
    const f = this.files.get(VirtualFileSystem.norm(path));
    if (!f) throw new Error(`Archivo no encontrado: ${VirtualFileSystem.norm(path)}`);
    return f.content;
  }

  delete(path) {
    return this.files.delete(VirtualFileSystem.norm(path));
  }

  rename(oldPath, newPath) {
    const o = VirtualFileSystem.norm(oldPath);
    const n = VirtualFileSystem.norm(newPath);
    this.files.set(n, this.files.get(o));
    this.files.delete(o);
  }

  exists(path) {
    return this.files.has(VirtualFileSystem.norm(path));
  }

  listdir(prefix = "/") {
    const p = VirtualFileSystem.norm(prefix).replace(/\/$/, "") + "/";
    return [...this.files.keys()].filter((k) => k.startsWith(p)).sort();
  }
}

export class LogManager {
  constructor(fs, { path = "/logs/system.log", maxBytes = 2000, keep = 3 } = {}) {
    this.fs = fs;
    this.path = path;
    this.maxBytes = maxBytes;
    this.keep = keep;
  }

  log(level, source, message) {
    level = level.toUpperCase();
    if (!(level in LEVELS)) throw new Error(`Nivel inválido: ${level}`);
    const line = `[${new Date().toISOString()}] [${level}] [${source}] ${message}\n`;
    if (this.fs.exists(this.path)) {
      const current = this.fs.files.get(VirtualFileSystem.norm(this.path));
      if (current.size + line.length > this.maxBytes) this.#rotate();
    }
    this.fs.write(this.path, line, { append: true });
  }

  #rotate() {
    this.fs.delete(`${this.path}.${this.keep}`);
    for (let i = this.keep - 1; i >= 1; i--) {
      if (this.fs.exists(`${this.path}.${i}`)) {
        this.fs.rename(`${this.path}.${i}`, `${this.path}.${i + 1}`);
      }
    }
    this.fs.rename(this.path, `${this.path}.1`);
  }

  query(minLevel = "DEBUG", source = null) {
    if (!this.fs.exists(this.path)) return [];
    const min = LEVELS[minLevel.toUpperCase()];
    return this.fs
      .read(this.path)
      .split("\n")
      .filter(Boolean)
      .filter((line) => {
        const m = line.match(/^\[(.+?)\] \[(.+?)\] \[(.+?)\]/);
        return m && LEVELS[m[2]] >= min && (source === null || m[3] === source);
      });
  }
}

export class SurveillanceStorage {
  constructor(fs, logs) {
    this.fs = fs;
    this.logs = logs;
    this.clips = new Map();
    this.seq = 0;
  }

  saveClip(cameraId, sizeMb, protectedClip = false) {
    const size = Math.round(sizeMb * 1_000_000);
    const seq = ++this.seq;
    const path = `/surveillance/${cameraId}/${Date.now()}-${seq}.clip`;
    while (!this.fs.write(path, `clip:${cameraId}:${seq}`, { size })) {
      if (!this.#evictOldest()) {
        this.logs.log("ERROR", "surveillance", `Sin espacio para clip de ${cameraId} (${sizeMb} MB)`);
        return null;
      }
    }
    this.clips.set(path, { camera: cameraId, seq, protected: protectedClip });
    this.logs.log("INFO", "surveillance", `Clip guardado ${path} (${sizeMb} MB, protegido=${protectedClip})`);
    return path;
  }

  #evictOldest() {
    const candidates = [...this.clips.entries()]
      .filter(([, c]) => !c.protected)
      .sort((a, b) => a[1].seq - b[1].seq);
    if (candidates.length === 0) return false;
    const [path] = candidates[0];
    this.fs.delete(path);
    this.clips.delete(path);
    this.logs.log("WARNING", "surveillance", `Clip antiguo eliminado: ${path}`);
    return true;
  }

  protect(path) {
    const clip = this.clips.get(path);
    if (clip) clip.protected = true;
  }
}

export class EnergyMonitor {
  constructor(logs, { thresholdKwh = 5.0, priceKwh = 700.0 } = {}) {
    this.logs = logs;
    this.threshold = thresholdKwh;
    this.price = priceKwh;
    this.watts = new Map();
    this.wh = new Map();
  }

  register(device, watts) {
    this.watts.set(device, watts);
    if (!this.wh.has(device)) this.wh.set(device, 0);
  }

  recordUsage(device, seconds) {
    if (!this.watts.has(device)) throw new Error(`Dispositivo no registrado: ${device}`);
    this.wh.set(device, this.wh.get(device) + (this.watts.get(device) * seconds) / 3600);
    if (this.totalKwh() > this.threshold) {
      this.logs.log(
        "WARNING",
        "energy",
        `Consumo total ${this.totalKwh().toFixed(2)} kWh supera el umbral de ${this.threshold} kWh`
      );
    }
  }

  totalKwh() {
    let total = 0;
    for (const v of this.wh.values()) total += v;
    return total / 1000;
  }

  report() {
    const porDispositivoKwh = {};
    for (const [d, v] of this.wh) porDispositivoKwh[d] = Math.round((v / 1000) * 10000) / 10000;
    return {
      porDispositivoKwh,
      totalKwh: Math.round(this.totalKwh() * 10000) / 10000,
      costoEstimado: Math.round(this.totalKwh() * this.price * 100) / 100,
    };
  }
}

export class StorageModule {
  constructor({ ramKb = 1024, diskBytes = 10_000_000 } = {}) {
    this.memory = new MemoryManager(ramKb);
    this.fs = new VirtualFileSystem(diskBytes);
    this.logs = new LogManager(this.fs);
    this.surveillance = new SurveillanceStorage(this.fs, this.logs);
    this.energy = new EnergyMonitor(this.logs);
    this.logs.log("INFO", "storage", "Módulo de almacenamiento iniciado");
  }

  status() {
    return {
      memoria: this.memory.stats(),
      discoUsadoBytes: this.fs.used(),
      discoLibreBytes: this.fs.freeSpace(),
      clips: this.surveillance.clips.size,
      energia: this.energy.report(),
    };
  }
}

export default StorageModule;
