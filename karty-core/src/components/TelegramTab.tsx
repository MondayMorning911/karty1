import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Play, Scan, RefreshCw, MessageSquare, Phone, User, Hash, ChevronDown, ChevronUp, Check, X, Loader2 } from 'lucide-react';
import { crmFetch } from '../lib/crmApi';

interface TgChat { id: number; chat_id: string; chat_link?: string; join_status?: string; chat_title: string; chat_type: string; last_checked_id: number; active: number; added_at: string; }
interface TgAccount { id: number; account_name: string; user_id: string; username: string; display_name: string; active: number; created_at: string; }
interface TgUser { id: number; user_id: string; username: string; phone: string; name: string; message_count: number; listing_count: number; source_chat: string; first_seen: string; last_seen: string; }
interface TgStats { total_users: number; with_phone: number; active_chats: number; active_accounts: number; }
interface TgParserStatus { running: boolean; mode?: string; cycle?: number; current_chat?: string; total_users?: number; with_phone?: number; listing_count?: number; last_cycle_at?: string; last_activity_at?: string; error?: string; }

export function TelegramTab({ token }: { token: string }) {
  const [chats, setChats] = useState<TgChat[]>([]);
  const [accounts, setAccounts] = useState<TgAccount[]>([]);
  const [users, setUsers] = useState<TgUser[]>([]);
  const [stats, setStats] = useState<TgStats>({ total_users: 0, with_phone: 0, active_chats: 0, active_accounts: 0 });
  const [section, setSection] = useState<'chats' | 'accounts' | 'users'>('chats');
  const [loading, setLoading] = useState(true);
  const [showAddChat, setShowAddChat] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loginStep, setLoginStep] = useState<'phone' | 'code' | 'password'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [accountName, setAccountName] = useState('');
  const [chatId, setChatId] = useState('');
  const [chatTitle, setChatTitle] = useState('');
  const [chatType, setChatType] = useState('group');
  const [monitoring, setMonitoring] = useState(false);
  const [parserRunning, setParserRunning] = useState(false);
  const [parserStatus, setParserStatus] = useState<TgParserStatus>({ running: false });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const authHeaders = () => ({ Authorization: `Bearer ${token}` });

  useEffect(() => {
    loadAll();
    const refresh = window.setInterval(loadAll, 30000);
    return () => window.clearInterval(refresh);
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [chatsRes, accRes, statsRes, statusRes, usersRes, leadsRes] = await Promise.all([
        crmFetch('/api/tg/chats', { headers: authHeaders() }).then(r => r.json()),
        crmFetch('/api/tg/accounts', { headers: authHeaders() }).then(r => r.json()),
        crmFetch('/api/tg/stats', { headers: authHeaders() }).then(r => r.json()),
        crmFetch('/api/tg/status', { headers: authHeaders() }).then(r => r.json()),
        crmFetch('/api/tg/users?limit=200', { headers: authHeaders() }).then(r => r.json()),
        crmFetch('/api/tg/leads?min_messages=30', { headers: authHeaders() }).then(r => r.json()),
      ]);
      setChats(chatsRes.chats || []);
      setAccounts(accRes.accounts || []);
      setStats(statsRes);
      setParserRunning(!!statusRes.running);
      setParserStatus(statusRes);
      setUsers(usersRes.users || []);
      void leadsRes;
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const flash = (type: 'error' | 'success', msg: string) => {
    if (type === 'error') setError(msg); else setSuccess(msg);
    setTimeout(() => { setError(''); setSuccess(''); }, 3000);
  };

  const addChat = async () => {
    if (!chatId.trim()) return;
    const res = await crmFetch('/api/tg/chats', { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId.trim(), chat_title: chatTitle.trim() || chatId, chat_type: chatType }) });
    const data = await res.json();
    if (data.success) { flash('success', 'Чат добавлен'); setShowAddChat(false); setChatId(''); setChatTitle(''); loadAll(); }
    else flash('error', data.error || 'Ошибка');
  };

  const deleteChat = async (chatId: string) => {
    await crmFetch(`/api/tg/chats/${chatId}`, { method: 'DELETE', headers: authHeaders() });
    loadAll();
  };

  const requestLoginCode = async () => {
    if (!phone.trim() || !accountName.trim()) return;
    const res = await crmFetch('/api/tg/accounts/login', { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: phone.trim(), account_name: accountName.trim() }) });
    const data = await res.json();
    if (data.success) { setLoginStep('code'); flash('success', data.message); }
    else flash('error', data.error || 'Ошибка');
  };

  const confirmLoginCode = async () => {
    if (!code.trim()) return;
    const res = await crmFetch('/api/tg/accounts/confirm', { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, code: code.trim(), password, account_name: accountName }) });
    const data = await res.json();
    if (data.requires_password) { setLoginStep('password'); flash('success', 'Введите пароль двухфакторной аутентификации Telegram'); return; }
    if (data.success) { flash('success', `Аккаунт ${data.name || accountName} подключен!`); setShowLogin(false); setPhone(''); setCode(''); setPassword(''); setAccountName(''); setLoginStep('phone'); loadAll(); }
    else flash('error', data.error || 'Ошибка');
  };

  const startMonitoring = async () => {
    setMonitoring(true);
    const res = await crmFetch('/api/tg/start', { method: 'POST', headers: authHeaders() });
    const data = await res.json();
    if (!res.ok || data.error) flash('error', data.error || 'Не удалось запустить мониторинг');
    else flash('success', 'Мониторинг запущен');
    setTimeout(() => setMonitoring(false), 3000);
  };

  const runScan = async () => {
    setMonitoring(true);
    const res = await crmFetch('/api/tg/scan', { method: 'POST', headers: authHeaders() });
    const data = await res.json();
    if (!res.ok || data.error) flash('error', data.error || 'Не удалось запустить скан');
    else flash('success', 'Разовый скан запущен');
    setTimeout(() => setMonitoring(false), 3000);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0A0A0A]">
      {/* Header */}
      <div className="flex flex-col px-4 pt-4 pb-3 bg-white/90 dark:bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-slate-200/80 dark:border-white/5 z-10 shrink-0">
        <h1 className="text-[26px] font-bold tracking-tight">Telegram Парсер</h1>
        <p className="text-[13px] text-slate-500 mt-1">Мониторинг чатов по недвижимости</p>
        <p className={`text-[11px] mt-1 ${parserRunning ? 'text-green-600' : 'text-slate-400'}`}>
          {parserRunning ? 'Парсер запущен' : 'Парсер остановлен'}
        </p>
        {(parserStatus.last_cycle_at || parserStatus.last_activity_at) && <p className="text-[10px] text-slate-400 mt-0.5">Цикл {parserStatus.cycle || 0} · пользователей {parserStatus.total_users || 0} · объявлений {parserStatus.listing_count || 0} · {new Date(parserStatus.last_activity_at || parserStatus.last_cycle_at || '').toLocaleTimeString()}</p>}
        {parserStatus.error && <p className="text-[10px] text-red-500 mt-0.5 truncate">Ошибка: {parserStatus.error}</p>}

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2 mt-3">
          {[
            { label: 'Пользователей', value: stats.total_users, icon: <User size={14} /> },
            { label: 'С телефонами', value: stats.with_phone, icon: <Phone size={14} /> },
            { label: 'Чатов', value: stats.active_chats, icon: <MessageSquare size={14} /> },
            { label: 'Аккаунтов', value: stats.active_accounts, icon: <Hash size={14} /> },
          ].map((s, i) => (
            <div key={i} className="bg-slate-50 rounded-lg p-2 text-center border border-slate-100">
              <div className="flex items-center justify-center gap-1 text-[#533afd] mb-0.5">{s.icon}<span className="text-[15px] font-bold">{s.value}</span></div>
              <p className="text-[9px] text-slate-500 uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3">
          {([ { id: 'chats' as const, label: 'Чаты' }, { id: 'accounts' as const, label: 'Аккаунты' }, { id: 'users' as const, label: 'Пользователи' } ]).map(t => (
            <button key={t.id} onClick={() => setSection(t.id)} className={`flex-1 py-2 rounded-xl text-[12px] font-medium transition-all ${section === t.id ? 'bg-[#533afd] text-white' : 'bg-slate-100 text-slate-600'}`}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Flash messages */}
      {error && <div className="mx-4 mt-2 px-3 py-2 bg-red-50 border border-red-200 text-red-700 rounded-xl text-[12px]">{error}</div>}
      {success && <div className="mx-4 mt-2 px-3 py-2 bg-green-50 border border-green-200 text-green-700 rounded-xl text-[12px]">{success}</div>}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading && <p className="text-center text-sm text-gray-500 mt-4">Загрузка...</p>}

        {/* === CHATS === */}
        {section === 'chats' && !loading && (
          <>
            {/* Action buttons */}
            <div className="flex gap-2">
              <button onClick={() => setShowAddChat(true)} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#533afd] text-white rounded-xl text-[12px] font-semibold hover:bg-[#4330e0]">
                <Plus size={14} /> Добавить чат
              </button>
              <button onClick={startMonitoring} disabled={monitoring || chats.length === 0} className="flex items-center gap-1.5 px-4 py-2.5 bg-green-600 text-white rounded-xl text-[12px] font-semibold hover:bg-green-700 disabled:opacity-50">
                {monitoring ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                Мониторинг
              </button>
              <button onClick={runScan} disabled={monitoring || chats.length === 0} className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-[12px] font-semibold hover:bg-blue-700 disabled:opacity-50">
                <Scan size={14} /> Скан
              </button>
            </div>

            <div className={`rounded-xl border px-3 py-2 text-[11px] ${parserRunning ? 'bg-green-50 border-green-200 text-green-800' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
              <div className="flex items-center justify-between font-semibold">
                <span>{parserRunning ? 'Мониторинг работает' : 'Мониторинг остановлен'}</span>
                <span>{parserStatus.mode || '—'} · цикл {parserStatus.cycle || 0}</span>
              </div>
              <div className="mt-1">Чатов: {stats.active_chats} · пользователей: {parserStatus.total_users || stats.total_users} · объявлений: {parserStatus.listing_count || 0}</div>
              {parserStatus.current_chat && <div className="mt-0.5 truncate">Сейчас: {parserStatus.current_chat}</div>}
              {parserStatus.last_cycle_at && <div className="mt-0.5 opacity-75">Последняя активность: {new Date(parserStatus.last_cycle_at).toLocaleString()}</div>}
              {parserStatus.error && <div className="mt-0.5 text-red-600">Ошибка: {parserStatus.error}</div>}
            </div>

            {/* Add chat form */}
            {showAddChat && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-semibold">Новый чат</p>
                  <button onClick={() => setShowAddChat(false)} className="p-1 hover:bg-slate-100 rounded-lg"><X size={16} /></button>
                </div>
               <input value={chatId} onChange={e => setChatId(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] outline-none focus:border-[#533afd]" placeholder="Ссылка на чат или ID (-100...)" />
                <input value={chatTitle} onChange={e => setChatTitle(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] outline-none focus:border-[#533afd]" placeholder="Название чата (опционально)" />
                <div className="flex gap-2">
                  <select value={chatType} onChange={e => setChatType(e.target.value)} className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] outline-none">
                    <option value="group">Группа</option>
                    <option value="channel">Канал</option>
                  </select>
                  <button onClick={addChat} className="px-6 py-2.5 bg-[#533afd] text-white rounded-xl text-[12px] font-semibold">Добавить</button>
                </div>
              </div>
            )}

            {/* Chat list */}
            {chats.map(chat => (
              <div key={chat.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold truncate">{chat.chat_title || chat.chat_id}</p>
                   <p className="text-[11px] text-slate-500 mt-0.5">{chat.chat_type} · {chat.join_status === 'pending' ? 'Ожидает обработки' : (chat.join_status || 'pending')} · Проверено до: {chat.last_checked_id}</p>
                </div>
                <button onClick={() => deleteChat(chat.chat_id)} className="p-2 hover:bg-red-50 rounded-xl text-slate-400 hover:text-red-500 shrink-0"><Trash2 size={16} /></button>
              </div>
            ))}
            {chats.length === 0 && !showAddChat && <p className="text-center text-[13px] text-slate-400 mt-8">Добавьте чаты для мониторинга</p>}
          </>
        )}

        {/* === ACCOUNTS === */}
        {section === 'accounts' && !loading && (
          <>
            <button onClick={() => setShowLogin(true)} className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#533afd] text-white rounded-xl text-[12px] font-semibold hover:bg-[#4330e0]">
              <Plus size={14} /> Добавить аккаунт
            </button>

            {/* Login form */}
            {showLogin && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-semibold">{loginStep === 'phone' ? 'Новый аккаунт' : 'Введите код'}</p>
                   <button onClick={() => { setShowLogin(false); setLoginStep('phone'); setPhone(''); setCode(''); setPassword(''); setAccountName(''); }} className="p-1 hover:bg-slate-100 rounded-lg"><X size={16} /></button>
                </div>
                {loginStep === 'phone' ? (
                  <>
                    <input value={accountName} onChange={e => setAccountName(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] outline-none focus:border-[#533afd]" placeholder="Название аккаунта (напр. main)" />
                    <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] outline-none focus:border-[#533afd]" placeholder="+995XXXXXXXXX" />
                    <button onClick={requestLoginCode} className="w-full py-2.5 bg-[#533afd] text-white rounded-xl text-[12px] font-semibold">Отправить код</button>
                  </>
                ) : (
                  <>
                    {loginStep === 'code' && <><p className="text-[12px] text-slate-500">Код отправлен на {phone}</p><input value={code} onChange={e => setCode(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] outline-none focus:border-[#533afd]" placeholder="Код из Telegram" autoFocus /></>}
                    {loginStep === 'password' && <><p className="text-[12px] text-slate-500">Введите пароль 2FA для {phone}</p><input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] outline-none focus:border-[#533afd]" placeholder="Пароль Telegram 2FA" autoFocus /></>}
                    <button onClick={confirmLoginCode} className="w-full py-2.5 bg-green-600 text-white rounded-xl text-[12px] font-semibold">Подтвердить</button>
                  </>
                )}
              </div>
            )}

            {/* Account list */}
            {accounts.map(acc => (
              <div key={acc.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
                <div className="w-10 h-10 rounded-full bg-[#533afd] flex items-center justify-center text-white text-[14px] font-bold shrink-0">
                  {(acc.display_name || acc.account_name || '?')[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold">{acc.display_name || acc.account_name}</p>
                  <p className="text-[11px] text-slate-500">@{acc.username || acc.account_name} · {acc.active ? 'Активен' : 'Неактивен'}</p>
                </div>
                <div className={`w-2.5 h-2.5 rounded-full ${acc.active ? 'bg-green-500' : 'bg-gray-300'}`} />
              </div>
            ))}
            {accounts.length === 0 && !showLogin && <p className="text-center text-[13px] text-slate-400 mt-8">Добавьте Telegram аккаунт для мониторинга</p>}
          </>
        )}

        {/* === USERS === */}
        {section === 'users' && !loading && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-[13px] text-slate-500">Найдено: {users.length} пользователей</p>
              <button onClick={loadAll} className="p-2 hover:bg-slate-100 rounded-xl text-slate-500"><RefreshCw size={16} /></button>
            </div>

            {users.length > 0 ? (
              <div className="space-y-2">
                {/* Header */}
                <div className="crm-telegram-head grid grid-cols-12 gap-2 px-3 text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                  <div className="col-span-3">Имя</div>
                  <div className="col-span-2">Username</div>
                  <div className="col-span-2">Телефон</div>
                  <div className="col-span-2">Объявлений</div>
                  <div className="col-span-3">Источник</div>
                </div>
                {users.map(u => (
                  <div key={u.id} className="crm-telegram-row bg-white border border-slate-200 rounded-xl p-3 grid grid-cols-12 gap-2 items-center text-[12px] shadow-sm">
                    <div className="col-span-3 font-medium truncate">{u.name || '—'}</div>
                    <div className="col-span-2 text-[#533afd] truncate">{u.username ? <a href={`https://t.me/${u.username}`} target="_blank" rel="noreferrer" className="hover:underline">@{u.username}</a> : '—'}</div>
                    <div className="col-span-2 font-mono truncate">{u.phone || '—'}</div>
                    <div className="col-span-2 font-bold">{u.listing_count || 0}<span className="block text-[10px] text-slate-400 font-normal">сообщений: {u.message_count}</span></div>
                    <div className="col-span-3 text-slate-500 truncate text-[11px]">{u.source_chat || '—'} · объявлений: {u.listing_count || 0}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-[13px] text-slate-400 mt-8">Пока нет собранных пользователей</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
