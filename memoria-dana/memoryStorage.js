export const LEVELS = { DEBUG: 10, INFO: 20, WARNING: 30, ERROR: 40, CRITICAL: 50 };
export const STRATEGIES = ["first", "best", "worst"];
export const REPLACEMENT = ["FIFO", "LRU"];

const iso = (ms) => new Date(ms).toISOString();
const round1 = (n) => Math.round(n * 10) / 10;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32Hex(text) {
  let c = 0xffffffff;
  for (const b of new TextEncoder().encode(text)) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return ((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}

const LINE_RE = /^\[([^\]]+)\] \[([A-Z]+)\] \[([^\]]+)\] (.*) ~([0-9a-f]{8})$/;

export function parseLogLine(line) {
  const m = LINE_RE.exec(line);
  if (!m || !(m[2] in LEVELS)) return null;
  const body = line.slice(0, line.lastIndexOf(" ~"));
  if (crc32Hex(body) !== m[5]) return null;
  return { ts: m[1], level: m[2], source: m[3], message: m[4], text: body };
}

export class MemoryManager {
  constructor(totalKb = 1024) {
    this.total = totalKb;
    this.blocks = [];
  }

  holes() {
    const out = [];
    let cursor = 0;
    for (const b of [...this.blocks].sort((a, c) => a.start - c.start)) {
      if (b.start > cursor) out.push({ start: cursor, size: b.start - cursor });
      cursor = b.start + b.size;
    }
    if (this.total > cursor) out.push({ start: cursor, size: this.total - cursor });
    return out;
  }

  allocate(owner, sizeKb, strategy = "first") {
    if (sizeKb <= 0) throw new Error("El tamaño debe ser positivo");
    if (!STRATEGIES.includes(strategy)) throw new Error(`Estrategia inválida: ${strategy}`);
    const fits = this.holes().filter((h) => h.size >= sizeKb);
    if (fits.length === 0) return null;
    let pick = fits[0];
    if (strategy === "best") for (const h of fits) if (h.size < pick.size) pick = h;
    if (strategy === "worst") for (const h of fits) if (h.size > pick.size) pick = h;
    return this.#insert(pick.start, sizeKb, owner);
  }

  #insert(start, size, owner) {
    const block = { start, size, owner };
    this.blocks.push(block);
    this.blocks.sort((a, b) => a.start - b.start);
    return block;
  }

  free(owner) {
    const freed = this.blocks.filter((b) => b.owner === owner).reduce((sum, b) => sum + b.size, 0);
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
      usagePct: round1((used / this.total) * 100),
      blocks: this.blocks.length,
    };
  }

  fragmentation() {
    const holes = this.holes();
    const free = holes.reduce((sum, h) => sum + h.size, 0);
    const largest = holes.reduce((m, h) => Math.max(m, h.size), 0);
    return {
      freeKb: free,
      holes: holes.length,
      largestHoleKb: largest,
      externalPct: free ? round1((1 - largest / free) * 100) : 0,
    };
  }
}

function* lcg(seed) {
  let state = seed >>> 0;
  while (true) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    yield state / 4294967296;
  }
}

export function makeWorkload(steps = 200, seed = 7, minKb = 8, maxKb = 128) {
  const rnd = lcg(seed);
  const ops = [];
  const live = [];
  let n = 0;
  for (let i = 0; i < steps; i++) {
    const r = rnd.next().value;
    if (live.length > 0 && r >= 0.6) {
      const idx = Math.floor(rnd.next().value * live.length);
      ops.push({ op: "free", owner: live.splice(idx, 1)[0] });
    } else {
      n += 1;
      const owner = `p${n}`;
      const size = minKb + Math.floor(rnd.next().value * (maxKb - minKb + 1));
      ops.push({ op: "alloc", owner, size });
      live.push(owner);
    }
  }
  return ops;
}

export function benchmarkAllocation(totalKb = 1024, workload = null, strategies = STRATEGIES) {
  workload = workload || makeWorkload();
  const result = {};
  for (const strategy of strategies) {
    const mem = new MemoryManager(totalKb);
    let allocated = 0;
    let failed = 0;
    for (const op of workload) {
      if (op.op === "alloc") {
        if (mem.allocate(op.owner, op.size, strategy) === null) failed += 1;
        else allocated += 1;
      } else {
        mem.free(op.owner);
      }
    }
    const frag = mem.fragmentation();
    result[strategy] = {
      allocated,
      failed,
      usedPct: mem.stats().usagePct,
      holes: frag.holes,
      largestHoleKb: frag.largestHoleKb,
      externalPct: frag.externalPct,
    };
  }
  return result;
}

