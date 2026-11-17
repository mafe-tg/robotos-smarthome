import time
import unittest

import os
import tempfile

from memory_storage import (
    EnergyMonitor,
    LogManager,
    MemoryManager,
    StorageModule,
    SurveillanceStorage,
    VirtualFileSystem,
    PowerManager,
    ResultsRecorder,
    VirtualMemory,
    benchmark_allocation,
    compare_replacement,
    crc32_hex,
    make_workload,
    parse_log_line,
)


class TestMemoryManager(unittest.TestCase):
    def test_allocate_and_free(self):
        m = MemoryManager(100)
        self.assertIsNotNone(m.allocate("a", 40))
        self.assertEqual(m.stats()["used_kb"], 40)
        self.assertEqual(m.free("a"), 40)
        self.assertEqual(m.stats()["used_kb"], 0)

    def test_out_of_memory(self):
        m = MemoryManager(100)
        m.allocate("a", 80)
        self.assertIsNone(m.allocate("b", 30))

    def test_first_fit_reuses_gap(self):
        m = MemoryManager(100)
        m.allocate("a", 30)
        m.allocate("b", 30)
        m.free("a")
        blk = m.allocate("c", 20)
        self.assertEqual(blk.start, 0)

    def test_compact(self):
        m = MemoryManager(100)
        m.allocate("a", 30)
        m.allocate("b", 30)
        m.free("a")
        m.compact()
        self.assertEqual(m.blocks[0].start, 0)

    def test_invalid_size(self):
        with self.assertRaises(ValueError):
            MemoryManager(100).allocate("a", 0)


class TestVirtualFileSystem(unittest.TestCase):
    def test_write_read(self):
        fs = VirtualFileSystem(1000)
        self.assertTrue(fs.write("/a.txt", "hola"))
        self.assertEqual(fs.read("a.txt"), "hola")

    def test_disk_full(self):
        fs = VirtualFileSystem(10)
        self.assertFalse(fs.write("/a.txt", "x" * 20))

    def test_append(self):
        fs = VirtualFileSystem(1000)
        fs.write("/a.txt", "uno")
        fs.write("/a.txt", "dos", append=True)
        self.assertEqual(fs.read("/a.txt"), "unodos")

    def test_delete_and_listdir(self):
        fs = VirtualFileSystem(1000)
        fs.write("/logs/a.log", "x")
        fs.write("/logs/b.log", "y")
        self.assertEqual(fs.listdir("/logs"), ["/logs/a.log", "/logs/b.log"])
        self.assertTrue(fs.delete("/logs/a.log"))
        self.assertFalse(fs.exists("/logs/a.log"))

    def test_read_missing(self):
        with self.assertRaises(FileNotFoundError):
            VirtualFileSystem(100).read("/nada")


class TestLogManager(unittest.TestCase):
    def test_log_and_query(self):
        fs = VirtualFileSystem(100000)
        logs = LogManager(fs)
        logs.log("INFO", "luces", "encendidas")
        logs.log("ERROR", "camara", "sin señal")
        self.assertEqual(len(logs.query()), 2)
        self.assertEqual(len(logs.query("ERROR")), 1)
        self.assertEqual(len(logs.query(source="luces")), 1)

    def test_rotation(self):
        fs = VirtualFileSystem(100000)
        logs = LogManager(fs, max_bytes=100)
        for i in range(6):
            logs.log("INFO", "t", f"mensaje {i}")
        self.assertTrue(fs.exists("/logs/system.log.1"))

    def test_invalid_level(self):
        with self.assertRaises(ValueError):
            LogManager(VirtualFileSystem(1000)).log("RARO", "t", "x")


