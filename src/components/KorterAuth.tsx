import React, { useState } from 'react';
import { Home } from 'lucide-react';
import { AuthAnimation } from './AuthAnimation';

export const KorterAuth = ({ onBack, userId }: { onBack: () => void, userId: string }) => {

  const [step, setStep] = useState<'login' | 'code' | 'done'>('login');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleNext = async () => {
    setError('');
    
    if (step === 'login') {
      if (!value) return setError('Введите телефон или email');
      
      setLoading(true);
      try {
        let finalLogin = value.trim();
        // If it looks like a phone number (just digits) and doesn't start with +, prepend +995
        if (/^\d{9}$/.test(finalLogin)) {
           finalLogin = '+995' + finalLogin;
        } else if (/^995\d{9}$/.test(finalLogin)) {
           finalLogin = '+' + finalLogin;
        }

        const res = await fetch('/api/auth/korter/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, login: finalLogin })
        });
        const data = await res.json();
        
        if (data.status === 'awaiting_code') {
          setStep('code');
          setValue('');
        } else {
          setError(data.message || 'Ошибка запуска авторизации');
        }
      } catch (err: any) {
        setError(err.message || 'Ошибка сети');
      } finally {
        setLoading(false);
      }
      
    } else if (step === 'code') {
      if (!value) return setError('Введите код');
      
      setLoading(true);
      try {
        const res = await fetch('/api/auth/korter/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, code: value })
        });
        const data = await res.json();
        
        if (data.status === 'success') {
          setStep('done');
        } else {
          setError(data.message || 'Неверный код или ошибка');
        }
      } catch (err: any) {
        setError(err.message || 'Ошибка сети');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0A0A0A] transition-colors duration-500 relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[40%] bg-[#F05A28]/5 dark:bg-[#F05A28]/15 blur-[80px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[40%] bg-[#F05A28]/5 dark:bg-[#F05A28]/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="flex items-center px-4 pt-4 pb-4 bg-white/90 dark:bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-slate-200/80 dark:border-white/5 z-10 transition-colors">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-white/10 mr-3 text-slate-600 dark:text-white/80">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div>
          <h1 className="text-[20px] font-bold tracking-tight text-slate-900 dark:text-white/90 leading-tight">Вход в Korter</h1>
        </div>
      </div>

      <div className="flex-1 p-6 z-10">
        <div className="p-6 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-3xl shadow-sm">
          {step !== 'done' ? (
            <>
              <h2 className="text-lg font-bold mb-4 text-slate-900 dark:text-white/90">
                {step === 'login' ? 'Авторизация Korter' : 'Введите код из SMS'}
              </h2>
              
              {loading ? (
                <AuthAnimation theme="korter" />
              ) : (
                <>
                  <input 
                    type="text" 
                    value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={step === 'login' ? 'Телефон или Email' : '0000'}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-black/50 text-slate-900 dark:text-white rounded-xl mb-4 border border-slate-200 dark:border-white/10 focus:border-[#F05A28] dark:focus:border-[#F05A28] outline-none transition-colors"
                disabled={loading}
              />
              
              {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
              
              <div className="mb-5 p-3 rounded-xl bg-orange-50 dark:bg-orange-500/10 border border-orange-100 dark:border-orange-500/20 text-orange-800 dark:text-orange-300 text-xs flex items-start gap-2">
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                <p>Мы <b>не храним ваш пароль или код</b>. Они используются один раз для создания зашифрованной сессии.</p>
              </div>

                  <button 
                    onClick={handleNext}
                    disabled={loading}
                    className="w-full py-3.5 bg-[#F05A28] hover:bg-[#d94a1b] text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center"
                  >
                    {step === 'login' ? 'Получить код' : 'Войти'}
                  </button>
                </>
              )}
            </>
          ) : (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
              </div>
              <p className="text-slate-900 dark:text-white font-bold text-lg">Успешно подключено!</p>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 mb-6">Связь с Korter установлена</p>
              
              <button onClick={onBack} className="w-full py-3.5 bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white rounded-xl font-medium transition-colors">
                Вернуться к площадкам
              </button>
            </div>
          )}
        </div>
        
        <p className="text-center text-xs text-slate-500 mt-6">
          Karty использует headless-браузер для безопасного соединения с серверами площадки.
        </p>
      </div>
    </div>
  );
};
