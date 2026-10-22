import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const LoginPage = ({ onNavigate }) => {
  const { login, authError, role, user } = useAuth();
  const [email, setEmail] = useState('admin@robotos.local');
  const [password, setPassword] = useState('robotos123');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const res = await login(email, password);
    setLoading(false);

    if (res.success) {
      setMessage({ type: 'success', text: 'Sesión iniciada correctamente. Redirigiendo...' });
      setTimeout(() => {
        onNavigate('overview');
      }, 800);
    } else {
      setMessage({ type: 'error', text: res.error || 'Credenciales inválidas.' });
    }
  };

  const handleQuickFill = (roleType) => {
    setEmail(`${roleType.toLowerCase()}@robotos.local`);
    setPassword('robotos123');
  };

  return (
    <div className="max-w-md mx-auto my-12 p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-cyan-500/20">
          R
        </div>
        <h2 className="text-xl font-bold text-white tracking-tight">Acceso a RobotOS</h2>
        <p className="text-xs text-slate-400">
          Autenticación mediante Supabase Auth con control de roles (RBAC)
        </p>
      </div>

      {user && (
        <div className="p-3 rounded-xl bg-slate-950 border border-cyan-800/60 flex items-center justify-between text-xs font-mono">
          <span className="text-slate-400">Sesión actual:</span>
          <span className="text-cyan-400 font-bold">{user.email} ({role})</span>
        </div>
      )}

      {message && (
        <div
          className={`p-3 rounded-xl text-xs font-medium ${
            message.type === 'success'
              ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
              : 'bg-red-950/60 border border-red-800 text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {authError && (
        <div className="p-3 rounded-xl bg-red-950/60 border border-red-800 text-xs text-red-300">
          {authError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1.5">
            Correo Electrónico
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:outline-none text-sm text-white font-mono"
            placeholder="operador@robotos.local"
          />
        </div>

        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1.5">
            Contraseña
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:outline-none text-sm text-white font-mono"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold text-sm transition-all shadow-lg shadow-cyan-600/20"
        >
          {loading ? 'Validando con Supabase...' : 'Entrar a RobotOS'}
        </button>
      </form>

      {/* Cuentas Rápidas de Prueba */}
      <div className="pt-4 border-t border-slate-800 space-y-2">
        <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 text-center">
          Credenciales Rápidas de Prueba:
        </p>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => handleQuickFill('ADMIN')}
            className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-purple-500/60 text-xs font-mono text-purple-400 transition-colors"
          >
            ADMIN
          </button>
          <button
            type="button"
            onClick={() => handleQuickFill('USER')}
            className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-blue-500/60 text-xs font-mono text-blue-400 transition-colors"
          >
            USER
          </button>
          <button
            type="button"
            onClick={() => handleQuickFill('GUEST')}
            className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-600 text-xs font-mono text-slate-400 transition-colors"
          >
            GUEST
          </button>
        </div>
      </div>
    </div>
  );
};
