// Datos iniciales de simulación para RobotOS SmartHome

// Equivalencia oficial de prioridades solicitada:
// Crítica = 1, Alta = 2, Media = 3, Baja = 4
export const PRIORITY_MAP = {
  'Crítica': 1,
  'Alta': 2,
  'Media': 3,
  'Baja': 4,
};

export const PRIORITY_LABEL = {
  1: 'Crítica',
  2: 'Alta',
  3: 'Media',
  4: 'Baja',
};

export const INITIAL_PROCESSES = [
  {
    id: 'p1',
    pid: 101,
    name: 'lighting_daemon',
    state: 'RUNNING', // NEW, READY, RUNNING, WAITING, TERMINATED
    priority: 'Alta',
    prioridadNum: 2,
    cpu: 8,
    memoryKb: 128, // 128 KB en el modelo de MemoryManager
    memory: 128,
    startKb: 0,
    tiempoTotal: 4, // Duración en ticks para el scheduler
    color: '#10B981',
    isSystem: true,
    description: 'Control y temporización de iluminación en todo el hogar',
  },
  {
    id: 'p2',
    pid: 102,
    name: 'temp_manager',
    state: 'READY',
    priority: 'Media',
    prioridadNum: 3,
    cpu: 3,
    memoryKb: 192, // 192 KB
    memory: 192,
    startKb: 448,
    tiempoTotal: 5,
    color: '#F59E0B',
    isSystem: true,
    description: 'Monitoreo de termostatos y control HVAC',
  },
  {
    id: 'p3',
    pid: 103,
    name: 'surveillance_proc',
    state: 'READY',
    priority: 'Media',
    prioridadNum: 3,
    cpu: 18,
    memoryKb: 256, // 256 KB
    memory: 256,
    startKb: 128,
    tiempoTotal: 6,
    color: '#3B82F6',
    isSystem: true,
    description: 'Detección perimetral y procesamiento de capturas',
  },
  {
    id: 'p4',
    pid: 104,
    name: 'routine_engine',
    state: 'RUNNING',
    priority: 'Media',
    prioridadNum: 3,
    cpu: 6,
    memoryKb: 96, // 96 KB
    memory: 96,
    startKb: 640,
    tiempoTotal: 3,
    color: '#06B6D4',
    isSystem: true,
    description: 'Ejecutor de reglas y automatizaciones cronometradas',
  },
  {
    id: 'p5',
    pid: 105,
    name: 'energy_monitor',
    state: 'READY',
    priority: 'Baja',
    prioridadNum: 4,
    cpu: 2,
    memoryKb: 64, // 64 KB
    memory: 64,
    startKb: 736,
    tiempoTotal: 4,
    color: '#8B5CF6',
    isSystem: true,
    description: 'Telemetría de consumo eléctrico y nivel de batería',
  },
  {
    id: 'p6',
    pid: 106,
    name: 'lock_guard',
    state: 'WAITING',
    priority: 'Crítica',
    prioridadNum: 1,
    cpu: 1,
    memoryKb: 64, // 64 KB
    memory: 64,
    startKb: 384,
    tiempoTotal: 2,
    color: '#EC4899',
    isSystem: true,
    description: 'Validación de seguros biométricos y cerrojos',
  },
];

export const INITIAL_SUPABASE_MEMORY_BLOCKS = [
  { id: 1, owner: 'lighting_daemon', start_kb: 0, size_kb: 128, color: '#10B981' },
  { id: 2, owner: 'surveillance_proc', start_kb: 128, size_kb: 256, color: '#3B82F6' },
  { id: 3, owner: 'lock_guard', start_kb: 384, size_kb: 64, color: '#EC4899' },
  { id: 4, owner: 'temp_manager', start_kb: 448, size_kb: 192, color: '#F59E0B' },
  { id: 5, owner: 'routine_engine', start_kb: 640, size_kb: 96, color: '#06B6D4' },
  { id: 6, owner: 'energy_monitor', start_kb: 736, size_kb: 64, color: '#8B5CF6' },
];

