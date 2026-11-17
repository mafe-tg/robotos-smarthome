from __future__ import annotations

import json
import re
import time
import zlib
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional

LEVELS = {"DEBUG": 10, "INFO": 20, "WARNING": 30, "ERROR": 40, "CRITICAL": 50}
STRATEGIES = ("first", "best", "worst")
REPLACEMENT = ("FIFO", "LRU")


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_iso(value: str) -> float:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


LINE_RE = re.compile(
    r"^\[(?P<ts>[^\]]+)\] \[(?P<level>[A-Z]+)\] \[(?P<source>[^\]]+)\] (?P<message>.*) ~(?P<crc>[0-9a-f]{8})$")


def crc32_hex(text: str) -> str:
    return format(zlib.crc32(text.encode("utf-8")) & 0xFFFFFFFF, "08x")


def parse_log_line(line: str) -> Optional[dict]:
    m = LINE_RE.match(line)
    if not m or m.group("level") not in LEVELS:
        return None
    body = line[: line.rindex(" ~")]
    if crc32_hex(body) != m.group("crc"):
        return None
    return {"ts": m.group("ts"), "level": m.group("level"), "source": m.group("source"),
            "message": m.group("message"), "text": body}


@dataclass
class Block:
    start: int
    size: int
    owner: str


class MemoryManager:
    def __init__(self, total_kb: int = 1024):
        self.total = total_kb
        self.blocks: List[Block] = []

    def holes(self) -> List[tuple]:
        out = []
        cursor = 0
        for b in sorted(self.blocks, key=lambda x: x.start):
            if b.start > cursor:
                out.append((cursor, b.start - cursor))
            cursor = b.start + b.size
        if self.total > cursor:
            out.append((cursor, self.total - cursor))
        return out

    def allocate(self, owner: str, size_kb: int, strategy: str = "first") -> Optional[Block]:
        if size_kb <= 0:
            raise ValueError("El tamaño debe ser positivo")
        if strategy not in STRATEGIES:
            raise ValueError(f"Estrategia inválida: {strategy}")
        fits = [h for h in self.holes() if h[1] >= size_kb]
        if not fits:
            return None
        if strategy == "first":
            start = fits[0][0]
        elif strategy == "best":
            start = min(fits, key=lambda h: (h[1], h[0]))[0]
        else:
            start = max(fits, key=lambda h: (h[1], -h[0]))[0]
        return self._insert(start, size_kb, owner)

    def _insert(self, start: int, size: int, owner: str) -> Block:
        blk = Block(start, size, owner)
        self.blocks.append(blk)
        self.blocks.sort(key=lambda x: x.start)
        return blk

    def free(self, owner: str) -> int:
        freed = sum(b.size for b in self.blocks if b.owner == owner)
        self.blocks = [b for b in self.blocks if b.owner != owner]
        return freed

    def compact(self) -> None:
        cursor = 0
        for b in self.blocks:
            b.start = cursor
            cursor += b.size

    def stats(self) -> dict:
        used = sum(b.size for b in self.blocks)
        return {
            "total_kb": self.total,
            "used_kb": used,
            "free_kb": self.total - used,
            "usage_pct": round(used / self.total * 100, 1),
            "blocks": len(self.blocks),
        }

    def fragmentation(self) -> dict:
        holes = self.holes()
        free = sum(h[1] for h in holes)
        largest = max((h[1] for h in holes), default=0)
        external = round((1 - largest / free) * 100, 1) if free else 0.0
        return {
            "free_kb": free,
            "holes": len(holes),
            "largest_hole_kb": largest,
            "external_pct": external,
        }


def _lcg(seed: int):
    state = seed % 2**32
    while True:
        state = (state * 1664525 + 1013904223) % 2**32
        yield state / 2**32


def make_workload(steps: int = 200, seed: int = 7, min_kb: int = 8, max_kb: int = 128) -> List[dict]:
    rnd = _lcg(seed)
    ops = []
    live = []
    n = 0
    for _ in range(steps):
        r = next(rnd)
        if live and r >= 0.6:
            idx = int(next(rnd) * len(live))
            ops.append({"op": "free", "owner": live.pop(idx)})
        else:
            n += 1
            owner = f"p{n}"
            size = min_kb + int(next(rnd) * (max_kb - min_kb + 1))
            ops.append({"op": "alloc", "owner": owner, "size": size})
            live.append(owner)
    return ops


