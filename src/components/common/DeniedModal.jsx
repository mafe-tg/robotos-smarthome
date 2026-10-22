import React from 'react';
import { useAuth } from '../../context/AuthContext';

export const DeniedModal = () => {
  const { deniedModal, closeDeniedModal } = useAuth();

  if (!deniedModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border-2 border-red-500/80 bg-slate-900 p-6 shadow-2xl shadow-red-500/20 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 text-red-500 border border-red-500/30">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <h3 className="text-xl font-black tracking-wider text-red-500 uppercase">
          {deniedModal.title || 'ACCESO DENEGADO'}
        </h3>
        
        <p className="mt-2 text-sm text-slate-300 font-medium">
          Acción intentada: <span className="text-white font-semibold">{deniedModal.action}</span>
        </p>

        <div className="mt-4 rounded-lg bg-red-950/40 border border-red-900/60 p-3 text-left">
          <p className="text-xs font-mono text-red-300 leading-relaxed">
            {deniedModal.reason}
          </p>
        </div>

        <p className="mt-3 text-xs text-slate-400">
          Este incidente ha sido registrado en la bitácora de auditoría de RobotOS.
        </p>

        <button
          onClick={closeDeniedModal}
          className="mt-6 w-full rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold py-2.5 px-4 transition-colors shadow-lg shadow-red-600/30"
        >
          Entendido
        </button>
      </div>
    </div>
  );
};
