import React, { useState } from 'react';
import { Building2, Lock, User } from 'lucide-react';

interface LoginPageProps {
  onLogin: (token: string, user: { id: string; name: string; login: string; role: string }) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/crm/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Ошибка входа');
        return;
      }
      localStorage.setItem('crm_token', data.token);
      localStorage.setItem('crm_user', JSON.stringify(data.user));
      onLogin(data.token, data.user);
    } catch {
      setError('Сервер недоступен');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f9fc] dark:bg-[#0A0A0A] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-[#0F0F0F] rounded-2xl border border-[#e5edf5] dark:border-[#1A1A1A] shadow-sm p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 bg-[#533afd] rounded-2xl flex items-center justify-center shadow-lg shadow-[#533afd]/20 mb-4">
              <Building2 size={28} className="text-white" />
            </div>
            <h1 className="text-[22px] font-bold tracking-tight">Karty CRM</h1>
            <p className="text-[13px] text-[#64748d] mt-1">Войдите в систему</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[12px] font-bold text-[#64748d] uppercase tracking-wider mb-1.5">Логин</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748d]" />
                <input
                  type="text"
                  value={login}
                  onChange={e => setLogin(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#f6f9fc] dark:bg-white/[0.03] border border-[#e5edf5] dark:border-white/10 rounded-xl text-[14px] focus:outline-none focus:border-[#533afd] focus:ring-1 focus:ring-[#533afd] transition-all dark:text-white"
                  placeholder="Введите логин"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-bold text-[#64748d] uppercase tracking-wider mb-1.5">Пароль</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748d]" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#f6f9fc] dark:bg-white/[0.03] border border-[#e5edf5] dark:border-white/10 rounded-xl text-[14px] focus:outline-none focus:border-[#533afd] focus:ring-1 focus:ring-[#533afd] transition-all dark:text-white"
                  placeholder="Введите пароль"
                />
              </div>
            </div>

            {error && (
              <div className="px-4 py-2.5 bg-[#e71d36]/10 border border-[#e71d36]/20 rounded-xl text-[13px] text-[#e71d36] font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !login || !password}
              className="w-full py-2.5 bg-[#533afd] hover:bg-[#432AEE] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-[14px] font-bold transition-all shadow-md shadow-[#533afd]/20"
            >
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
