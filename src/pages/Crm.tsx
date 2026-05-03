import React, { useState } from 'react';
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
  Briefcase
} from 'lucide-react';
import { KorterIcon, SSIcon, RealtingIcon, MyHomeIcon } from '../components/PlatformIcons';

type Tab = 'dashboard' | 'leads' | 'finances' | 'agencies' | 'settings';

export function Crm() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [userRole, setUserRole] = useState<'admin' | 'manager'>('admin'); // Toggle for demo

  return (
    <div className="flex h-screen bg-[#f7f9fc] dark:bg-[#0A0A0A] text-[#061b31] dark:text-gray-200 font-sans overflow-hidden transition-colors duration-500">
      
      {/* Sidebar */}
      <aside className="w-64 bg-[#ffffff] dark:bg-[#0F0F0F] border-r border-[#e5edf5] dark:border-[#1A1A1A] flex flex-col transition-colors duration-500 z-10">
        <div className="h-16 flex items-center px-6 border-b border-[#e5edf5] dark:border-[#1A1A1A]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#533afd] rounded-xl flex items-center justify-center shadow-lg shadow-[#533afd]/20">
              <Building2 size={18} className="text-white" />
            </div>
            <span className="font-bold text-[18px] tracking-tight">Karty CRM</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
          <NavItem icon={<BarChart3 />} label="Дашборд" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavItem icon={<Users />} label="База лидов" active={activeTab === 'leads'} onClick={() => setActiveTab('leads')} badge="12" />
          <NavItem icon={<CreditCard />} label="Финансы" active={activeTab === 'finances'} onClick={() => setActiveTab('finances')} />
          <NavItem icon={<Briefcase />} label="Агентства" active={activeTab === 'agencies'} onClick={() => setActiveTab('agencies')} />
          <NavItem icon={<Settings />} label="Настройки" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </nav>

        <div className="p-4 border-t border-[#e5edf5] dark:border-[#1A1A1A]">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#533afd] to-[#806BFF] flex items-center justify-center text-white font-bold text-sm shadow-sm">
              AD
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-[14px] font-semibold truncate">admin@karty.ge</p>
              <button 
                onClick={() => setUserRole(userRole === 'admin' ? 'manager' : 'admin')}
                className="text-[12px] text-[#64748d] hover:text-[#533afd] transition-colors"
               >
                Роль: {userRole === 'admin' ? 'Админ' : 'Менеджер'}
              </button>
            </div>
          </div>
          <button className="w-full flex items-center gap-2 px-3 py-2 text-[#64748d] hover:text-[#e71d36] hover:bg-[#e71d36]/5 rounded-lg transition-colors text-sm font-medium">
            <LogOut size={16} />
            Выйти
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-[#ffffff]/80 dark:bg-[#0F0F0F]/80 backdrop-blur-md border-b border-[#e5edf5] dark:border-[#1A1A1A] flex items-center justify-between px-8 z-10 transition-colors duration-500">
          <h1 className="text-[20px] font-bold tracking-tight">
            {activeTab === 'dashboard' && 'Общая сводка'}
            {activeTab === 'leads' && 'База лидов'}
            {activeTab === 'finances' && 'Финансы и выплаты'}
            {activeTab === 'agencies' && 'Управление агентствами'}
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

        {/* Dynamic Content */}
        <div className="flex-1 overflow-auto p-8 relative">
          <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] bg-[#533afd]/5 dark:bg-[#533afd]/10 blur-[100px] rounded-full pointer-events-none" />
          
          <div className="max-w-7xl mx-auto space-y-8 relative z-10">
            {activeTab === 'dashboard' && <Dashboard userRole={userRole} />}
            {activeTab === 'leads' && <Leads />}
            {activeTab === 'finances' && <Finances userRole={userRole} />}
            {activeTab === 'agencies' && <Agencies />}
            {activeTab === 'settings' && <SettingsPanel />}
          </div>
        </div>
      </main>
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
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {userRole === 'manager' ? (
          <>
            <StatCard title="Мой баланс" value="$420.00" trend="+12% за неделю" />
            <StatCard title="Конверсия" value="15.2%" trend="+2.4% за сегодня" />
            <StatCard title="Активные тесты" value="48" trend="12 ждут оплаты" />
          </>
        ) : (
          <>
            <StatCard title="Общая выручка" value="$12,450" trend="+18% за месяц" />
            <StatCard title="Платных юзеров" value="312" trend="+42 за неделю" />
            <StatCard title="Топ менеджер" value="Анна С." trend="$1,200 комиссионных" />
          </>
        )}
      </div>

      <div className="bg-[#ffffff] dark:bg-[#0F0F0F] rounded-2xl border border-[#e5edf5] dark:border-[#1A1A1A] p-6 shadow-sm">
        <h3 className="text-[16px] font-bold mb-4">График активности (Демо)</h3>
        <div className="h-64 flex items-end gap-2">
          {[40, 70, 45, 90, 65, 85, 110].map((h, i) => (
            <div key={i} className="flex-1 bg-[#f6f9fc] dark:bg-white/[0.03] rounded-t-lg relative group h-full flex flex-col justify-end">
              <div 
                className="w-full bg-[#533afd] rounded-t-xl transition-all duration-700 ease-out group-hover:bg-[#432AEE]" 
                style={{ height: `${h}%` }}
              />
            </div>
          ))}
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

function Leads() {
  const MOCK_LEADS = [
    { id: 'LD-8012', source: 'SS.ge', contact: 'Георгий +995 555...', status: 'Новый', manager: 'Свободно' },
    { id: 'LD-8013', source: 'MyHome', contact: 'Нина +995 599...', status: 'В работе', manager: 'Анна С.' },
    { id: 'LD-8014', source: 'SS.ge', contact: 'Давид +995 577...', status: 'Тестирует', manager: 'Алекс М.' },
    { id: 'LD-8015', source: 'Realting', contact: 'Елена +995 514...', status: 'Оплатил', manager: 'Свободно' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button className="px-4 py-2 bg-[#ffffff] dark:bg-[#0F0F0F] border border-[#e5edf5] dark:border-[#1A1A1A] rounded-xl text-[13px] font-semibold text-[#061b31] dark:text-white flex items-center gap-2 hover:bg-[#f6f9fc] dark:hover:bg-white/[0.03] transition-colors shadow-sm">
            <Filter size={14} /> Фильтры
          </button>
        </div>
        <button className="px-4 py-2 bg-[#533afd] text-white rounded-xl text-[13px] font-semibold hover:bg-[#432AEE] transition-all shadow-md shadow-[#533afd]/20">
          + Добавить лид
        </button>
      </div>

      <div className="bg-[#ffffff] dark:bg-[#0F0F0F] border border-[#e5edf5] dark:border-[#1A1A1A] rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-[#f6f9fc] dark:bg-white/[0.02] text-[#64748d] dark:text-gray-400 text-[12px] uppercase tracking-wider font-bold">
            <tr>
              <th className="px-6 py-4">ID / Источник</th>
              <th className="px-6 py-4">Контакт</th>
              <th className="px-6 py-4">Статус</th>
              <th className="px-6 py-4">Менеджер</th>
              <th className="px-6 py-4 text-right">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5edf5] dark:divide-[#1A1A1A] text-[14px]">
            {MOCK_LEADS.map((lead) => (
              <tr key={lead.id} className="hover:bg-[#f6f9fc] dark:hover:bg-white/[0.01] transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-100 dark:bg-white/5 rounded-lg flex items-center justify-center font-bold text-xs">
                      {lead.source === 'SS.ge' ? 'SS' : lead.source === 'MyHome' ? 'MH' : 'RE'}
                    </div>
                    <div className="font-mono text-[13px] text-[#64748d]">{lead.id}</div>
                  </div>
                </td>
                <td className="px-6 py-4 font-medium text-[#061b31] dark:text-white">{lead.contact}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                    lead.status === 'Новый' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' :
                    lead.status === 'В работе' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' :
                    lead.status === 'Тестирует' ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400' :
                    'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                  }`}>
                    {lead.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-[#64748d]">{lead.manager}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                    <button className="px-3 py-1.5 bg-[#f6f9fc] dark:bg-white/[0.05] hover:bg-[#533afd] hover:text-white text-[#061b31] dark:text-white rounded-lg text-[12px] font-semibold transition-colors border border-[#e5edf5] dark:border-white/10 hover:border-[#533afd]">
                      Взять
                    </button>
                    <button className="px-3 py-1.5 bg-green-500/10 hover:bg-green-500 hover:text-white text-green-600 dark:text-green-400 rounded-lg text-[12px] font-semibold transition-colors">
                      WA
                    </button>
                    <button className="p-1.5 text-[#64748d] hover:text-[#061b31] dark:hover:text-white transition-colors">
                      <MoreVertical size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Finances({ userRole }: { userRole: 'admin' | 'manager' }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Всего заработано" value="$1,420" trend="За всё время" />
        <StatCard title="Выплачено" value="$1,000" trend="Успешные переводы" />
        <div className="bg-[#533afd] rounded-2xl p-6 shadow-lg shadow-[#533afd]/20 flex flex-col justify-between text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl flex items-center justify-center" />
          <span className="text-white/70 font-semibold text-[13px] tracking-wide uppercase">Доступно сейчас</span>
          <div>
            <div className="text-[36px] font-bold tracking-tight leading-none mb-3">$420.00</div>
            {userRole === 'manager' && (
              <button className="px-4 py-2 bg-white text-[#533afd] rounded-xl text-[13px] font-bold hover:bg-gray-50 transition-colors shadow-sm">
                Запросить выплату
              </button>
            )}
          </div>
        </div>
      </div>
      
      {userRole === 'admin' && (
        <div className="bg-[#ffffff] dark:bg-[#0F0F0F] rounded-2xl border border-[#e5edf5] dark:border-[#1A1A1A] p-6 shadow-sm">
          <h3 className="text-[16px] font-bold mb-4">Запросы на выплату</h3>
          <div className="space-y-3">
            {[
              { manager: 'Менеджер 1', amount: '$420', req: 'USDT TRC20: Txx...' },
              { manager: 'Менеджер 2', amount: '$150', req: 'Bank: GE22TB...' }
            ].map((req, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-[#f6f9fc] dark:bg-white/[0.02] rounded-xl border border-[#e5edf5] dark:border-white/5">
                <div>
                  <div className="font-bold text-[14px]">{req.manager} <span className="text-[#533afd]">{req.amount}</span></div>
                  <div className="text-[12px] text-[#64748d] font-mono mt-1">{req.req}</div>
                </div>
                <button className="px-4 py-2 bg-green-500 text-white rounded-lg text-[13px] font-bold hover:bg-green-600 transition-colors">
                  Подтвердить
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Agencies() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-bold">Управление пакетными подписками</h2>
        <button className="px-4 py-2 bg-[#533afd] text-white rounded-xl text-[13px] font-semibold hover:bg-[#432AEE] transition-all shadow-md shadow-[#533afd]/20">
          + Добавить агентство
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[
          { name: 'Batumi Prime Easte', slots: 10, used: 8, expires: '2026-12-01' },
          { name: 'Sea View Homes', slots: 5, used: 5, expires: '2026-08-15' },
        ].map((ag, i) => (
          <div key={i} className="bg-[#ffffff] dark:bg-[#0F0F0F] border border-[#e5edf5] dark:border-[#1A1A1A] rounded-2xl p-6 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-[16px]">{ag.name}</h3>
                <p className="text-[12px] text-[#64748d]">Закончится: {ag.expires}</p>
              </div>
              <span className="px-2.5 py-1 bg-[#533afd]/10 text-[#533afd] rounded-md text-[11px] font-bold">
                Слоты {ag.used}/{ag.slots}
              </span>
            </div>
            
            <div className="w-full bg-gray-100 dark:bg-white/10 rounded-full h-2 mb-6">
              <div className="bg-[#533afd] h-2 rounded-full" style={{ width: `${(ag.used/ag.slots)*100}%` }}></div>
            </div>
            
            <div className="flex gap-2">
              <button className="flex-1 px-3 py-2 bg-[#f6f9fc] dark:bg-white/[0.05] border border-[#e5edf5] dark:border-white/10 rounded-xl text-[13px] font-semibold hover:border-[#533afd] transition-colors">
                Управление слотами
              </button>
              <button className="flex-1 px-3 py-2 bg-[#f6f9fc] dark:bg-white/[0.05] border border-[#e5edf5] dark:border-white/10 rounded-xl text-[13px] font-semibold hover:border-[#533afd] transition-colors">
                Продлить
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsPanel() {
  return (
    <div className="max-w-3xl space-y-8">
      <div className="bg-[#ffffff] dark:bg-[#0F0F0F] border border-[#e5edf5] dark:border-[#1A1A1A] rounded-2xl p-6 shadow-sm">
        <h3 className="text-[16px] font-bold mb-6">Настройки бота и цен</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-[13px] font-bold text-[#64748d] mb-1.5 uppercase tracking-wider">Цена базовой подписки ($)</label>
            <input type="number" defaultValue={49} className="w-full px-4 py-2.5 bg-[#f6f9fc] dark:bg-white/[0.03] border border-[#e5edf5] dark:border-white/10 rounded-xl font-medium focus:outline-none focus:border-[#533afd]" />
          </div>
          <div>
            <label className="block text-[13px] font-bold text-[#64748d] mb-1.5 uppercase tracking-wider">Процент менеджера (%)</label>
            <input type="number" defaultValue={20} className="w-full px-4 py-2.5 bg-[#f6f9fc] dark:bg-white/[0.03] border border-[#e5edf5] dark:border-white/10 rounded-xl font-medium focus:outline-none focus:border-[#533afd]" />
          </div>
          <button className="px-5 py-2.5 bg-[#533afd] text-white rounded-xl text-[14px] font-bold hover:bg-[#432AEE] transition-all">
            Сохранить тарифы
          </button>
        </div>
      </div>
      
      <div className="bg-[#ffffff] dark:bg-[#0F0F0F] border border-[#e5edf5] dark:border-[#1A1A1A] rounded-2xl p-6 shadow-sm">
        <h3 className="text-[16px] font-bold mb-6">Интеграции</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 border border-[#e5edf5] dark:border-white/10 rounded-xl bg-green-500/5">
            <div>
              <div className="font-bold text-[14px]">Cryptomus API</div>
              <div className="text-[12px] text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                Подключено
              </div>
            </div>
            <button className="text-[13px] font-bold text-[#64748d] hover:text-[#061b31] dark:hover:text-white">Изменить</button>
          </div>
          <div className="flex items-center justify-between p-4 border border-[#e5edf5] dark:border-white/10 rounded-xl bg-green-500/5">
            <div>
              <div className="font-bold text-[14px]">Telegram Bot Token</div>
              <div className="text-[12px] text-green-600 dark:text-green-400 mt-1">Подключено (Active)</div>
            </div>
            <button className="text-[13px] font-bold text-[#64748d] hover:text-[#061b31] dark:hover:text-white">Изменить</button>
          </div>
        </div>
      </div>
    </div>
  );
}
