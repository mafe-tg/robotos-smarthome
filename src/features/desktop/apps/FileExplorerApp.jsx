/**
 * Archivos: explorador del sistema de archivos virtual (VFS).
 * Crear, abrir, editar, renombrar y eliminar usan las mismas funciones del
 * sistema que la terminal, así que todo queda en Supabase y en los registros.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Folder, FolderOpen, FileText, Plus, Save, Pencil, Trash2, HardDrive } from 'lucide-react';
import { useSystem } from '../../../context/SystemContext';
import { useAuth } from '../../../context/AuthContext';
import { useDesktop } from '../DesktopContext';

const dirOf = (path) => path.slice(0, path.lastIndexOf('/')) || '/';
const baseOf = (path) => path.slice(path.lastIndexOf('/') + 1);

const formatBytes = (b = 0) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`);
const formatDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
};

const btn = 'os-focus h-8 px-3 rounded-md text-sm flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed';

export const FileExplorerApp = () => {
  const { vfsFiles, vfsStats, createVfsFile, updateVfsFile, deleteVfsFile, addLog } = useSystem();
  const { checkPermission } = useAuth();
  const { notify } = useDesktop();

  const folders = useMemo(() => {
    const set = new Set(vfsFiles.map((f) => dirOf(f.path)));
    return [...set].sort();
  }, [vfsFiles]);

  const [folder, setFolder] = useState(() => folders[0] || '/');
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [newName, setNewName] = useState(null);

  const files = vfsFiles.filter((f) => dirOf(f.path) === folder).sort((a, b) => a.path.localeCompare(b.path));
  const current = vfsFiles.find((f) => f.path === selected) || null;
  const dirty = current && draft !== (current.content ?? '');

  useEffect(() => {
    if (current) setDraft(current.content ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    if (!folders.includes(folder) && folders.length) setFolder(folders[0]);
  }, [folders, folder]);

  const save = () => {
    if (!current || !checkPermission('USER', `Guardar ${current.path}`, addLog)) return;
    const r = updateVfsFile({ oldPath: current.path, newPath: current.path, content: draft });
    if (r.success) notify('Archivo guardado', current.path, 'ok');
    else notify('No se pudo guardar', r.error, 'error');
  };

  const commitRename = () => {
    const name = renaming?.trim();
    if (!current || !name || name === baseOf(current.path)) return setRenaming(null);
    if (name.includes('/')) return notify('Nombre no válido', 'El nombre no puede tener "/".', 'error');
    const target = `${dirOf(current.path) === '/' ? '' : dirOf(current.path)}/${name}`;
    const r = updateVfsFile({ oldPath: current.path, newPath: target, content: draft });
    setRenaming(null);
    if (r.success) {
      setSelected(target);
      notify('Archivo renombrado', `${current.path} ahora es ${target}`, 'ok');
    } else notify('No se pudo renombrar', r.error, 'error');
  };

  const remove = () => {
    if (!current || !checkPermission('ADMIN', `Eliminar ${current.path}`, addLog)) return;
    const path = current.path;
    const r = deleteVfsFile(path);
    if (r?.success === false) return notify('No se pudo eliminar', r.error, 'error');
    setSelected(null);
    notify('Archivo eliminado', path, 'ok');
  };

  const commitCreate = () => {
    const name = newName?.trim();
    if (!name) return setNewName(null);
    if (name.includes('/')) return notify('Nombre no válido', 'El nombre no puede tener "/".', 'error');
    if (!checkPermission('USER', 'Crear archivo', addLog)) return;
    const path = `${folder === '/' ? '' : folder}/${name}`;
    const r = createVfsFile({ path, content: '' });
    setNewName(null);
    if (r.success) setSelected(r.file.path);
    else notify('No se pudo crear el archivo', r.error, 'error');
  };

  const usedPct = vfsStats.capacityBytes ? (vfsStats.usedBytes / vfsStats.capacityBytes) * 100 : 0;

  return (
    <div className="h-full flex flex-col os-light os-applight text-[var(--os-ink)] bg-[#f7f6ff]" style={{ fontFamily: 'var(--os-font)' }}>
      {/* En celular: selector de carpeta arriba */}
      <div className="sm:hidden p-2 border-b border-[var(--os-line)]">
        <select
          value={folder}
          onChange={(e) => {
            setFolder(e.target.value);
            setSelected(null);
          }}
          aria-label="Carpeta"
          className="w-full h-10 px-3 rounded-xl bg-[var(--os-night)] border border-[var(--os-line)] os-mono text-sm"
        >
          {folders.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>
      <div className="flex-1 min-h-0 flex">
        {/* Carpetas */}
        <nav className="hidden sm:block w-48 shrink-0 border-r border-[var(--os-line)] p-2 overflow-y-auto" aria-label="Carpetas">
          {folders.map((d) => {
            const open = d === folder;
            const Icon = open ? FolderOpen : Folder;
            return (
              <button
                key={d}
                onClick={() => {
                  setFolder(d);
                  setSelected(null);
                }}
                className={`os-focus w-full flex items-center gap-2 px-2 h-8 rounded-md text-sm text-left ${open ? 'bg-white/10' : 'hover:bg-white/5'}`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${open ? 'text-[var(--os-signal)]' : 'text-[var(--os-mute)]'}`} />
                <span className="truncate os-mono text-[13px]">{d}</span>
              </button>
            );
          })}
        </nav>

        {/* Archivos de la carpeta */}
        <section className={`${current ? 'hidden sm:flex' : 'flex'} w-full sm:w-72 shrink-0 sm:border-r border-[var(--os-line)] flex-col min-h-0`}>
          <div className="h-11 px-3 flex items-center justify-between border-b border-[var(--os-line)]">
            <span className="text-sm os-mono truncate">{folder}</span>
            <button onClick={() => setNewName('')} className={`${btn} px-2 hover:bg-white/5`} aria-label="Nuevo archivo">
              <Plus className="w-4 h-4" /> Nuevo
            </button>
          </div>
          <ul className="flex-1 overflow-y-auto p-1">
            {newName !== null && (
              <li className="p-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitCreate();
                    if (e.key === 'Escape') setNewName(null);
                  }}
                  onBlur={() => setNewName(null)}
                  placeholder="nombre.txt"
                  aria-label="Nombre del archivo nuevo"
                  className="w-full h-8 px-2 rounded-md bg-[var(--os-night)] border border-[var(--os-signal)] outline-none text-sm os-mono"
                />
              </li>
            )}
            {files.length === 0 && newName === null && (
              <li className="p-4 text-sm text-[var(--os-mute)]">Carpeta vacía. Usa Nuevo para crear un archivo.</li>
            )}
            {files.map((f) => (
              <li key={f.path}>
                <button
                  onClick={() => setSelected(f.path)}
                  className={`os-focus w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left ${selected === f.path ? 'bg-[var(--os-signal)]/15' : 'hover:bg-white/5'}`}
                >
                  <FileText className="w-4 h-4 shrink-0 text-[var(--os-mute)]" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate">{baseOf(f.path)}</span>
                    <span className="block text-[11px] text-[var(--os-mute)]">
                      {formatBytes(f.size_bytes)}, {formatDate(f.modified_at)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Vista del archivo */}
        <section className={`${current ? 'flex' : 'hidden sm:flex'} flex-1 min-w-0 flex-col min-h-0`}>
          {current ? (
            <>
              <div className="min-h-11 px-2 sm:px-3 py-1.5 flex flex-wrap items-center gap-1 border-b border-[var(--os-line)]">
                <button onClick={() => setSelected(null)} className={`${btn} sm:hidden px-2 hover:bg-white/5`} aria-label="Volver a la lista">
                  ‹ Volver
                </button>
                {renaming !== null ? (
                  <input
                    autoFocus
                    value={renaming}
                    onChange={(e) => setRenaming(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                    onBlur={() => setRenaming(null)}
                    aria-label="Nuevo nombre"
                    className="flex-1 h-8 px-2 rounded-md bg-[var(--os-night)] border border-[var(--os-signal)] outline-none text-sm os-mono"
                  />
                ) : (
                  <span className="basis-full sm:basis-auto order-first sm:order-none flex-1 min-w-0 truncate text-sm font-medium px-1 sm:px-0">
                    {baseOf(current.path)}
                    {dirty && <span className="ml-2 text-xs text-[var(--os-signal)]">sin guardar</span>}
                  </span>
                )}
                <button onClick={save} disabled={!dirty} className={`${btn} ${dirty ? 'bg-[var(--os-signal)] text-[var(--os-on-signal)] font-semibold' : ''}`}>
                  <Save className="w-4 h-4" /> Guardar
                </button>
                <button onClick={() => setRenaming(baseOf(current.path))} className={`${btn} hover:bg-white/5`}>
                  <Pencil className="w-4 h-4" /> Renombrar
                </button>
                <button onClick={remove} className={`${btn} hover:bg-[var(--os-alert)] hover:text-white`} title="Solo el administrador puede eliminar">
                  <Trash2 className="w-4 h-4" /> Eliminar
                </button>
              </div>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    if (dirty) save();
                  }
                }}
                spellCheck={false}
                aria-label={`Contenido de ${current.path}`}
                className="flex-1 min-h-0 resize-none p-4 bg-[var(--os-night)] outline-none os-mono text-[13px] leading-6"
              />
            </>
          ) : (
            <div className="flex-1 grid place-items-center p-8 text-center">
              <p className="text-sm text-[var(--os-mute)] max-w-xs">Elige un archivo para ver y editar su contenido.</p>
            </div>
          )}
        </section>
      </div>

      <footer className="h-9 shrink-0 px-3 flex items-center gap-3 border-t border-[var(--os-line)] text-xs text-[var(--os-mute)]">
        <HardDrive className="w-4 h-4" />
        <span>
          Disco: {formatBytes(vfsStats.usedBytes)} usados de {formatBytes(vfsStats.capacityBytes)}
        </span>
        <span className="w-32 h-1.5 rounded-full bg-[var(--os-line)] overflow-hidden">
          <span className="block h-full bg-[var(--os-signal)]" style={{ width: `${Math.max(1, usedPct)}%` }} />
        </span>
        <span className="ml-auto">{vfsFiles.length} archivos</span>
      </footer>
    </div>
  );
};

export default FileExplorerApp;