export class VirtualMemory {
  constructor(frames = 8, pageKb = 4, algorithm = "LRU") {
    if (!REPLACEMENT.includes(algorithm)) throw new Error(`Algoritmo inválido: ${algorithm}`);
    this.framesTotal = frames;
    this.pageKb = pageKb;
    this.algorithm = algorithm;
    this.frames = new Array(frames).fill(null);
    this.tables = new Map();
    this.clock = 0;
    this.accesses = 0;
    this.hits = 0;
    this.faults = 0;
  }

  access(pid, page) {
    this.clock += 1;
    this.accesses += 1;
    if (!this.tables.has(pid)) this.tables.set(pid, new Map());
    const table = this.tables.get(pid);
    if (table.has(page)) {
      const frame = table.get(page);
      this.frames[frame].lastUsed = this.clock;
      this.hits += 1;
      return { hit: true, frame, evicted: null };
    }
    this.faults += 1;
    let evicted = null;
    let frame = this.frames.findIndex((f) => f === null);
    if (frame === -1) {
      const key = this.algorithm === "FIFO" ? "loadedAt" : "lastUsed";
      frame = 0;
      for (let i = 1; i < this.frames.length; i++) {
        if (this.frames[i][key] < this.frames[frame][key]) frame = i;
      }
      const old = this.frames[frame];
      this.tables.get(old.pid).delete(old.page);
      evicted = { pid: old.pid, page: old.page };
    }
    this.frames[frame] = { pid, page, loadedAt: this.clock, lastUsed: this.clock };
    table.set(page, frame);
    return { hit: false, frame, evicted };
  }

  translate(pid, addressKb) {
    const page = Math.floor(addressKb / this.pageKb);
    const offset = addressKb % this.pageKb;
    const res = this.access(pid, page);
    return { ...res, page, offset, physicalKb: res.frame * this.pageKb + offset };
  }

  freeProcess(pid) {
    const table = this.tables.get(pid);
    if (!table) return 0;
    for (const frame of table.values()) this.frames[frame] = null;
    this.tables.delete(pid);
    return table.size;
  }

  pageTable(pid) {
    const table = this.tables.get(pid);
    if (!table) return [];
    return [...table.entries()].sort((a, b) => a[0] - b[0]).map(([page, frame]) => ({ page, frame }));
  }

  stats() {
    return {
      algorithm: this.algorithm,
      frames: this.framesTotal,
      usedFrames: this.frames.filter((f) => f !== null).length,
      accesses: this.accesses,
      hits: this.hits,
      faults: this.faults,
      hitRatioPct: this.accesses ? round1((this.hits / this.accesses) * 100) : 0,
    };
  }
}

function simulate(reference, frames, algorithm) {
  const memory = [];
  const last = new Map();
  let faults = 0;
  reference.forEach((page, i) => {
    if (memory.includes(page)) {
      last.set(page, i);
      return;
    }
    faults += 1;
    if (memory.length >= frames) {
      let victim = memory[0];
      if (algorithm === "LRU") {
        for (const p of memory) if (last.get(p) < last.get(victim)) victim = p;
      } else if (algorithm === "OPT") {
        const future = reference.slice(i + 1);
        let best = -1;
        for (const p of memory) {
          const idx = future.indexOf(p);
          const d = idx === -1 ? future.length + 1 : idx;
          if (d > best) {
            best = d;
            victim = p;
          }
        }
      }
      memory.splice(memory.indexOf(victim), 1);
    }
    memory.push(page);
    last.set(page, i);
  });
  return faults;
}