export const INITIAL_MEMORY_BLOCKS = INITIAL_SUPABASE_MEMORY_BLOCKS;

export const INITIAL_SUPABASE_FILES = [
  {
    id: 1,
    path: '/config/home.json',
    content: '{"casa":"RobotOS SmartHome","ramKb":1024,"discoBytes":10000000}',
    size_bytes: 63,
    created_at: '2026-11-04T02:40:33.927932+00:00',
    modified_at: '2026-11-04T02:40:33.927932+00:00',
  },
  {
    id: 2,
    path: '/config/rutinas.json',
    content: '{"noche":{"luces":"off","cerraduras":"on"},"manana":{"luces":"on","clima":"22C"}}',
    size_bytes: 81,
    created_at: '2026-11-04T02:40:33.927932+00:00',
    modified_at: '2026-11-04T02:40:33.927932+00:00',
  },
  {
    id: 3,
    path: '/logs/system.log',
    content: 'Sistema iniciado correctamente',
    size_bytes: 30,
    created_at: '2026-11-04T02:40:33.927932+00:00',
    modified_at: '2026-11-04T02:40:33.927932+00:00',
  },
  {
    id: 4,
    path: '/surveillance/camara_1/clip_001.clip',
    content: 'clip:camara_1:1',
    size_bytes: 1500000,
    created_at: '2026-11-04T02:40:33.927932+00:00',
    modified_at: '2026-11-04T02:40:33.927932+00:00',
  },
  {
    id: 5,
    path: '/surveillance/camara_1/clip_002.clip',
    content: 'clip:camara_1:2',
    size_bytes: 1200000,
    created_at: '2026-11-04T02:40:33.927932+00:00',
    modified_at: '2026-11-04T02:40:33.927932+00:00',
  },
  {
    id: 6,
    path: '/surveillance/camara_2/clip_003.clip',
    content: 'clip:camara_2:3',
    size_bytes: 1800000,
    created_at: '2026-11-04T02:40:33.927932+00:00',
    modified_at: '2026-11-04T02:40:33.927932+00:00',
  },
];

export const INITIAL_SUPABASE_CLIPS = [
  {
    id: 1,
    camera_id: 'camara_1',
    path: '/surveillance/camara_1/clip_001.clip',
    size_mb: 1.5,
    is_protected: false,
    recorded_at: '2026-11-03T23:40:33.927932+00:00',
  },
  {
    id: 2,
    camera_id: 'camara_1',
    path: '/surveillance/camara_1/clip_002.clip',
    size_mb: 1.2,
    is_protected: true,
    recorded_at: '2026-11-04T00:40:33.927932+00:00',
  },
  {
    id: 3,
    camera_id: 'camara_2',
    path: '/surveillance/camara_2/clip_003.clip',
    size_mb: 1.8,
    is_protected: false,
    recorded_at: '2026-11-04T01:40:33.927932+00:00',
  },
];

export const INITIAL_ENERGY_DEVICES = [
  { device: 'luces_sala', watts: 12 },
  { device: 'camara_1', watts: 8 },
  { device: 'camara_2', watts: 8 },
  { device: 'cerradura_principal', watts: 5 },
  { device: 'aire_acondicionado', watts: 1500 },
];

export const INITIAL_ENERGY_USAGE = [
  { id: 1, device: 'luces_sala', seconds: 21600 },
  { id: 2, device: 'aire_acondicionado', seconds: 14400 },
  { id: 3, device: 'camara_1', seconds: 86400 },
  { id: 4, device: 'camara_2', seconds: 86400 },
  { id: 5, device: 'cerradura_principal', seconds: 86400 },
  { id: 6, device: 'luces_sala', seconds: 18000 },
  { id: 7, device: 'aire_acondicionado', seconds: 7200 },
];

