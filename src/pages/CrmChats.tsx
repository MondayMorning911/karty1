import React, { useState, useEffect, useRef } from 'react';
import { Search, Info, Phone, Video, MoreVertical, Send, Mic, Paperclip, Smile, ArrowLeft, Building2, Bell, Clock, Users, ArrowUpRight, TrendingUp, MessageCircle } from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'client' | 'manager';
  text: string;
  timestamp: string;
}

interface Chat {
  chat_id: string;
  client_name: string;
  client_phone: string;
  manager_id: string;
  platform: 'whatsapp' | 'telegram';
  unread: boolean;
  last_message_text: string;
  last_message_timestamp: string;
}

// MOCK DATA for initial load
const MOCK_CHATS: Chat[] = [
  {
    chat_id: 'chat-1',
    client_name: 'Георгий Махарадзе',
    client_phone: '+995555123456',
    manager_id: 'mgr-123',
    platform: 'whatsapp',
    unread: true,
    last_message_text: 'Здравствуйте! А как работает автопубликация?',
    last_message_timestamp: '10:42',
  },
  {
    chat_id: 'chat-2',
    client_name: 'Анна Соколова',
    client_phone: '@anna_sokol',
    manager_id: 'mgr-123',
    platform: 'telegram',
    unread: false,
    last_message_text: 'Да, давайте оформим подписку.',
    last_message_timestamp: 'Вчера',
  }
];

const MOCK_MESSAGES: Record<string, ChatMessage[]> = {
  'chat-1': [
    { id: 'm1', sender: 'manager', text: 'Здравствуйте, Георгий! Заметил, что вы публикуете объекты. Хочу предложить Karty — сервис автоматической публикации на SS.ge, MyHome и Korter за 1 клик. Экономия времени до 5 часов в неделю!', timestamp: '10:15' },
    { id: 'm2', sender: 'client', text: 'Здравствуйте! А как работает автопубликация?', timestamp: '10:42' },
  ],
  'chat-2': [
    { id: 'm1', sender: 'manager', text: 'Добрый день, Анна! Как вам наш сервис Karty? Вы уже использовали тестовые кредиты?', timestamp: 'Вчера 14:00' },
    { id: 'm2', sender: 'client', text: 'Да, очень удобно. Но мне нужно больше площадок.', timestamp: 'Вчера 14:15' },
    { id: 'm3', sender: 'manager', text: 'Понимаю. В базовой подписке доступны SS.ge и MyHome. В премиум пакете за $49 доступен еще Korter и Realting. Желаете перейти на премиум?', timestamp: 'Вчера 14:20' },
    { id: 'm4', sender: 'client', text: 'Да, давайте оформим подписку.', timestamp: 'Вчера 15:00' },
  ]
};

const WA_COLOR = { light: 'text-[#25D366]', bg: 'bg-[#25D366]', bgSoft: 'bg-[#25D366]/10' };
const TG_COLOR = { light: 'text-[#0088cc]', bg: 'bg-[#0088cc]', bgSoft: 'bg-[#0088cc]/10' };

