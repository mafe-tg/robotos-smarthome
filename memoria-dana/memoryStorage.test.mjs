import assert from "node:assert/strict";
import test from "node:test";
import {
  MemoryManager,
  VirtualFileSystem,
  LogManager,
  SurveillanceStorage,
  EnergyMonitor,
  VirtualMemory,
  PowerManager,
  ResultsRecorder,
  StorageModule,
  crc32Hex,
  parseLogLine,
  makeWorkload,
  benchmarkAllocation,
  compareReplacement,
} from "./memoryStorage.js";

function fakeSupabase() {
  const db = {};
  let nextId = 1;
  return {
    db,
    from(name) {
      db[name] ||= [];
      const rows = db[name];
      let op = "select";
      const q = {
        select() { op = "select"; return q; },
        eq() { return q; },
        order() { return q; },
        limit() { return q; },
        insert(r) { op = "insert"; r.forEach((x) => rows.push({ id: nextId++, ...x })); return q; },
        upsert(r, { onConflict }) {
          op = "upsert";
          r.forEach((x) => {
            const i = rows.findIndex((y) => y[onConflict] === x[onConflict]);
            if (i >= 0) rows[i] = { ...rows[i], ...x };
            else rows.push({ id: nextId++, ...x });
          });
          return q;
        },
        delete() { op = "delete"; return q; },
        neq() { rows.length = 0; return q; },
        then(res, rej) {
          return Promise.resolve({ data: op === "select" ? [...rows] : null, error: null }).then(res, rej);
        },
      };
      return q;
    },
  };
}

test("estrategias de asignación", () => {
  const build = () => {
    const m = new MemoryManager(100);
    m.allocate("a", 10);
    m.allocate("b", 30);
    m.allocate("c", 10);
    m.allocate("d", 20);
    m.allocate("e", 10);
    m.free("b");
    m.free("d");
    return m;
  };
  assert.equal(build().allocate("x", 15, "first").start, 10);
  assert.equal(build().allocate("x", 15, "best").start, 50);
  assert.equal(build().allocate("x", 15, "worst").start, 10);
  assert.equal(build().allocate("x", 60, "first"), null);
  assert.throws(() => build().allocate("x", 5, "raro"));
});

test("fragmentación", () => {
  const m = new MemoryManager(100);
  m.allocate("a", 20);
  m.allocate("b", 20);
  m.allocate("c", 20);
  m.free("b");
  const f = m.fragmentation();
  assert.equal(f.holes, 2);
  assert.equal(f.largestHoleKb, 40);
  assert.equal(f.freeKb, 60);
  assert.equal(f.externalPct, 33.3);
});

test("benchmark es reproducible", () => {
  const a = benchmarkAllocation(1024, makeWorkload(200, 7));
  const b = benchmarkAllocation(1024, makeWorkload(200, 7));
  assert.deepEqual(a, b);
  assert.equal(Object.keys(a).length, 3);
});

test("memoria virtual: aciertos, fallos y reemplazo", () => {
  const vm = new VirtualMemory(2, 4, "FIFO");
  assert.equal(vm.access("p", 1).hit, false);
  assert.equal(vm.access("p", 2).hit, false);
  assert.equal(vm.access("p", 1).hit, true);
  const r = vm.access("p", 3);
  assert.deepEqual(r.evicted, { pid: "p", page: 1 });
  const s = vm.stats();
  assert.equal(s.faults, 3);
  assert.equal(s.hits, 1);
  assert.equal(s.hitRatioPct, 25);
});

test("LRU reemplaza la menos usada", () => {
  const vm = new VirtualMemory(2, 4, "LRU");
  vm.access("p", 1);
  vm.access("p", 2);
  vm.access("p", 1);
  assert.deepEqual(vm.access("p", 3).evicted, { pid: "p", page: 2 });
});

test("traducción de direcciones y liberación", () => {
  const vm = new VirtualMemory(4, 4, "LRU");
  const t = vm.translate("p", 9);
  assert.equal(t.page, 2);
  assert.equal(t.offset, 1);
  assert.equal(t.physicalKb, t.frame * 4 + 1);
  assert.equal(vm.pageTable("p").length, 1);
  assert.equal(vm.freeProcess("p"), 1);
  assert.equal(vm.stats().usedFrames, 0);
});

test("anomalía de Belady con FIFO", () => {
  const ref = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];
  assert.equal(compareReplacement(ref, 3).FIFO, 9);
  assert.equal(compareReplacement(ref, 4).FIFO, 10);
  const r = compareReplacement(ref, 3);
  assert.ok(r.OPT <= r.LRU && r.OPT <= r.FIFO);
});