class TestSurveillance(unittest.TestCase):
    def setUp(self):
        self.fs = VirtualFileSystem(4_000_000)
        self.logs = LogManager(self.fs)
        self.sv = SurveillanceStorage(self.fs, self.logs)

    def test_evicts_oldest_unprotected(self):
        a = self.sv.save_clip("cam1", 1.5)
        time.sleep(0.005)
        b = self.sv.save_clip("cam1", 1.5, protected=True)
        time.sleep(0.005)
        c = self.sv.save_clip("cam1", 1.5)
        self.assertIsNotNone(c)
        self.assertNotIn(a, self.sv.clips)
        self.assertIn(b, self.sv.clips)
        self.assertIn(c, self.sv.clips)

    def test_all_protected_no_space(self):
        self.sv.save_clip("cam1", 1.5, protected=True)
        time.sleep(0.005)
        self.sv.save_clip("cam1", 1.5, protected=True)
        time.sleep(0.005)
        self.assertIsNone(self.sv.save_clip("cam1", 1.5))


class TestEnergy(unittest.TestCase):
    def test_consumption(self):
        e = EnergyMonitor(LogManager(VirtualFileSystem(100000)))
        e.register("aire", 1500)
        e.record_usage("aire", 4 * 3600)
        self.assertAlmostEqual(e.total_kwh(), 6.0)
        self.assertAlmostEqual(e.report()["costo_estimado"], 4200.0)

    def test_threshold_alert(self):
        fs = VirtualFileSystem(100000)
        logs = LogManager(fs)
        e = EnergyMonitor(logs, threshold_kwh=1.0)
        e.register("aire", 1500)
        e.record_usage("aire", 3600)
        self.assertEqual(len(logs.query("WARNING", source="energy")), 1)

    def test_unknown_device(self):
        e = EnergyMonitor(LogManager(VirtualFileSystem(100000)))
        with self.assertRaises(KeyError):
            e.record_usage("fantasma", 10)


class TestFacade(unittest.TestCase):
    def test_status(self):
        s = StorageModule().status()
        self.assertIn("memoria", s)
        self.assertIn("energia", s)


class TestAllocationStrategies(unittest.TestCase):
    def build(self):
        m = MemoryManager(100)
        for owner, size in [("a", 10), ("b", 30), ("c", 10), ("d", 20), ("e", 10)]:
            m.allocate(owner, size)
        m.free("b")
        m.free("d")
        return m

    def test_first_best_worst(self):
        self.assertEqual(self.build().allocate("x", 15, "first").start, 10)
        self.assertEqual(self.build().allocate("x", 15, "best").start, 50)
        self.assertEqual(self.build().allocate("x", 15, "worst").start, 10)

    def test_no_fit_and_invalid(self):
        self.assertIsNone(self.build().allocate("x", 60, "first"))
        with self.assertRaises(ValueError):
            self.build().allocate("x", 5, "raro")

    def test_fragmentation(self):
        m = MemoryManager(100)
        m.allocate("a", 20)
        m.allocate("b", 20)
        m.allocate("c", 20)
        m.free("b")
        f = m.fragmentation()
        self.assertEqual((f["holes"], f["largest_hole_kb"], f["free_kb"], f["external_pct"]),
                         (2, 40, 60, 33.3))

    def test_benchmark_reproducible(self):
        a = benchmark_allocation(1024, make_workload(200, 7))
        b = benchmark_allocation(1024, make_workload(200, 7))
        self.assertEqual(a, b)
        self.assertEqual(set(a), {"first", "best", "worst"})


class TestVirtualMemory(unittest.TestCase):
    def test_fifo(self):
        vm = VirtualMemory(2, 4, "FIFO")
        self.assertFalse(vm.access("p", 1)["hit"])
        self.assertFalse(vm.access("p", 2)["hit"])
        self.assertTrue(vm.access("p", 1)["hit"])
        self.assertEqual(vm.access("p", 3)["evicted"], {"pid": "p", "page": 1})
        s = vm.stats()
        self.assertEqual((s["faults"], s["hits"], s["hit_ratio_pct"]), (3, 1, 25.0))

    def test_lru(self):
        vm = VirtualMemory(2, 4, "LRU")
        vm.access("p", 1)
        vm.access("p", 2)
        vm.access("p", 1)
        self.assertEqual(vm.access("p", 3)["evicted"], {"pid": "p", "page": 2})

    def test_translate_and_free(self):
        vm = VirtualMemory(4, 4, "LRU")
        t = vm.translate("p", 9)
        self.assertEqual((t["page"], t["offset"]), (2, 1))
        self.assertEqual(t["physical_kb"], t["frame"] * 4 + 1)
        self.assertEqual(len(vm.page_table("p")), 1)
        self.assertEqual(vm.free_process("p"), 1)
        self.assertEqual(vm.stats()["used_frames"], 0)

    def test_belady(self):
        ref = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5]
        self.assertEqual(compare_replacement(ref, 3)["FIFO"], 9)
        self.assertEqual(compare_replacement(ref, 4)["FIFO"], 10)
        r = compare_replacement(ref, 3)
        self.assertTrue(r["OPT"] <= r["LRU"] and r["OPT"] <= r["FIFO"])


