/**
 * Tipos para el módulo de Seguridad y Dispositivos de RobotOS
 */

export type AppRole = 'ADMIN' | 'USER' | 'GUEST';

export interface User {
  id: string;
  email?: string;
  role: AppRole;
  name?: string;
}

export type DeviceStatus = 'online' | 'offline' | 'alert' | 'maintenance' | string;

export interface Device {
  id: string;
  name: string;
  type: string;
  status: DeviceStatus;
  last_seen: string | null;
}

export type EventSeverity = 'low' | 'medium' | 'high' | 'critical' | string;

export interface SecurityEvent {
  id: string;
  device_id: string | null;
  event_type: string;
  severity: EventSeverity;
  description: string | null;
  user_id: string | null;
  created_at: string;
}

export interface UserRoleRecord {
  user_id: string;
  role: AppRole;
  created_at?: string;
}
