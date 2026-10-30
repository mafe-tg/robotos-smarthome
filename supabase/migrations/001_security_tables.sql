-- ==============================================================================
-- Migración: 001_security_tables.sql
-- Descripción: Módulo de Seguridad y Dispositivos para RobotOS
-- ==============================================================================

-- 1. Crear Enum app_role si no existe
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE public.app_role AS ENUM ('ADMIN', 'USER', 'GUEST');
    END IF;
END $$;

-- 2. Tabla user_roles
-- Asocia usuarios de Supabase Auth con su rol en la aplicación
CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role public.app_role NOT NULL DEFAULT 'USER',
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (user_id, role)
);

-- 3. Tabla devices
-- Registra los dispositivos inteligentes gestionados por RobotOS
CREATE TABLE IF NOT EXISTS public.devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'offline',
    last_seen TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabla security_events
-- Registra eventos e incidentes de seguridad asociados a dispositivos o usuarios
CREATE TABLE IF NOT EXISTS public.security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    description TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 5. Índices en device_id, event_type y created_at
CREATE INDEX IF NOT EXISTS idx_security_events_device_id ON public.security_events(device_id);
CREATE INDEX IF NOT EXISTS idx_security_events_event_type ON public.security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON public.security_events(created_at DESC);

-- 6. Habilitar Row Level Security (RLS) en todas las tablas
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- 7. Funciones auxiliares y Políticas de Seguridad (RLS)

-- Función auxiliar para verificar si el usuario autenticado tiene rol de ADMIN
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'ADMIN'
  );
$$;

-- Políticas para user_roles:
-- Los usuarios pueden consultar sus propios roles; los administradores pueden ver y gestionar todos
CREATE POLICY "Users can read own roles"
    ON public.user_roles FOR SELECT
    TO authenticated
    USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Admins can manage user roles"
    ON public.user_roles FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Políticas para devices:
-- 1. SELECT: cualquier usuario autenticado puede leer
CREATE POLICY "Authenticated users can read devices"
    ON public.devices FOR SELECT
    TO authenticated
    USING (true);

-- 2. INSERT: solo administradores pueden crear dispositivos
CREATE POLICY "Solo admins pueden crear dispositivos"
    ON public.devices FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

-- 3. UPDATE: solo administradores pueden modificar dispositivos
CREATE POLICY "Solo admins pueden modificar dispositivos"
    ON public.devices FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 4. DELETE: solo administradores pueden eliminar dispositivos
CREATE POLICY "Solo admins pueden eliminar dispositivos"
    ON public.devices FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- Políticas para security_events:
-- Cualquier usuario autenticado puede leer eventos de seguridad y registrar eventos generados
CREATE POLICY "Authenticated users can read security events"
    ON public.security_events FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can insert security events"
    ON public.security_events FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL OR public.is_admin());

CREATE POLICY "Admins can manage security events"
    ON public.security_events FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());