def benchmark_allocation(total_kb: int = 1024, workload: Optional[List[dict]] = None,
                         strategies=STRATEGIES) -> dict:
    workload = workload or make_workload()
    result = {}
    for strategy in strategies:
        mem = MemoryManager(total_kb)
        done = 0
        failed = 0
        for op in workload:
            if op["op"] == "alloc":
                if mem.allocate(op["owner"], op["size"], strategy) is None:
                    failed += 1
                else:
                    done += 1
            else:
                mem.free(op["owner"])
        frag = mem.fragmentation()
        result[strategy] = {
            "allocated": done,
            "failed": failed,
            "used_pct": mem.stats()["usage_pct"],
            "holes": frag["holes"],
            "largest_hole_kb": frag["largest_hole_kb"],
            "external_pct": frag["external_pct"],
        }
    return result


class VirtualMemory:
    def __init__(self, frames: int = 8, page_kb: int = 4, algorithm: str = "LRU"):
        if algorithm not in REPLACEMENT:
            raise ValueError(f"Algoritmo inválido: {algorithm}")
        self.frames_total = frames
        self.page_kb = page_kb
        self.algorithm = algorithm
        self.frames: List[Optional[dict]] = [None] * frames
        self.tables: Dict[str, Dict[int, int]] = {}
        self.clock = 0
        self.accesses = 0
        self.hits = 0
        self.faults = 0

    def access(self, pid: str, page: int) -> dict:
        self.clock += 1
        self.accesses += 1
        table = self.tables.setdefault(pid, {})
        if page in table:
            frame = table[page]
            self.frames[frame]["last_used"] = self.clock
            self.hits += 1
            return {"hit": True, "frame": frame, "evicted": None}
        self.faults += 1
        evicted = None
        free = [i for i, f in enumerate(self.frames) if f is None]
        if free:
            frame = free[0]
        else:
            key = "loaded_at" if self.algorithm == "FIFO" else "last_used"
            frame = min(range(len(self.frames)), key=lambda i: self.frames[i][key])
            old = self.frames[frame]
            del self.tables[old["pid"]][old["page"]]
            evicted = {"pid": old["pid"], "page": old["page"]}
        self.frames[frame] = {"pid": pid, "page": page, "loaded_at": self.clock, "last_used": self.clock}
        table[page] = frame
        return {"hit": False, "frame": frame, "evicted": evicted}

    def translate(self, pid: str, address_kb: int) -> dict:
        page = address_kb // self.page_kb
        offset = address_kb % self.page_kb
        res = self.access(pid, page)
        return {**res, "page": page, "offset": offset,
                "physical_kb": res["frame"] * self.page_kb + offset}

    def free_process(self, pid: str) -> int:
        table = self.tables.pop(pid, {})
        for frame in table.values():
            self.frames[frame] = None
        return len(table)

    def page_table(self, pid: str) -> List[dict]:
        return [{"page": p, "frame": f} for p, f in sorted(self.tables.get(pid, {}).items())]

    def stats(self) -> dict:
        return {
            "algorithm": self.algorithm,
            "frames": self.frames_total,
            "used_frames": sum(1 for f in self.frames if f is not None),
            "accesses": self.accesses,
            "hits": self.hits,
            "faults": self.faults,
            "hit_ratio_pct": round(self.hits / self.accesses * 100, 1) if self.accesses else 0.0,
        }


def _simulate(reference: List[int], frames: int, algorithm: str) -> int:
    memory: List[int] = []
    last: Dict[int, int] = {}
    faults = 0
    for i, page in enumerate(reference):
        if page in memory:
            last[page] = i
            continue
        faults += 1
        if len(memory) >= frames:
            if algorithm == "FIFO":
                victim = memory[0]
            elif algorithm == "LRU":
                victim = min(memory, key=lambda p: last[p])
            else:
                future = reference[i + 1:]
                victim = max(memory, key=lambda p: future.index(p) if p in future else len(future) + 1)
            memory.remove(victim)
        memory.append(page)
        last[page] = i
    return faults


