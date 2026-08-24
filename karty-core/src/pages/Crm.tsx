import React, { useState, useEffect } from 'react';
import {
  Users,
  BarChart3,
  CreditCard,
  Building2,
  Settings,
  Search,
  Filter,
  MoreVertical,
  MessageCircle,
  LogOut,
  ChevronRight,
  TrendingUp,
  Briefcase,
  Database,
  MessageSquare
} from 'lucide-react';
import { KorterIcon, SSIcon, MyHomeIcon } from '../components/PlatformIcons';
import { CrmChats } from './CrmChats';
import { ParserTab } from '../components/ParserTab';
import { TelegramTab } from '../components/TelegramTab';
import { LoginPage } from './LoginPage';
import { crmFetch } from '../lib/crmApi';

type Tab = 'dashboard' | 'chat' | 'leads' | 'finances' | 'parser' | 'telegram' | 'settings';

interface AuthUser {
  id: string;
  name: string;
  login: string;
  role: 'admin' | 'manager';
}

export function Crm() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [leadsCount, setLeadsCount] = useState(0);
  const [chatsCount, setChatsCount] = useState(0);

  useEffect(() => {
    const savedToken = localStorage.getItem('crm_token');
    const savedUser = localStorage.getItem('crm_user');
    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setAuthUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('crm_token');
        localStorage.removeItem('crm_user');
      }
    }
  }, []);

  useEffect(() => {
    if (!token) return;

    crmFetch('/api/crm/session', { headers: { Authorization: `Bearer ${token}` } }).then(response => {
      if (!response.ok) {
        localStorage.removeItem('crm_token');
        localStorage.removeItem('crm_user');
        setToken(null);
        setAuthUser(null);
      }
    }).catch(() => {});

    const refreshCounts = () => {
      const headers = { Authorization: `Bearer ${token}` };
      crmFetch('/api/crm/leads?status=all', { headers })
        .then(r => r.json())
        .then(data => setLeadsCount((data.leads || []).length))
        .catch(() => {});
      crmFetch('/api/crm/chats', { headers })
        .then(r => r.json())
        .then(data => setChatsCount((data.chats || []).filter((c: any) => c.unread).length))
        .catch(() => {});
    };

    refreshCounts();
    // Refresh every 10 seconds for dynamic updates during parsing
    const interval = setInterval(refreshCounts, 10000);
    return () => clearInterval(interval);
  }, [token]);

  const handleLogin = (newToken: string, user: AuthUser) => {
    setToken(newToken);
    setAuthUser(user);
  };

  const handleLogout = () => {
    try {
      const t = localStorage.getItem('crm_token');
      if (t) fetch('/api/crm/logout', { method: 'POST', headers: { Authorization: `Bearer ${t}` } }).catch(() => {});
    } catch {}
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    setToken(null);
    setAuthUser(null);
    setActiveTab('chat');
  };

  if (!authUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const userRole = authUser.role;
  const currentManagerId = authUser.id;

  return (
      <div className="crm-shell flex h-screen bg-[#f7f9fc] dark:bg-[#0A0A0A] text-[#061b31] dark:text-gray-200 font-sans overflow-hidden transition-colors duration-500">
      
      {/* Sidebar */}
      <aside className="crm-sidebar hidden md:flex w-64 bg-[#ffffff] dark:bg-[#0F0F0F] border-r border-[#e5edf5] dark:border-[#1A1A1A] flex-col transition-colors duration-500 z-10">
        <div className="h-16 flex items-center px-6 border-b border-[#e5edf5] dark:border-[#1A1A1A]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#533afd] rounded-xl flex items-center justify-center shadow-lg shadow-[#533afd]/20">
              <Building2 size={18} className="text-white" />
            </div>
            <span className="font-bold text-[18px] tracking-tight">Karty CRM</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
          <NavItem icon={<MessageCircle />} label="Чаты и сообщения" active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} badge={chatsCount > 0 ? String(chatsCount) : undefined} />
          <NavItem icon={<BarChart3 />} label="Дашборд" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavItem icon={<Users />} label="База лидов" active={activeTab === 'leads'} onClick={() => setActiveTab('leads')} badge={leadsCount > 0 ? String(leadsCount) : undefined} />
          <NavItem icon={<CreditCard />} label="Финансы" active={activeTab === 'finances'} onClick={() => setActiveTab('finances')} />
          {userRole === 'admin' && <NavItem icon={<Database />} label="Парсер" active={activeTab === 'parser'} onClick={() => setActiveTab('parser')} />}
          {userRole === 'admin' && <NavItem icon={<MessageSquare />} label="Telegram" active={activeTab === 'telegram'} onClick={() => setActiveTab('telegram')} />}
          {userRole === 'admin' && <NavItem icon={<Settings />} label="Настройки" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />}
        </nav>

        <div className="p-4 border-t border-[#e5edf5] dark:border-[#1A1A1A]">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#533afd] to-[#806BFF] flex items-center justify-center text-white font-bold text-sm shadow-sm">
              {authUser.name.substring(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-[14px] font-semibold truncate">{authUser.name}</p>
              <p className="text-[12px] text-[#64748d]">
                {userRole === 'admin' ? 'Администратор' : 'Менеджер'}
              </p>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 text-[#64748d] hover:text-[#e71d36] hover:bg-[#e71d36]/5 rounded-lg transition-colors text-sm font-medium">
            <LogOut size={16} />
            Выйти
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="crm-main flex-1 min-w-0 flex flex-col h-screen overflow-hidden relative">
        {/* Topbar only for other views */}
        {activeTab !== 'chat' && (
        <header className="crm-topbar h-16 bg-[#ffffff]/80 dark:bg-[#0F0F0F]/80 backdrop-blur-md border-b border-[#e5edf5] dark:border-[#1A1A1A] flex items-center justify-between px-8 z-20 transition-colors duration-500 absolute w-full top-0">
          <h1 className="text-[20px] font-bold tracking-tight">
            {activeTab === 'dashboard' && 'Общая сводка'}
            {activeTab === 'leads' && 'База лидов'}
            {activeTab === 'finances' && 'Финансы и выплаты'}
            {activeTab === 'parser' && 'Парсер риэлторов'}
            {activeTab === 'telegram' && 'Telegram Парсер'}
            {activeTab === 'settings' && 'Настройки системы'}
          </h1>
          
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748d] w-4 h-4" />
              <input 
                type="text" 
                placeholder="Поиск по CRM..."
                className="w-64 pl-9 pr-4 py-2 bg-[#f6f9fc] dark:bg-white/[0.03] border border-[#e5edf5] dark:border-white/10 rounded-full text-[13px] focus:outline-none focus:border-[#533afd] focus:ring-1 focus:ring-[#533afd] transition-all"
              />
            </div>
            <button className="relative p-2 text-[#64748d] hover:text-[#061b31] dark:hover:text-white transition-colors">
              <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#e71d36] rounded-full border border-white dark:border-[#0F0F0F]"></div>
              <MessageCircle size={20} />
            </button>
          </div>
        </header>
        )}

        {/* Dynamic Content */}
        <div className={`crm-content flex-1 overflow-auto relative ${activeTab === 'chat' ? 'p-0 pt-0' : 'p-8 pt-24'}`}>
          {activeTab !== 'chat' && <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] bg-[#533afd]/5 dark:bg-[#533afd]/10 blur-[100px] rounded-full pointer-events-none" />}
          
          <div className={`${activeTab === 'chat' ? 'h-full w-full max-w-none flex flex-col relative z-20' : 'max-w-7xl mx-auto space-y-8 relative z-20'}`}>
            {activeTab === 'dashboard' && <Dashboard userRole={userRole} />}
            {activeTab === 'chat' && <CrmChats userRole={userRole} currentManagerId={currentManagerId} />}
            {activeTab === 'leads' && <LeadsWorkspace />}
            {activeTab === 'finances' && <Finances userRole={userRole} />}
            {activeTab === 'parser' && <ParserTab />}
            {activeTab === 'telegram' && <TelegramTab token={token || ''} />}
            {activeTab === 'settings' && <SettingsPanel />}
          </div>
        </div>
      </main>
      <nav className="crm-mobile-nav md:hidden fixed bottom-0 inset-x-0 z-50 bg-white/95 dark:bg-[#0F0F0F]/95 backdrop-blur-lg border-t border-[#e5edf5] dark:border-white/10 grid grid-cols-5 px-1 pb-[env(safe-area-inset-bottom)]">
        {[
          ['chat', 'Чаты', MessageCircle],
          ['leads', 'Лиды', Users],
          ['parser', 'Парсер', Database],
          ['telegram', 'TG', MessageSquare],
          ['settings', 'Ещё', Settings],
        ].filter(([id]) => (id !== 'parser' && id !== 'telegram' && id !== 'settings') || userRole === 'admin').map(([id, label, Icon]: any) => (
          <button key={id} onClick={() => setActiveTab(id as Tab)} className={`flex flex-col items-center gap-1 py-2 text-[10px] font-semibold ${activeTab === id ? 'text-[#533afd]' : 'text-[#64748d]'}`}>
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

// --- SUB-COMPONENTS ---

function NavItem({ icon, label, active, onClick, badge }: any) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-semibold text-[14px] transition-all ${
        active 
          ? 'bg-[#533afd] text-white shadow-md shadow-[#533afd]/20' 
          : 'text-[#64748d] dark:text-gray-400 hover:bg-[#533afd]/5 hover:text-[#533afd] dark:hover:bg-white/[0.05] dark:hover:text-white'
      }`}
    >
      <div className="flex items-center gap-3">
        {React.cloneElement(icon, { size: 18, className: active ? 'opacity-100' : 'opacity-70' })}
        {label}
      </div>
      {badge && (
        <span className={`px-2 py-0.5 rounded-full text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-[#e71d36]/10 text-[#e71d36]'}`}>
          {badge}
        </span>
      )}
    </button>
  );
}

function Dashboard({ userRole }: { userRole: 'admin' | 'manager' }) {
  const [stats, setStats] = useState({ leads: 0, chats: 0, realtors: 0, bySource: {} as Record<string, number> });
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem('crm_token');
  const h = { Authorization: `Bearer ${token}` };
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [leadsRes, chatsRes, realtorsRes] = await Promise.all([
          crmFetch('/api/crm/leads?all=true', { headers: h }).then(r => r.json()).catch(() => ({ leads: [] })),
          crmFetch('/api/crm/chats', { headers: h }).then(r => r.json()).catch(() => ({ chats: [] })),
          crmFetch('/api/realtors/stats', { headers: h }).then(r => r.json()).catch(() => ({ total: 0, by_source: {} })),
        ]);
        setStats({
          leads: (leadsRes.leads || []).length,
          chats: (chatsRes.chats || []).length,
          realtors: realtorsRes.total || 0,
          bySource: realtorsRes.by_source || {},
        });
      } catch {} finally { setLoading(false); }
    };
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Всего лидов" value={loading ? '…' : String(stats.leads)} trend={userRole === 'admin' ? 'База риэлторов' : 'Доступно вам'} />
        <StatCard title="Активные чаты" value={loading ? '…' : String(stats.chats)} trend={userRole === 'admin' ? 'Все менеджеры' : 'Ваши чаты'} />
        <StatCard title="Риэлторов в БД" value={loading ? '…' : String(stats.realtors)} trend={Object.entries(stats.bySource).map(([k,v]) => `${k}: ${v}`).join(' · ') || 'Нет данных'} />
      </div>
      <div className="bg-[#ffffff] dark:bg-[#0F0F0F] rounded-2xl border border-[#e5edf5] dark:border-[#1A1A1A] p-6 shadow-sm">
        <h3 className="text-[16px] font-bold mb-4">Источники лидов</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(stats.bySource).length > 0 ? Object.entries(stats.bySource).map(([source, count]) => (
            <div key={source} className="p-4 rounded-xl bg-[#f6f9fc] dark:bg-white/[0.03] border border-[#e5edf5] dark:border-white/10">
              <div className="text-[11px] text-[#64748d] uppercase font-bold">{source}</div>
              <div className="text-[24px] font-bold mt-1">{count}</div>
            </div>
          )) : <div className="col-span-4 text-[#64748d] text-center py-4">{loading ? 'Загрузка...' : 'Нет данных'}</div>}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, trend }: any) {
  const isPositive = trend.includes('+');
  return (
    <div className="bg-[#ffffff] dark:bg-[#0F0F0F] rounded-2xl border border-[#e5edf5] dark:border-[#1A1A1A] p-6 shadow-sm flex flex-col justify-between h-36 relative overflow-hidden group">
      <div className="absolute -right-6 -top-6 w-24 h-24 bg-[#533afd]/5 dark:bg-[#533afd]/10 rounded-full blur-xl group-hover:scale-150 transition-transform duration-700" />
      <span className="text-[#64748d] dark:text-gray-400 font-semibold text-[13px] tracking-wide uppercase">{title}</span>
      <div>
        <div className="text-[32px] font-bold tracking-tight text-[#061b31] dark:text-white leading-none mb-2">{value}</div>
        <div className={`text-[12px] font-medium flex items-center gap-1 ${isPositive ? 'text-green-500' : 'text-[#64748d]'}`}>
          {isPositive ? <TrendingUp size={12} /> : null}
          {trend}
        </div>
      </div>
    </div>
  );
}