class TestPersistence(unittest.TestCase):
    def test_roundtrip(self):
        a = StorageModule(disk_bytes=10_000_000)
        a.memory.allocate("luces", 128)
        a.memory.allocate("camaras", 256)
        a.fs.write("/config/home.json", "{}")
        a.surveillance.save_clip("camara_1", 1.5)
        a.energy.register("aire", 1500)
        a.energy.record_usage("aire", 3600)
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "estado.json")
            a.save_json(path)
            b = StorageModule()
            b.load_json(path)
        self.assertEqual(b.memory.stats()["used_kb"], 384)
        self.assertEqual(b.fs.read("/config/home.json"), "{}")
        self.assertEqual(len(b.surveillance.clips), 1)
        self.assertAlmostEqual(b.energy.total_kwh(), 1.5)
        self.assertEqual(len(b.logs.entries), len(a.logs.entries))

    def test_pending_logs(self):
        m = StorageModule()
        total = len(m.logs.entries)
        self.assertEqual(len(m.logs.pending()), total)
        m.logs.mark_synced(total)
        self.assertEqual(m.logs.pending(), [])

    def test_status_has_new_sections(self):
        s = StorageModule().status()
        self.assertIn("memoria_virtual", s)
        self.assertIn("fragmentacion", s)


class TestLogRecovery(unittest.TestCase):
    def setUp(self):
        self.fs = VirtualFileSystem(1_000_000)
        self.logs = LogManager(self.fs, max_bytes=100000)
        for i in range(6):
            self.logs.log("INFO", "t", f"mensaje {i}")

    def test_crc_known_value(self):
        self.assertEqual(crc32_hex("123456789"), "cbf43926")

    def test_line_format(self):
        line = self.fs.read("/logs/system.log").split("\n")[0]
        parsed = parse_log_line(line)
        self.assertEqual((parsed["level"], parsed["source"], parsed["message"]), ("INFO", "t", "mensaje 0"))
        self.assertEqual(len(self.logs.query()), 6)
        self.assertNotIn("~", self.logs.query()[0])

    def test_newlines_are_sanitized(self):
        self.logs.log("INFO", "t", "uno\ndos")
        self.assertEqual(self.logs.query()[-1].split("] ", 3)[-1], "uno dos")

    def test_truncate_and_recover(self):
        self.logs.simulate_crash("truncate")
        self.assertGreaterEqual(self.logs.verify()["corrupt"], 1)
        res = self.logs.recover()
        self.assertEqual(res["discarded"], 1)
        self.assertEqual(self.logs.verify()["corrupt"], 0)
        self.assertTrue(self.fs.read("/logs/system.log").endswith("\n"))

    def test_corrupt_and_recover(self):
        self.logs.simulate_crash("corrupt")
        self.assertEqual(self.logs.verify()["corrupt"], 1)
        self.assertEqual(len(self.logs.query()), 5)
        res = self.logs.recover()
        self.assertEqual((res["kept"], res["discarded"]), (5, 1))
        self.assertEqual(self.logs.verify()["corrupt"], 0)

    def test_delete_and_rebuild(self):
        self.logs.simulate_crash("delete")
        self.assertFalse(self.fs.exists("/logs/system.log"))
        res = self.logs.recover()
        self.assertTrue(res["rebuilt"])
        self.assertGreaterEqual(len(self.logs.query()), 6)
        self.assertEqual(self.logs.verify()["corrupt"], 0)

    def test_invalid_mode(self):
        with self.assertRaises(ValueError):
            self.logs.simulate_crash("raro")