test("sistema de archivos: filas de ida y vuelta", () => {
  const fs = new VirtualFileSystem(1000);
  fs.write("/config/a.json", "hola");
  const fs2 = new VirtualFileSystem(1000);
  fs2.fromRows(fs.toRows());
  assert.equal(fs2.read("/config/a.json"), "hola");
  assert.equal(fs2.used(), 4);
});

test("logs: entradas pendientes", () => {
  const fs = new VirtualFileSystem(100000);
  const logs = new LogManager(fs);
  logs.log("INFO", "t", "uno");
  logs.log("ERROR", "t", "dos");
  assert.equal(logs.pending().length, 2);
  logs.markSynced(2);
  assert.equal(logs.pending().length, 0);
});

test("vigilancia y energía siguen funcionando", () => {
  const fs = new VirtualFileSystem(4_000_000);
  const logs = new LogManager(fs);
  const sv = new SurveillanceStorage(fs, logs);
  const a = sv.saveClip("c", 1.5);
  const b = sv.saveClip("c", 1.5, true);
  const c = sv.saveClip("c", 1.5);
  assert.ok(c);
  assert.ok(!sv.clips.has(a));
  assert.ok(sv.clips.has(b));
  const e = new EnergyMonitor(logs);
  e.register("aire", 1500);
  e.recordUsage("aire", 4 * 3600);
  assert.equal(e.totalKwh(), 6);
  assert.equal(e.pending().length, 1);
});

test("sync y load con Supabase simulado", async () => {
  const sb = fakeSupabase();
  const a = new StorageModule({ diskBytes: 10_000_000 });
  a.memory.allocate("luces", 128);
  a.memory.allocate("camaras", 256);
  a.fs.write("/config/home.json", "{}");
  a.surveillance.saveClip("camara_1", 1.5);
  a.energy.register("aire", 1500);
  a.energy.recordUsage("aire", 3600);
  const res = await a.sync(sb);
  assert.equal(res.memory_blocks, 2);
  assert.equal(sb.db.memory_blocks.length, 2);
  assert.ok(sb.db.files.some((f) => f.path === "/config/home.json"));
  assert.equal(sb.db.energy_usage.length, 1);
  assert.equal(a.logs.pending().length, 0);
  await a.sync(sb);
  assert.equal(sb.db.energy_usage.length, 1);
  assert.equal(sb.db.logs.length, a.logs.entries.length);

  const b = new StorageModule();
  const loaded = await b.load(sb);
  assert.equal(loaded.memory_blocks, 2);
  assert.equal(b.memory.stats().usedKb, 384);
  assert.equal(b.fs.read("/config/home.json"), "{}");
  assert.equal(b.surveillance.clips.size, 1);
  assert.equal(b.energy.totalKwh(), 1.5);
});

test("guardar benchmarks", async () => {
  const sb = fakeSupabase();
  const m = new StorageModule();
  const res = await m.saveBenchmarks(sb);
  assert.equal(sb.db.experiment_results.length, 3 + 6);
  assert.equal(m.results.pending().length, 0);
  assert.ok(res.allocation.first);
});

test("estado incluye memoria virtual y fragmentación", () => {
  const s = new StorageModule().status();
  assert.ok(s.memoriaVirtual);
  assert.ok(s.fragmentacion);
  assert.ok(s.energia);
});

test("crc32 conocido y formato de línea", () => {
  assert.equal(crc32Hex("123456789"), "cbf43926");
  const fs = new VirtualFileSystem(1_000_000);
  const logs = new LogManager(fs, { maxBytes: 100000 });
  logs.log("INFO", "t", "uno\ndos");
  const line = fs.read("/logs/system.log").split("\n")[0];
  const parsed = parseLogLine(line);
  assert.deepEqual([parsed.level, parsed.source, parsed.message], ["INFO", "t", "uno dos"]);
  assert.ok(!logs.query()[0].includes("~"));
});

function logsWith(n) {
  const fs = new VirtualFileSystem(1_000_000);
  const logs = new LogManager(fs, { maxBytes: 100000 });
  for (let i = 0; i < n; i++) logs.log("INFO", "t", `mensaje ${i}`);
  return { fs, logs };
}

test("logs: truncado y recuperación", () => {
  const { fs, logs } = logsWith(6);
  logs.simulateCrash("truncate");
  assert.ok(logs.verify().corrupt >= 1);
  const res = logs.recover();
  assert.equal(res.discarded, 1);
  assert.equal(logs.verify().corrupt, 0);
  assert.ok(fs.read("/logs/system.log").endsWith("\n"));
});

