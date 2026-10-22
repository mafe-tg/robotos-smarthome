import React, { useState } from 'react';
import { useSystem } from '../context/SystemContext';
import { useAuth } from '../context/AuthContext';

export const MemoryPage = () => {
  const { memoryBlocks, fileSystem, freeMemoryBlock, addLog } = useSystem();
  const { role, checkPermission } = useAuth();

  const [selectedFolder, setSelectedFolder] = useState('/system');

  const rootFolders = Object.keys(fileSystem);

  const kernelBlocks = memoryBlocks.filter((b) => b.state === 'KERNEL').length;
  const allocatedBlocks = memoryBlocks.filter((b) => b.state === 'ALLOCATED').length;
  const freeBlocks = memoryBlocks.filter((b) => b.state === 'FREE').length;

  const usedMB = (kernelBlocks + allocatedBlocks) * 16;
  const freeMB = freeBlocks * 16;

  const handleFreeBlockClick = (block) => {
    if (block.state === 'FREE') return;
    if (block.state === 'KERNEL') {
      checkPermission('ADMIN', 'Liberar bloque protegido del Kernel', addLog);
      return;
    }

    if (checkPermission('ADMIN', `Liberar manualmente bloque #${block.id} (${block.processName})`, addLog)) {
      freeMemoryBlock(block.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white">Memoria & Sistema de Archivos (VFS)</h2>
          <p className="text-xs text-slate-400">
            Supervisión física de los 64 bloques de memoria RAM y estructura de directorios de RobotOS.
          </p>
        </div>
        <div className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-400">
          Rol activo: <span className="font-bold">{role}</span>
        </div>
      </div>

      {/* Métricas de Memoria */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-[10px] font-mono uppercase text-slate-500">Capacidad Total</div>
          <div className="text-xl font-black text-white mt-0.5">1024 MB</div>
          <div className="text-xs font-mono text-slate-400">64 bloques (16 MB c/u)</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-indigo-900/40">
          <div className="text-[10px] font-mono uppercase text-indigo-400">Kernel Protegido</div>
          <div className="text-xl font-black text-indigo-300 mt-0.5">{kernelBlocks * 16} MB</div>
          <div className="text-xs font-mono text-indigo-400/80">{kernelBlocks} bloques reservados</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-cyan-900/40">
          <div className="text-[10px] font-mono uppercase text-cyan-400">Memoria Asignada</div>
          <div className="text-xl font-black text-cyan-300 mt-0.5">{allocatedBlocks * 16} MB</div>
          <div className="text-xs font-mono text-cyan-400/80">{allocatedBlocks} bloques a procesos</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-emerald-900/40">
          <div className="text-[10px] font-mono uppercase text-emerald-400">Memoria Disponible</div>
          <div className="text-xl font-black text-emerald-400 mt-0.5">{freeMB} MB</div>
          <div className="text-xs font-mono text-emerald-400/80">{freeBlocks} bloques libres</div>
        </div>
      </div>

      {/* 1. MALLA INTERACTIVA DE BLOQUES DE MEMORIA (64 BLOQUES) */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800/80 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">Mapa Físico de Bloques de Memoria</h3>
            <p className="text-xs text-slate-400">
              Representación visual de la paginación física en tiempo real.
            </p>
          </div>

          <div className="flex items-center space-x-3 text-xs font-mono">
            <span className="flex items-center space-x-1.5 text-indigo-400">
              <span className="w-2.5 h-2.5 rounded bg-indigo-500"></span>
              <span>Kernel</span>
            </span>
            <span className="flex items-center space-x-1.5 text-cyan-400">
              <span className="w-2.5 h-2.5 rounded bg-cyan-500"></span>
              <span>Procesos</span>
            </span>
            <span className="flex items-center space-x-1.5 text-slate-400">
              <span className="w-2.5 h-2.5 rounded bg-slate-800 border border-slate-700"></span>
              <span>Libre</span>
            </span>
          </div>
        </div>

        {/* Grícula de 64 bloques */}
        <div className="grid grid-cols-4 sm:grid-cols-8 md:grid-cols-16 gap-2">
          {memoryBlocks.map((block) => {
            const isKernel = block.state === 'KERNEL';
            const isAllocated = block.state === 'ALLOCATED';

            return (
              <div
                key={block.id}
                onClick={() => handleFreeBlockClick(block)}
                className={`p-2 rounded-lg border text-center transition-all cursor-pointer relative group ${
                  isKernel
                    ? 'bg-indigo-950/80 border-indigo-700/80 text-indigo-300'
                    : isAllocated
                    ? 'bg-cyan-950/80 border-cyan-500/80 text-cyan-300 shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-600 hover:border-slate-700'
                }`}
                title={`Bloque #${block.id}: ${block.state} ${block.processName ? `(${block.processName})` : ''}`}
              >
                <div className="text-[10px] font-mono font-bold">#{block.id}</div>
                <div className="text-[8px] font-mono truncate mt-0.5">
                  {isKernel ? 'KERNEL' : isAllocated ? block.processName : 'LIBRE'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. EXPLORADOR DEL SISTEMA DE ARCHIVOS (VFS) */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg space-y-4">
        <div>
          <h3 className="text-sm font-bold text-white tracking-wide">Explorador del Sistema de Archivos VFS</h3>
          <p className="text-xs text-slate-400">Las 6 carpetas raíz canónicas de RobotOS</p>
        </div>

        {/* Tabs de Carpetas */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {rootFolders.map((folder) => {
            const isSelected = selectedFolder === folder;
            return (
              <button
                key={folder}
                onClick={() => setSelectedFolder(folder)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400 font-bold shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center space-x-1.5 font-mono text-xs">
                  <span>📁</span>
                  <span>{folder}</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1 font-mono">
                  {fileSystem[folder]?.length || 0} archivos
                </div>
              </button>
            );
          })}
        </div>

        {/* Lista de Archivos de la Carpeta Seleccionada */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
          <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
            Contenido de <span className="text-cyan-400 font-bold">{selectedFolder}</span>:
          </div>
          <div className="divide-y divide-slate-800/60">
            {fileSystem[selectedFolder]?.map((file) => (
              <div key={file.id} className="py-2.5 flex items-center justify-between text-xs font-mono">
                <div className="flex items-center space-x-2">
                  <span className="text-slate-500">📄</span>
                  <span className="text-slate-200 font-semibold">{file.name}</span>
                </div>
                <div className="flex items-center space-x-4 text-slate-500 text-[11px]">
                  <span>{file.size}</span>
                  <span className="text-slate-600">{file.permissions}</span>
                  <span>{file.modified}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
