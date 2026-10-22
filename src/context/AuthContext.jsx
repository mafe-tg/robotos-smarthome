import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext();

const ROLE_LEVELS = {
  ADMIN: 3,
  USER: 2,
  GUEST: 1,
};

export const AuthProvider = ({ children }) => {
  // Usuario por defecto para el prototipo (ADMIN para ver todo inicialmente)
  const [user, setUser] = useState({
    id: 'usr_admin',
    email: 'admin@robotos.local',
    name: 'Operador Admin',
    role: 'ADMIN', // ADMIN | USER | GUEST
  });

  const [authError, setAuthError] = useState(null);
  const [deniedModal, setDeniedModal] = useState(null); // { message, reason }

  // Cambiar rol rápidamente para pruebas del prototipo
  const switchRole = (newRole) => {
    if (ROLE_LEVELS[newRole]) {
      setUser((prev) => ({
        ...prev,
        role: newRole,
        name: newRole === 'ADMIN' ? 'Operador Admin' : newRole === 'USER' ? 'Residente Hogar' : 'Invitado Temporal',
        email: `${newRole.toLowerCase()}@robotos.local`,
      }));
    }
  };

  // Función de login con Supabase Auth (con fallback a cuentas de prueba)
  const login = async (email, password) => {
    setAuthError(null);
    try {
      // Intento con Supabase
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!error && data?.user) {
        const assignedRole = data.user.user_metadata?.role || 'USER';
        setUser({
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.name || email.split('@')[0],
          role: assignedRole,
        });
        return { success: true };
      }

      // Si falla o no hay conexión con Supabase backend, permitir usuarios de prueba predeterminados
      if (email.includes('admin')) {
        setUser({ id: 'u_adm', email, name: 'Operador Admin', role: 'ADMIN' });
        return { success: true };
      } else if (email.includes('guest')) {
        setUser({ id: 'u_gst', email, name: 'Invitado Temporal', role: 'GUEST' });
        return { success: true };
      } else {
        setUser({ id: 'u_usr', email, name: 'Residente', role: 'USER' });
        return { success: true };
      }
    } catch (err) {
      setAuthError(err.message || 'Error de autenticación');
      return { success: false, error: err.message };
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      // Ignorar error de red si no está configurado Supabase
    }
    setUser(null);
  };

  /**
   * Valida si el usuario actual cumple con el rol mínimo necesario.
   * Si no tiene permiso, muestra alerta de ACCESO DENEGADO y devuelve false.
   */
  const checkPermission = (requiredRole, actionDescription, logActionCallback) => {
    const currentLevel = user ? ROLE_LEVELS[user.role] || 0 : 0;
    const requiredLevel = ROLE_LEVELS[requiredRole] || 1;

    if (currentLevel < requiredLevel) {
      const reason = `El rol actual (${user ? user.role : 'NO_AUTH'}) no tiene permisos para "${actionDescription}". Se requiere rol ${requiredRole}.`;
      
      // Mostrar modal visual
      setDeniedModal({
        title: 'ACCESO DENEGADO',
        action: actionDescription,
        reason: reason,
      });

      // Registrar en logs del sistema si se pasa la función de callback
      if (logActionCallback) {
        logActionCallback({
          level: 'ERROR',
          source: 'SECURITY_GUARD',
          message: `[ACCESO DENEGADO] Intento no autorizado por ${user?.email || 'Desconocido'}: "${actionDescription}". Motivo: ${reason}`,
        });
      }

      return false;
    }

    return true;
  };

  const closeDeniedModal = () => setDeniedModal(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role || 'GUEST',
        isAuthenticated: !!user,
        switchRole,
        login,
        logout,
        checkPermission,
        deniedModal,
        closeDeniedModal,
        authError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
