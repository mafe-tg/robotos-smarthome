import React from 'react';
import { AuthProvider } from './context/AuthContext';
import { SystemProvider } from './context/SystemContext';
import { Desktop } from './features/desktop/Desktop';

/**
 * RobotOS arranca como un sistema operativo de escritorio: secuencia de boot,
 * elección de perfil y escritorio con ventanas. Cada módulo del proyecto es una
 * app que se abre en su propia ventana (ver src/features/desktop/apps.js).
 */
export default function App() {
  return (
    <AuthProvider>
      <SystemProvider>
        <Desktop />
      </SystemProvider>
    </AuthProvider>
  );
}