def compare_replacement(reference: List[int], frames: int) -> dict:
    return {name: _simulate(reference, frames, name) for name in ("FIFO", "LRU", "OPT")}


@dataclass
class VFile:
    content: str
    size: int
    created: float
    modified: float


class VirtualFileSystem:
    def __init__(self, capacity_bytes: int = 10_000_000):
        self.capacity = capacity_bytes
        self.files: Dict[str, VFile] = {}

    @staticmethod
    def _norm(path: str) -> str:
        return "/" + path.strip("/")

    def used(self) -> int:
        return sum(f.size for f in self.files.values())

    def free_space(self) -> int:
        return self.capacity - self.used()

    def write(self, path: str, content: str = "", size: Optional[int] = None,
              append: bool = False) -> bool:
        path = self._norm(path)
        old = self.files.get(path)
        if append and old:
            content = old.content + content
            size = None if size is None else old.size + size
        new_size = size if size is not None else len(content.encode())
        if self.free_space() + (old.size if old else 0) < new_size:
            return False
        now = time.time()
        if old:
            old.content, old.size, old.modified = content, new_size, now
        else:
            self.files[path] = VFile(content, new_size, now, now)
        return True

    def read(self, path: str) -> str:
        path = self._norm(path)
        if path not in self.files:
            raise FileNotFoundError(path)
        return self.files[path].content

    def delete(self, path: str) -> bool:
        return self.files.pop(self._norm(path), None) is not None

    def rename(self, old: str, new: str) -> None:
        old, new = self._norm(old), self._norm(new)
        self.files[new] = self.files.pop(old)

    def exists(self, path: str) -> bool:
        return self._norm(path) in self.files

    def listdir(self, prefix: str = "/") -> List[str]:
        prefix = self._norm(prefix).rstrip("/") + "/"
        return sorted(p for p in self.files if p.startswith(prefix))

    def to_rows(self) -> List[dict]:
        return [
            {"path": p, "content": f.content, "size_bytes": f.size,
             "created_at": _iso(f.created), "modified_at": _iso(f.modified)}
            for p, f in sorted(self.files.items())
        ]

    def from_rows(self, rows: List[dict]) -> None:
        self.files = {}
        for r in rows:
            created = _parse_iso(r["created_at"]) if r.get("created_at") else time.time()
            modified = _parse_iso(r["modified_at"]) if r.get("modified_at") else created
            self.files[self._norm(r["path"])] = VFile(
                r.get("content") or "", int(r.get("size_bytes") or 0), created, modified)