test("logs: línea alterada y recuperación", () => {
  const { logs } = logsWith(6);
  logs.simulateCrash("corrupt");
  assert.equal(logs.verify().corrupt, 1);
  assert.equal(logs.query().length, 5);
  const res = logs.recover();
  assert.deepEqual([res.kept, res.discarded], [5, 1]);
  assert.equal(logs.verify().corrupt, 0);
});

test("logs: archivo borrado y reconstrucción", () => {
  const { fs, logs } = logsWith(6);
  logs.simulateCrash("delete");
  assert.ok(!fs.exists("/logs/system.log"));
  const res = logs.recover();
  assert.ok(res.rebuilt);
  assert.ok(logs.query().length >= 6);
  assert.equal(logs.verify().corrupt, 0);
  assert.throws(() => logs.simulateCrash("raro"));
});

function buildPower(capacity = 100, charger = 50) {
  const fs = new VirtualFileSystem(1_000_000);
  const logs = new LogManager(fs, { maxBytes: 100000 });
  const energy = new EnergyMonitor(logs, { thresholdKwh: 999 });
  const pm = new PowerManager(logs, energy, { capacityWh: capacity, chargerW: charger });
  pm.register("cerradura", 5, "critical");
  pm.register("luces", 20, "normal");
  pm.register("decoracion", 25, "low");
  return { pm, logs, energy };
}

test("power: modos y recuperación al cargar", () => {
  const { pm, logs } = buildPower();
  assert.equal(pm.runtimeHours(), 2);
  let s = pm.tick(3600);
  assert.deepEqual([s.mode, s.batteryPct], ["NORMAL", 50]);
  s = pm.tick(1800);
  assert.deepEqual([s.mode, s.suspended, s.drawW], ["SAVER", ["decoracion"], 25]);
  s = pm.tick(1800);
  assert.deepEqual([s.mode, s.suspended], ["CRITICAL", ["decoracion", "luces"]]);
  assert.deepEqual(s.active, ["cerradura"]);
  pm.setCharging(true);
  s = pm.tick(3600);
  assert.deepEqual([s.mode, s.suspended], ["NORMAL", []]);
  const levels = logs.query("DEBUG", "power").map((l) => l.split("] [")[1]);
  assert.deepEqual(levels, ["WARNING", "CRITICAL", "INFO"]);
});

test("power: apagado de emergencia y reinicio", () => {
  const fs = new VirtualFileSystem(1_000_000);
  const logs = new LogManager(fs, { maxBytes: 100000 });
  const pm = new PowerManager(logs, null, { capacityWh: 10, chargerW: 60 });
  pm.register("motor", 100, "normal");
  let s = pm.tick(3600);
  assert.ok(s.shutdown);
  assert.deepEqual(s.active, []);
  assert.equal(logs.query("CRITICAL", "power").length, 1);
  pm.setCharging(true);
  s = pm.tick(3600);
  assert.ok(!s.shutdown);
  assert.deepEqual(s.active, ["motor"]);
});

test("power: energía, validaciones y persistencia", () => {
  const { pm, energy } = buildPower();
  pm.tick(3600);
  assert.ok(Math.abs(energy.totalKwh() - 0.05) < 1e-9);
  assert.equal(energy.usage.length, 3);
  pm.setDevice("luces", false);
  assert.throws(() => pm.register("x", 1, "urgente"));
  assert.throws(() => pm.tick(0));
  const a = new StorageModule();
  a.power.register("camara", 8, "critical");
  a.power.register("luces", 12, "normal");
  a.power.tick(3600);
  const b = new StorageModule();
  b.restore(a.snapshot());
  assert.equal(b.power.state().chargeWh, a.power.state().chargeWh);
  assert.deepEqual([...b.power.devices.keys()].sort(), ["camara", "luces"]);
});

test("resultados: registro, pendientes y sync", async () => {
  const m = new StorageModule();
  m.recordBenchmarks();
  assert.equal(m.results.rows.length, 9);
  assert.equal(m.results.byLab("memory").length, 9);
  const row = m.recordResult("cpu", "Round Robin", { quantum: 2 }, { espera: 17.6 });
  assert.equal(row.metrics.espera, 17.6);
  const sb = fakeSupabase();
  const res = await m.sync(sb);
  assert.equal(res.results, 10);
  assert.equal(sb.db.experiment_results.length, 10);
  assert.equal(m.results.pending().length, 0);
  const rows = await new ResultsRecorder().list(sb, "memory", 5);
  assert.ok(rows.length >= 1);
});
