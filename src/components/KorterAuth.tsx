import React, { useState } from 'react';

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
        const res = await fetch('/api/auth/korter/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, login: value })
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
    <div className="flex flex-col h-full bg-[#fcfdfd] dark:bg-[#0A0A0A] transition-colors duration-500 relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[40%] bg-[#F05A28]/5 dark:bg-[#F05A28]/15 blur-[80px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[40%] bg-[#F05A28]/5 dark:bg-[#F05A28]/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="flex items-center px-4 pt-4 pb-4 bg-[#ffffff]/90 dark:bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-[#e5edf5] dark:border-white/5 z-10 transition-colors">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-white/10 mr-3 text-slate-600 dark:text-white/80">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div>
          <h1 className="text-[20px] font-bold tracking-tight text-[#061b31] dark:text-white/90 leading-tight">Вход в Korter</h1>
        </div>
      </div>

      <div className="flex-1 p-6 z-10">
        <div className="p-6 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-3xl shadow-sm">
          {step !== 'done' ? (
            <>
              <h2 className="text-lg font-bold mb-4 text-[#061b31] dark:text-white/90">
                {step === 'login' ? 'Авторизация Korter' : 'Введите код из SMS'}
              </h2>
              
              <input 
                type="text" 
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={step === 'login' ? 'Телефон или Email' : '0000'}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-black/50 text-[#061b31] dark:text-white rounded-xl mb-4 border border-slate-200 dark:border-white/10 focus:border-[#F05A28] dark:focus:border-[#F05A28] outline-none transition-colors"
                disabled={loading}
              />
              
              {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
              
              <button 
                onClick={handleNext}
                disabled={loading}
                className="w-full py-3.5 bg-[#F05A28] hover:bg-[#d94a1b] text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  step === 'login' ? 'Получить код' : 'Войти'
                )}
              </button>
            </>
          ) : (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
              </div>
              <p className="text-[#061b31] dark:text-white font-bold text-lg">Успешно подключено!</p>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 mb-6">Связь с Korter установлена</p>
              
              <button onClick={onBack} className="w-full py-3.5 bg-slate-100 dark:bg-white/10 text-[#061b31] dark:text-white rounded-xl font-medium transition-colors">
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
