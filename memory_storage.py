from __future__ import annotations
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional
LEVELS = {'DEBUG': 10, 'INFO': 20, 'WARNING': 30, 'ERROR': 40, 'CRITICAL': 50}

@dataclass
class Block:
    start: int
    size: int
    owner: str

class MemoryManager:

    def __init__(self, total_kb: int=1024):
        self.total = total_kb
        self.blocks: List[Block] = []

    def allocate(self, owner: str, size_kb: int) -> Optional[Block]:
        if size_kb <= 0:
            raise ValueError('El tamaño debe ser positivo')
        cursor = 0
        for i, b in enumerate(sorted(self.blocks, key=lambda x: x.start)):
            if b.start - cursor >= size_kb:
                return self._insert(cursor, size_kb, owner)
            cursor = b.start + b.size
        if self.total - cursor >= size_kb:
            return self._insert(cursor, size_kb, owner)
        return None

    def _insert(self, start: int, size: int, owner: str) -> Block:
        blk = Block(start, size, owner)
        self.blocks.append(blk)
        self.blocks.sort(key=lambda x: x.start)
        return blk

    def free(self, owner: str) -> int:
        freed = sum((b.size for b in self.blocks if b.owner == owner))
        self.blocks = [b for b in self.blocks if b.owner != owner]
        return freed

    def compact(self) -> None:
        cursor = 0
        for b in self.blocks:
            b.start = cursor
            cursor += b.size

    def stats(self) -> dict:
        used = sum((b.size for b in self.blocks))
        return {'total_kb': self.total, 'used_kb': used, 'free_kb': self.total - used, 'usage_pct': round(used / self.total * 100, 1), 'blocks': len(self.blocks)}

@dataclass
class VFile:
    content: str
    size: int
    created: float = field(default_factory=time.time)
    modified: float = field(default_factory=time.time)

class VirtualFileSystem:

    def __init__(self, capacity_bytes: int=10000000):
        self.capacity = capacity_bytes
        self.files: Dict[str, VFile] = {}

    @staticmethod
    def _norm(path: str) -> str:
        return '/' + path.strip('/')

    def used(self) -> int:
        return sum((f.size for f in self.files.values()))

    def free_space(self) -> int:
        return self.capacity - self.used()

    def write(self, path: str, content: str='', size: Optional[int]=None, append: bool=False) -> bool:
        path = self._norm(path)
        old = self.files.get(path)
        if append and old:
            content = old.content + content
            size = None if size is None else old.size + size
        new_size = size if size is not None else len(content.encode())
        if self.free_space() + (old.size if old else 0) < new_size:
            return False
        if old:
            old.content, old.size, old.modified = (content, new_size, time.time())
        else:
            self.files[path] = VFile(content, new_size)
        return True

    def read(self, path: str) -> str:
        path = self._norm(path)
        if path not in self.files:
            raise FileNotFoundError(path)
        return self.files[path].content

    def delete(self, path: str) -> bool:
        return self.files.pop(self._norm(path), None) is not None

    def rename(self, old: str, new: str) -> None:
        old, new = (self._norm(old), self._norm(new))
        self.files[new] = self.files.pop(old)

    def exists(self, path: str) -> bool:
        return self._norm(path) in self.files

    def listdir(self, prefix: str='/') -> List[str]:
        prefix = self._norm(prefix).rstrip('/') + '/'
        return sorted((p for p in self.files if p.startswith(prefix)))

class LogManager:

    def __init__(self, fs: VirtualFileSystem, path: str='/logs/system.log', max_bytes: int=2000, keep: int=3):
        self.fs, self.path, self.max_bytes, self.keep = (fs, path, max_bytes, keep)

    def log(self, level: str, source: str, message: str) -> None:
        level = level.upper()
        if level not in LEVELS:
            raise ValueError(f'Nivel inválido: {level}')
        ts = time.strftime('%Y-%m-%d %H:%M:%S')
        line = f'[{ts}] [{level}] [{source}] {message}\n'
        if self.fs.exists(self.path) and self.fs.files[self.fs._norm(self.path)].size + len(line) > self.max_bytes:
            self._rotate()
        self.fs.write(self.path, line, append=True)

    def _rotate(self) -> None:
        oldest = f'{self.path}.{self.keep}'
        self.fs.delete(oldest)
        for i in range(self.keep - 1, 0, -1):
            if self.fs.exists(f'{self.path}.{i}'):
                self.fs.rename(f'{self.path}.{i}', f'{self.path}.{i + 1}')
        self.fs.rename(self.path, f'{self.path}.1')

    def query(self, min_level: str='DEBUG', source: Optional[str]=None) -> List[str]:
        if not self.fs.exists(self.path):
            return []
        out = []
        for line in self.fs.read(self.path).splitlines():
            lvl = line.split('] [')[1]
            src = line.split('] [')[2].rstrip(']').split(']')[0]
            if LEVELS[lvl] >= LEVELS[min_level.upper()] and (source is None or src == source):
                out.append(line)
        return out