export const INITIAL_SUPABASE_LOGS = [
  {
    id: 'supa_1',
    created_at: '2026-11-03T20:40:33.927932+00:00',
    timestamp: '20:40:33',
    level: 'INFO',
    source: 'STORAGE',
    message: 'Modulo de almacenamiento iniciado',
  },
  {
    id: 'supa_2',
    created_at: '2026-11-03T21:40:33.927932+00:00',
    timestamp: '21:40:33',
    level: 'INFO',
    source: 'SURVEILLANCE',
    message: 'Clip guardado /surveillance/camara_1/clip_001.clip (1.5 MB, protegido=false)',
  },
  {
    id: 'supa_3',
    created_at: '2026-11-03T22:40:33.927932+00:00',
    timestamp: '22:40:33',
    level: 'DEBUG',
    source: 'MEMORY',
    message: 'Bloque asignado a luces (128 KB)',
  },
  {
    id: 'supa_4',
    created_at: '2026-11-03T23:40:33.927932+00:00',
    timestamp: '23:40:33',
    level: 'WARNING',
    source: 'SURVEILLANCE',
    message: 'Clip antiguo eliminado: /surveillance/camara_1/clip_000.clip',
  },
  {
    id: 'supa_5',
    created_at: '2026-11-04T00:40:33.927932+00:00',
    timestamp: '00:40:33',
    level: 'INFO',
    source: 'SURVEILLANCE',
    message: 'Clip guardado /surveillance/camara_1/clip_002.clip (1.2 MB, protegido=true)',
  },
  {
    id: 'supa_6',
    created_at: '2026-11-04T01:10:33.927932+00:00',
    timestamp: '01:10:33',
    level: 'WARNING',
    source: 'ENERGY',
    message: 'Consumo total 6.07 kWh supera el umbral de 5.0 kWh',
  },
  {
    id: 'supa_7',
    created_at: '2026-11-04T01:40:33.927932+00:00',
    timestamp: '01:40:33',
    level: 'ERROR',
    source: 'SURVEILLANCE',
    message: 'Sin espacio para clip de camara_2 (2.0 MB)',
  },
  {
    id: 'supa_8',
    created_at: '2026-11-04T02:10:33.927932+00:00',
    timestamp: '02:10:33',
    level: 'CRITICAL',
    source: 'MEMORY',
    message: 'Memoria disponible por debajo del 10%',
  },
  {
    id: 'supa_9',
    created_at: '2026-11-04T02:35:33.927932+00:00',
    timestamp: '02:35:33',
    level: 'INFO',
    source: 'STORAGE',
    message: 'Rotacion de logs completada',
  },
];