class LogManager:
    def __init__(self, fs: VirtualFileSystem, path: str = "/logs/system.log",
                 max_bytes: int = 2000, keep: int = 3):
        self.fs, self.path, self.max_bytes, self.keep = fs, path, max_bytes, keep
        self.entries: List[dict] = []
        self.synced = 0

    @staticmethod
    def _format(created_at: str, level: str, source: str, message: str) -> str:
        body = f"[{created_at}] [{level}] [{source}] {message}"
        return f"{body} ~{crc32_hex(body)}\n"

    def log(self, level: str, source: str, message: str) -> None:
        level = level.upper()
        if level not in LEVELS:
            raise ValueError(f"Nivel inválido: {level}")
        message = str(message).replace("\r", " ").replace("\n", " ")
        created_at = _iso(time.time())
        line = self._format(created_at, level, source, message)
        if (self.fs.exists(self.path)
                and self.fs.files[self.fs._norm(self.path)].size + len(line) > self.max_bytes):
            self._rotate()
        self.fs.write(self.path, line, append=True)
        self.entries.append({"created_at": created_at, "level": level,
                             "source": source, "message": message})

    def _rotate(self) -> None:
        self.fs.delete(f"{self.path}.{self.keep}")
        for i in range(self.keep - 1, 0, -1):
            if self.fs.exists(f"{self.path}.{i}"):
                self.fs.rename(f"{self.path}.{i}", f"{self.path}.{i + 1}")
        self.fs.rename(self.path, f"{self.path}.1")

    def _paths(self) -> List[str]:
        names = [f"{self.path}.{i}" for i in range(self.keep, 0, -1)] + [self.path]
        return [p for p in names if self.fs.exists(p)]

    def query(self, min_level: str = "DEBUG", source: Optional[str] = None) -> List[str]:
        if not self.fs.exists(self.path):
            return []
        out = []
        for line in self.fs.read(self.path).split("\n"):
            parsed = parse_log_line(line)
            if parsed is None:
                continue
            if LEVELS[parsed["level"]] >= LEVELS[min_level.upper()] and (
                    source is None or parsed["source"] == source):
                out.append(parsed["text"])
        return out

    def verify(self) -> dict:
        report = []
        total = 0
        corrupt = 0
        for p in self._paths():
            raw = self.fs.read(p)
            lines = [l for l in raw.split("\n") if l != ""]
            bad = sum(1 for l in lines if parse_log_line(l) is None)
            report.append({"path": p, "lines": len(lines), "corrupt": bad,
                           "torn_tail": bool(raw) and not raw.endswith("\n")})
            total += len(lines)
            corrupt += bad
        return {"files": report, "total": total, "corrupt": corrupt}

    def recover(self) -> dict:
        kept = 0
        discarded = 0
        touched = []
        for p in self._paths():
            raw = self.fs.read(p)
            lines = [l for l in raw.split("\n") if l != ""]
            good = [l for l in lines if parse_log_line(l) is not None]
            kept += len(good)
            discarded += len(lines) - len(good)
            if len(good) != len(lines) or (raw and not raw.endswith("\n")):
                self.fs.write(p, "".join(l + "\n" for l in good))
                touched.append(p)
        rebuilt = False
        if not self.fs.exists(self.path) and self.entries:
            text = "".join(self._format(e["created_at"], e["level"], e["source"], e["message"])
                           for e in self.entries)
            self.fs.write(self.path, text)
            kept += len(self.entries)
            rebuilt = True
        result = {"kept": kept, "discarded": discarded, "rebuilt": rebuilt, "files": touched}
        self.log("INFO", "logs",
                 f"Recuperación de logs: {kept} líneas válidas, {discarded} descartadas, reconstruido={rebuilt}")
        return result

    def simulate_crash(self, mode: str = "truncate") -> str:
        if mode not in ("truncate", "corrupt", "delete"):
            raise ValueError(f"Modo inválido: {mode}")
        if not self.fs.exists(self.path):
            return "no hay log principal"
        if mode == "delete":
            self.fs.delete(self.path)
            return "log principal eliminado"
        raw = self.fs.read(self.path)
        if mode == "truncate":
            self.fs.write(self.path, raw[: max(0, len(raw) - 20)])
            return "última línea truncada"
        lines = raw.split("\n")
        nonempty = [i for i, l in enumerate(lines) if l]
        target = nonempty[len(nonempty) // 2]
        line = lines[target]
        i = line.rindex(" ~")
        lines[target] = line[: i - 1] + ("X" if line[i - 1] != "X" else "Y") + line[i:]
        self.fs.write(self.path, "\n".join(lines))
        return f"línea {target + 1} alterada"

    def pending(self) -> List[dict]:
        return self.entries[self.synced:]

    def mark_synced(self, count: int) -> None:
        self.synced += count


class SurveillanceStorage:
    def __init__(self, fs: VirtualFileSystem, logs: LogManager):
        self.fs, self.logs = fs, logs
        self.clips: Dict[str, dict] = {}
        self.seq = 0

    def save_clip(self, camera_id: str, size_mb: float, protected: bool = False) -> Optional[str]:
        size = int(size_mb * 1_000_000)
        self.seq += 1
        seq = self.seq
        path = f"/surveillance/{camera_id}/{int(time.time() * 1000)}-{seq}.clip"
        while not self.fs.write(path, f"clip:{camera_id}:{seq}", size=size):
            if not self._evict_oldest():
                self.logs.log("ERROR", "surveillance",
                              f"Sin espacio para clip de {camera_id} ({size_mb} MB)")
                return None
        self.clips[path] = {"camera": camera_id, "seq": seq, "protected": protected,
                            "size_mb": size_mb, "recorded_at": _iso(time.time())}
        self.logs.log("INFO", "surveillance",
                      f"Clip guardado {path} ({size_mb} MB, protegido={protected})")
        return path

    def _evict_oldest(self) -> bool:
        candidates = sorted((c["seq"], p) for p, c in self.clips.items() if not c["protected"])
        if not candidates:
            return False
        _, path = candidates[0]
        self.fs.delete(path)
        del self.clips[path]
        self.logs.log("WARNING", "surveillance", f"Clip antiguo eliminado: {path}")
        return True

    def protect(self, path: str) -> None:
        if path in self.clips:
            self.clips[path]["protected"] = True

    def to_rows(self) -> List[dict]:
        return [
            {"camera_id": c["camera"], "path": p, "size_mb": c["size_mb"],
             "is_protected": c["protected"], "recorded_at": c["recorded_at"]}
            for p, c in sorted(self.clips.items(), key=lambda kv: kv[1]["seq"])
        ]

    def from_rows(self, rows: List[dict]) -> None:
        ordered = sorted(rows, key=lambda r: r.get("recorded_at") or "")
        self.clips = {}
        for i, r in enumerate(ordered, 1):
            self.clips[r["path"]] = {
                "camera": r["camera_id"], "seq": i, "protected": bool(r.get("is_protected")),
                "size_mb": float(r["size_mb"]), "recorded_at": r.get("recorded_at") or _iso(time.time())}
        self.seq = len(ordered)


class EnergyMonitor:
    def __init__(self, logs: LogManager, threshold_kwh: float = 5.0, price_kwh: float = 700.0):
        self.logs = logs
        self.threshold = threshold_kwh
        self.price = price_kwh
        self.watts: Dict[str, float] = {}
        self.wh: Dict[str, float] = {}
        self.usage: List[dict] = []
        self.synced = 0

    def register(self, device: str, watts: float) -> None:
        self.watts[device] = watts
        self.wh.setdefault(device, 0.0)

    def record_usage(self, device: str, seconds: float) -> None:
        if device not in self.watts:
            raise KeyError(f"Dispositivo no registrado: {device}")
        self.wh[device] += self.watts[device] * seconds / 3600
        self.usage.append({"device": device, "seconds": seconds, "recorded_at": _iso(time.time())})
        if self.total_kwh() > self.threshold:
            self.logs.log("WARNING", "energy",
                          f"Consumo total {self.total_kwh():.2f} kWh supera el umbral de {self.threshold} kWh")

    def total_kwh(self) -> float:
        return sum(self.wh.values()) / 1000

    def report(self) -> dict:
        return {
            "por_dispositivo_kwh": {d: round(v / 1000, 4) for d, v in self.wh.items()},
            "total_kwh": round(self.total_kwh(), 4),
            "costo_estimado": round(self.total_kwh() * self.price, 2),
        }

    def device_rows(self) -> List[dict]:
        return [{"device": d, "watts": w} for d, w in self.watts.items()]

    def pending(self) -> List[dict]:
        return self.usage[self.synced:]

    def mark_synced(self, count: int) -> None:
        self.synced += count

    def restore(self, devices: List[dict], usage: List[dict]) -> None:
        self.watts = {d["device"]: float(d["watts"]) for d in devices}
        self.wh = {d: 0.0 for d in self.watts}
        self.usage = [{"device": u["device"], "seconds": float(u["seconds"]),
                       "recorded_at": u.get("recorded_at") or _iso(time.time())} for u in usage]
        for u in self.usage:
            if u["device"] in self.watts:
                self.wh[u["device"]] += self.watts[u["device"]] * u["seconds"] / 3600
        self.synced = len(self.usage)


PRIORITIES = ("critical", "normal", "low")
POWER_MODES = ("NORMAL", "SAVER", "CRITICAL")


class PowerManager:
    def __init__(self, logs: LogManager, energy: Optional[EnergyMonitor] = None,
                 capacity_wh: float = 200.0, charge_wh: Optional[float] = None,
                 saver_pct: float = 30.0, critical_pct: float = 15.0, charger_w: float = 60.0):
        self.logs = logs
        self.energy = energy
        self.capacity = float(capacity_wh)
        self.charge = self.capacity if charge_wh is None else float(charge_wh)
        self.saver_pct = saver_pct
        self.critical_pct = critical_pct
        self.charger_w = charger_w
        self.devices: Dict[str, dict] = {}
        self.charging = False
        self.mode = "NORMAL"
        self.shutdown = False

    def register(self, name: str, watts: float, priority: str = "normal", on: bool = True) -> None:
        if priority not in PRIORITIES:
            raise ValueError(f"Prioridad inválida: {priority}")
        self.devices[name] = {"watts": float(watts), "priority": priority, "on": on, "suspended": False}
        if self.energy is not None:
            self.energy.register(name, float(watts))
        self._apply_mode()

    def set_device(self, name: str, on: bool) -> None:
        self.devices[name]["on"] = on

    def set_charging(self, flag: bool) -> None:
        self.charging = bool(flag)

    def battery_pct(self) -> float:
        return round(self.charge / self.capacity * 100, 1)

    def _active(self) -> List[str]:
        return sorted(n for n, d in self.devices.items() if d["on"] and not d["suspended"])

    def draw_w(self) -> float:
        return round(sum(self.devices[n]["watts"] for n in self._active()), 2)

    def runtime_hours(self) -> Optional[float]:
        draw = self.draw_w()
        return None if draw <= 0 else round(self.charge / draw, 2)

    def _compute_mode(self) -> str:
        pct = self.charge / self.capacity * 100
        if pct < self.critical_pct:
            return "CRITICAL"
        if self.mode == "CRITICAL" and pct < self.critical_pct + 5:
            return "CRITICAL"
        if pct < self.saver_pct:
            return "SAVER"
        if self.mode in ("SAVER", "CRITICAL") and pct < self.saver_pct + 5:
            return "SAVER"
        return "NORMAL"

    def _apply_mode(self) -> dict:
        suspend = {"NORMAL": set(), "SAVER": {"low"}, "CRITICAL": {"low", "normal"}}[self.mode]
        if self.shutdown:
            suspend = set(PRIORITIES)
        changed = {"suspended": [], "resumed": []}
        for name, d in sorted(self.devices.items()):
            want = d["priority"] in suspend
            if want and not d["suspended"]:
                d["suspended"] = True
                changed["suspended"].append(name)
            elif not want and d["suspended"]:
                d["suspended"] = False
                changed["resumed"].append(name)
        return changed

    def tick(self, seconds: float) -> dict:
        if seconds <= 0:
            raise ValueError("El tiempo debe ser positivo")
        draw = self.draw_w()
        if self.energy is not None:
            for name in self._active():
                self.energy.record_usage(name, seconds)
        net = (self.charger_w if self.charging else 0.0) - draw
        self.charge = min(self.capacity, max(0.0, self.charge + net * seconds / 3600))
        pct = self.charge / self.capacity * 100
        if not self.shutdown and self.charge <= 0:
            self.shutdown = True
            self.mode = "CRITICAL"
            self._apply_mode()
            self.logs.log("CRITICAL", "power", "Batería agotada: apagado de emergencia")
        elif self.shutdown:
            if pct >= self.critical_pct:
                self.shutdown = False
                self.mode = self._compute_mode()
                self._apply_mode()
                self.logs.log("INFO", "power",
                              f"Sistema reiniciado con {self.battery_pct()}% de batería (modo {self.mode})")
        else:
            new = self._compute_mode()
            if new != self.mode:
                previous = self.mode
                self.mode = new
                changed = self._apply_mode()
                level = {"NORMAL": "INFO", "SAVER": "WARNING", "CRITICAL": "CRITICAL"}[new]
                detail = ""
                if changed["suspended"]:
                    detail += " Suspendidos: " + ", ".join(changed["suspended"]) + "."
                if changed["resumed"]:
                    detail += " Reanudados: " + ", ".join(changed["resumed"]) + "."
                self.logs.log(level, "power",
                              f"Modo de energía {previous} -> {new} (batería {pct:.1f}%).{detail}")
        return self.state()

    def state(self) -> dict:
        return {
            "mode": self.mode,
            "battery_pct": self.battery_pct(),
            "charge_wh": round(self.charge, 2),
            "capacity_wh": self.capacity,
            "charging": self.charging,
            "draw_w": self.draw_w(),
            "runtime_h": self.runtime_hours(),
            "active": self._active(),
            "suspended": sorted(n for n, d in self.devices.items() if d["suspended"]),
            "shutdown": self.shutdown,
        }

    def to_dict(self) -> dict:
        return {
            "capacity_wh": self.capacity, "charge_wh": self.charge, "charging": self.charging,
            "mode": self.mode, "shutdown": self.shutdown, "saver_pct": self.saver_pct,
            "critical_pct": self.critical_pct, "charger_w": self.charger_w,
            "devices": [{"name": n, **d} for n, d in sorted(self.devices.items())],
        }

    def from_dict(self, data: dict) -> None:
        self.capacity = float(data["capacity_wh"])
        self.charge = float(data["charge_wh"])
        self.charging = bool(data.get("charging", False))
        self.mode = data.get("mode", "NORMAL")
        self.shutdown = bool(data.get("shutdown", False))
        self.saver_pct = data.get("saver_pct", self.saver_pct)
        self.critical_pct = data.get("critical_pct", self.critical_pct)
        self.charger_w = data.get("charger_w", self.charger_w)
        self.devices = {}
        for d in data.get("devices", []):
            self.devices[d["name"]] = {"watts": float(d["watts"]), "priority": d["priority"],
                                       "on": bool(d["on"]), "suspended": bool(d["suspended"])}
            if self.energy is not None:
                self.energy.register(d["name"], float(d["watts"]))


class ResultsRecorder:
    def __init__(self):
        self.rows: List[dict] = []
        self.synced = 0

    def record(self, lab: str, name: str, params: Optional[dict] = None,
               metrics: Optional[dict] = None) -> dict:
        row = {"lab": lab, "name": name, "params": params or {}, "metrics": metrics or {},
               "created_at": _iso(time.time())}
        self.rows.append(row)
        return row

    def by_lab(self, lab: str) -> List[dict]:
        return [r for r in self.rows if r["lab"] == lab]

    def pending(self) -> List[dict]:
        return self.rows[self.synced:]

    def mark_synced(self, count: int) -> None:
        self.synced += count


POWER_FILE = "/config/power.json"


class StorageModule:
    def __init__(self, ram_kb: int = 1024, disk_bytes: int = 10_000_000,
                 frames: int = 8, page_kb: int = 4, algorithm: str = "LRU"):
        self.memory = MemoryManager(ram_kb)
        self.vmem = VirtualMemory(frames, page_kb, algorithm)
        self.fs = VirtualFileSystem(disk_bytes)
        self.logs = LogManager(self.fs)
        self.surveillance = SurveillanceStorage(self.fs, self.logs)
        self.energy = EnergyMonitor(self.logs)
        self.power = PowerManager(self.logs, self.energy)
        self.results = ResultsRecorder()
        self.logs.log("INFO", "storage", "Módulo de almacenamiento iniciado")

    def status(self) -> dict:
        return {
            "memoria": self.memory.stats(),
            "fragmentacion": self.memory.fragmentation(),
            "memoria_virtual": self.vmem.stats(),
            "disco_usado_bytes": self.fs.used(),
            "disco_libre_bytes": self.fs.free_space(),
            "clips": len(self.surveillance.clips),
            "energia": self.energy.report(),
            "bateria": self.power.state(),
        }

    def run_benchmarks(self, total_kb: int = 1024, steps: int = 200, seed: int = 7) -> dict:
        belady = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5]
        return {
            "allocation": benchmark_allocation(total_kb, make_workload(steps, seed)),
            "replacement": {
                "frames_3": compare_replacement(belady, 3),
                "frames_4": compare_replacement(belady, 4),
            },
        }

    def record_benchmarks(self, total_kb: int = 1024, steps: int = 200, seed: int = 7) -> dict:
        result = self.run_benchmarks(total_kb, steps, seed)
        for strategy, metrics in result["allocation"].items():
            self.results.record("memory", f"allocation:{strategy}",
                                {"total_kb": total_kb, "steps": steps, "seed": seed}, metrics)
        for label, counts in result["replacement"].items():
            for algorithm, faults in counts.items():
                self.results.record("memory", f"replacement:{algorithm}",
                                    {"frames": label}, {"faults": faults})
        return result

    def record_result(self, lab: str, name: str, params: Optional[dict] = None,
                      metrics: Optional[dict] = None) -> dict:
        return self.results.record(lab, name, params, metrics)

    def save_power(self) -> bool:
        return self.fs.write(POWER_FILE, json.dumps(self.power.to_dict(), ensure_ascii=False))

    def load_power(self) -> bool:
        if not self.fs.exists(POWER_FILE):
            return False
        self.power.from_dict(json.loads(self.fs.read(POWER_FILE)))
        return True

    def snapshot(self) -> dict:
        self.save_power()
        return {
            "memory_blocks": [{"owner": b.owner, "start_kb": b.start, "size_kb": b.size}
                              for b in self.memory.blocks],
            "files": self.fs.to_rows(),
            "logs": [dict(e) for e in self.logs.entries],
            "clips": self.surveillance.to_rows(),
            "energy_devices": self.energy.device_rows(),
            "energy_usage": [dict(u) for u in self.energy.usage],
            "results": [dict(r) for r in self.results.rows],
        }

    def restore(self, data: dict) -> None:
        if data.get("memory_blocks"):
            self.memory.blocks = sorted(
                (Block(r["start_kb"], r["size_kb"], r["owner"]) for r in data["memory_blocks"]),
                key=lambda b: b.start)
        if data.get("files"):
            self.fs.from_rows(data["files"])
        if data.get("logs"):
            self.logs.entries = [dict(e) for e in data["logs"]]
            self.logs.synced = len(self.logs.entries)
        if data.get("clips"):
            self.surveillance.from_rows(data["clips"])
        if data.get("energy_devices") or data.get("energy_usage"):
            self.energy.restore(data.get("energy_devices", []), data.get("energy_usage", []))
        self.load_power()

    def save_json(self, path: str) -> None:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(self.snapshot(), fh, ensure_ascii=False, indent=2)

    def load_json(self, path: str) -> None:
        with open(path, "r", encoding="utf-8") as fh:
            self.restore(json.load(fh))


