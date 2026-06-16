import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../lib/supabase';
import { Lock, Save, AlertTriangle } from 'lucide-react';

export default function UpdatePassword({ onPasswordUpdated, recoveryToken }) {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [updateError, setUpdateError] = useState(null);
  const [sessionStatus, setSessionStatus] = useState('checking');

  useEffect(() => {
    if (recoveryToken) {
      setSessionStatus('ok');
    } else {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSessionStatus(session ? 'ok' : 'missing');
      });
    }
  }, [recoveryToken]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setUpdateError(null);
    try {
      if (recoveryToken) {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/user`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${recoveryToken}`
          },
          body: JSON.stringify({ password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.msg || data.message || 'Erreur lors de la mise à jour');
      } else {
        const { error: authUpdateError } = await supabase.auth.updateUser({ password });
        if (authUpdateError) throw authUpdateError;
      }
      onPasswordUpdated();
    } catch (err) {
      setUpdateError(err.message || 'Erreur lors de la mise à jour.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-beige-100 px-4">
      <div className="w-full max-w-md p-8 bg-white rounded-3xl shadow-2xl border border-beige-200">
        <h2 className="text-2xl font-extrabold text-neutral-900 mb-6 text-center">Nouveau mot de passe</h2>
        
        {sessionStatus === 'missing' && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium flex items-start gap-3">
            <AlertTriangle className="flex-shrink-0" size={20} />
            <p><strong>Lien expiré ou invalide.</strong> Supabase n'a pas pu vous connecter avec ce lien. Veuillez demander un nouveau lien de réinitialisation.</p>
          </div>
        )}

        {updateError && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium text-center">
            {updateError}
          </div>
        )}
        <form onSubmit={handleUpdate} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2 ml-1">Nouveau mot de passe</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-neutral-400">
                <Lock size={18} />
              </div>
              <input
                type="password"
                required
                disabled={sessionStatus === 'missing'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-beige-50 border border-beige-200 rounded-2xl focus:ring-2 focus:ring-terracotta-500 disabled:opacity-50"
                placeholder="••••••••"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={isLoading || password.length < 6 || sessionStatus !== 'ok'}
            className="w-full flex items-center justify-center py-4 px-6 rounded-2xl text-white bg-terracotta-600 hover:bg-terracotta-500 transition-all font-bold disabled:opacity-50"
          >
            {isLoading ? 'Mise à jour...' : <><Save size={18} className="mr-3" /> Enregistrer</>}
          </button>
        </form>
      </div>
    </div>
  );
}

UpdatePassword.propTypes = {
  onPasswordUpdated: PropTypes.func.isRequired,
  recoveryToken: PropTypes.string,
};