export const INITIAL_FILE_SYSTEM = {
  '/system': [
    { id: 'f1', name: 'kernel.sys', size: '2.4 MB', modified: '2026-10-18 04:00', permissions: 'rwx------' },
    { id: 'f2', name: 'scheduler.bin', size: '512 KB', modified: '2026-10-18 04:00', permissions: 'rwx------' },
    { id: 'f3', name: 'mem_manager.sys', size: '380 KB', modified: '2026-10-18 04:00', permissions: 'rwx------' },
  ],
  '/apps': [
    { id: 'f4', name: 'lighting.app', size: '1.2 MB', modified: '2026-10-19 12:10', permissions: 'rwxr-xr-x' },
    { id: 'f5', name: 'climate.app', size: '980 KB', modified: '2026-10-19 14:22', permissions: 'rwxr-xr-x' },
    { id: 'f6', name: 'security.app', size: '3.1 MB', modified: '2026-10-19 18:30', permissions: 'rwxr-xr-x' },
  ],
  '/users': [
    { id: 'f7', name: 'admin.profile', size: '12 KB', modified: '2026-10-19 19:00', permissions: 'rw-------' },
    { id: 'f8', name: 'resident.profile', size: '8 KB', modified: '2026-10-19 19:15', permissions: 'rw-r--r--' },
    { id: 'f9', name: 'guest.profile', size: '4 KB', modified: '2026-10-19 20:00', permissions: 'r--r--r--' },
  ],
  '/drivers': [
    { id: 'f10', name: 'zigbee_mesh.ko', size: '240 KB', modified: '2026-10-17 11:00', permissions: 'rw-r--r--' },
    { id: 'f11', name: 'i2c_sensors.ko', size: '180 KB', modified: '2026-10-17 11:00', permissions: 'rw-r--r--' },
    { id: 'f12', name: 'smartlock_gpio.ko', size: '115 KB', modified: '2026-10-17 11:00', permissions: 'rw-r--r--' },
  ],
  '/config': [
    { id: 'f13', name: 'robotos.conf', size: '16 KB', modified: '2026-10-19 08:00', permissions: 'rw-r--r--' },
    { id: 'f14', name: 'network.json', size: '8 KB', modified: '2026-10-19 08:30', permissions: 'rw-r--r--' },
    { id: 'f15', name: 'automations.yaml', size: '24 KB', modified: '2026-10-19 15:45', permissions: 'rw-r--r--' },
  ],
  '/logs': [
    { id: 'f16', name: 'kernel.log', size: '4.8 MB', modified: '2026-10-19 20:10', permissions: 'rw-r--r--' },
    { id: 'f17', name: 'audit.log', size: '1.9 MB', modified: '2026-10-19 20:12', permissions: 'rw-------' },
    { id: 'f18', name: 'devices_events.log', size: '3.2 MB', modified: '2026-10-19 20:14', permissions: 'rw-r--r--' },
  ],
};

export const INITIAL_DEVICES = [
  {
    id: 'd1',
    name: 'Luces Salón Principal',
    type: 'light',
    zone: 'Salón',
    status: 'ON',
    isCommonArea: true,
  },
  {
    id: 'd2',
    name: 'Luces Cocina',
    type: 'light',
    zone: 'Cocina',
    status: 'OFF',
    isCommonArea: true,
  },
  {
    id: 'd3',
    name: 'Sensor Movimiento Entrada',
    type: 'motion',
    zone: 'Entrada',
    status: 'EN REPOSO',
    isCommonArea: false,
  },
  {
    id: 'd4',
    name: 'Cámara Frontal',
    type: 'camera',
    zone: 'Exterior',
    status: 'ONLINE',
    isCommonArea: false,
  },
  {
    id: 'd5',
    name: 'Cerradura Puerta Principal',
    type: 'lock',
    zone: 'Entrada',
    status: 'BLOQUEADA',
    isCommonArea: false,
  },
  {
    id: 'd6',
    name: 'Termostato Salón',
    type: 'climate',
    zone: 'Salón',
    status: '22.5 °C',
    temperature: 22.5,
    isCommonArea: true,
  },
];

export const INITIAL_LOGS = [
  { id: 'l1', timestamp: '20:00:15', level: 'INFO', source: 'KERNEL', message: 'RobotOS v2.4 iniciado en modo seguro con éxito.' },
  { id: 'l2', timestamp: '20:02:30', level: 'INFO', source: 'LIGHTING', message: 'Rutina nocturna programada para las 22:00.' },
  { id: 'l3', timestamp: '20:05:44', level: 'WARN', source: 'ENERGY', message: 'Consumo pico detectado en Climatización (+2.1 kW).' },
  { id: 'l4', timestamp: '20:08:12', level: 'INFO', source: 'SECURITY', message: 'Cerraduras verificadas. Estado: 100% asegurado.' },
];

export const INITIAL_ALERTS = [
  {
    id: 'a1',
    timestamp: '20:05:44',
    title: 'Consumo Eléctrico Elevado',
    details: 'Pico de consumo en el subsistema de climatización.',
    severity: 'warning',
    state: 'Resuelta',
  },
];