function LeadsWorkspace() {
  const views = [{ id: 'all', label: 'Все лиды' }, { id: 'contacted', label: 'В работе' }, { id: 'bot_started', label: 'В боте' }, { id: 'trial_active', label: 'Тестирует' }, { id: 'trial_exhausted', label: 'Лимит исчерпан' }, { id: 'paid', label: 'Оплатил' }];
  const [view, setView] = useState('all'); const [leads, setLeads] = useState<any[]>([]); const [loading, setLoading] = useState(true); const [greetings, setGreetings] = useState<Record<string, string[]>>({}); const [openId, setOpenId] = useState<string | null>(null); const token = localStorage.getItem('crm_token');
  const load = () => { setLoading(true); const query = view === 'all' ? 'all=true' : `status=${view}`; crmFetch(`/api/crm/leads?${query}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then(d => setLeads(d.leads || [])).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, [view]);
  const generate = async (lead: any) => { setOpenId(lead.id); const r = await crmFetch(`/api/crm/leads/${lead.id}/greetings`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); const d = await r.json(); if (r.ok) setGreetings(prev => ({ ...prev, [lead.id]: d.variants || [] })); };
  const takeAndSend = async (lead: any, text: string) => { const user = JSON.parse(localStorage.getItem('crm_user') || '{}'); const claim = await crmFetch(`/api/crm/leads/${lead.id}/claim`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); if (!claim.ok) return alert((await claim.json()).error || 'Лид уже закреплён'); const created = await crmFetch('/api/crm/chats', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ client_phone: lead.phone, client_name: lead.name, platform: 'telegram', manager_id: user.id }) }); const chat = await created.json(); if (!chat.chat_id) return alert(chat.error || 'Не удалось создать чат'); const accounts = await crmFetch('/api/crm/accounts', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()); const account = (accounts.accounts || []).find((item: any) => item.platform === 'telegram'); if (!account) return alert('Нет подключённого Telegram аккаунта'); const sent = await crmFetch(`/api/crm/chats/${chat.chat_id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ text, account_name: account.account_name }) }); if (!sent.ok) return alert((await sent.json()).error || 'Ошибка отправки'); alert('Лид закреплён и сообщение отправлено'); load(); };
  return <div className="space-y-5"><div className="flex items-center justify-between"><div><h2 className="text-[20px] font-bold">База лидов</h2><p className="text-[12px] text-[#64748d]">Все лиды доступны менеджерам. После первого сообщения лид закрепляется за отправителем.</p></div><button onClick={load} className="px-3 py-2 bg-[#533afd] text-white rounded-xl text-[12px] font-semibold">Обновить</button></div><div className="flex gap-2 overflow-x-auto pb-1">{views.map(item => <button key={item.id} onClick={() => setView(item.id)} className={`px-4 py-2 rounded-xl text-[12px] font-semibold whitespace-nowrap ${view === item.id ? 'bg-[#533afd] text-white shadow-md shadow-[#533afd]/20' : 'bg-white border border-[#e5edf5] text-[#64748d]'}`}>{item.label}</button>)}</div><div className="bg-white dark:bg-[#0F0F0F] border border-[#e5edf5] dark:border-white/10 rounded-2xl overflow-hidden"><div className="grid grid-cols-[1fr_150px_120px_150px] gap-4 px-5 py-3 bg-[#f6f9fc] dark:bg-white/[0.03] text-[10px] uppercase tracking-wider font-bold text-[#64748d]"><span>Лид</span><span>Источник</span><span>Объявления</span><span>Действие</span></div>{loading ? <div className="py-16 text-center text-[#64748d]">Загрузка...</div> : leads.length === 0 ? <div className="py-16 text-center text-[#64748d]">В этом разделе пока нет лидов</div> : leads.map(lead => <div key={lead.id} className="border-t border-[#e5edf5] dark:border-white/5"><div className="grid grid-cols-[1fr_150px_120px_150px] gap-4 items-center px-5 py-3"><div className="min-w-0"><b className="block text-[13px] truncate">{lead.name || 'Без имени'}</b><span className="text-[11px] text-[#64748d]">{lead.phone || 'Telegram lead'}</span></div><span className="text-[11px] text-[#64748d]">{lead.source || '—'}</span><span className="text-[12px] font-semibold">{lead.metadata?.listings_count || 0}</span><button onClick={() => generate(lead)} className="px-3 py-2 rounded-lg bg-[#533afd]/10 text-[#533afd] text-[11px] font-semibold">Написать</button></div>{openId === lead.id && greetings[lead.id]?.length > 0 && <div className="px-5 pb-4 grid gap-2 bg-[#f6f9fc]/60">{greetings[lead.id].map((text, index) => <button key={index} onClick={() => takeAndSend(lead, text)} className="text-left p-3 rounded-xl bg-white border border-[#e5edf5] text-[11px] hover:border-[#533afd]">{text}</button>)}</div>}</div>)}</div></div>;
}

