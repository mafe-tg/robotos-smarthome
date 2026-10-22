import React from 'react';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { DeniedModal } from '../common/DeniedModal';

export const MainLayout = ({ currentScreen, onNavigate, children }) => {
  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Sidebar fijo a la izquierda */}
      <Sidebar currentScreen={currentScreen} onNavigate={onNavigate} />

      {/* Área principal con Navbar y contenido */}
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar currentScreen={currentScreen} onNavigate={onNavigate} />
        
        <main className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>

      {/* Modal global de Acceso Denegado */}
      <DeniedModal />
    </div>
  );
};
