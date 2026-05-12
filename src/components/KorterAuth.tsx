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
              
              {loading ? (
                <div className="flex flex-col items-center justify-center py-10 opacity-0 animate-[fadeIn_0.5s_ease-out_forwards]">
                  <div className="relative w-24 h-24 mb-6 mt-2">
                    {/* Clouds */}
                    <svg className="w-24 h-12 text-slate-200/50 dark:text-white/5 absolute bottom-0" fill="currentColor" viewBox="0 0 24 24"><path d="M19.333 14.667a4.667 4.667 0 00-4.666-4.667 4.667 4.667 0 00-4.667-4.667 4.667 4.667 0 00-4.667 4.667A4.667 4.667 0 00.667 14.667h18.666z"/></svg>
                    {/* Bouncing House */}
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-2 animate-[bounce_1.5s_infinite]">
                      <svg className="w-10 h-10 drop-shadow-lg" viewBox="0 0 24 24" fill="#F05A28">
                        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                      </svg>
                    </div>
                  </div>
                  <h3 className="text-base font-bold text-[#061b31] dark:text-white text-center mb-2 animate-pulse">
                    Связываемся с площадкой...
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 text-center px-4 leading-relaxed">
                    Авторизация занимает от 15 до 40 секунд.<br/>Мы почти у цели 🔑
                  </p>
                </div>
              ) : (
                <>
                  <input 
                    type="text" 
                    value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={step === 'login' ? 'Телефон или Email' : '0000'}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-black/50 text-[#061b31] dark:text-white rounded-xl mb-4 border border-slate-200 dark:border-white/10 focus:border-[#F05A28] dark:focus:border-[#F05A28] outline-none transition-colors"
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