function Finances({ userRole }: { userRole: 'admin' | 'manager' }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Всего заработано" value="—" trend="Нет данных" />
        <StatCard title="Выплачено" value="—" trend="Нет данных" />
        <div className="bg-[#533afd] rounded-2xl p-6 shadow-lg shadow-[#533afd]/20 flex flex-col justify-between text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl flex items-center justify-center" />
          <span className="text-white/70 font-semibold text-[13px] tracking-wide uppercase">Доступно сейчас</span>
          <div>
            <div className="text-[36px] font-bold tracking-tight leading-none mb-3">—</div>
          </div>
        </div>
      </div>
      
      {userRole === 'admin' && (
        <div className="bg-[#ffffff] dark:bg-[#0F0F0F] rounded-2xl border border-[#e5edf5] dark:border-[#1A1A1A] p-6 shadow-sm">
          <h3 className="text-[16px] font-bold mb-4">Запросы на выплату</h3>
          <div className="text-[14px] text-[#64748d] py-8 text-center">
            Нет запросов на выплату
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsPanel() {
  const [managers, setManagers] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [newManager, setNewManager] = useState({ name: '', login: '', password: '' });
  const [error, setError] = useState('');
  // Telegram login state
  const [tgStep, setTgStep] = useState<'phone' | 'code'>('phone');
  const [tgPhone, setTgPhone] = useState('');
  const [tgName, setTgName] = useState('');
  const [tgCode, setTgCode] = useState('');
  const [tgLoading, setTgLoading] = useState(false);
  const [tgError, setTgError] = useState('');
  const [tgSuccess, setTgSuccess] = useState('');
  // WhatsApp state
  const [waName, setWaName] = useState('');
  const [waUrl, setWaUrl] = useState('');
  const [waToken, setWaToken] = useState('');

  const token = localStorage.getItem('crm_token');
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const loadAccounts = () => {
    crmFetch('/api/crm/accounts', { headers })
      .then(r => r.json())
      .then(data => setAccounts(data.accounts || []))
      .catch(() => {});
  };

  const handleTgRequestCode = async () => {
    setTgLoading(true);
    setTgError('');
    try {
      const res = await crmFetch('/api/crm/accounts/tg/request-code', {
        method: 'POST', headers,
        body: JSON.stringify({ phone: tgPhone }),
      });
      const data = await res.json();
      if (data.success) {
        setTgStep('code');
      } else {
        setTgError(data.error || 'Ошибка');
      }
    } catch { setTgError('Сервер недоступен'); }
    setTgLoading(false);
  };

  const handleTgConfirm = async () => {
    setTgLoading(true);
    setTgError('');
    try {
      // First create the account
      const acctRes = await crmFetch('/api/crm/accounts', {
        method: 'POST', headers,
        body: JSON.stringify({ platform: 'telegram', account_name: tgName }),
      });
      const acct = await acctRes.json();
      // Then confirm code
      const res = await crmFetch('/api/crm/accounts/tg/confirm', {
        method: 'POST', headers,
        body: JSON.stringify({ phone: tgPhone, code: tgCode, account_name: tgName }),
      });
      const data = await res.json();
      if (data.success) {
        setTgSuccess(`Аккаунт ${data.name} (@${data.username}) подключен!`);
        setTgStep('phone');
        setTgPhone('');
        setTgName('');
        setTgCode('');
        loadAccounts();
      } else {
        setTgError(data.error || 'Ошибка');
      }
    } catch { setTgError('Сервер недоступен'); }
    setTgLoading(false);
  };

  const handleWaAdd = async () => {
    try {
      const res = await crmFetch('/api/crm/accounts', {
        method: 'POST', headers,
        body: JSON.stringify({ platform: 'whatsapp', account_name: waName, chatwoot_url: waUrl, chatwoot_token: waToken }),
      });
      if (res.ok) {
        setWaName(''); setWaUrl(''); setWaToken('');
        loadAccounts();
      }
    } catch {}
  };

  React.useEffect(() => {
    crmFetch('/api/crm/managers', { headers })
      .then(r => r.json())
      .then(data => setManagers(data.managers || []))
      .catch(() => {});
    loadAccounts();
  }, []);

  const handleAddManager = async () => {
    if (!newManager.name || !newManager.login || !newManager.password) return;
    setError('');
    try {
      const res = await crmFetch('/api/crm/managers', {
        method: 'POST', headers,
        body: JSON.stringify(newManager),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Ошибка'); return; }
      setManagers([...managers, data]);
      setNewManager({ name: '', login: '', password: '' });
    } catch { setError('Сервер недоступен'); }
  };

  const handleDelete = async (id: string) => {
    await crmFetch(`/api/crm/managers/${id}`, { method: 'DELETE', headers });
    setManagers(managers.filter(m => m.id !== id));
  };

  return (
    <div className="max-w-3xl space-y-8">
      <div className="bg-[#ffffff] dark:bg-[#0F0F0F] border border-[#e5edf5] dark:border-[#1A1A1A] rounded-2xl p-6 shadow-sm">
        <h3 className="text-[16px] font-bold mb-6 text-[#061b31] dark:text-white">Управление менеджерами</h3>
        <div className="space-y-4 mb-6 relative">
          <div className="flex items-center gap-3">
             <input type="text" placeholder="Имя менеджера" value={newManager.name} onChange={e => setNewManager({...newManager, name: e.target.value})} className="flex-1 px-4 py-2 bg-[#f6f9fc] dark:bg-white/[0.03] border border-[#e5edf5] dark:border-white/10 rounded-xl font-medium text-[13px] focus:outline-none focus:border-[#533afd] dark:text-white" />
             <input type="text" placeholder="Логин" value={newManager.login} onChange={e => setNewManager({...newManager, login: e.target.value})} className="flex-1 px-4 py-2 bg-[#f6f9fc] dark:bg-white/[0.03] border border-[#e5edf5] dark:border-white/10 rounded-xl font-medium text-[13px] focus:outline-none focus:border-[#533afd] dark:text-white" />
             <input type="password" placeholder="Пароль" value={newManager.password} onChange={e => setNewManager({...newManager, password: e.target.value})} className="flex-1 px-4 py-2 bg-[#f6f9fc] dark:bg-white/[0.03] border border-[#e5edf5] dark:border-white/10 rounded-xl font-medium text-[13px] focus:outline-none focus:border-[#533afd] dark:text-white" />
             <button onClick={handleAddManager} className="px-5 py-2 min-w-[120px] bg-[#533afd] text-white rounded-xl text-[13px] font-bold hover:bg-[#432AEE] transition-all">Добавить</button>
          </div>
          {error && <div className="text-[13px] text-[#e71d36] font-medium">{error}</div>}
        </div>

        <div className="space-y-2">
          {managers.map(mgr => (
            <div key={mgr.id} className="flex items-center justify-between p-4 bg-[#f6f9fc] dark:bg-white/[0.02] rounded-xl border border-[#e5edf5] dark:border-white/5">
              <div>
                <div className="font-bold text-[14px] text-[#061b31] dark:text-white">{mgr.name}</div>
                <div className="text-[12px] text-[#64748d] font-mono mt-0.5">@{mgr.login} <span className="text-[10px] uppercase font-bold bg-[#533afd]/10 text-[#533afd] px-1.5 py-0.5 rounded ml-1">{mgr.role}</span></div>
              </div>
              {mgr.role !== 'admin' && (
                <button onClick={() => handleDelete(mgr.id)} className="px-3 py-1.5 bg-[#e71d36]/10 text-[#e71d36] rounded-lg text-[12px] font-bold hover:bg-[#e71d36]/20 transition-colors">
                  Удалить доступ
                </button>
              )}
            </div>
          ))}
          {managers.length === 0 && <div className="text-[13px] text-[#64748d]">Нет добавленных менеджеров</div>}
        </div>
      </div>

      <div className="bg-[#ffffff] dark:bg-[#0F0F0F] border border-[#e5edf5] dark:border-[#1A1A1A] rounded-2xl p-6 shadow-sm">
        <h3 className="text-[16px] font-bold mb-6 text-[#061b31] dark:text-white">Аккаунты мессенджеров</h3>

        {/* Telegram userbot login */}
        <div className="mb-6 p-4 bg-[#f6f9fc] dark:bg-white/[0.03] rounded-xl border border-[#e5edf5] dark:border-white/10">
          <h4 className="text-[14px] font-bold mb-3 text-[#061b31] dark:text-white">Подключить Telegram аккаунт</h4>
          <p className="text-[12px] text-[#64748d] mb-3">Подключите реальный Telegram аккаунт для отправки сообщений клиентам. Введите номер телефона, получите код и подтвердите.</p>
          {tgStep === 'phone' ? (
            <div className="flex items-center gap-3">
              <input type="text" placeholder="+995 5XX XXX XXX" value={tgPhone} onChange={e => setTgPhone(e.target.value)} className="flex-1 px-4 py-2 bg-white dark:bg-[#0F0F0F] border border-[#e5edf5] dark:border-white/10 rounded-xl font-medium text-[13px] focus:outline-none focus:border-[#533afd] dark:text-white" />
              <input type="text" placeholder="Название аккаунта" value={tgName} onChange={e => setTgName(e.target.value)} className="flex-1 px-4 py-2 bg-white dark:bg-[#0F0F0F] border border-[#e5edf5] dark:border-white/10 rounded-xl font-medium text-[13px] focus:outline-none focus:border-[#533afd] dark:text-white" />
              <button onClick={handleTgRequestCode} disabled={!tgPhone || !tgName || tgLoading} className="px-5 py-2 bg-[#0088cc] text-white rounded-xl text-[13px] font-bold hover:bg-[#0077b3] disabled:opacity-50 transition-all">
                {tgLoading ? '...' : 'Получить код'}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="text-[13px] text-[#64748d]">Код отправлен на {tgPhone}</div>
              <input type="text" placeholder="Код из Telegram" value={tgCode} onChange={e => setTgCode(e.target.value)} className="w-40 px-4 py-2 bg-white dark:bg-[#0F0F0F] border border-[#e5edf5] dark:border-white/10 rounded-xl font-medium text-[13px] focus:outline-none focus:border-[#533afd] dark:text-white" />
              <button onClick={handleTgConfirm} disabled={!tgCode || tgLoading} className="px-5 py-2 bg-green-600 text-white rounded-xl text-[13px] font-bold hover:bg-green-700 disabled:opacity-50 transition-all">
                {tgLoading ? '...' : 'Войти'}
              </button>
              <button onClick={() => setTgStep('phone')} className="text-[13px] text-[#64748d] hover:text-[#061b31]">Отмена</button>
            </div>
          )}
          {tgError && <div className="text-[12px] text-[#e71d36] mt-2">{tgError}</div>}
          {tgSuccess && <div className="text-[12px] text-green-600 mt-2">{tgSuccess}</div>}
        </div>

        {/* WhatsApp Chatwoot */}
        <div className="mb-6 p-4 bg-[#f6f9fc] dark:bg-white/[0.03] rounded-xl border border-[#e5edf5] dark:border-white/10">
          <h4 className="text-[14px] font-bold mb-3 text-[#061b31] dark:text-white">Подключить WhatsApp (Chatwoot)</h4>
          <p className="text-[12px] text-[#64748d] mb-3">Введите URL вашего Chatwoot сервера и API Token для интеграции с WhatsApp.</p>
          <div className="flex items-center gap-3">
            <input type="text" placeholder="Название аккаунта" value={waName} onChange={e => setWaName(e.target.value)} className="flex-1 px-4 py-2 bg-white dark:bg-[#0F0F0F] border border-[#e5edf5] dark:border-white/10 rounded-xl font-medium text-[13px] focus:outline-none focus:border-[#533afd] dark:text-white" />
            <input type="text" placeholder="Chatwoot URL" value={waUrl} onChange={e => setWaUrl(e.target.value)} className="flex-1 px-4 py-2 bg-white dark:bg-[#0F0F0F] border border-[#e5edf5] dark:border-white/10 rounded-xl font-medium text-[13px] focus:outline-none focus:border-[#533afd] dark:text-white" />
            <input type="text" placeholder="API Token" value={waToken} onChange={e => setWaToken(e.target.value)} className="flex-1 px-4 py-2 bg-white dark:bg-[#0F0F0F] border border-[#e5edf5] dark:border-white/10 rounded-xl font-medium text-[13px] focus:outline-none focus:border-[#533afd] dark:text-white" />
            <button onClick={handleWaAdd} disabled={!waName || !waUrl || !waToken} className="px-5 py-2 bg-[#25D366] text-white rounded-xl text-[13px] font-bold hover:bg-[#20bd5a] disabled:opacity-50 transition-all">Добавить</button>
          </div>
        </div>

        <div className="space-y-2">
          {accounts.map(acct => (
            <div key={acct.id} className="flex items-center justify-between p-4 bg-[#f6f9fc] dark:bg-white/[0.02] rounded-xl border border-[#e5edf5] dark:border-white/5">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-[11px] font-bold ${acct.platform === 'whatsapp' ? 'bg-[#25D366]' : 'bg-[#0088cc]'}`}>
                  {acct.platform === 'whatsapp' ? 'WA' : 'TG'}
                </div>
                <div>
                  <div className="font-bold text-[14px] text-[#061b31] dark:text-white">{acct.account_name}</div>
                  <div className="text-[12px] text-[#64748d]">
                    {acct.platform === 'whatsapp' ? 'Chatwoot' : 'Telegram Userbot'}
                    {acct.manager_id && <span className="ml-2 text-[#533amd]">→ {managers.find(m => m.id === acct.manager_id)?.name || 'Менеджер'}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={acct.manager_id || ''}
                  onChange={async (e) => {
                    await crmFetch(`/api/crm/accounts/${acct.id}/assign`, {
                      method: 'POST', headers,
                      body: JSON.stringify({ manager_id: e.target.value || null }),
                    });
                    loadAccounts();
                  }}
                  className="px-2 py-1 text-[12px] border border-[#e5edf5] dark:border-white/10 rounded-lg bg-white dark:bg-[#0F0F0F] text-[#061b31] dark:text-white"
                >
                  <option value="">Без менеджера</option>
                  {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <button onClick={async () => { await crmFetch(`/api/crm/accounts/${acct.id}`, { method: 'DELETE', headers }); loadAccounts(); }} className="px-3 py-1.5 bg-[#e71d36]/10 text-[#e71d36] rounded-lg text-[12px] font-bold hover:bg-[#e71d36]/20 transition-colors">Удалить</button>
              </div>
            </div>
          ))}
          {accounts.length === 0 && <div className="text-[13px] text-[#64748d]">Нет добавленных аккаунтов</div>}
        </div>
      </div>

      <div className="bg-[#ffffff] dark:bg-[#0F0F0F] border border-[#e5edf5] dark:border-[#1A1A1A] rounded-2xl p-6 shadow-sm">
        <h3 className="text-[16px] font-bold mb-6 text-[#061b31] dark:text-white">Настройки бота и цен</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-[13px] font-bold text-[#64748d] mb-1.5 uppercase tracking-wider">Цена базовой подписки ($)</label>
            <input type="number" defaultValue={49} className="w-full px-4 py-2.5 bg-[#f6f9fc] dark:bg-white/[0.03] border border-[#e5edf5] dark:border-white/10 rounded-xl font-medium focus:outline-none focus:border-[#533afd] dark:text-white" />
          </div>
          <div>
            <label className="block text-[13px] font-bold text-[#64748d] mb-1.5 uppercase tracking-wider">Процент менеджера (%)</label>
            <input type="number" defaultValue={20} className="w-full px-4 py-2.5 bg-[#f6f9fc] dark:bg-white/[0.03] border border-[#e5edf5] dark:border-white/10 rounded-xl font-medium focus:outline-none focus:border-[#533afd] dark:text-white" />
          </div>
          <button className="px-5 py-2.5 bg-[#533afd] text-white rounded-xl text-[14px] font-bold hover:bg-[#432AEE] transition-all">
            Сохранить тарифы
          </button>
        </div>
      </div>
      
      <div className="bg-[#ffffff] dark:bg-[#0F0F0F] border border-[#e5edf5] dark:border-[#1A1A1A] rounded-2xl p-6 shadow-sm">
        <h3 className="text-[16px] font-bold mb-6 text-[#061b31] dark:text-white">Чаты: Уведомления Telegram</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 border border-[#e5edf5] dark:border-white/10 rounded-xl bg-green-500/5">
            <div>
              <div className="font-bold text-[14px] text-[#061b31] dark:text-white">Telegram Notifier Bot Token</div>
              <div className="text-[12px] text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                Подключено (Active)
              </div>
            </div>
            <button className="text-[13px] font-bold text-[#64748d] hover:text-[#061b31] dark:hover:text-white">Изменить</button>
          </div>
          <p className="text-[12px] text-[#64748d]">
            *Система автоматически будет пушить менеджеров в этот бот, если они не прочитали сообщение клиента в течение 2 минут.
          </p>
        </div>
      </div>
    </div>
  );
}