export function compareReplacement(reference, frames) {
  return {
    FIFO: simulate(reference, frames, "FIFO"),
    LRU: simulate(reference, frames, "LRU"),
    OPT: simulate(reference, frames, "OPT"),
  };
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

  toRows() {
    return [...this.files.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([path, f]) => ({
        path,
        content: f.content,
        size_bytes: f.size,
        created_at: iso(f.created),
        modified_at: iso(f.modified),
      }));
  }

  fromRows(rows) {
    this.files = new Map();
    for (const r of rows) {
      const created = r.created_at ? Date.parse(r.created_at) : Date.now();
      const modified = r.modified_at ? Date.parse(r.modified_at) : created;
      this.files.set(VirtualFileSystem.norm(r.path), {
        content: r.content || "",
        size: Number(r.size_bytes || 0),
        created,
        modified,
      });
    }
  }
}

export class LogManager {
  constructor(fs, { path = "/logs/system.log", maxBytes = 2000, keep = 3 } = {}) {
    this.fs = fs;
    this.path = path;
    this.maxBytes = maxBytes;
    this.keep = keep;
    this.entries = [];
    this.synced = 0;
  }

  static format(createdAt, level, source, message) {
    const body = `[${createdAt}] [${level}] [${source}] ${message}`;
    return `${body} ~${crc32Hex(body)}\n`;
  }

