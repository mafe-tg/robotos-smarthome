/**
 * Catálogo de aplicaciones del escritorio de RobotOS.
 * Cada app abierta se ejecuta como un proceso del kernel: reserva memoria,
 * consume CPU y se libera al cerrarla.
 */
import {
  Gauge, Lightbulb, Map, FolderOpen, Activity, Cpu, MemoryStick, ScrollText,
  SquareTerminal, Settings, Bug, Zap, Bot, Stethoscope,
} from 'lucide-react';

import { OverviewPage } from '../../pages/OverviewPage';
import { ProcessesPage } from '../../pages/ProcessesPage';
import { MemoryPage } from '../../pages/MemoryPage';
import { DevicesPage } from '../../pages/DevicesPage';
import { LogsAlertsPage } from '../../pages/LogsAlertsPage';
import { TwinApp } from './apps/TwinApp';
import { FaultInjectionPage } from '../../pages/FaultInjectionPage';
import { TerminalPage } from '../../pages/TerminalPage';
import { KernelPage } from '../../pages/KernelPage';
import { FileExplorerApp } from './apps/FileExplorerApp';
import { SystemMonitorApp } from './apps/SystemMonitorApp';
import { SettingsApp } from './apps/SettingsApp';
import { HardwareApp } from './apps/HardwareApp';
import { DiagnosticsApp } from './apps/DiagnosticsApp';

const BIG = { w: 1120, h: 720 };
const MID = { w: 940, h: 620 };
const SMALL = { w: 820, h: 560 };

export const APPS = [
  { id: 'overview', short: 'Control', name: 'Centro de control', hint: 'Resumen de la casa y del robot', icon: Gauge, group: 'casa', minRole: 'GUEST', cpu: 4, size: BIG, component: OverviewPage },
  { id: 'devices', short: 'Dispositivos', name: 'Dispositivos', hint: 'Luces, sensores, cámara y cerradura', icon: Lightbulb, group: 'casa', minRole: 'GUEST', cpu: 3, size: MID, component: DevicesPage },
  { id: 'twin', short: 'Gemelo', flush: true, name: 'Gemelo digital', hint: 'El robot en el plano de la casa', icon: Map, group: 'casa', minRole: 'GUEST', cpu: 6, size: BIG, component: TwinApp },
  { id: 'hardware', short: 'Hardware', flush: true, name: 'Hardware del robot', hint: 'Sensores, motores, brazo y drivers de RX-1', icon: Bot, group: 'casa', minRole: 'USER', cpu: 4, size: MID, component: HardwareApp },
  { id: 'diagnostico', short: 'Diagnóstico', flush: true, name: 'Diagnóstico', hint: 'RX-1 revisa el sistema y propone arreglos', icon: Stethoscope, group: 'sistema', minRole: 'USER', cpu: 3, size: SMALL, component: DiagnosticsApp },
  { id: 'files', short: 'Archivos', flush: true, name: 'Archivos', hint: 'Explora y edita el disco del robot', icon: FolderOpen, group: 'casa', minRole: 'USER', cpu: 2, size: SMALL, component: FileExplorerApp },

  { id: 'monitor', short: 'Monitor', flush: true, name: 'Monitor del sistema', hint: 'Procesos abiertos, CPU y memoria en vivo', icon: Activity, group: 'sistema', minRole: 'USER', cpu: 3, size: MID, component: SystemMonitorApp },
  { id: 'processes', short: 'Procesos', name: 'Procesos y planificador', hint: 'Estados, prioridades y diagrama de Gantt', icon: Cpu, group: 'sistema', minRole: 'USER', cpu: 5, size: BIG, component: ProcessesPage },
  { id: 'memory', short: 'Memoria', name: 'Memoria y disco', hint: 'Bloques de RAM y sistema de archivos', icon: MemoryStick, group: 'sistema', minRole: 'USER', cpu: 4, size: BIG, component: MemoryPage },
  { id: 'logs-alerts', short: 'Eventos', name: 'Visor de eventos', hint: 'Registros, alertas y diagnóstico', icon: ScrollText, group: 'sistema', minRole: 'USER', cpu: 3, size: BIG, component: LogsAlertsPage },
  { id: 'terminal', short: 'Terminal', name: 'Terminal', hint: 'Comandos y llamadas al sistema', icon: SquareTerminal, group: 'sistema', minRole: 'USER', cpu: 2, size: MID, component: TerminalPage },
  { id: 'settings', short: 'Ajustes', flush: true, name: 'Configuración', hint: 'Perfil, sistema, memoria y escritorio', icon: Settings, group: 'sistema', minRole: 'GUEST', cpu: 1, size: SMALL, component: SettingsApp },

  { id: 'kernel', short: 'Kernel', name: 'Kernel Debugger', hint: 'Laboratorio aislado: paginación, sincronización y benchmark', icon: Bug, group: 'laboratorio', minRole: 'USER', cpu: 6, size: BIG, component: KernelPage },
  { id: 'fault-injection', short: 'Fallos', name: 'Inyección de fallos', hint: 'Provoca fallos y mide la recuperación', icon: Zap, group: 'laboratorio', minRole: 'ADMIN', cpu: 5, size: BIG, component: FaultInjectionPage },
];

export const APP_GROUPS = [
  { id: 'casa', name: 'La casa' },
  { id: 'sistema', name: 'Sistema' },
  { id: 'laboratorio', name: 'Laboratorio' },
];

/** Apps fijas en el dock. */
export const DOCK_APPS = ['overview', 'devices', 'twin', 'hardware', 'diagnostico', 'files', 'monitor', 'terminal', 'kernel', 'settings'];

/** Memoria que reserva cada ventana abierta (un bloque de 16 KB). */
export const APP_MEMORY_KB = 16;

/** Prefijo con el que el kernel reconoce los procesos de las ventanas. */
export const APP_PROCESS_PREFIX = 'app_';

export const getApp = (id) => APPS.find((a) => a.id === id);

export const appProcessName = (appId) => `${APP_PROCESS_PREFIX}${appId.replace(/-/g, '_')}`;

/** Devuelve la app a la que pertenece un proceso, si es una ventana. */
export const appFromProcessName = (name = '') =>
  name.startsWith(APP_PROCESS_PREFIX)
    ? APPS.find((a) => appProcessName(a.id) === name) || null
    : null;

const ROLE_LEVEL = { GUEST: 1, USER: 2, ADMIN: 3 };
export const roleAllows = (role, minRole) => (ROLE_LEVEL[role] || 0) >= (ROLE_LEVEL[minRole] || 1);
