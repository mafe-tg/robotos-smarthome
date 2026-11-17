/**
 * faultCatalog.js — Catálogo Oficial de Fallos de RobotOS SmartHome
 *
 * Clasifica los fallos en 4 categorías:
 * - Dispositivos (Sensor desconectado, Pérdida de comunicación, Acceso no autorizado)
 * - Procesos (Proceso colgado, Sobrecarga de CPU)
 * - Memoria (Corrupción de bloque RAM)
 * - Concurrencia (Interbloqueo / Deadlock)
 */

export const FAULT_CATEGORIES = {
  DEVICES: 'Dispositivos',
  PROCESSES: 'Procesos',
  MEMORY: 'Memoria',
  CONCURRENCY: 'Concurrencia',
};

export const INTENSITY_LEVELS = [
  { value: 'Baja',  label: 'Baja (30%)',   pct: 30,  color: '#3B82F6' },
  { value: 'Media', label: 'Media (65%)',  pct: 65,  color: '#F59E0B' },
  { value: 'Alta',  label: 'Alta (100%)',  pct: 100, color: '#EF4444' },
];

export const FAULT_CATALOG = [
  // ── 1. Dispositivos ──
  {
    id: 'sensor_disconnected',
    name: 'Sensor Desconectado',
    category: FAULT_CATEGORIES.DEVICES,
    icon: '🔌',
    badgeColor: 'border-amber-700/60 bg-amber-950/40 text-amber-300',
    description: 'Pérdida física o lógica de señal en el bus I2C de sensores domóticos.',
    targetType: 'device',
    targetFilter: (d) => d.type === 'climate' || d.type === 'motion',
    defaultTarget: 'd6', // Termostato Salón
    defaultIntensity: 'Media',
    defaultDuration: 7,
    impact: 'Dispositivo offline; proceso supervisor entra en WAITING por falta de telemetría.',
    recoverySteps: [
      'Kernel detecta fallo de ACK en línea SDA/SCL',
      'Escaneo reactivo de direcciones I2C',
      'Re-inicialización de bus y reconexión de telemetría',
      'Restauración de estado operativo del dispositivo',
    ],
  },
  {
    id: 'comm_loss',
    name: 'Pérdida de Comunicación',
    category: FAULT_CATEGORIES.DEVICES,
    icon: '📡',
    badgeColor: 'border-orange-700/60 bg-orange-950/40 text-orange-300',
    description: 'Caída de enlace inalámbrico Zigbee o timeout de comunicación de periférico.',
    targetType: 'device',
    defaultTarget: 'd5', // Cerradura Puerta Principal
    defaultIntensity: 'Alta',
    defaultDuration: 8,
    impact: 'Periférico conmutado a estado OFFLINE en el bus del sistema.',
    recoverySteps: [
      'Network Stack reporta timeout de paquetes Zigbee',
      'Reintento de handshake inalámbrico 1/3 (Timeout)',
      'Reintento de handshake inalámbrico 2/3 (Timeout)',
      'Reintento de handshake 3/3 exitoso y enlace restablecido',
    ],
  },
  {
    id: 'unauthorized_access',
    name: 'Acceso No Autorizado',
    category: FAULT_CATEGORIES.DEVICES,
    icon: '🚨',
    badgeColor: 'border-red-700/60 bg-red-950/40 text-red-300',
    description: 'Ataque de fuerza bruta de PIN o manipulación indebida en cerraduras.',
    targetType: 'device',
    targetFilter: (d) => d.type === 'lock' || d.type === 'camera',
    defaultTarget: 'd5',
    defaultIntensity: 'Alta',
    defaultDuration: 8,
    impact: 'Bloqueo preventivo de cerrojo y elevación de vigilancia a CRÍTICA (Nivel 1).',
    recoverySteps: [
      'Alarma perimetral por 3 intentos erróneos de credenciales',
      'Protocolo de intrusión: cerrojo forzado a BLOQUEADA',
      'Validación de token criptográfico de administrador',
      'Normalización de prioridad de vigilancia y cierre de incidente',
    ],
  },

  // ── 2. Procesos ──
  {
    id: 'process_hang',
    name: 'Proceso Colgado (Freeze)',
    category: FAULT_CATEGORIES.PROCESSES,
    icon: '🧊',
    badgeColor: 'border-blue-700/60 bg-blue-950/40 text-blue-300',
    description: 'Un proceso entra en ciclo infinito o deja de emitir latidos (heartbeats).',
    targetType: 'process',
    defaultTarget: 'temp_manager',
    defaultIntensity: 'Media',
    defaultDuration: 7,
    impact: 'Proceso paralizado en estado WAITING reteniendo recursos sin avanzar.',
    recoverySteps: [
      'Watchdog timer detecta ausencia de heartbeat (>3000ms)',
      'Emisión de señal SIGKILL para terminar hilo colgado',
      'Re-inicialización de contexto y re-admisión del proceso',
      'Transición automática NEW -> READY -> RUNNING',
    ],
  },
  {
    id: 'cpu_overload',
    name: 'Sobrecarga de CPU',
    category: FAULT_CATEGORIES.PROCESSES,
    icon: '🔥',
    badgeColor: 'border-amber-600/60 bg-amber-950/40 text-amber-300',
    description: 'Ráfaga de cálculo intensiva que satura la CPU por encima del 95%.',
    targetType: 'process',
    defaultTarget: 'routine_engine',
    defaultIntensity: 'Alta',
    defaultDuration: 8,
    impact: 'Uso de CPU al 98%, degradación de ráfagas y retrasos en planificador.',
    recoverySteps: [
      'Sensor térmico/CPU emite alerta por consumo sostenido > 90%',
      'Planificador degrada temporalmente prioridad de tareas no esenciales',
      'Pausa preventiva de daemons de fondo',
      'Normalización de carga de CPU a rango operativo (< 30%)',
    ],
  },

  // ── 3. Memoria ──
  {
    id: 'memory_corruption',
    name: 'Corrupción de Memoria',
    category: FAULT_CATEGORIES.MEMORY,
    icon: '💥',
    badgeColor: 'border-purple-700/60 bg-purple-950/40 text-purple-300',
    description: 'Fallo de paridad o bit-flip en un bloque asignado de la memoria RAM.',
    targetType: 'memory_owner',
    defaultTarget: 'surveillance_proc',
    defaultIntensity: 'Alta',
    defaultDuration: 8,
    impact: 'Bloque RAM marcado como corrupto por fallo de checksum CRC.',
    recoverySteps: [
      'MemoryGuard detecta incoherencia de paridad en bloque asignado',
      'Aislamiento y cuarentena del espacio de direcciones dañado',
      'Llamada a MemoryManager.free() para desalojar bloque defectuoso',
      'Llamada a MemoryManager.allocate() para reasignar bloque limpio',
    ],
  },

  // ── 4. Concurrencia ──
  {
    id: 'deadlock',
    name: 'Interbloqueo (Deadlock)',
    category: FAULT_CATEGORIES.CONCURRENCY,
    icon: '🔒',
    badgeColor: 'border-fuchsia-700/60 bg-fuchsia-950/40 text-fuchsia-300',
    description: 'Espera circular por recursos compartidos (Bus I2C vs Cerrojo GPIO).',
    targetType: 'dual_process',
    defaultTarget: { processA: 'lock_guard', processB: 'routine_engine' },
    defaultIntensity: 'Alta',
    defaultDuration: 9,
    impact: 'Ambos procesos congelados en WAITING esperando mutuamente por recursos.',
    recoverySteps: [
      'Detección de ciclo dirigido en Grafo de Asignación de Recursos (RAG)',
      'Evaluación de prioridades relativas: Crítica (1) vs Media (3)',
      'Selección de víctima: Expropiación de routine_engine (menor prioridad)',
      'Liberación de mutex retenido, ejecución de proceso crítico y reencolado',
    ],
  },
];