  log(level, source, message) {
    level = level.toUpperCase();
    if (!(level in LEVELS)) throw new Error(`Nivel inválido: ${level}`);
    message = String(message).replace(/\r/g, " ").replace(/\n/g, " ");
    const createdAt = new Date().toISOString();
    const line = LogManager.format(createdAt, level, source, message);
    if (this.fs.exists(this.path)) {
      const current = this.fs.files.get(VirtualFileSystem.norm(this.path));
      if (current.size + line.length > this.maxBytes) this.#rotate();
    }
    this.fs.write(this.path, line, { append: true });
    this.entries.push({ created_at: createdAt, level, source, message });
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

  paths() {
    const names = [];
    for (let i = this.keep; i >= 1; i--) names.push(`${this.path}.${i}`);
    names.push(this.path);
    return names.filter((p) => this.fs.exists(p));
  }

  query(minLevel = "DEBUG", source = null) {
    if (!this.fs.exists(this.path)) return [];
    const min = LEVELS[minLevel.toUpperCase()];
    const out = [];
    for (const line of this.fs.read(this.path).split("\n")) {
      const parsed = parseLogLine(line);
      if (parsed && LEVELS[parsed.level] >= min && (source === null || parsed.source === source)) {
        out.push(parsed.text);
      }
    }
    return out;
  }

  verify() {
    const files = [];
    let total = 0;
    let corrupt = 0;
    for (const p of this.paths()) {
      const raw = this.fs.read(p);
      const lines = raw.split("\n").filter((l) => l !== "");
      const bad = lines.filter((l) => parseLogLine(l) === null).length;
      files.push({ path: p, lines: lines.length, corrupt: bad, tornTail: raw.length > 0 && !raw.endsWith("\n") });
      total += lines.length;
      corrupt += bad;
    }
    return { files, total, corrupt };
  }

  recover() {
    let kept = 0;
    let discarded = 0;
    const touched = [];
    for (const p of this.paths()) {
      const raw = this.fs.read(p);
      const lines = raw.split("\n").filter((l) => l !== "");
      const good = lines.filter((l) => parseLogLine(l) !== null);
      kept += good.length;
      discarded += lines.length - good.length;
      if (good.length !== lines.length || (raw && !raw.endsWith("\n"))) {
        this.fs.write(p, good.map((l) => l + "\n").join(""));
        touched.push(p);
      }
    }
    let rebuilt = false;
    if (!this.fs.exists(this.path) && this.entries.length > 0) {
      const text = this.entries
        .map((e) => LogManager.format(e.created_at, e.level, e.source, e.message))
        .join("");
      this.fs.write(this.path, text);
      kept += this.entries.length;
      rebuilt = true;
    }
    const result = { kept, discarded, rebuilt, files: touched };
    this.log("INFO", "logs", `Recuperación de logs: ${kept} líneas válidas, ${discarded} descartadas, reconstruido=${rebuilt}`);
    return result;
  }

  simulateCrash(mode = "truncate") {
    if (!["truncate", "corrupt", "delete"].includes(mode)) throw new Error(`Modo inválido: ${mode}`);
    if (!this.fs.exists(this.path)) return "no hay log principal";
    if (mode === "delete") {
      this.fs.delete(this.path);
      return "log principal eliminado";
    }
    const raw = this.fs.read(this.path);
    if (mode === "truncate") {
      this.fs.write(this.path, raw.slice(0, Math.max(0, raw.length - 20)));
      return "última línea truncada";
    }
    const lines = raw.split("\n");
    const nonempty = lines.map((l, i) => (l ? i : -1)).filter((i) => i >= 0);
    const target = nonempty[Math.floor(nonempty.length / 2)];
    const line = lines[target];
    const i = line.lastIndexOf(" ~");
    lines[target] = line.slice(0, i - 1) + (line[i - 1] !== "X" ? "X" : "Y") + line.slice(i);
    this.fs.write(this.path, lines.join("\n"));
    return `línea ${target + 1} alterada`;
  }

  pending() {
    return this.entries.slice(this.synced);
  }

  markSynced(count) {
    this.synced += count;
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
    this.clips.set(path, {
      camera: cameraId,
      seq,
      protected: protectedClip,
      sizeMb,
      recordedAt: new Date().toISOString(),
    });
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

  toRows() {
    return [...this.clips.entries()]
      .sort((a, b) => a[1].seq - b[1].seq)
      .map(([path, c]) => ({
        camera_id: c.camera,
        path,
        size_mb: c.sizeMb,
        is_protected: c.protected,
        recorded_at: c.recordedAt,
      }));
  }

  fromRows(rows) {
    const ordered = [...rows].sort((a, b) => String(a.recorded_at || "").localeCompare(String(b.recorded_at || "")));
    this.clips = new Map();
    ordered.forEach((r, i) => {
      this.clips.set(r.path, {
        camera: r.camera_id,
        seq: i + 1,
        protected: Boolean(r.is_protected),
        sizeMb: Number(r.size_mb),
        recordedAt: r.recorded_at || new Date().toISOString(),
      });
    });
    this.seq = ordered.length;
  }
}

export class EnergyMonitor {
  constructor(logs, { thresholdKwh = 5.0, priceKwh = 700.0 } = {}) {
    this.logs = logs;
    this.threshold = thresholdKwh;
    this.price = priceKwh;
    this.watts = new Map();
    this.wh = new Map();
    this.usage = [];
    this.synced = 0;
  }

  register(device, watts) {
    this.watts.set(device, watts);
    if (!this.wh.has(device)) this.wh.set(device, 0);
  }

  recordUsage(device, seconds) {
    if (!this.watts.has(device)) throw new Error(`Dispositivo no registrado: ${device}`);
    this.wh.set(device, this.wh.get(device) + (this.watts.get(device) * seconds) / 3600);
    this.usage.push({ device, seconds, recorded_at: new Date().toISOString() });
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

  deviceRows() {
    return [...this.watts.entries()].map(([device, watts]) => ({ device, watts }));
  }

  pending() {
    return this.usage.slice(this.synced);
  }

  markSynced(count) {
    this.synced += count;
  }

  restore(devices, usage) {
    this.watts = new Map(devices.map((d) => [d.device, Number(d.watts)]));
    this.wh = new Map([...this.watts.keys()].map((d) => [d, 0]));
    this.usage = usage.map((u) => ({
      device: u.device,
      seconds: Number(u.seconds),
      recorded_at: u.recorded_at || new Date().toISOString(),
    }));
    for (const u of this.usage) {
      if (this.watts.has(u.device)) {
        this.wh.set(u.device, this.wh.get(u.device) + (this.watts.get(u.device) * u.seconds) / 3600);
      }
    }
    this.synced = this.usage.length;
  }
}

const check = async (query) => {
  const { error } = await query;
  if (error) throw new Error(error.message);
};

export const PRIORITIES = ["critical", "normal", "low"];
export const POWER_MODES = ["NORMAL", "SAVER", "CRITICAL"];

export class PowerManager {
  constructor(
    logs,
    energy = null,
    { capacityWh = 200, chargeWh = null, saverPct = 30, criticalPct = 15, chargerW = 60 } = {}
  ) {
    this.logs = logs;
    this.energy = energy;
    this.capacity = capacityWh;
    this.charge = chargeWh === null ? capacityWh : chargeWh;
    this.saverPct = saverPct;
    this.criticalPct = criticalPct;
    this.chargerW = chargerW;
    this.devices = new Map();
    this.charging = false;
    this.mode = "NORMAL";
    this.shutdown = false;
  }

  register(name, watts, priority = "normal", on = true) {
    if (!PRIORITIES.includes(priority)) throw new Error(`Prioridad inválida: ${priority}`);
    this.devices.set(name, { watts: Number(watts), priority, on, suspended: false });
    if (this.energy) this.energy.register(name, Number(watts));
    this.#applyMode();
  }

  setDevice(name, on) {
    if (!this.devices.has(name)) throw new Error(`Dispositivo no registrado: ${name}`);
    this.devices.get(name).on = on;
  }

  setCharging(flag) {
    this.charging = Boolean(flag);
  }

  batteryPct() {
    return round1((this.charge / this.capacity) * 100);
  }

  active() {
    return [...this.devices.entries()]
      .filter(([, d]) => d.on && !d.suspended)
      .map(([n]) => n)
      .sort();
  }

  drawW() {
    return Math.round(this.active().reduce((sum, n) => sum + this.devices.get(n).watts, 0) * 100) / 100;
  }

  runtimeHours() {
    const draw = this.drawW();
    return draw <= 0 ? null : Math.round((this.charge / draw) * 100) / 100;
  }

  #computeMode() {
    const pct = (this.charge / this.capacity) * 100;
    if (pct < this.criticalPct) return "CRITICAL";
    if (this.mode === "CRITICAL" && pct < this.criticalPct + 5) return "CRITICAL";
    if (pct < this.saverPct) return "SAVER";
    if ((this.mode === "SAVER" || this.mode === "CRITICAL") && pct < this.saverPct + 5) return "SAVER";
    return "NORMAL";
  }

  #applyMode() {
    const table = { NORMAL: [], SAVER: ["low"], CRITICAL: ["low", "normal"] };
    const suspend = this.shutdown ? PRIORITIES : table[this.mode];
    const changed = { suspended: [], resumed: [] };
    for (const [name, d] of [...this.devices.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const want = suspend.includes(d.priority);
      if (want && !d.suspended) {
        d.suspended = true;
        changed.suspended.push(name);
      } else if (!want && d.suspended) {
        d.suspended = false;
        changed.resumed.push(name);
      }
    }
    return changed;
  }

  tick(seconds) {
    if (seconds <= 0) throw new Error("El tiempo debe ser positivo");
    const draw = this.drawW();
    if (this.energy) for (const name of this.active()) this.energy.recordUsage(name, seconds);
    const net = (this.charging ? this.chargerW : 0) - draw;
    this.charge = Math.min(this.capacity, Math.max(0, this.charge + (net * seconds) / 3600));
    const pct = (this.charge / this.capacity) * 100;
    if (!this.shutdown && this.charge <= 0) {
      this.shutdown = true;
      this.mode = "CRITICAL";
      this.#applyMode();
      this.logs.log("CRITICAL", "power", "Batería agotada: apagado de emergencia");
    } else if (this.shutdown) {
      if (pct >= this.criticalPct) {
        this.shutdown = false;
        this.mode = this.#computeMode();
        this.#applyMode();
        this.logs.log("INFO", "power", `Sistema reiniciado con ${this.batteryPct()}% de batería (modo ${this.mode})`);
      }
    } else {
      const next = this.#computeMode();
      if (next !== this.mode) {
        const previous = this.mode;
        this.mode = next;
        const changed = this.#applyMode();
        const level = { NORMAL: "INFO", SAVER: "WARNING", CRITICAL: "CRITICAL" }[next];
        let detail = "";
        if (changed.suspended.length) detail += ` Suspendidos: ${changed.suspended.join(", ")}.`;
        if (changed.resumed.length) detail += ` Reanudados: ${changed.resumed.join(", ")}.`;
        this.logs.log(level, "power", `Modo de energía ${previous} -> ${next} (batería ${pct.toFixed(1)}%).${detail}`);
      }
    }
    return this.state();
  }

  state() {
    return {
      mode: this.mode,
      batteryPct: this.batteryPct(),
      chargeWh: Math.round(this.charge * 100) / 100,
      capacityWh: this.capacity,
      charging: this.charging,
      drawW: this.drawW(),
      runtimeH: this.runtimeHours(),
      active: this.active(),
      suspended: [...this.devices.entries()].filter(([, d]) => d.suspended).map(([n]) => n).sort(),
      shutdown: this.shutdown,
    };
  }

  toObject() {
    return {
      capacity_wh: this.capacity,
      charge_wh: this.charge,
      charging: this.charging,
      mode: this.mode,
      shutdown: this.shutdown,
      saver_pct: this.saverPct,
      critical_pct: this.criticalPct,
      charger_w: this.chargerW,
      devices: [...this.devices.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([name, d]) => ({ name, ...d })),
    };
  }

  fromObject(data) {
    this.capacity = Number(data.capacity_wh);
    this.charge = Number(data.charge_wh);
    this.charging = Boolean(data.charging);
    this.mode = data.mode || "NORMAL";
    this.shutdown = Boolean(data.shutdown);
    this.saverPct = data.saver_pct ?? this.saverPct;
    this.criticalPct = data.critical_pct ?? this.criticalPct;
    this.chargerW = data.charger_w ?? this.chargerW;
    this.devices = new Map();
    for (const d of data.devices || []) {
      this.devices.set(d.name, {
        watts: Number(d.watts),
        priority: d.priority,
        on: Boolean(d.on),
        suspended: Boolean(d.suspended),
      });
      if (this.energy) this.energy.register(d.name, Number(d.watts));
    }
  }
}

export class ResultsRecorder {
  constructor() {
    this.rows = [];
    this.synced = 0;
  }

  record(lab, name, params = {}, metrics = {}) {
    const row = { lab, name, params, metrics, created_at: new Date().toISOString() };
    this.rows.push(row);
    return row;
  }

  byLab(lab) {
    return this.rows.filter((r) => r.lab === lab);
  }

  pending() {
    return this.rows.slice(this.synced);
  }

  markSynced(count) {
    this.synced += count;
  }

  async list(supabase, lab = null, limit = 50) {
    let query = supabase.from("experiment_results").select("*");
    if (lab) query = query.eq("lab", lab);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return data || [];
  }
}

export const POWER_FILE = "/config/power.json";

export class StorageModule {
  constructor({ ramKb = 1024, diskBytes = 10_000_000, frames = 8, pageKb = 4, algorithm = "LRU" } = {}) {
    this.memory = new MemoryManager(ramKb);
    this.vmem = new VirtualMemory(frames, pageKb, algorithm);
    this.fs = new VirtualFileSystem(diskBytes);
    this.logs = new LogManager(this.fs);
    this.surveillance = new SurveillanceStorage(this.fs, this.logs);
    this.energy = new EnergyMonitor(this.logs);
    this.power = new PowerManager(this.logs, this.energy);
    this.results = new ResultsRecorder();
    this.logs.log("INFO", "storage", "Módulo de almacenamiento iniciado");
  }

  status() {
    return {
      memoria: this.memory.stats(),
      fragmentacion: this.memory.fragmentation(),
      memoriaVirtual: this.vmem.stats(),
      discoUsadoBytes: this.fs.used(),
      discoLibreBytes: this.fs.freeSpace(),
      clips: this.surveillance.clips.size,
      energia: this.energy.report(),
      bateria: this.power.state(),
    };
  }

  runBenchmarks({ totalKb = 1024, steps = 200, seed = 7 } = {}) {
    const belady = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];
    return {
      allocation: benchmarkAllocation(totalKb, makeWorkload(steps, seed)),
      replacement: {
        frames3: compareReplacement(belady, 3),
        frames4: compareReplacement(belady, 4),
      },
    };
  }

  recordBenchmarks(options = {}) {
    const { totalKb = 1024, steps = 200, seed = 7 } = options;
    const result = this.runBenchmarks(options);
    for (const [strategy, metrics] of Object.entries(result.allocation)) {
      this.results.record("memory", `allocation:${strategy}`, { totalKb, steps, seed }, metrics);
    }
    for (const [label, counts] of Object.entries(result.replacement)) {
      for (const [algorithm, faults] of Object.entries(counts)) {
        this.results.record("memory", `replacement:${algorithm}`, { frames: label }, { faults });
      }
    }
    return result;
  }

  recordResult(lab, name, params = {}, metrics = {}) {
    return this.results.record(lab, name, params, metrics);
  }

  savePower() {
    return this.fs.write(POWER_FILE, JSON.stringify(this.power.toObject()));
  }

  loadPower() {
    if (!this.fs.exists(POWER_FILE)) return false;
    this.power.fromObject(JSON.parse(this.fs.read(POWER_FILE)));
    return true;
  }

  snapshot() {
    this.savePower();
    return {
      memory_blocks: this.memory.blocks.map((b) => ({ owner: b.owner, start_kb: b.start, size_kb: b.size })),
      files: this.fs.toRows(),
      logs: this.logs.entries.map((e) => ({ ...e })),
      clips: this.surveillance.toRows(),
      energy_devices: this.energy.deviceRows(),
      energy_usage: this.energy.usage.map((u) => ({ ...u })),
      results: this.results.rows.map((r) => ({ ...r })),
    };
  }

  restore(data) {
    if (data.memory_blocks && data.memory_blocks.length) {
      this.memory.blocks = data.memory_blocks
        .map((r) => ({ start: r.start_kb, size: r.size_kb, owner: r.owner }))
        .sort((a, b) => a.start - b.start);
    }
    if (data.files && data.files.length) this.fs.fromRows(data.files);
    if (data.logs && data.logs.length) {
      this.logs.entries = data.logs.map(({ created_at, level, source, message }) => ({ created_at, level, source, message }));
      this.logs.synced = this.logs.entries.length;
    }
    if (data.clips && data.clips.length) this.surveillance.fromRows(data.clips);
    if ((data.energy_devices && data.energy_devices.length) || (data.energy_usage && data.energy_usage.length)) {
      this.energy.restore(data.energy_devices || [], data.energy_usage || []);
    }
    this.loadPower();
  }

  async load(supabase) {
    const data = {};
    const tables = ["memory_blocks", "files", "surveillance_clips", "energy_devices", "energy_usage"];
    const keys = ["memory_blocks", "files", "clips", "energy_devices", "energy_usage"];
    for (let i = 0; i < tables.length; i++) {
      const { data: rows, error } = await supabase.from(tables[i]).select("*");
      if (error) throw new Error(error.message);
      data[keys[i]] = rows || [];
    }
    const { data: logRows, error: logError } = await supabase
      .from("logs")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(500);
    if (logError) throw new Error(logError.message);
    data.logs = logRows || [];
    this.restore(data);
    return {
      files: data.files.length,
      logs: data.logs.length,
      memory_blocks: data.memory_blocks.length,
      clips: data.clips.length,
    };
  }

  async sync(supabase) {
    const snap = this.snapshot();
    const pendingLogs = this.logs.pending();
    const pendingUsage = this.energy.pending();
    const pendingResults = this.results.pending();
    await check(supabase.from("files").delete().neq("id", 0));
    if (snap.files.length) await check(supabase.from("files").insert(snap.files));
    await check(supabase.from("memory_blocks").delete().neq("id", 0));
    if (snap.memory_blocks.length) await check(supabase.from("memory_blocks").insert(snap.memory_blocks));
    await check(supabase.from("surveillance_clips").delete().neq("id", 0));
    if (snap.clips.length) await check(supabase.from("surveillance_clips").insert(snap.clips));
    if (snap.energy_devices.length) {
      await check(supabase.from("energy_devices").upsert(snap.energy_devices, { onConflict: "device" }));
    }
    if (pendingUsage.length) await check(supabase.from("energy_usage").insert(pendingUsage));
    if (pendingLogs.length) await check(supabase.from("logs").insert(pendingLogs));
    if (pendingResults.length) await check(supabase.from("experiment_results").insert(pendingResults));
    this.logs.markSynced(pendingLogs.length);
    this.energy.markSynced(pendingUsage.length);
    this.results.markSynced(pendingResults.length);
    return {
      files: snap.files.length,
      memory_blocks: snap.memory_blocks.length,
      clips: snap.clips.length,
      logs: pendingLogs.length,
      energy_usage: pendingUsage.length,
      results: pendingResults.length,
    };
  }

  async flushResults(supabase) {
    const pending = this.results.pending();
    if (pending.length) await check(supabase.from("experiment_results").insert(pending));
    this.results.markSynced(pending.length);
    return pending.length;
  }

  async saveBenchmarks(supabase, options = {}) {
    const result = this.recordBenchmarks(options);
    await this.flushResults(supabase);
    return result;
  }
}

export default StorageModule;