if __name__ == "__main__":
    mod = StorageModule(ram_kb=512, disk_bytes=5_000_000)

    for dev, kb in [("luces", 100), ("camara_1", 200), ("cerradura", 50)]:
        mod.memory.allocate(dev, kb)
    mod.memory.free("luces")
    print("Asignar 150 KB:", mod.memory.allocate("clima", 150, "best"))
    print("Fragmentación:", mod.memory.fragmentation())

    for page in [1, 2, 3, 1, 4, 1, 2]:
        mod.vmem.access("lighting_daemon", page)
    print("Memoria virtual:", mod.vmem.stats())

    print("Benchmark:", mod.record_benchmarks()["replacement"])

    mod.power.register("cerradura", 5, "critical")
    mod.power.register("camara_1", 8, "critical")
    mod.power.register("luces_sala", 12, "normal")
    mod.power.register("decoracion", 20, "low")
    for _ in range(8):
        mod.power.tick(3600)
    print("Batería:", mod.power.state())
    print("Crash:", mod.logs.simulate_crash("corrupt"))
    print("Verificación:", mod.logs.verify()["corrupt"], "líneas corruptas")
    print("Recuperación:", mod.logs.recover())

    for i in range(4):
        mod.surveillance.save_clip("camara_1", 1.5, protected=(i == 1))
    mod.energy.register("aire_acondicionado", 1500)
    mod.energy.record_usage("aire_acondicionado", 4 * 3600)
    mod.save_json("robotos_storage.json")
    other = StorageModule(ram_kb=512, disk_bytes=5_000_000)
    other.load_json("robotos_storage.json")
    print("Recuperado:", len(other.fs.files), "archivos,", len(other.logs.entries), "logs")
