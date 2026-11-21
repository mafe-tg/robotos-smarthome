/**
 * Escritorio de RobotOS.
 *
 * Ciclo de energía: arranque (BootManager real) -> elección de perfil -> escritorio
 * -> apagado o reinicio. Si el kernel se apaga desde la terminal, el escritorio
 * también se apaga.
 *
 * Gestor de ventanas: cada ventana es un proceso del kernel creado con la system
 * call sys_spawn. Reserva 16 KB de RAM y suma su CPU mientras está en RUNNING.
 * Minimizar la pasa a WAITING, restaurarla la devuelve a READY y RUNNING, y
 * cerrarla la termina y libera su memoria. Si el proceso se finaliza desde otra
 * app (monitor o terminal), la ventana se cierra.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSystem } from '../../context/SystemContext';
import { useAuth } from '../../context/AuthContext';
import { DeniedModal } from '../../components/common/DeniedModal';
import { emitSystemEvent } from '../../lib/persistence';
import { getKernel, setTerminalContext, shutdownKernel } from '../terminal/kernelBridge';
import { APP_MEMORY_KB, APP_PROCESS_PREFIX, appProcessName, getApp, roleAllows } from './apps';
import { DesktopContext } from './DesktopContext';
import { HomeScreen, useTwinSnapshot } from './HomeScreen';
import { setSoundEnabled, sfx } from './sound';
import { Window } from './Window';
import { BootScreen, WelcomeScreen, ShutdownScreen, OffScreen } from './PowerScreens';
import { TopBar, Dock, Launcher, NotificationPanel, Toasts } from './Chrome';
import '@fontsource/chakra-petch/latin-600.css';
import '@fontsource/chakra-petch/latin-700.css';
import '@fontsource/chakra-petch/latin-700-italic.css';
import '@fontsource/sora/latin-400.css';
import '@fontsource/sora/latin-600.css';
import '@fontsource/sora/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import './desktop.css';
import './skin.css';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PREFS_KEY = 'robotos.desktop.prefs';

const loadPrefs = () => {
  try {
    return { sound: true, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return { sound: true };
  }
};

const useCompact = () => {
  const [compact, setCompact] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return compact;
};

export const Desktop = () => {
  const system = useSystem();
  const { processes, admitProcess, executeProcess, pauseProcess, resumeProcess, terminateProcess, alerts, addLog } = system;
  const { role, switchRole, checkPermission } = useAuth();

  // Las system calls leen el estado vivo del sistema desde aquí
  setTerminalContext(system);
  const { kernel } = getKernel();

  const [phase, setPhase] = useState('boot');
  const [offReason, setOffReason] = useState(null);
  const [shutdownSteps, setShutdownSteps] = useState([]);
  const [windows, setWindows] = useState([]);
  const [focusedWid, setFocusedWid] = useState(null);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [prefs, setPrefsState] = useState(loadPrefs);
  const [, setTick] = useState(0);
  const compact = useCompact();

  const zRef = useRef(10);
  const widRef = useRef(0);
  const openingRef = useRef(new Set());
  const ownShutdownRef = useRef(false);
  const windowsRef = useRef(windows);
  windowsRef.current = windows;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // ── Avisos emergentes ──
  const notify = useCallback((title, body = '', kind = 'info') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, title, body, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  }, []);
  const dismissToast = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  // Cada alerta nueva del sistema aparece como aviso
  const seenAlerts = useRef(null);
  useEffect(() => {
    if (seenAlerts.current === null) {
      seenAlerts.current = new Set(alerts.map((a) => a.id));
      return;
    }
    for (const a of alerts) {
      if (seenAlerts.current.has(a.id)) continue;
      seenAlerts.current.add(a.id);
      if (phaseRef.current === 'desktop' && a.state === 'Activa') {
        notify(a.title, a.details, a.severity === 'warning' ? 'warning' : 'error');
      }
    }
  }, [alerts, notify]);

  const setPrefs = (patch) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* sin almacenamiento local */
      }
      return next;
    });
  };

  // ── Ventanas ──
  const focusWindow = (wid) => {
    zRef.current += 1;
    // Mantener las ventanas por debajo de las barras y modales
    if (zRef.current > 40) {
      const order = [...windowsRef.current].sort((a, b) => a.z - b.z);
      setWindows((prev) => prev.map((w) => ({ ...w, z: 10 + order.findIndex((o) => o.wid === w.wid) })));
      zRef.current = 10 + order.length;
    }
    const z = zRef.current;
    setWindows((prev) => prev.map((w) => (w.wid === wid ? { ...w, z } : w)));
    setFocusedWid(wid);
  };

  const updateWindow = (wid, patch) => setWindows((prev) => prev.map((w) => (w.wid === wid ? { ...w, ...patch } : w)));

  const procOf = (win) => processes.find((p) => p.id === win.procId);

  const openApp = useCallback(
    async (appId) => {
      const app = getApp(appId);
      if (!app) return;

      if (!roleAllows(role, app.minRole)) {
        checkPermission(app.minRole, `Abrir la app "${app.name}"`, addLog);
        return;
      }

      const existing = windowsRef.current.find((w) => w.appId === appId);
      if (existing) {
        if (existing.minimized) restoreWindow(existing.wid);
        else focusWindow(existing.wid);
        return;
      }
      if (openingRef.current.has(appId)) return;
      openingRef.current.add(appId);

      try {
        const result = await kernel.syscalls.invoke('sys_spawn', {
          name: appProcessName(app.id),
          priority: 'Media',
          memoryKb: APP_MEMORY_KB,
          cpu: app.cpu,
          tiempoTotal: 4,
        });
        if (!result?.success) {
          sfx.error();
          notify(
            `No hay memoria para abrir ${app.name}`,
            'Cierra alguna ventana o compacta la RAM desde Configuración, en Memoria.',
            'error'
          );
          return;
        }

        const n = windowsRef.current.length;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const w = Math.min(app.size.w, vw - 140);
        const h = Math.min(app.size.h, vh - 190);
        zRef.current += 1;
        const win = {
          wid: ++widRef.current,
          appId,
          procId: result.process.id,
          x: Math.max(8, Math.min(120 + (n % 6) * 34, vw - w - 8)),
          y: Math.max(64, Math.min(66 + (n % 6) * 28, vh - h - 116)),
          w,
          h,
          z: zRef.current,
          minimized: false,
          maximized: false,
          pendingRun: true,
        };
        setWindows((prev) => [...prev, win]);
        sfx.open();
        setFocusedWid(win.wid);
        emitSystemEvent({
          event_type: 'APP_OPENED',
          source: 'WINDOW_MANAGER',
          description: `Se abrió ${app.name} como proceso PID ${result.process.pid}`,
          details: { app: app.id, pid: result.process.pid, memory_kb: APP_MEMORY_KB, cpu: app.cpu },
        });
      } catch (error) {
        if (error.code === 'KERNEL_NOT_READY') {
          notify('El kernel no está en ejecución', 'Reinicia RobotOS desde el menú del robot para abrir apps.', 'error');
        } else {
          notify(`No se pudo abrir ${app.name}`, error.message, 'error');
        }
      } finally {
        openingRef.current.delete(appId);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [role, kernel, notify, processes]
  );

  const closeWindow = (wid) => {
    const win = windowsRef.current.find((w) => w.wid === wid);
    if (!win) return;
    sfx.close();
    setWindows((prev) => prev.filter((w) => w.wid !== wid));
    if (focusedWid === wid) setFocusedWid(null);
    const proc = procOf(win);
    if (proc && proc.state !== 'TERMINATED') terminateProcess(win.procId);
    emitSystemEvent({
      event_type: 'APP_CLOSED',
      source: 'WINDOW_MANAGER',
      description: `Se cerró ${getApp(win.appId)?.name} y se liberó su memoria`,
      details: { app: win.appId, pid: proc?.pid },
    });
  };

  const minimizeWindow = (wid) => {
    const win = windowsRef.current.find((w) => w.wid === wid);
    if (!win) return;
    updateWindow(wid, { minimized: true });
    if (focusedWid === wid) setFocusedWid(null);
    const proc = procOf(win);
    if (proc && (proc.state === 'RUNNING' || proc.state === 'READY')) pauseProcess(win.procId);
  };

  const restoreWindow = (wid) => {
    const win = windowsRef.current.find((w) => w.wid === wid);
    if (!win) return;
    updateWindow(wid, { minimized: false, pendingRun: true });
    focusWindow(wid);
    const proc = procOf(win);
    if (proc && proc.state === 'WAITING') resumeProcess(win.procId);
  };

  const onWindowButton = (wid) => {
    const win = windows.find((w) => w.wid === wid);
    if (!win) return;
    if (win.minimized) restoreWindow(wid);
    else if (focusedWid === wid) minimizeWindow(wid);
    else focusWindow(wid);
  };

  // Llevar cada proceso de ventana por su ciclo de vida y detectar los finalizados
  useEffect(() => {
    for (const win of windows) {
      const proc = procOf(win);
      if (!proc) continue;
      if (proc.state === 'TERMINATED') {
        setWindows((prev) => prev.filter((w) => w.wid !== win.wid));
        notify(
          `${getApp(win.appId).name} se cerró`,
          `Su proceso (PID ${proc.pid}) fue finalizado y la memoria quedó libre.`,
          'warning'
        );
        return;
      }
      if (!win.pendingRun) continue;
      if (proc.state === 'NEW') {
        admitProcess(win.procId);
        return;
      }
      if (proc.state === 'READY' && !win.minimized) {
        executeProcess(win.procId);
        return;
      }
      if (proc.state === 'RUNNING') {
        updateWindow(win.wid, { pendingRun: false });
        return;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processes, windows]);

  // Si cambia el perfil, se cierran las apps que el nuevo perfil no puede usar
  useEffect(() => {
    const blocked = windowsRef.current.filter((w) => !roleAllows(role, getApp(w.appId).minRole));
    if (blocked.length) {
      blocked.forEach((w) => closeWindow(w.wid));
      notify('Se cerraron apps de otro perfil', blocked.map((w) => getApp(w.appId).name).join(', '), 'info');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  // Al entrar al escritorio, finalizar procesos de ventanas que quedaron de una sesión anterior
  useEffect(() => {
    if (phase !== 'desktop') return;
    const live = new Set(windowsRef.current.map((w) => w.procId));
    const orphans = processes.filter(
      (p) => p.name?.startsWith(APP_PROCESS_PREFIX) && p.state !== 'TERMINATED' && !live.has(p.id)
    );
    if (orphans.length) {
      orphans.forEach((p) => terminateProcess(p.id));
      addLog({
        level: 'INFO',
        source: 'WINDOW_MANAGER',
        message: `Limpieza al iniciar sesión: ${orphans.length} proceso(s) de ventanas anteriores finalizados (${orphans
          .map((p) => `PID ${p.pid}`)
          .join(', ')}).`,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Energía ──
  const closeAllWindows = () => {
    windowsRef.current.forEach((w) => {
      const proc = processes.find((p) => p.id === w.procId);
      if (proc && proc.state !== 'TERMINATED') terminateProcess(w.procId);
    });
    setWindows([]);
    setFocusedWid(null);
  };

  const powerDown = async (mode) => {
    const count = windowsRef.current.length;
    ownShutdownRef.current = true;
    setLauncherOpen(false);
    setNotifOpen(false);
    setShutdownSteps([]);
    setPhase('shutting');
    const step = async (text) => {
      setShutdownSteps((prev) => [...prev, text]);
      await sleep(340);
    };
    await step(count ? `Cerrando ${count} app${count > 1 ? 's' : ''} abierta${count > 1 ? 's' : ''}` : 'No hay apps abiertas');
    closeAllWindows();
    if (count) await step(`Memoria liberada: ${count * APP_MEMORY_KB} KB`);
    emitSystemEvent({
      event_type: mode === 'restart' ? 'SYSTEM_RESTART' : 'SYSTEM_SHUTDOWN',
      source: 'DESKTOP',
      severity: 'WARNING',
      description: mode === 'restart' ? 'Reinicio pedido desde el escritorio' : 'Apagado pedido desde el escritorio',
      details: { closed_apps: count },
    });
    await step('Registros guardados');
    await step('Deteniendo el kernel');
    shutdownKernel(mode === 'restart' ? 'Reinicio desde el escritorio' : 'Apagado desde el escritorio');
    await sleep(300);
    ownShutdownRef.current = false;
    if (mode === 'restart') {
      setPhase('boot');
    } else {
      setOffReason('Apagado desde el menú del robot');
      setPhase('off');
    }
  };

  const switchUser = () => {
    closeAllWindows();
    setPhase('welcome');
  };

  // El kernel puede apagarse o arrancarse desde la terminal
  useEffect(() => {
    const offShutdown = kernel.events.on('kernel:shutdown', (event) => {
      setTick((t) => t + 1);
      if (ownShutdownRef.current || phaseRef.current !== 'desktop') return;
      closeAllWindows();
      setOffReason(event?.payload?.reason || 'Apagado desde la terminal');
      setPhase('off');
    });
    const offStarted = kernel.events.on('kernel:started', () => {
      setTick((t) => t + 1);
      if (phaseRef.current === 'off') setPhase('welcome');
    });
    const offError = kernel.events.on('kernel:error', () => setTick((t) => t + 1));
    return () => {
      offShutdown();
      offStarted();
      offError();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kernel]);

  const toggleLauncher = () => {
    setNotifOpen(false);
    setLauncherOpen((o) => !o);
  };

  // Mostrar la casa: minimiza todas las ventanas (sus procesos pasan a WAITING)
  const showHome = () => {
    sfx.move();
    windowsRef.current.filter((w) => !w.minimized).forEach((w) => minimizeWindow(w.wid));
  };

  useEffect(() => {
    setSoundEnabled(prefs.sound);
  }, [prefs.sound]);

  // ── Hardware del robot: un ciclo del bus por segundo mientras el kernel corre ──
  const metricsRef = useRef(system.metrics);
  metricsRef.current = system.metrics;
  const { hardware } = getKernel();
  useEffect(() => {
    if (phase !== 'desktop') return undefined;
    const t = setInterval(() => {
      if (kernel.state.status !== 'RUNNING') return;
      hardware.tick({ cpu: metricsRef.current.cpuUsage, battery: metricsRef.current.batteryPercent });
    }, 1000);
    return () => clearInterval(t);
  }, [phase, hardware, kernel]);

  // Cuando RX-1 cambia de habitación, sus motores se activan
  const twin = useTwinSnapshot();
  const lastRoom = useRef(null);
  useEffect(() => {
    const room = twin.robot.currentRoom;
    if (lastRoom.current && room && room !== lastRoom.current && phase === 'desktop') {
      try {
        hardware.move(60, 3);
      } catch (e) {
        addLog({ level: 'WARNING', source: 'HARDWARE_MGR', message: `RX-1 no pudo ir a la nueva habitación: ${e.message}` });
      }
    }
    lastRoom.current = room;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [twin.robot.currentRoom]);

  const desktopApi = useMemo(
    () => ({
      openApp,
      closeApp: (appId) => {
        const w = windowsRef.current.find((x) => x.appId === appId);
        if (w) closeWindow(w.wid);
      },
      restart: () => powerDown('restart'),
      shutdown: () => powerDown('shutdown'),
      switchUser,
      notify,
      prefs,
      setPrefs,
      windows,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openApp, notify, prefs, windows]
  );

  const kernelStatus = kernel.state.status;

  return (
    <DesktopContext.Provider value={desktopApi}>
      <div className="os-root fixed inset-0 overflow-hidden">
        {phase === 'boot' && <BootScreen onDone={() => { sfx.boot(); setPhase('welcome'); }} />}

        {phase === 'welcome' && (
          <WelcomeScreen
            lastRole={role}
            onPick={(r) => {
              switchRole(r);
              setPhase('desktop');
            }}
          />
        )}

        {phase === 'shutting' && <ShutdownScreen steps={shutdownSteps} />}

        {phase === 'off' && (
          <OffScreen
            reason={offReason}
            onPowerOn={() => {
              setOffReason(null);
              setPhase('boot');
            }}
          />
        )}

        {phase === 'desktop' && (
          <>
            <div className="os-light contents">
              <div className="absolute inset-0 os-light-bg" aria-hidden="true" />
              <HomeScreen />
            </div>

            {windows.map((win) => {
              const app = getApp(win.appId);
              const AppComponent = app.component;
              return (
                <Window
                  key={win.wid}
                  win={win}
                  app={app}
                  process={procOf(win)}
                  focused={focusedWid === win.wid}
                  compact={compact}
                  onFocus={() => focusedWid !== win.wid && focusWindow(win.wid)}
                  onClose={() => closeWindow(win.wid)}
                  onMinimize={() => minimizeWindow(win.wid)}
                  onToggleMaximize={() => updateWindow(win.wid, { maximized: !win.maximized })}
                  onMove={(patch) => updateWindow(win.wid, patch)}
                  onCrash={(error) =>
                    addLog({ level: 'ERROR', source: 'WINDOW_MANAGER', message: `${app.name} dejó de responder: ${error.message}` })
                  }
                >
                  <AppComponent onNavigate={openApp} />
                </Window>
              );
            })}

            <div className="os-light contents">
              <TopBar
                kernelStatus={kernelStatus}
                notifOpen={notifOpen}
                sound={prefs.sound}
                onToggleSound={() => setPrefs({ sound: !prefs.sound })}
                onToggleLauncher={toggleLauncher}
                onToggleNotif={() => {
                  setLauncherOpen(false);
                  setNotifOpen((o) => !o);
                }}
              />
              <Dock
                windows={windows}
                focusedWid={focusedWid}
                homeVisible={windows.every((w) => w.minimized)}
                onHome={showHome}
                onOpenApp={openApp}
                onWindowButton={onWindowButton}
                onToggleLauncher={toggleLauncher}
                launcherOpen={launcherOpen}
              />
              <Launcher
                open={launcherOpen}
                onClose={() => setLauncherOpen(false)}
                onOpenApp={openApp}
                onSwitchUser={switchUser}
                onRestart={() => powerDown('restart')}
                onShutdown={() => powerDown('shutdown')}
              />
              <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)} onOpenApp={openApp} />
              <Toasts toasts={toasts} onDismiss={dismissToast} />
            </div>
          </>
        )}

        <div className="relative z-[90]">
          <DeniedModal />
        </div>
      </div>
    </DesktopContext.Provider>
  );
};

export default Desktop;