class SurveillanceStorage:

    def __init__(self, fs: VirtualFileSystem, logs: LogManager):
        self.fs, self.logs = (fs, logs)
        self.clips: Dict[str, dict] = {}

    def save_clip(self, camera_id: str, size_mb: float, protected: bool=False) -> Optional[str]:
        size = int(size_mb * 1000000)
        ts = int(time.time() * 1000)
        path = f'/surveillance/{camera_id}/{ts}.clip'
        while not self.fs.write(path, f'clip:{camera_id}:{ts}', size=size):
            if not self._evict_oldest():
                self.logs.log('ERROR', 'surveillance', f'Sin espacio para clip de {camera_id} ({size_mb} MB)')
                return None
        self.clips[path] = {'camera': camera_id, 'ts': ts, 'protected': protected}
        self.logs.log('INFO', 'surveillance', f'Clip guardado {path} ({size_mb} MB, protegido={protected})')
        return path

    def _evict_oldest(self) -> bool:
        candidates = sorted(((c['ts'], p) for p, c in self.clips.items() if not c['protected']))
        if not candidates:
            return False
        _, path = candidates[0]
        self.fs.delete(path)
        del self.clips[path]
        self.logs.log('WARNING', 'surveillance', f'Clip antiguo eliminado: {path}')
        return True

    def protect(self, path: str) -> None:
        if path in self.clips:
            self.clips[path]['protected'] = True

class EnergyMonitor:

    def __init__(self, logs: LogManager, threshold_kwh: float=5.0, price_kwh: float=700.0):
        self.logs = logs
        self.threshold = threshold_kwh
        self.price = price_kwh
        self.watts: Dict[str, float] = {}
        self.wh: Dict[str, float] = {}

    def register(self, device: str, watts: float) -> None:
        self.watts[device] = watts
        self.wh.setdefault(device, 0.0)

    def record_usage(self, device: str, seconds: float) -> None:
        if device not in self.watts:
            raise KeyError(f'Dispositivo no registrado: {device}')
        self.wh[device] += self.watts[device] * seconds / 3600
        if self.total_kwh() > self.threshold:
            self.logs.log('WARNING', 'energy', f'Consumo total {self.total_kwh():.2f} kWh supera el umbral de {self.threshold} kWh')

    def total_kwh(self) -> float:
        return sum(self.wh.values()) / 1000

    def report(self) -> dict:
        return {'por_dispositivo_kwh': {d: round(v / 1000, 4) for d, v in self.wh.items()}, 'total_kwh': round(self.total_kwh(), 4), 'costo_estimado': round(self.total_kwh() * self.price, 2)}

class StorageModule:

    def __init__(self, ram_kb: int=1024, disk_bytes: int=10000000):
        self.memory = MemoryManager(ram_kb)
        self.fs = VirtualFileSystem(disk_bytes)
        self.logs = LogManager(self.fs)
        self.surveillance = SurveillanceStorage(self.fs, self.logs)
        self.energy = EnergyMonitor(self.logs)
        self.logs.log('INFO', 'storage', 'Módulo de almacenamiento iniciado')

    def status(self) -> dict:
        return {'memoria': self.memory.stats(), 'disco_usado_bytes': self.fs.used(), 'disco_libre_bytes': self.fs.free_space(), 'clips': len(self.surveillance.clips), 'energia': self.energy.report()}
if __name__ == '__main__':
    mod = StorageModule(ram_kb=512, disk_bytes=5000000)
    for dev, kb in [('luces', 100), ('camara_1', 200), ('cerradura', 50)]:
        mod.memory.allocate(dev, kb)
    mod.memory.free('luces')
    print('Asignar 150 KB:', mod.memory.allocate('clima', 150))
    mod.memory.compact()
    print('Memoria:', mod.memory.stats())
    for i in range(4):
        mod.surveillance.save_clip('camara_1', 1.5, protected=i == 1)
        time.sleep(0.002)
    print('Clips guardados:', len(mod.surveillance.clips))
    mod.energy.register('luces_sala', 12)
    mod.energy.register('aire_acondicionado', 1500)
    mod.energy.record_usage('luces_sala', 6 * 3600)
    mod.energy.record_usage('aire_acondicionado', 4 * 3600)
    print('Energía:', mod.energy.report())
    print('\n--- Logs WARNING+ ---')
    for line in mod.logs.query('WARNING'):
        print(line)
    print('\nArchivos en /logs:', mod.fs.listdir('/logs'))
