import React, { useState } from 'react';
import { useSystem } from '../context/SystemContext';
import { useAuth } from '../context/AuthContext';

// Paleta de colores para los procesos en el mapa de memoria
const OWNER_PALETTE = {
  lighting_daemon: { bg: 'bg-emerald-950/90', border: 'border-emerald-500/80', text: 'text-emerald-300', bar: '#10B981' },
  surveillance_proc: { bg: 'bg-blue-950/90', border: 'border-blue-500/80', text: 'text-blue-300', bar: '#3B82F6' },
  lock_guard: { bg: 'bg-rose-950/90', border: 'border-rose-500/80', text: 'text-rose-300', bar: '#F43F5E' },
  temp_manager: { bg: 'bg-amber-950/90', border: 'border-amber-500/80', text: 'text-amber-300', bar: '#F59E0B' },
  routine_engine: { bg: 'bg-cyan-950/90', border: 'border-cyan-500/80', text: 'text-cyan-300', bar: '#06B6D4' },
  energy_monitor: { bg: 'bg-purple-950/90', border: 'border-purple-500/80', text: 'text-purple-300', bar: '#8B5CF6' },
  luces: { bg: 'bg-emerald-950/90', border: 'border-emerald-500/80', text: 'text-emerald-300', bar: '#10B981' },
  seguridad: { bg: 'bg-blue-950/90', border: 'border-blue-500/80', text: 'text-blue-300', bar: '#3B82F6' },
  clima: { bg: 'bg-amber-950/90', border: 'border-amber-500/80', text: 'text-amber-300', bar: '#F59E0B' },
  camaras: { bg: 'bg-purple-950/90', border: 'border-purple-500/80', text: 'text-purple-300', bar: '#8B5CF6' },
  dashboard: { bg: 'bg-cyan-950/90', border: 'border-cyan-500/80', text: 'text-cyan-300', bar: '#06B6D4' },
};

const getBlockStyle = (owner) =>
  OWNER_PALETTE[owner] || {
    bg: 'bg-sky-950/90',
    border: 'border-sky-500/80',
    text: 'text-sky-300',
    bar: '#38BDF8',
  };