class TestPowerManager(unittest.TestCase):
    def build(self, capacity=100.0, charger=50.0):
        fs = VirtualFileSystem(1_000_000)
        logs = LogManager(fs, max_bytes=100000)
        energy = EnergyMonitor(logs, threshold_kwh=999)
        pm = PowerManager(logs, energy, capacity_wh=capacity, charger_w=charger)
        pm.register("cerradura", 5, "critical")
        pm.register("luces", 20, "normal")
        pm.register("decoracion", 25, "low")
        return pm, logs, energy

    def test_modes_and_recovery(self):
        pm, logs, _ = self.build()
        self.assertEqual(pm.runtime_hours(), 2.0)
        s = pm.tick(3600)
        self.assertEqual((s["mode"], s["battery_pct"]), ("NORMAL", 50.0))
        s = pm.tick(1800)
        self.assertEqual((s["mode"], s["suspended"], s["draw_w"]), ("SAVER", ["decoracion"], 25.0))
        s = pm.tick(1800)
        self.assertEqual((s["mode"], s["suspended"]), ("CRITICAL", ["decoracion", "luces"]))
        self.assertEqual(s["active"], ["cerradura"])
        pm.set_charging(True)
        s = pm.tick(3600)
        self.assertEqual((s["mode"], s["suspended"]), ("NORMAL", []))
        levels = [l.split("] [")[1] for l in logs.query(source="power")]
        self.assertEqual(levels, ["WARNING", "CRITICAL", "INFO"])

    def test_shutdown_and_restart(self):
        fs = VirtualFileSystem(1_000_000)
        logs = LogManager(fs, max_bytes=100000)
        pm = PowerManager(logs, None, capacity_wh=10, charger_w=60)
        pm.register("motor", 100, "normal")
        s = pm.tick(3600)
        self.assertTrue(s["shutdown"])
        self.assertEqual(s["active"], [])
        self.assertEqual(len(logs.query("CRITICAL", "power")), 1)
        pm.set_charging(True)
        s = pm.tick(3600)
        self.assertFalse(s["shutdown"])
        self.assertEqual(s["active"], ["motor"])

    def test_energy_is_recorded(self):
        pm, _, energy = self.build()
        pm.tick(3600)
        self.assertAlmostEqual(energy.total_kwh(), 0.05)
        self.assertEqual(len(energy.usage), 3)

    def test_manual_off_and_validation(self):
        pm, _, _ = self.build()
        pm.set_device("luces", False)
        self.assertEqual(pm.draw_w(), 30.0)
        with self.assertRaises(ValueError):
            pm.register("x", 1, "urgente")
        with self.assertRaises(ValueError):
            pm.tick(0)

    def test_persist_in_module(self):
        a = StorageModule()
        a.power.register("camara", 8, "critical")
        a.power.register("luces", 12, "normal")
        a.power.tick(3600)
        snap = a.snapshot()
        b = StorageModule()
        b.restore(snap)
        self.assertEqual(b.power.state()["charge_wh"], a.power.state()["charge_wh"])
        self.assertEqual(sorted(b.power.devices), ["camara", "luces"])


class TestResults(unittest.TestCase):
    def test_record_benchmarks(self):
        m = StorageModule()
        m.record_benchmarks()
        self.assertEqual(len(m.results.rows), 9)
        self.assertEqual(len(m.results.by_lab("memory")), 9)
        self.assertEqual(len(m.results.pending()), 9)
        m.results.mark_synced(9)
        self.assertEqual(m.results.pending(), [])

    def test_custom_result(self):
        r = ResultsRecorder()
        row = r.record("cpu", "Round Robin", {"quantum": 2}, {"espera": 17.6})
        self.assertEqual((row["lab"], row["metrics"]["espera"]), ("cpu", 17.6))


if __name__ == "__main__":
    unittest.main(verbosity=2)