export function CrmChats({ userRole, currentManagerId }: { userRole: 'admin' | 'manager', currentManagerId: string }) {
  const [chats, setChats] = useState<Chat[]>(MOCK_CHATS);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [managerFilter, setManagerFilter] = useState<string>('all');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'whatsapp' | 'telegram'>('all');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedChat) {
      setMessages(MOCK_MESSAGES[selectedChat.chat_id] || []);
      // Mark read
      setChats(prev => prev.map(c => c.chat_id === selectedChat.chat_id ? { ...c, unread: false } : c));
    } else {
      setMessages([]);
    }
  }, [selectedChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = () => {
    if (!inputText.trim() || !selectedChat) return;
    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'manager',
      text: inputText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    // update current messages
    setMessages(prev => [...prev, newMsg]);
    // update chat last message
    setChats(prev => prev.map(c => 
      c.chat_id === selectedChat.chat_id 
        ? { ...c, last_message_text: inputText, last_message_timestamp: newMsg.timestamp }
        : c
    ));
    // Here we would also call API to send to WA/TG via backend webhook, and update FB
    setInputText('');
  };

  const filteredChats = chats.filter(c => {
    if (platformFilter !== 'all' && c.platform !== platformFilter) return false;
    if (managerFilter !== 'all' && c.manager_id !== managerFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-[#f6f9fc] dark:bg-[#0A0A0A]">
      {/* 2. ВИДЖЕТ ВЫПЛАТ И ЭФФЕКТИВНОСТИ МЕНЕДЖЕРА */}
      <div className="h-[72px] shrink-0 border-b border-[#e5edf5] dark:border-[#1A1A1A] bg-white dark:bg-[#0F0F0F] px-6 flex items-center justify-between shadow-sm z-10 w-full relative">
        <div className="flex items-center gap-6">
          <h2 className="font-bold text-[18px]">Чаты и сообщения</h2>
          
          <div className="h-8 w-[1px] bg-[#e5edf5] dark:bg-[#1A1A1A]"></div>
          
          {/* Efficiency indicators */}
          <div className="flex items-center gap-5 text-[13px]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-green-500/10 text-green-600 flex items-center justify-center">
                <TrendingUp size={16} />
              </div>
              <div className="flex flex-col">
                <span className="text-[#64748d] text-[11px] font-bold uppercase leading-tight">Заработано сегодня</span>
                <span className="font-extrabold text-green-600 dark:text-green-400 leading-tight">$340</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center">
                <Users size={16} />
              </div>
              <div className="flex flex-col">
                <span className="text-[#64748d] text-[11px] font-bold uppercase leading-tight">Лидов в работе</span>
                <span className="font-bold leading-tight text-[#061b31] dark:text-white">12</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                <Clock size={16} />
              </div>
              <div className="flex flex-col">
                <span className="text-[#64748d] text-[11px] font-bold uppercase leading-tight">Ср. время ответа</span>
                <span className="font-bold leading-tight text-[#061b31] dark:text-white">4 мин</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* 4. ПАНЕЛЬ СУПЕРВИЗОРА / АДМИНКА */}
        {userRole === 'admin' && (
          <div className="flex items-center gap-3">
            <span className="text-[12px] font-bold text-[#64748d] uppercase">Режим админа:</span>
            <select 
              value={managerFilter}
              onChange={(e) => setManagerFilter(e.target.value)}
              className="px-3 py-1.5 bg-[#f6f9fc] dark:bg-white/[0.03] border border-[#e5edf5] dark:border-white/10 rounded-lg text-[13px] font-semibold text-[#061b31] dark:text-white outline-none"
            >
              <option value="all">Все менеджеры</option>
              <option value="mgr-123">Алексей М.</option>
              <option value="mgr-456">Анна С.</option>
            </select>
            <select 
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value as any)}
              className="px-3 py-1.5 bg-[#f6f9fc] dark:bg-white/[0.03] border border-[#e5edf5] dark:border-white/10 rounded-lg text-[13px] font-semibold text-[#061b31] dark:text-white outline-none"
            >
              <option value="all">Все каналы</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="telegram">Telegram</option>
            </select>
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel - Chat list */}
        <div className="w-80 bg-white dark:bg-[#0F0F0F] border-r border-[#e5edf5] dark:border-[#1A1A1A] flex flex-col shrink-0">
          <div className="p-4 border-b border-[#e5edf5] dark:border-[#1A1A1A] shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748d] w-4 h-4" />
              <input 
                type="text" 
                placeholder="Поиск по чатам..."
                className="w-full pl-9 pr-4 py-2 bg-[#f6f9fc] dark:bg-white/[0.03] border border-[#e5edf5] dark:border-white/10 rounded-full text-[13px] focus:outline-none focus:border-[#533afd] transition-all"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto w-full no-scrollbar">
            {filteredChats.map(chat => (
              <div 
                key={chat.chat_id}
                onClick={() => setSelectedChat(chat)}
                className={`flex items-start gap-3 p-4 cursor-pointer transition-colors border-b border-[#e5edf5]/50 dark:border-[#1A1A1A]/50 ${selectedChat?.chat_id === chat.chat_id ? 'bg-[#533afd]/5 dark:bg-white/[0.03]' : 'hover:bg-[#f6f9fc] dark:hover:bg-white/[0.01]'}`}
              >
                <div className="relative shrink-0 mt-0.5">
                  <div className="w-[42px] h-[42px] rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-[#64748d] dark:text-gray-400 uppercase">
                    {chat.client_name.substring(0, 2)}
                  </div>
                  {/* Platform Icon Indicator */}
                  <div className={`absolute -bottom-1 -right-1 w-[20px] h-[20px] rounded-full flex items-center justify-center text-white border-2 border-white dark:border-[#0F0F0F] ${chat.platform === 'whatsapp' ? 'bg-[#25D366]' : 'bg-[#0088cc]'}`}>
                    {chat.platform === 'whatsapp' ? <Phone size={10} fill="currentColor" className="stroke-none" /> : <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M2L22 2L15 22L11 13L22 2L9 11L2 8Z" /></svg>}
                  </div>
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <span className="font-bold text-[14px] truncate dark:text-gray-200">{chat.client_name}</span>
                    <span className="text-[11px] text-[#64748d] shrink-0 font-medium">{chat.last_message_timestamp}</span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <p className={`text-[13px] truncate ${chat.unread ? 'font-semibold text-[#061b31] dark:text-white' : 'text-[#64748d]'}`}>
                      {chat.last_message_text}
                    </p>
                    {chat.unread && (
                      <div className="w-2 h-2 rounded-full bg-[#533afd] shrink-0"></div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {filteredChats.length === 0 && (
              <div className="p-8 text-center text-[#64748d] text-[13px]">
                Чаты не найдены
              </div>
            )}
          </div>
        </div>

        {/* Right panel - Active Chat */}
        {selectedChat ? (
          <div className="flex-1 flex flex-col bg-[url('https://web.whatsapp.com/img/bg-chat-tile-light_04fcacde53925e4cb0a565f1ee5cb9a5.png')] dark:bg-[url('https://web.whatsapp.com/img/bg-chat-tile-dark_a4be512e7195b6b733d9110b408f075d.png')] bg-repeat bg-opacity-20 dark:bg-opacity-10 bg-blend-soft-light relative">
            <div className="absolute inset-0 bg-[#f6f9fc]/95 dark:bg-[#0A0A0A]/95 pointer-events-none" />
            
            {/* Chat header */}
            <div className={`h-16 px-6 flex items-center justify-between shrink-0 border-b border-black/5 dark:border-white/5 relative z-10 transition-colors ${selectedChat.platform === 'whatsapp' ? 'bg-[#f0f2f5] dark:bg-[#202c33]' : 'bg-white dark:bg-[#1c242f]'}`}>
              <div className="flex items-center gap-4">
                <button className="md:hidden p-2 -ml-2 text-[#64748d]" onClick={() => setSelectedChat(null)}>
                  <ArrowLeft size={20} />
                </button>
                <div className="w-[40px] h-[40px] rounded-full bg-slate-300 dark:bg-slate-700 font-bold flex items-center justify-center dark:text-gray-300">
                  {selectedChat.client_name.substring(0,2)}
                </div>
                <div>
                  <h3 className="font-bold text-[15px] dark:text-gray-200">{selectedChat.client_name}</h3>
                  <div className="text-[12px] text-[#64748d]">{selectedChat.client_phone}</div>
                </div>
              </div>
              <div className="flex gap-4 text-[#64748d]">
                <button className="hover:text-[#061b31] dark:hover:text-white transition-colors"><Search size={18} /></button>
                <button className="hover:text-[#061b31] dark:hover:text-white transition-colors"><MoreVertical size={18} /></button>
              </div>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 relative z-10 w-full no-scrollbar">
              {messages.map(msg => {
                const isMe = msg.sender === 'manager';
                return (
                  <div key={msg.id} className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 shadow-sm flex flex-col relative text-[14.5px] leading-[1.3]
                      ${isMe 
                        ? selectedChat.platform === 'whatsapp' 
                            ? 'bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-tr-sm' 
                            : 'bg-[#eef3f7] dark:bg-[#2a3942] text-black dark:text-gray-200 rounded-tr-sm border border-black/5 dark:border-white/5'
                        : selectedChat.platform === 'whatsapp'
                            ? 'bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] rounded-tl-sm'
                            : 'bg-white dark:bg-[#1c242f] text-black dark:text-gray-200 rounded-tl-sm border border-black/5 dark:border-white/5'
                      }
                    `}>
                      <span style={{ wordBreak: 'break-word' }}>{msg.text}</span>
                      <span className={`text-[10px] self-end mt-1 font-medium ${isMe ? 'opacity-75' : 'text-[#64748d]'}`}>
                        {msg.timestamp}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} className="h-2 w-full" />
            </div>

            {/* Input area */}
            <div className={`shrink-0 p-3 flex items-end gap-2 relative z-10 transition-colors ${selectedChat.platform === 'whatsapp' ? 'bg-[#f0f2f5] dark:bg-[#202c33]' : 'bg-white dark:bg-[#1c242f]'}`}>
              <button className="p-2.5 text-[#64748d] hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors">
                <Smile size={22} />
              </button>
              <button className="p-2.5 text-[#64748d] hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors mr-1">
                <Paperclip size={20} />
              </button>
              
              <div className="flex-1 bg-white dark:bg-[#2a3942] rounded-xl flex items-center min-h-[44px] px-4 shadow-sm border border-transparent dark:border-white/5">
                <input 
                  type="text"
                  placeholder="Введите сообщение..."
                  className="w-full bg-transparent outline-none text-[15px] dark:text-white"
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                />
              </div>

              {inputText.trim() ? (
                <button 
                  onClick={handleSendMessage}
                  className={`p-2.5 rounded-full text-white shadow-md transition-transform active:scale-95 ml-1 ${selectedChat.platform === 'whatsapp' ? 'bg-[#25D366] hover:bg-[#20bd5a]' : 'bg-[#0088cc] hover:bg-[#0077b3]'}`}
                >
                  <Send size={20} className="ml-1" />
                </button>
              ) : (
                <button className="p-2.5 text-[#64748d] hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors ml-1">
                  <Mic size={22} />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[url('https://web.whatsapp.com/img/bg-chat-tile-light_04fcacde53925e4cb0a565f1ee5cb9a5.png')] dark:bg-[url('https://web.whatsapp.com/img/bg-chat-tile-dark_a4be512e7195b6b733d9110b408f075d.png')] bg-repeat bg-opacity-20 dark:bg-opacity-10 bg-blend-soft-light relative">
            <div className="absolute inset-0 bg-[#f6f9fc]/95 dark:bg-[#0A0A0A]/95 pointer-events-none" />
             <div className="relative z-10 flex flex-col items-center">
                <div className="w-20 h-20 bg-white dark:bg-white/5 shadow-sm border border-[#e5edf5] dark:border-white/10 rounded-full flex items-center justify-center mb-6">
                  <MessageCircle size={32} className="text-[#64748d]" />
                </div>
                <h3 className="text-[20px] font-bold text-[#061b31] dark:text-white mb-2">Рабочее пространство чатов</h3>
                <p className="text-[14px] text-[#64748d] max-w-sm">
                  Выберите чат слева, чтобы начать переписку. Все сообщения из WhatsApp и Telegram поступают сюда автоматически.
                </p>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