export const MemoryPage = () => {
  const {
    memoryBlocks,
    memoryStats,
    compactMemory,
    freeMemoryBlock,
    vfsStats,
    vfsFiles,
    surveillanceClips,
    addLog,
  } = useSystem();
  const { role, checkPermission } = useAuth();

  const [activeFolderTab, setActiveFolderTab] = useState('ALL');
  const [selectedFile, setSelectedFile] = useState(null);

  // Acción de compactar (exclusiva ADMIN)
  const handleCompact = () => {
    if (checkPermission('ADMIN', 'Compactación de memoria RAM física (compact)', addLog)) {
      compactMemory();
    }
  };

  // Liberar bloque manualmente (exclusivo ADMIN)
  const handleFreeBlock = (block) => {
    if (
      checkPermission(
        'ADMIN',
        `Liberar manualmente bloque de memoria "${block.owner}" (${block.size} KB)`,
        addLog
      )
    ) {
      freeMemoryBlock(block.owner);
    }
  };

  // Calcular segmentos contiguos para la barra lineal (bloques ocupados y huecos libres)
  const sortedBlocks = [...memoryBlocks].sort((a, b) => a.start - b.start);
  const segments = [];
  let cursor = 0;

  for (const b of sortedBlocks) {
    if (b.start > cursor) {
      segments.push({
        type: 'FREE',
        start: cursor,
        size: b.start - cursor,
        owner: 'LIBRE',
      });
    }
    segments.push({
      type: 'ALLOCATED',
      start: b.start,
      size: b.size,
      owner: b.owner,
      id: b.id,
      style: getBlockStyle(b.owner),
    });
    cursor = b.start + b.size;
  }

  if (cursor < 1024) {
    segments.push({
      type: 'FREE',
      start: cursor,
      size: 1024 - cursor,
      owner: 'LIBRE',
    });
  }

  // Filtrado de archivos del VFS
  const filteredFiles = vfsFiles.filter((f) => {
    if (activeFolderTab === 'ALL') return true;
    if (activeFolderTab === '/config') return f.path.startsWith('/config');
    if (activeFolderTab === '/logs') return f.path.startsWith('/logs');
    if (activeFolderTab === '/surveillance') return f.path.startsWith('/surveillance');
    return true;
  });

  const formatBytes = (bytes) => {
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
    return `${bytes} Bytes`;
  };

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white">
            Memoria & Sistema de Archivos (VFS)
          </h2>
          <p className="text-xs text-slate-400">
            Modelo operativo de Dana: asignación dinámica en 1024 KB de RAM (MemoryManager) y VirtualFileSystem con clips de vigilancia.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleCompact}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs tracking-wide shadow-lg shadow-cyan-600/30 transition-all flex items-center space-x-2 cursor-pointer"
            title="Compactar memoria RAM: reubica bloques al inicio eliminando la fragmentación externa"
          >
            <span>🗜️ Compactar Memoria</span>
            {role !== 'ADMIN' && <span className="text-[10px] text-cyan-200">(Solo ADMIN)</span>}
          </button>
          <div className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-400">
            Rol: <span className="font-bold">{role}</span>
          </div>
        </div>
      </div>

      {/* Tarjetas de Métricas de Memoria de Dana */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-[10px] font-mono uppercase text-slate-500">Capacidad Total</div>
          <div className="text-xl font-black text-white mt-0.5">{memoryStats.totalKb} KB</div>
          <div className="text-xs font-mono text-slate-400">1.0 MB memoria física</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-cyan-900/40">
          <div className="text-[10px] font-mono uppercase text-cyan-400">Memoria Usada</div>
          <div className="text-xl font-black text-cyan-300 mt-0.5">{memoryStats.usedKb} KB</div>
          <div className="text-xs font-mono text-cyan-400/80">{memoryStats.usagePct}% ocupado</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-emerald-900/40">
          <div className="text-[10px] font-mono uppercase text-emerald-400">Memoria Disponible</div>
          <div className="text-xl font-black text-emerald-400 mt-0.5">{memoryStats.freeKb} KB</div>
          <div className="text-xs font-mono text-emerald-400/80">
            {(100 - memoryStats.usagePct).toFixed(1)}% libre
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-purple-900/40">
          <div className="text-[10px] font-mono uppercase text-purple-400">Bloques Asignados</div>
          <div className="text-xl font-black text-purple-300 mt-0.5">{memoryBlocks.length}</div>
          <div className="text-xs font-mono text-purple-400/80">Tamaño dinámico variable</div>
        </div>
      </div>

      {/* 1. REPRESENTACIÓN VISUAL CONTINUA DE MEMORIA RAM (0 KB a 1024 KB) */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800/80 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">
              Mapa Físico de Memoria RAM (Espacio de Direcciones 0 a 1024 KB)
            </h3>
            <p className="text-xs text-slate-400">
              Visualización proporcional de particiones contiguas y huecos libres en tiempo real.
            </p>
          </div>

          <div className="flex items-center space-x-3 text-xs font-mono">
            <span className="flex items-center space-x-1.5 text-cyan-400">
              <span className="w-2.5 h-2.5 rounded bg-cyan-500"></span>
              <span>Asignado</span>
            </span>
            <span className="flex items-center space-x-1.5 text-slate-400">
              <span className="w-2.5 h-2.5 rounded bg-slate-800 border border-slate-600"></span>
              <span>Hueco Libre</span>
            </span>
          </div>
        </div>

        {/* Barra Proporcional Continua de 1024 KB */}
        <div className="space-y-1.5">
          <div className="h-14 w-full bg-slate-950 rounded-xl border border-slate-800 flex overflow-hidden p-1 gap-1">
            {segments.map((seg, idx) => {
              const widthPct = (seg.size / 1024) * 100;
              const isAlloc = seg.type === 'ALLOCATED';

              return (
                <div
                  key={`${seg.owner}_${seg.start}_${idx}`}
                  style={{ width: `${widthPct}%` }}
                  className={`h-full rounded-lg transition-all flex flex-col items-center justify-center relative group cursor-pointer ${
                    isAlloc
                      ? `${seg.style.bg} ${seg.style.border} border shadow-sm`
                      : 'bg-slate-950/80 border border-dashed border-slate-800 text-slate-600 hover:border-slate-700'
                  }`}
                  title={`${seg.owner}: ${seg.start} KB a ${seg.start + seg.size - 1} KB (${seg.size} KB)`}
                >
                  <span
                    className={`text-[10px] font-mono font-bold truncate px-1 ${
                      isAlloc ? seg.style.text : 'text-slate-500'
                    }`}
                  >
                    {widthPct > 5 ? seg.owner : ''}
                  </span>
                  <span className="text-[9px] font-mono text-slate-400">
                    {widthPct > 8 ? `${seg.size} KB` : ''}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Escala de direcciones en la parte inferior */}
          <div className="flex justify-between text-[10px] font-mono text-slate-500 px-1">
            <span>0 KB</span>
            <span>256 KB</span>
            <span>512 KB</span>
            <span>768 KB</span>
            <span>1024 KB (1 MB)</span>
          </div>
        </div>

        {/* Tabla de Bloques de Memoria Asignados */}
        <div className="pt-2">
          <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">
            Detalle de Bloques Asignados en MemoryManager:
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">Inicio (start_kb)</th>
                  <th className="py-2.5 px-3">Rango Físico</th>
                  <th className="py-2.5 px-3">Propietario (owner)</th>
                  <th className="py-2.5 px-3">Tamaño (size_kb)</th>
                  <th className="py-2.5 px-3">% de RAM</th>
                  <th className="py-2.5 px-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {sortedBlocks.map((b) => {
                  const style = getBlockStyle(b.owner);
                  const endKb = b.start + b.size - 1;
                  const pct = ((b.size / 1024) * 100).toFixed(1);

                  return (
                    <tr key={`${b.owner}_${b.start}`} className="hover:bg-slate-950/40 transition-colors">
                      <td className="py-2.5 px-3 text-slate-400">{b.start} KB</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-200">
                        [{b.start} .. {endKb} KB]
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${style.bg} ${style.text} border ${style.border}`}
                        >
                          {b.owner}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-cyan-400 font-bold">{b.size} KB</td>
                      <td className="py-2.5 px-3 text-slate-400">{pct}%</td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => handleFreeBlock(b)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-red-950/60 hover:text-red-400 hover:border-red-800/60 text-slate-300 border border-slate-700 text-[10px] font-bold transition-all"
                          title={role === 'ADMIN' ? 'Liberar este bloque de memoria' : 'Requiere rol ADMIN'}
                        >
                          free()
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 2. EXPLORADOR DEL SISTEMA DE ARCHIVOS VFS & CLIPS DE VIGILANCIA */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">
              Explorador del VirtualFileSystem & Clips de Vigilancia
            </h3>
            <p className="text-xs text-slate-400">
              Rutas reales leídas de Supabase persistidas en VirtualFileSystem y SurveillanceStorage.
            </p>
          </div>

          {/* Barra de Espacio de Almacenamiento */}
          <div className="flex items-center space-x-3 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs font-mono">
            <span className="text-slate-400">Espacio VFS:</span>
            <span className="text-cyan-400 font-bold">{formatBytes(vfsStats.usedBytes)}</span>
            <span className="text-slate-500">/ {formatBytes(vfsStats.capacityBytes)}</span>
            <span className="text-slate-400">
              ({Math.round((vfsStats.usedBytes / vfsStats.capacityBytes) * 100)}%)
            </span>
          </div>
        </div>

        {/* Tabs de Filtro de Carpetas */}
        <div className="flex flex-wrap gap-2 pt-1">
          {[
            { id: 'ALL', label: 'Todos los Archivos', icon: '🗂️', count: vfsFiles.length },
            {
              id: '/config',
              label: '/config',
              icon: '⚙️',
              count: vfsFiles.filter((f) => f.path.startsWith('/config')).length,
            },
            {
              id: '/logs',
              label: '/logs',
              icon: '📜',
              count: vfsFiles.filter((f) => f.path.startsWith('/logs')).length,
            },
            {
              id: '/surveillance',
              label: '/surveillance',
              icon: '🎥',
              count: vfsFiles.filter((f) => f.path.startsWith('/surveillance')).length,
            },
          ].map((tab) => {
            const isSelected = activeFolderTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveFolderTab(tab.id)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-mono flex items-center space-x-2 transition-all ${
                  isSelected
                    ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400 font-bold shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Lista de Archivos y Clips */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 max-h-96 overflow-y-auto">
            {filteredFiles.map((file) => {
              const isClip = file.path.startsWith('/surveillance');
              const clipMeta = surveillanceClips.find((c) => c.path === file.path);
              const isSelected = selectedFile?.path === file.path;

              return (
                <div
                  key={file.id || file.path}
                  onClick={() => setSelectedFile(file)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? 'bg-cyan-950/40 border-cyan-500/80 text-white shadow-sm'
                      : 'bg-slate-900/60 border-slate-800/80 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-xl">{isClip ? '📹' : '📄'}</span>
                    <div>
                      <div className="text-xs font-mono font-bold text-slate-200">{file.path}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center space-x-2">
                        <span>Tamaño: {formatBytes(file.size_bytes || file.size || 0)}</span>
                        {clipMeta && (
                          <span className="text-blue-400 font-semibold">
                            Cámara: {clipMeta.camera_id}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {clipMeta?.is_protected && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950 text-amber-400 border border-amber-800/80">
                        🔒 Protegido
                      </span>
                    )}
                    <span className="text-[10px] text-slate-500 font-mono">
                      {file.modified_at
                        ? new Date(file.modified_at).toLocaleDateString()
                        : 'Reciente'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Panel Inspector de Archivo / Clip Seleccionado */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="text-xs font-mono uppercase text-cyan-400 font-bold border-b border-slate-800 pb-2">
              Inspector de Archivo VFS
            </div>

            {selectedFile ? (
              <div className="space-y-3 font-mono text-xs">
                <div>
                  <div className="text-[10px] uppercase text-slate-500">Ruta Canónica</div>
                  <div className="font-bold text-white break-all mt-0.5">{selectedFile.path}</div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[10px] uppercase text-slate-500">Tamaño</div>
                    <div className="text-slate-200">
                      {formatBytes(selectedFile.size_bytes || selectedFile.size || 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-slate-500">Tipo</div>
                    <div className="text-slate-200">
                      {selectedFile.path.endsWith('.clip')
                        ? 'Video Surveillance'
                        : selectedFile.path.endsWith('.json')
                        ? 'JSON Config'
                        : 'Log Stream'}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase text-slate-500 mb-1">Contenido / Datos</div>
                  <pre className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300 overflow-x-auto max-h-40 whitespace-pre-wrap">
                    {selectedFile.content || '(Archivo binario o clip de vigilancia simulado)'}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 text-xs font-mono text-slate-500">
                Selecciona un archivo o clip de vigilancia para inspeccionar sus metadatos y contenido.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
