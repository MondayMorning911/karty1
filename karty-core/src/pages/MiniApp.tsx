import React, { useState, MouseEvent, ChangeEvent, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { TabType, HistoryItem } from "../types";
import { Link } from "react-router-dom";
import { Camera, Star, X, Sparkles, FilePlus2, Layers, History, RefreshCcw, CheckCircle2, MoreVertical, Moon, Sun, ArrowRight, MapPin, AlertCircle, Presentation, ClipboardList, Trash2, Search , HelpCircle, Megaphone } from "lucide-react";
import { KorterIcon, SSIcon, MyHomeIcon } from '../components/PlatformIcons';
import { KorterAuth } from '../components/KorterAuth';
import { PlatformLoginAuth } from '../components/PlatformLoginAuth';
import { PresentationsTab } from '../components/PresentationsTab';
import { PlannerTab } from '../components/PlannerTab';
import Map, { Marker } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '../lib/supabase';

// Same shadow constants as LandingPage
const STRIPE_SHADOW = "shadow-sm border border-slate-200/80 dark:border-transparent dark:shadow-none";
const ELEVATE_SHADOW = "shadow-xl shadow-slate-200/40 dark:shadow-none";

const DUMMY_STYLES = [
  { id: 'selling', label: 'Продающий' },
  { id: 'short', label: 'Кратко' },
  { id: 'pro', label: 'Строгий' },
  { id: 'original', label: 'Не менять' },
] as const;

type StyleOption = typeof DUMMY_STYLES[number]['id'];

interface PageProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export function useUserSessions(uid: string | null) {
  const [sessions, setSessions] = useState<Record<string, any>>({});
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const pendingRefreshRef = useRef<string[] | null>(null);
  
  useEffect(() => {
    if (!uid) return;
    
    const fetchSessions = async () => {
      const { data, error } = await supabase
        .from('platform_sessions')
        .select('platform, state, created_at')
        .eq('user_id', uid);
        
      if (!error && data) {
          const sessionDict: Record<string, any> = {};
          data.forEach(row => { sessionDict[row.platform] = { ...row, authStatus: 'checking' }; });
          ['korter', 'ssge', 'myhome'].forEach(platform => {
            if (!sessionDict[platform]) sessionDict[platform] = { platform, authStatus: 'checking' };
          });
          setSessions(sessionDict);
           const { data: authData } = await supabase.auth.getSession();
           const authHeaders = authData.session?.access_token
             ? { 'Content-Type': 'application/json', Authorization: `Bearer ${authData.session.access_token}` }
             : { 'Content-Type': 'application/json' };
           const platformsToCheck = pendingRefreshRef.current || ['korter', 'ssge', 'myhome'];
           pendingRefreshRef.current = null;
           await Promise.all(platformsToCheck.map(async platform => {
             try {
               const response = await fetch('/api/auth/status', {
                 method: 'POST', headers: authHeaders,
                body: JSON.stringify({ userId: uid, siteKey: platform }),
              });
              const health = await response.json();
              sessionDict[platform] = { ...sessionDict[platform], authStatus: health.status || 'unknown', health };
              if (health.status === 'valid') {
                try {
                  const balanceResponse = await fetch('/api/auth/balance', {
                    method: 'POST', headers: authHeaders,
                    body: JSON.stringify({ userId: uid, siteKey: platform }),
                  });
                  const balance = await balanceResponse.json();
                  sessionDict[platform] = { ...sessionDict[platform], balance };
                } catch (error: any) {
                  sessionDict[platform] = { ...sessionDict[platform], balance: { errors: [error.message] } };
                }
              }
            } catch (error: any) {
              sessionDict[platform] = { ...sessionDict[platform], authStatus: 'unknown', health: { error: error.message } };
            }
          }));
          setSessions({ ...sessionDict });
      }
    };
    
    fetchSessions();
  }, [uid, refreshTrigger]);

  return {
    sessions,
    refresh: (platform?: string) => {
      pendingRefreshRef.current = platform ? [platform] : null;
      setRefreshTrigger(t => t + 1);
    },
  };
}

export function MiniApp({ theme, toggleTheme }: PageProps) {
  const [activeTab, setActiveTab] = useState<TabType>("create");
  const [uid, setUid] = useState<string | null>(null);
  const [viewportHeight, setViewportHeight] = useState(() => window.visualViewport?.height || window.innerHeight);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Lifted state for CreateTab to persist between tab switches
  const [desc, setDesc] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<StyleOption>('original');
  const [photos, setPhotos] = useState<string[]>([]);
  const [parsedData, setParsedData] = useState<any>(null);
  const [addressCoords, setAddressCoords] = useState<{lat: number, lng: number} | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUid(session.user.id);
      } else {
        supabase.auth.signInAnonymously().then(({ data }) => {
          if (data?.user) setUid(data.user.id);
        });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUid(session?.user?.id || null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const tg = window.Telegram?.WebApp as any;
    tg?.expand?.();
    tg?.disableVerticalSwipes?.();

    const updateViewport = () => {
      const visualHeight = window.visualViewport?.height || window.innerHeight;
      const layoutHeight = window.innerHeight;
      document.documentElement.style.setProperty('--tg-viewport-height', `${visualHeight}px`);
      setViewportHeight(visualHeight);
      setKeyboardOpen(layoutHeight - visualHeight > 120);
    };
    const viewport = window.visualViewport;
    updateViewport();
    window.addEventListener('resize', updateViewport);
    viewport?.addEventListener('resize', updateViewport);
    tg?.onEvent?.('viewportChanged', updateViewport);

    const handleFieldFocus = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || !['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      window.setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
    };
    document.addEventListener('focusin', handleFieldFocus);

    return () => {
      window.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('resize', updateViewport);
      tg?.offEvent?.('viewportChanged', updateViewport);
      document.removeEventListener('focusin', handleFieldFocus);
    };
  }, []);

  useEffect(() => {
    const chatId = (window.Telegram?.WebApp as any)?.initDataUnsafe?.user?.id;
    if (!uid || !chatId) return;
    fetch('/api/planner/register-telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: uid, chatId: String(chatId) }) }).catch(() => {});
    const startParam = (window.Telegram?.WebApp as any)?.initDataUnsafe?.start_param || '';
    fetch('/api/attribution/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telegramUserId: String(chatId), name: (window.Telegram?.WebApp as any)?.initDataUnsafe?.user?.first_name || '', username: (window.Telegram?.WebApp as any)?.initDataUnsafe?.user?.username || '', referralToken: startParam, event: 'mini_app_opened' }) }).catch(() => {});
  }, [uid]);

  const isTelegramMiniApp = Boolean(window.Telegram?.WebApp);

  return (
    <div className={`mini-app-root ${isTelegramMiniApp ? 'mini-telegram-app' : ''} ${keyboardOpen ? 'mini-keyboard-open' : ''} fixed inset-0 flex justify-center w-full bg-slate-50 dark:bg-[#050505] font-sans text-slate-900 dark:text-gray-200 selection:bg-[#533afd]/20 selection:text-[#533afd] transition-colors duration-500 overflow-hidden z-50`} style={{ '--tg-viewport-height': `${viewportHeight}px` } as React.CSSProperties}>
      <div className={`mini-app-shell w-full h-full sm:max-w-[375px] sm:h-[750px] sm:my-auto bg-white dark:bg-[#0F0F0F] relative flex flex-col sm:rounded-[32px] sm:border border-slate-200/80 dark:border-[#1A1A1A] ${ELEVATE_SHADOW} overflow-hidden transition-colors duration-500`}>
        
        {/* Header theme toggle inside the phone app, right corner */}
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
          <button onClick={toggleTheme} className="p-2 bg-slate-100 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 rounded-full text-slate-600 dark:text-gray-400 hover:text-[#533afd] dark:hover:text-white transition-colors" title="Сменить тему">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button onClick={() => (window.Telegram?.WebApp as any)?.close?.() || window.close()} className="px-3 py-1.5 bg-slate-100 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 rounded-[12px] font-semibold text-[12px] text-slate-900 dark:text-white hover:text-red-500 dark:hover:text-red-400 transition-colors shadow-sm">
            Закрыть
          </button>
        </div>

        <main className="flex-1 overflow-hidden relative bg-white dark:bg-[#0F0F0F] transition-colors duration-500">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, scale: 0.98, y: 5 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -5 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {activeTab === "create" && <CreateTab
                  uid={uid}
                  descState={[desc, setDesc]}
                  styleState={[selectedStyle, setSelectedStyle]}
                  photosState={[photos, setPhotos]}
                  parsedDataState={[parsedData, setParsedData]}
                  addressCoordsState={[addressCoords, setAddressCoords]}
                />}
              {activeTab === "history" && <HistoryTab uid={uid} />}
              {activeTab === "presentations" && <PresentationsTab uid={uid} />}
              {activeTab === "planner" && <PlannerTab uid={uid} />}
            </motion.div>
          </AnimatePresence>
        </main>
        
        <BottomBar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  );
}

async function pollTaskStatus(
  taskIds: { platform: string; taskId: string }[],
  listingId: string,
  initialFailures: Record<string, string> = {}
) {
  const MAX_POLLS = 120; // 10 minutes max (5s interval)
  let polls = 0;
  const pending = [...taskIds];
  const outcomes: Record<string, { ok: boolean; url?: string; error?: string; errorCode?: string }> = Object.fromEntries(
    Object.entries(initialFailures).map(([platform, error]) => [platform, { ok: false, error }])
  );

  while (pending.length > 0 && polls < MAX_POLLS) {
    await new Promise(r => setTimeout(r, 5000));
    polls++;

    for (let i = pending.length - 1; i >= 0; i--) {
      const { platform, taskId } = pending[i];
      try {
        const r = await fetch(`/api/publish/${taskId}/status`);
        if (!r.ok) continue;
        const data = await r.json();
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'partial' || data.status === 'publish_unknown') {
          pending.splice(i, 1);
          const siteKey = platform === 'ssge' ? 'ss_ge' : platform === 'korter' ? 'korter_ge' : platform === 'myhome' ? 'myhome_ge' : platform;
          const siteResult = data.results?.[siteKey];
          if (siteResult?.status === 'success') {
            outcomes[platform] = { ok: true, url: siteResult.url };
          } else {
            outcomes[platform] = { ok: false, error: siteResult?.user_message || siteResult?.error || data.error || 'Публикация не удалась', errorCode: siteResult?.error_code };
          }
        }
      } catch (e) {
        console.error(`Poll error for ${taskId}:`, e);
      }
    }
  }

  const timedOut = pending.map(({ platform }) => { outcomes[platform] = { ok: false, error: 'Таймаут ожидания публикации' }; return platform; });
  void timedOut;
  const failed = Object.entries(outcomes).filter(([, result]) => !result.ok);
  const successful = Object.entries(outcomes).filter(([, result]) => result.ok);
  if (failed.length) {
    const status = failed.some(([, result]) => result.errorCode === 'PUBLISH_NOT_VERIFIED')
      ? 'publish_unknown'
      : successful.length ? 'partial' : 'error';
    await supabase.from('listings').update({ status, error_details: failed.map(([platform, result]) => `${platform}: ${result.error}`).join('\n') }).eq('id', listingId);
  } else if (successful.length) {
    await supabase.from('listings').update({ status: 'published', error_details: null }).eq('id', listingId);
  }
}

// Survives CreateTab unmount: prevents double publish when switching tabs.
let modulePublishLock = { current: false };

export function CreateTab({ 
  uid, 
  descState, styleState, photosState, parsedDataState, addressCoordsState
}: { 
  uid: string | null, 
  descState: [string, React.Dispatch<React.SetStateAction<string>>],
  styleState: [StyleOption, React.Dispatch<React.SetStateAction<StyleOption>>],
  photosState: [string[], React.Dispatch<React.SetStateAction<string[]>>],
  parsedDataState: [any, React.Dispatch<React.SetStateAction<any>>],
  addressCoordsState: [{lat: number, lng: number} | null, React.Dispatch<React.SetStateAction<{lat: number, lng: number} | null>>]
}) {
  const [desc, setDesc] = descState;
  const [selectedStyle, setSelectedStyle] = styleState;
  
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [parsedData, setParsedData] = parsedDataState;
  const [showAddressConfirmation, setShowAddressConfirmation] = useState(false);
  const [showFullscreenMap, setShowFullscreenMap] = useState(false);
  
  // Real coordinates from geocoding or drag
  const [addressCoords, setAddressCoords] = addressCoordsState;

  const [activeEnhance, setActiveEnhance] = useState<string | null>(null);

  const { sessions, refresh: refreshSessions } = useUserSessions(uid);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Record<string, boolean>>({});
  const [authLoading, setAuthLoading] = useState<string | null>(null);
  const [activeSiteAuth, setActiveSiteAuth] = useState<string | null>(null);

  const handleStartAuth = async (siteKey: string) => {
    setActiveSiteAuth(siteKey);
  };

  const handleRemoveSession = async (siteKey: string) => {
    if (!uid) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Сессия пользователя истекла');
      await fetch('/api/auth/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ userId: uid, siteKey })
      });
    } catch {}
  };

  // Auto-select platforms that are connected, if not already specifically deselected
  useEffect(() => {
    setSelectedPlatforms(prev => {
      const next = { ...prev };
      Object.keys(sessions).forEach(key => {
        if (next[key] === undefined) {
          next[key] = true;
        }
      });
      return next;
    });
  }, [sessions]);

  const togglePlatform = (key: string) => {
    if (sessions[key]?.authStatus !== 'valid') return; // Not connected or expired
    setSelectedPlatforms(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleQuickAuth = async (siteKey: string) => {
    await handleStartAuth(siteKey);
  };

  // Debounced API call for AI parsing (extracts fields without rewriting text unless selectedStyle changes but let's decouple text rewriting)
  useEffect(() => {
    if (!desc || desc.length < 10) return;
    
    const handler = setTimeout(async () => {
      setIsAiLoading(true);
      setParsedData(null);
      setAddressCoords(null);
      try {
        let authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) authHeaders['Authorization'] = `Bearer ${session.access_token}`;
        } catch {}
        if (abortControllerRef.current) abortControllerRef.current.abort();
        const ac = new AbortController();
        abortControllerRef.current = ac;
        const res = await fetch('/api/parse-listing', {
          method: 'POST',
          headers: authHeaders,
          signal: ac.signal,
          body: JSON.stringify({ text: desc, styleId: 'original' }) // Always pass original for background parsing
        });
        const data = await res.json();
        setParsedData(data ? { ...data, enhanced_text: data.enhanced_text || '' } : null);
        if (data && data.address && data.lat && data.lng) {
          if (!addressCoords) {
             setAddressCoords({ lat: data.lat, lng: data.lng });
             setShowAddressConfirmation(true);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsAiLoading(false);
      }
    }, 1200);

    return () => clearTimeout(handler);
  }, [desc]);

  const handleStyleClick = async (styleId: StyleOption) => {
    setSelectedStyle(styleId);
    if (styleId === 'original') return;
    if (!desc || desc.length < 5) return;
    
    setActiveEnhance(styleId);
    try {
      const res = await fetch('/api/parse-listing', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ text: desc, styleId })
      });
      const data = await res.json();
      if (data?.enhanced_text) {
        setDesc(data.enhanced_text);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActiveEnhance(null);
    }
  };

  // Derived parsed fields for UI
  const parsedAddress = parsedData?.address;
  const parsedArea = parsedData?.area;
  const parsedPrice = parsedData?.price;
  const parsedRooms = parsedData?.rooms;
  const parsedFloor = parsedData?.floor;
  const missingFields = parsedData?.missing_fields || [];
  
  const handleMapConfirmation = (confirm: boolean) => {
    setShowAddressConfirmation(false);
    if (!confirm) {
      setShowFullscreenMap(true);
    }
  };

  const [isPublishing, setIsPublishing] = useState(false);
  // Module-scope ref: survives CreateTab unmount when user switches tabs mid-publish.
  const publishLock = useRef(modulePublishLock.current);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [photos, setPhotos] = photosState;

  const handleAddPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const files = Array.from(e.target.files);
    
    files.forEach((file: any) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const localUrl = event.target.result as string;
          setPhotos(prev => [...prev, localUrl]);
          fetch('/api/cloudinary/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl: localUrl, userId: uid }) })
            .then(response => response.ok ? response.json() : null)
            .then(uploaded => { if (uploaded?.url) setPhotos(prev => prev.map(photo => photo === localUrl ? uploaded.url : photo)); })
            .catch(() => { /* Keep local data URI if Cloudinary is temporarily unavailable. */ });
        }
      };
      reader.readAsDataURL(file);
    });
    // Reset file input
    e.target.value = '';
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const setMainPhoto = (index: number) => {
    setPhotos(prev => {
      const newPhotos = [...prev];
      const selected = newPhotos.splice(index, 1)[0];
      newPhotos.unshift(selected);
      return newPhotos;
    });
  };

  const handlePublish = async () => {
    if (publishLock.current) return;
    if (!desc.trim()) return;
    if (!uid) {
      alert("Авторизуйтесь для публикации");
      return;
    }

    const activePlatformNames = ['korter', 'ssge', 'myhome']
      .filter(k => selectedPlatforms[k]);
    const telegramContext = { telegramChatId: (window.Telegram?.WebApp as any)?.initDataUnsafe?.user?.id || '', telegramUsername: (window.Telegram?.WebApp as any)?.initDataUnsafe?.user?.username || '' };

      if (activePlatformNames.length === 0) {
      alert("Выберите хотя бы одну площадку для публикации");
      return;
    }

    publishLock.current = true;
    setIsPublishing(true);
    let backgroundPolling = false;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        alert('Сессия пользователя истекла. Обновите приложение и повторите попытку.');
        return;
      }
      const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` };
      const preflightResponse = await fetch('/api/publish/preflight', { method: 'POST', headers: authHeaders, body: JSON.stringify({ userId: uid, text: desc, parsedData, photos, sites: activePlatformNames }) });
      const preflight = await preflightResponse.json();
      if (!preflightResponse.ok) {
         alert(preflight.error || 'Описание не готово к публикации. Проверьте обязательные поля.');
         return;
      }
      if (!preflight.ready) {
        const siteNames: Record<string, string> = { ssge: 'SS.ge', myhome: 'MyHome', korter: 'Korter' };
        const errors = (preflight.checks || []).flatMap((check: any) =>
          (check.errors || []).map((error: string) => `${siteNames[check.site] || check.site}: ${error}`)
        );
        alert(`Публикация пока недоступна:\n${errors.join('\n') || 'Проверьте авторизацию и баланс площадок.'}`);
        return;
      }
      const warnings = (preflight.checks || []).flatMap((check: any) => check.warnings || []);
      if (warnings.length) alert(`Предупреждение перед публикацией:\n${warnings.join('\n')}`);
      // Real title calculation
      const displayTitle = [parsedRooms ? `${parsedRooms}-к. квартира` : 'Объект', parsedArea].filter(Boolean).join(', ');

      const listingData = {
        user_id: uid,
        title: displayTitle === 'Объект' && parsedAddress ? parsedAddress : displayTitle,
        description: desc,
        status: 'publishing',
        platforms: activePlatformNames,
        cover_image: photos.length > 0 ? photos[0] : null,
        images: photos
      };

      let { data: docData, error } = await supabase.from('listings').insert([listingData] as any).select().single();
      if (error && /images|column/i.test(error.message)) {
        const { images: _images, ...legacyListingData } = listingData;
        ({ data: docData, error } = await supabase.from('listings').insert([legacyListingData] as any).select().single());
      }
      if (error) {
         if (error.message.includes('cover_image')) {
             throw new Error("Необходимо добавить колонку cover_image (text) в таблицу listings в Supabase. Воспользуйтесь SQL Editor.");
         }
         throw error;
      }
       const docRef = docData;
       try { localStorage.setItem(`karty:listing:${docRef.id}:images`, JSON.stringify(photos)); } catch { /* Prefer persisted Cloudinary URLs when available. */ }
      const taskIds: { platform: string; taskId: string }[] = [];
      const startFailures: Record<string, string> = {};
      
      // Start publishing on Korter
      if (activePlatformNames.includes('korter')) {
        try {
          const r = await fetch('/api/publish/korter', {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ userId: uid, objectId: docRef.id, text: desc, photos, parsedData, ...telegramContext })
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || 'Не удалось запустить публикацию на Korter');
          if (d.task_id) taskIds.push({ platform: 'korter', taskId: d.task_id });
         } catch(e: any) { console.error(e); startFailures.korter = e.message; await supabase.from('listings').update({ status: 'error', error_details: e.message }).eq('id', docRef.id); }
      }

      // Start publishing on SS.ge
      if (activePlatformNames.includes('ssge')) {
        try {
          const r = await fetch('/api/publish/ssge', {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ userId: uid, objectId: docRef.id, text: desc, photos, parsedData, ...telegramContext })
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || 'Не удалось запустить публикацию на SS.ge');
          if (d.task_id) taskIds.push({ platform: 'ssge', taskId: d.task_id });
         } catch(e: any) { console.error(e); startFailures.ssge = e.message; await supabase.from('listings').update({ status: 'error', error_details: e.message }).eq('id', docRef.id); }
      }

      // Start publishing on MyHome
      if (activePlatformNames.includes('myhome')) {
        try {
          const r = await fetch('/api/publish/myhome', {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ userId: uid, objectId: docRef.id, text: desc, photos, parsedData, ...telegramContext })
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || 'Не удалось запустить публикацию на MyHome');
          if (d.task_id) taskIds.push({ platform: 'myhome', taskId: d.task_id });
         } catch(e: any) { console.error(e); startFailures.myhome = e.message; await supabase.from('listings').update({ status: 'error', error_details: e.message }).eq('id', docRef.id); }
      }
      
      // Poll task status and update listing in Supabase
      if (taskIds.length > 0) {
        backgroundPolling = true;
         pollTaskStatus(taskIds, docRef.id, startFailures).finally(() => { publishLock.current = false; setIsPublishing(false); });
      }
      
      setDesc("");
      setParsedData(null);
      setAddressCoords(null);
      setPhotos([]);
      alert("Публикация начата. Вы можете следить за статусом в Истории объектов.");
    } catch (e: any) {
      console.error(e);
      alert(`Ошибка при публикации: ${e.message}`);
    } finally {
      if (!backgroundPolling) { publishLock.current = false; setIsPublishing(false); }
    }
  };

  if (activeSiteAuth === 'korter') {
    return <KorterAuth onBack={() => { setActiveSiteAuth(null); refreshSessions('korter'); }} userId={uid || 'anonymous_user'} />;
  }
  if (activeSiteAuth && activeSiteAuth !== 'korter') {
    return <PlatformLoginAuth onBack={() => { const site = activeSiteAuth; setActiveSiteAuth(null); refreshSessions(site || undefined); }} siteKey={activeSiteAuth} userId={uid || 'anonymous_user'} />;
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0A0A0A] transition-colors duration-500 relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[40%] bg-[#533afd]/5 dark:bg-[#533afd]/15 blur-[80px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[40%] bg-[#533afd]/5 dark:bg-[#533afd]/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="flex flex-col justify-start px-4 pt-4 pb-2 bg-white/90 dark:bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-slate-200/80 dark:border-white/5 z-10 transition-colors">
        <div className="flex items-center gap-1.5 opacity-80 mb-2">
          <svg width="18" height="18" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="25" y="20" width="16" height="60" rx="4" className="fill-[#0a2540] dark:fill-white" />
            <path d="M38 52 L 70 20 C 72 18, 76 18, 78 20 L 78 28 C 78 30, 77 32, 75 33 L 38 70 Z" fill="#533afd" />
            <path fillRule="evenodd" clipRule="evenodd" d="M48 64 L 62 50 H 76 C 79.3137 50 82 52.6863 82 56 V 76 C 82 79.3137 79.3137 82 76 82 H 54 C 50.6863 82 48 79.3137 48 76 V 64 Z M 58 58 C 58 56.8954 58.8954 56 60 56 H 64 C 65.1046 56 66 56.8954 66 58 V 62 C 66 63.1046 65.1046 64 64 64 H 60 C 58.8954 64 58 63.1046 58 62 V 58 Z M 60 68 C 58.8954 68 58 68.8954 58 70 V 74 C 58 75.1046 58.8954 76 60 76 H 64 C 65.1046 76 66 75.1046 66 74 V 70 C 66 68.8954 65.1046 68 64 68 H 60 Z" fill="#533afd" />
          </svg>
          <span className="text-[15px] font-bold text-[#0a2540] dark:text-white tracking-tight">Karty</span>
        </div>
        <h1 className="text-[26px] font-bold tracking-tight text-slate-900 dark:text-white/90 leading-tight pr-12">Новое объявление</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-40">
        
        {/* Text Area block */}
        <div className="space-y-3">
          <div className={`relative flex flex-col bg-white dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/10 rounded-2xl p-4 transition-all focus-within:border-[#533afd] focus-within:ring-4 focus-within:ring-[#533afd]/10 ${STRIPE_SHADOW}`}>
            <textarea 
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder={"Например: 2к квартира у моря в Батуми, 55 метров, 120 000 $..."}
              className="w-full h-32 bg-transparent text-[15px] sm:text-[16px] text-slate-900 dark:text-gray-200 placeholder:text-slate-600 dark:placeholder:text-gray-600 focus:outline-none resize-none border-none leading-relaxed" 
            />
            
            <div className="mt-2 pt-3 border-t border-slate-200/80 dark:border-white/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[11px] uppercase tracking-wider text-slate-600 dark:text-gray-500 font-bold flex items-center gap-1">
                  <Sparkles size={10} className="text-[#533afd] dark:text-blue-400" /> 
                  Распознано AI {isAiLoading && <span className="animate-pulse">...</span>}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-gray-600 font-medium">{desc.length}/2000</span>
              </div>

              {showAddressConfirmation && parsedAddress && (
                <div className="mb-3 bg-[#e8f7ec] dark:bg-[#15be53]/10 border border-[#15be53]/20 dark:border-[#15be53]/30 rounded-xl p-3 shadow-sm">
                  <div className="flex items-start gap-2 mb-2">
                    <MapPin size={16} className="text-[#15be53] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[13px] text-slate-900 dark:text-white font-medium leading-tight">
                        Я нашел адрес: {parsedAddress}. <br/>Верно?
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleMapConfirmation(true)} className="flex-1 py-1.5 bg-[#15be53] hover:bg-[#12a849] text-white text-[12px] font-bold rounded-lg transition-colors">
                      Да, подтверждаю
                    </button>
                    <button onClick={() => handleMapConfirmation(false)} className="flex-1 py-1.5 bg-white dark:bg-white/10 hover:bg-gray-50 dark:hover:bg-white/20 border border-slate-200/80 dark:border-white/10 text-[12px] font-bold text-slate-900 dark:text-white rounded-lg transition-colors">
                      Уточнить на карте
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 min-h-[26px]">
                {(!parsedAddress && !parsedArea && !parsedPrice && !parsedRooms) && <span className="text-[11px] text-slate-500 dark:text-gray-600 font-medium my-auto">Начните вводить текст...</span>}
                {parsedAddress && (
                  <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 px-2.5 py-1 rounded-md text-[11px] transition-all">
                    <span className="text-slate-500">📍 Адрес:</span> <span className="font-semibold text-slate-900 dark:text-white">{parsedAddress}</span>
                  </div>
                )}
                {parsedArea && (
                  <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 px-2.5 py-1 rounded-md text-[11px] transition-all">
                    <span className="text-slate-500">📏 Площадь:</span> <span className="font-semibold text-slate-900 dark:text-white">{parsedArea}</span>
                  </div>
                )}
                {parsedPrice && (
                  <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 px-2.5 py-1 rounded-md text-[11px] transition-all">
                    <span className="text-slate-500">💰 Цена:</span> <span className="font-semibold text-slate-900 dark:text-white">{parsedPrice}</span>
                  </div>
                )}
                {parsedRooms && (
                  <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 px-2.5 py-1 rounded-md text-[11px] transition-all">
                    <span className="text-slate-500">🛏 Комнат:</span> <span className="font-semibold text-slate-900 dark:text-white">{parsedRooms}</span>
                  </div>
                )}
                {missingFields.length > 0 && (
                  <div className="w-full mt-1 bg-[#fff1f2] dark:bg-[#e71d36]/10 border border-[#e71d36]/20 py-1.5 px-2.5 rounded-md text-[11px] text-[#e71d36] font-medium flex items-start gap-1.5 leading-snug">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <span>Для публикации не хватает: {missingFields.join(', ')}. Пожалуйста, добавьте их в описание.</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pb-2 pt-1 px-1">
            {DUMMY_STYLES.map((style) => (
              <button
                key={style.id}
                onClick={() => handleStyleClick(style.id)}
                disabled={activeEnhance !== null}
                className={`w-full justify-center px-3 py-2 rounded-lg text-[13px] sm:text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  selectedStyle === style.id && style.id === 'original'
                    ? 'bg-[#061b31] dark:bg-white text-white dark:text-black shadow-md'
                    : selectedStyle === style.id
                    ? 'bg-[#533afd] text-white shadow-md shadow-[#533afd]/20'
                    : 'bg-white dark:bg-white/[0.03] text-slate-600 dark:text-gray-400 border border-slate-200/80 dark:border-white/10 hover:border-slate-200/80 dark:hover:border-white/20'
                } ${activeEnhance !== null ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {activeEnhance === style.id ? (
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  style.id !== 'original' && <Sparkles size={12} className={selectedStyle === style.id ? 'text-white' : 'text-[#533afd] dark:text-blue-400'} />
                )}
                {style.label}
              </button>
            ))}
          </div>
        </div>

        {/* Photos */}
        <div className="space-y-3">
          <h3 className="text-[12px] uppercase tracking-wider text-slate-600 dark:text-gray-500 font-bold">Фотографии</h3>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
            <label className="shrink-0 w-28 h-28 rounded-[16px] bg-white dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/10 flex flex-col items-center justify-center gap-2 text-slate-600 dark:text-gray-400 hover:text-[#533afd] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05] hover:border-[#533afd]/40 dark:hover:border-white/20 transition-all active:scale-95 shadow-sm dark:shadow-none cursor-pointer">
              <input type="file" multiple accept="image/*" className="hidden" onChange={handleAddPhotos} />
              <Camera size={24} />
              <span className="text-[12px] font-medium">Добавить</span>
            </label>
            
            {photos.map((photo, i) => (
              <div 
                key={i} 
                className={`relative shrink-0 w-28 h-28 rounded-[16px] ${i === 0 ? 'border-2 border-[#533afd]' : 'border border-slate-200/80 dark:border-transparent'} overflow-hidden ${STRIPE_SHADOW} cursor-pointer`}
                onClick={() => i !== 0 && setMainPhoto(i)}
              >
                <img src={photo} alt={`Upload ${i}`} className="w-full h-full object-cover" />
                {i === 0 && (
                  <div className="absolute top-2 left-2 bg-[#533afd] text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm flex items-center gap-1 backdrop-blur-md">
                    <Star size={8} className="fill-white" /> Обложка
                  </div>
                )}
                {i !== 0 && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
                    <span className="text-white text-[10px] font-bold bg-black/50 px-2 py-1 rounded">Сделать главной</span>
                  </div>
                )}
                <button 
                  onClick={(e) => { e.stopPropagation(); removePhoto(i); }} 
                  className="absolute top-2 right-2 p-1.5 bg-white dark:bg-black/50 rounded-full text-slate-600 dark:text-white/70 hover:text-[#e71d36] dark:hover:text-red-400 shadow-sm transition-colors backdrop-blur-md z-10"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Platforms */}
        <div className="space-y-3 pb-24">
          <h3 className="text-[12px] uppercase tracking-wider text-slate-600 dark:text-gray-500 font-bold">Площадки для публикации</h3>
          <div className="space-y-2">
            {[
              { key: 'korter', name: 'Korter', logo: <KorterIcon className="w-4 h-4" />, logoBg: 'bg-gray-100 dark:bg-white/5', logoColor: 'text-slate-900 dark:text-white' },
              { key: 'ssge', name: 'SS.ge', logo: <SSIcon className="w-4 h-4" />, logoBg: 'bg-gray-100 dark:bg-white/5', logoColor: 'text-slate-900 dark:text-white' },
              { key: 'myhome', name: 'MyHome', logo: <MyHomeIcon className="w-4 h-4" />, logoBg: 'bg-gray-100 dark:bg-white/5', logoColor: 'text-slate-900 dark:text-white' },
            ].map(({ key, name, logo, logoBg, logoColor }) => {
              const status = sessions[key]?.authStatus;
              const connected = status === 'valid';
              const active = !!selectedPlatforms[key];
              const isLoading = authLoading === key;
              return (
                <div key={key} className={`flex items-center justify-between p-3 rounded-[14px] bg-white dark:bg-white/[0.02] border ${connected ? (active ? 'border-[#533afd] bg-[#533afd]/5 dark:bg-[#533afd]/10' : 'border-slate-200/80 dark:border-white/5') : 'border-dashed border-slate-300 dark:border-white/10'} transition-all shadow-sm`}>
                  <div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => togglePlatform(key)}>
                    <div className={`w-8 h-8 rounded-full ${logoBg} flex items-center justify-center ${logoColor} border border-slate-200/80 dark:border-white/5`}>
                      {logo}
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-slate-900 dark:text-white/90">{name}</p>
                      {connected ? (
                        <p className="text-[10px] text-[#15be53] font-bold">Подключена</p>
                      ) : status === 'expired' ? (
                        <p className="text-[10px] text-amber-600 font-bold">Требуется повторный вход</p>
                      ) : status === 'checking' ? (
                        <p className="text-[10px] text-slate-400">Проверка сессии...</p>
                      ) : (
                        <p className="text-[10px] text-slate-400">Не подключена</p>
                      )}
                    </div>
                  </div>
                  {connected ? (
                    <div className="flex items-center gap-2">
                      <div onClick={() => togglePlatform(key)} className={`w-12 h-[26px] rounded-full p-0.5 transition-colors duration-300 cursor-pointer ${active ? 'bg-[#533afd]' : 'bg-[#e5edf5] dark:bg-white/10'}`}>
                        <motion.div initial={false} animate={{ x: active ? 22 : 0 }} transition={{ type: "spring", stiffness: 500, damping: 30 }} className="w-5 h-5 bg-white rounded-full shadow" />
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleQuickAuth(key); }} 
                      disabled={isLoading}
                      className="px-4 py-1.5 bg-[#533afd] text-white rounded-lg text-[12px] font-semibold hover:bg-[#4330e0] disabled:opacity-50 transition-colors"
                    >
                      {isLoading ? '...' : 'Войти'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      {/* Fullscreen Map Overlay */}
      <AnimatePresence>
        {showFullscreenMap && (
          <motion.div 
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute inset-0 z-[100] bg-white dark:bg-[#0F0F0F] flex flex-col"
          >
            <div className="flex justify-between items-center p-4 border-b border-slate-200/80 dark:border-[#1A1A1A] bg-white/50 dark:bg-black/50 backdrop-blur-md absolute top-0 w-full z-10">
              <h3 className="font-bold text-[16px] text-slate-900 dark:text-white">Укажите точку</h3>
              <button onClick={() => setShowFullscreenMap(false)} className="p-2 bg-gray-100 dark:bg-white/10 rounded-full">
                <X size={18} />
              </button>
            </div>
            
            <div className="flex-1 w-full bg-gray-100 dark:bg-[#050505] relative">
              {(() => {
                const mapCoords = addressCoords || (desc.toLowerCase().includes('тбилиси') 
                  ? { lng: 44.793, lat: 41.7151 } 
                  : { lng: 41.6366, lat: 41.6168 });
                
                return (
                  <Map
                    key={`${mapCoords.lat}-${mapCoords.lng}`} // Форсирует перецентровку
                    mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
                    initialViewState={{
                      longitude: mapCoords.lng,
                      latitude: mapCoords.lat,
                      zoom: 15
                    }}
                    mapStyle="mapbox://styles/mapbox/streets-v12"
                  >
                    <Marker 
                      longitude={mapCoords.lng} 
                      latitude={mapCoords.lat} 
                      anchor="bottom"
                      draggable
                      onDragEnd={(e) => setAddressCoords({ lng: e.lngLat.lng, lat: e.lngLat.lat })}
                    >
                      <MapPin size={32} className="text-[#533afd] fill-white" />
                    </Marker>
                  </Map>
                );
              })()}
            </div>
            
            <div className="p-4 border-t border-slate-200/80 dark:border-[#1A1A1A]">
              <button 
                onClick={() => setShowFullscreenMap(false)} 
                className="w-full bg-[#533afd] hover:bg-[#4434d4] text-white rounded-xl py-3 font-semibold text-[15px] transition-transform active:scale-[0.98]">
                Сохранить точку
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sticky Bottom button */}
      <div className="mini-publish-bar sticky bottom-0 w-full p-4 bg-gradient-to-t from-[#f6f9fc] dark:from-[#050505] via-[#f6f9fc]/90 dark:via-[#050505]/90 to-transparent pb-8 z-40">
        <button 
          onClick={handlePublish}
          disabled={isPublishing || isAiLoading || !desc.trim() || missingFields.length > 0}
          className={`w-full ${missingFields.length > 0 ? 'bg-gray-400 dark:bg-gray-700' : 'bg-[#15be53] hover:bg-[#12a849]'} disabled:opacity-50 text-white rounded-[14px] py-4 font-semibold text-[15px] transition-transform active:scale-[0.98] ${STRIPE_SHADOW} flex items-center justify-center gap-2`}>
          {isPublishing ? "Публикация..." : isAiLoading ? "Разбираем описание..." : "Опубликовать"} <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

function PlatformCheckbox({ name, active, isConnected, logoBg, logoColor, logo, onClick }: any) {
  return (
    <div onClick={onClick} className={`flex items-center justify-between p-3 rounded-[14px] bg-white dark:bg-white/[0.02] border ${isConnected === false ? 'border-dashed border-slate-200/80 dark:border-white/5 opacity-70' : 'border-slate-200/80 dark:border-white/5'} hover:border-[#c1d1e0] dark:hover:border-white/10 shadow-sm dark:shadow-none cursor-pointer transition-colors`}>
      <div className="flex items-center gap-3">
        <div className={`relative w-8 h-8 rounded-full ${logoBg} flex items-center justify-center ${logoColor} font-bold text-sm border border-slate-200/80 dark:border-white/5`}>
          {logo}
        </div>
        <div>
          <p className="text-[14px] font-semibold text-slate-900 dark:text-white/90 leading-tight">{name}</p>
          {isConnected === false && (
            <p className="text-[10px] text-[#ff4264] mt-0.5">Требуется вход</p>
          )}
        </div>
      </div>
      <div className={`w-12 h-[26px] rounded-full p-0.5 transition-colors duration-300 ${active ? 'bg-[#533afd]' : 'bg-[#e5edf5] dark:bg-white/10'}`}>
        <motion.div 
          initial={false}
          animate={{ x: active ? 22 : 2 }}
          className="w-[22px] h-[22px] bg-white rounded-full shadow-sm"
        />
      </div>
    </div>
  );
}

function PlatformAuthCard({ name, siteKey, isConnected, balance, logoBg, logoColor, logo, onAuth, onRemoveSession }: any) {
  const [isLoading, setIsLoading] = React.useState(false);

  const handleAuth = async () => {
    setIsLoading(true);
    await onAuth(siteKey);
    setIsLoading(false);
  };

  const handleRemove = async () => {
    setIsLoading(true);
    await onRemoveSession(siteKey);
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col p-4 rounded-[16px] bg-white dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/5 shadow-sm dark:shadow-none transition-colors relative">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full ${logoBg} flex items-center justify-center ${logoColor} font-bold text-lg border border-slate-200/80 dark:border-white/5`}>
            {logo}
          </div>
          <div>
            <p className="text-[15px] font-semibold text-slate-900 dark:text-white/90 leading-tight">{name}</p>
            <p className={`text-[11px] font-bold mt-0.5 ${isConnected ? 'text-[#15be53]' : 'text-[#ff4264] dark:text-red-400'}`}>
              {isConnected ? '• Сессия активна' : '• Требуется вход'}
            </p>
          </div>
        </div>
      </div>
      
      {isConnected ? (
        <div className="mt-2 pt-3 border-t border-slate-200/80 dark:border-white/5 space-y-2">
          <div className="flex items-center justify-between bg-slate-50 dark:bg-white/[0.04] rounded-lg px-3 py-2.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">Баланс</span>
            <span className="text-sm font-bold text-slate-900 dark:text-white">
              {balance?.balance?.checked && balance.balance.amount !== null ? `${balance.balance.amount} ${balance.balance.currency || 'GEL'}` : 'Проверка...'}
            </span>
          </div>
          <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-[#15be53]/10 text-[#15be53] px-4 py-2.5 rounded-lg text-sm font-semibold border border-[#15be53]/20">
            <CheckCircle2 size={16} /> Авторизован
          </div>
          <button 
            onClick={handleRemove}
            disabled={isLoading}
            className="shrink-0 bg-slate-100 text-[#ff4264] dark:bg-red-500/10 dark:text-red-400 px-4 py-2.5 rounded-lg text-sm font-semibold active:scale-95 transition-all text-center border border-red-500/10 disabled:opacity-50"
          >
            {isLoading ? "..." : "Выйти"}
          </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 pt-3 border-t border-slate-200/80 dark:border-white/5 flex gap-2">
          <button 
            onClick={handleAuth}
            disabled={isLoading}
            className="w-full bg-[#533afd] text-white px-4 py-2.5 rounded-lg text-sm font-semibold active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? "Ожидание входа..." : "Авторизация"}
          </button>
        </div>
      )}
    </div>
  );
}

function HistoryTab({ uid }: { uid: string | null }) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'error' | 'publishing' | 'partial' | 'publish_unknown'>('all');
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showRepublishConfirm, setShowRepublishConfirm] = useState<string | null>(null);
  const [showPlatformSelect, setShowPlatformSelect] = useState<{action: 'delete' | 'republish', item: HistoryItem} | null>(null);
  const [selectedPlatformsForAction, setSelectedPlatformsForAction] = useState<string[]>([]);
  const [promotionCheck, setPromotionCheck] = useState<{ item: HistoryItem; loading: boolean; results: any[] } | null>(null);

  useEffect(() => {
    if (!uid) return;
    
    const fetchHistory = async () => {
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });
        
      if (!error && data) {
         setHistory(data.map(d => ({
           id: d.id,
           title: d.title,
           desc: d.description || d.desc, // handle db rename
           date: d.created_at || d.date,
           platforms: d.platforms,
           status: d.status,
            image: d.cover_image,
            images: d.images || d.photos || [],
            listingUrls: d.listing_urls || {},
           userId: d.user_id,
           errorDetails: d.error_details || undefined
         })) as HistoryItem[]);
      }
      setLoading(false);
    };
    
    fetchHistory();
    
    const channel = supabase.channel(`public:listings:user_id=eq.${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'listings', filter: `user_id=eq.${uid}` },
        () => {
          fetchHistory();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [uid]);

  const checkPromotion = async (item: HistoryItem) => {
    setOpenMenuId(null);
    setPromotionCheck({ item, loading: true, results: [] });
    const results = await Promise.all(item.platforms.map(async platform => {
      try {
        const response = await fetch('/api/promotion/preflight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: item.userId, siteKey: platform, listingUrl: item.listingUrls?.[platform] || null }),
        });
        return await response.json();
      } catch (error: any) {
        return { site: platform, errors: [error.message] };
      }
    }));
    setPromotionCheck({ item, loading: false, results });
  };

  // Filter logic
  const filtered = history.filter(item => {
    // Status filter
    if (statusFilter === 'published' && item.status !== 'published') return false;
    if (statusFilter === 'error' && item.status !== 'error') return false;
    if (statusFilter === 'partial' && item.status !== 'partial') return false;
    if (statusFilter === 'publish_unknown' && item.status !== 'publish_unknown') return false;
    if (statusFilter === 'publishing' && item.status !== 'publishing') return false;
    // Platform filter
    if (platformFilter && !item.platforms.includes(platformFilter)) return false;
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (item.title || '').toLowerCase().includes(q);
      const matchDesc = (item.desc || '').toLowerCase().includes(q);
      // Extract price from desc or title
      const priceMatch = (item.desc || '').match(/(\d[\d\s]*\d)/);
      const matchPrice = priceMatch && priceMatch[0].replace(/\s/g, '').includes(q.replace(/\s/g, ''));
      if (!matchTitle && !matchDesc && !matchPrice) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0A0A0A] transition-colors duration-500 relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[40%] bg-[#533afd]/5 dark:bg-[#533afd]/15 blur-[80px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[40%] bg-[#533afd]/5 dark:bg-[#533afd]/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="flex flex-col px-4 pt-4 pb-4 bg-white/90 dark:bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-slate-200/80 dark:border-white/5 z-10 transition-colors">
        <h1 className="text-[26px] font-bold tracking-tight text-slate-900 dark:text-white/90 leading-tight">Мои объекты</h1>
        
        {/* Search / Filter bar */}
        <div className="mt-4 space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 bg-slate-100 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 rounded-[12px] px-3 py-2 flex items-center gap-2">
              <Search size={16} className="text-slate-400 shrink-0" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по описанию, цене, названию..."
                className="w-full bg-transparent text-sm text-slate-900 dark:text-white/90 outline-none placeholder:text-slate-400"
              />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>}
            </div>
          </div>
          
          {/* Status filters */}
          <div className="flex gap-1.5">
            {(['all', 'published', 'publishing', 'partial', 'publish_unknown', 'error'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                  statusFilter === s ? 'bg-[#533afd] text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-400'
                }`}>
                 {s === 'all' ? 'Все' : s === 'published' ? 'Опубликованные' : s === 'publishing' ? 'Публикуется' : s === 'partial' ? 'Частично' : s === 'publish_unknown' ? 'Проверить' : 'Ошибки'}
              </button>
            ))}
          </div>
          
          {/* Platform filters */}
          <div className="flex gap-1.5">
            {(['korter', 'ssge', 'myhome'] as const).map(p => (
              <button key={p} onClick={() => setPlatformFilter(platformFilter === p ? null : p)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                  platformFilter === p ? 'bg-[#533afd] text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-400'
                }`}>
                {p === 'korter' ? 'Korter' : p === 'ssge' ? 'SS.ge' : 'MyHome'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-8 text-slate-900 dark:text-gray-200">
        {loading && <p className="text-center text-sm text-gray-500 mt-4">Загрузка...</p>}
        {!loading && filtered.length === 0 && <p className="text-center text-sm text-gray-500 mt-4">{history.length === 0 ? 'У вас пока нет объектов.' : 'Нет объектов по фильтрам.'}</p>}
        {filtered.map((item) => (
          <div key={item.id} className="bg-white dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/5 rounded-[16px] p-3 shadow-sm dark:shadow-none transition-colors relative">
            <div className="flex gap-3">
              <div className="w-[72px] h-[72px] rounded-[10px] bg-slate-100 dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/5 shrink-0 overflow-hidden flex items-center justify-center text-gray-300 dark:text-gray-600 transition-colors">
                {item.image ? (
                  <img src={item.image} className="w-full h-full object-cover" />
                ) : (
                  <Camera size={20} />
                )}
              </div>
              <div className="flex-1 min-w-0 py-1">
                <div className="flex justify-between items-start">
                  <h3 className="font-semibold text-[14px] text-slate-900 dark:text-white/90 truncate pr-2">{item.title}</h3>
                  {/* Three-dot menu */}
                  <div className="relative shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === item.id ? null : item.id); }}
                      className="text-slate-500 dark:text-gray-500 hover:text-slate-900 dark:hover:text-white p-1">
                      <MoreVertical size={16} />
                    </button>
                    {openMenuId === item.id && (
                      <div className="absolute right-0 top-8 z-50 bg-white dark:bg-[#1a1a1a] border border-slate-200/80 dark:border-white/10 rounded-xl shadow-lg py-1 min-w-[140px]">
                         <button onClick={() => {
                            checkPromotion(item);
                          }} className="w-full text-left px-3 py-2 text-[13px] text-[#533afd] hover:bg-[#533afd]/5 flex items-center gap-2">
                           <Megaphone size={14} /> Продвижение
                         </button>
                         <button onClick={() => {
                            setOpenMenuId(null);
                            if (item.platforms.length === 1) {
                              setSelectedPlatformsForAction([...item.platforms]);
                              setShowRepublishConfirm(item.id);
                            } else {
                              setShowPlatformSelect({ action: 'republish', item });
                            }
                          }} className="w-full text-left px-3 py-2 text-[13px] text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5 flex items-center gap-2">
                          <RefreshCcw size={14} /> Републикация
                          <HelpCircle size={12} className="ml-auto text-slate-400 hover:text-slate-600 cursor-help" title="Републикация — удаление объявления с платформы и повторная публикация с теми же данными. Полезно для поднятия объявления в поиске." />
                        </button>
                        <button onClick={() => {
                            setOpenMenuId(null);
                            if (item.platforms.length === 1) {
                              setSelectedPlatformsForAction([...item.platforms]);
                              setShowDeleteConfirm(item.id);
                            } else {
                              setShowPlatformSelect({ action: 'delete', item });
                            }
                          }} className="w-full text-left px-3 py-2 text-[13px] text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center gap-2">
                          <Trash2 size={14} /> Удалить
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-[12px] text-slate-600 dark:text-gray-400 mt-1 line-clamp-2 leading-snug">{item.desc}</p>
                <p className="text-[11px] text-slate-500 dark:text-gray-500 mt-1.5">
                  {new Date(item.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
                
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {item.status === 'published' && <StatusBadge type="success" text="Опубликовано" />}
                  {item.status === 'publishing' && <StatusBadge type="publishing" text="Публикуется..." />}
                  {item.status === 'draft' && <StatusBadge type="neutral" text="Черновик" />}
                  {item.status === 'error' && <StatusBadge type="error" text="Ошибка" />}
                  {item.status === 'partial' && <StatusBadge type="error" text="Частично опубликовано" />}
                  {item.status === 'publish_unknown' && <StatusBadge type="error" text="Нужно проверить" />}
                </div>
                {['error', 'partial', 'publish_unknown'].includes(item.status) && item.errorDetails && (
                  <p className="text-[11px] text-red-500 dark:text-red-400 mt-1.5 leading-snug">
                    {item.errorDetails}
                  </p>
                )}
              </div>
            </div>
            
            {/* Platforms row */}
            <div className="mt-3 pt-3 border-t border-slate-200/80 dark:border-white/5 flex gap-2">
               {item.platforms.map(p => (
                 <div key={p} className="text-[10px] uppercase font-bold px-2 py-1 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-400 rounded-md border border-slate-200/80 dark:border-white/5">
                   {p}
                 </div>
               ))}
            </div>
          </div>
        ))}


        {/* Platform Selection Modal */}
        {showPlatformSelect && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowPlatformSelect(null)}>
            <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 max-w-sm mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-[16px] font-bold text-slate-900 dark:text-white mb-1">
                {showPlatformSelect.action === 'delete' ? 'Удалить с платформ' : 'Републикация на платформах'}
              </h3>
              <p className="text-[12px] text-slate-500 mb-4">Выберите платформы:</p>
              {showPlatformSelect.item.platforms.map((p: string) => (
                <label key={p} className="flex items-center gap-3 py-2.5 px-3 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedPlatformsForAction.includes(p)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPlatformsForAction(prev => [...prev, p]);
                      } else {
                        setSelectedPlatformsForAction(prev => prev.filter(x => x !== p));
                      }
                    }}
                    className="w-4 h-4 accent-[#533afd]"
                  />
                  <span className="text-[13px] font-medium text-slate-700 dark:text-gray-200">
                    {p === 'korter' ? 'Korter' : p === 'ssge' ? 'SS.ge' : p === 'myhome' ? 'MyHome' : p}
                  </span>
                </label>
              ))}
              <div className="flex gap-2 mt-1 mb-4">
                <button onClick={() => setSelectedPlatformsForAction([...showPlatformSelect.item.platforms])}
                  className="text-[11px] text-[#533afd] font-semibold">Выбрать все</button>
                <button onClick={() => setSelectedPlatformsForAction([])}
                  className="text-[11px] text-slate-400 font-semibold">Снять все</button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setShowPlatformSelect(null); setSelectedPlatformsForAction([]); }}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-gray-300 rounded-xl text-[13px] font-semibold">Отмена</button>
                <button onClick={() => {
                  setShowPlatformSelect(null);
                  if (showPlatformSelect.action === 'delete') {
                    setShowDeleteConfirm(showPlatformSelect.item.id);
                  } else {
                    setShowRepublishConfirm(showPlatformSelect.item.id);
                  }
                }} disabled={selectedPlatformsForAction.length === 0}
                  className={`flex-1 py-2.5 rounded-xl text-[13px] font-semibold ${showPlatformSelect.action === 'delete' ? 'bg-red-500 text-white' : 'bg-[#533afd] text-white'} disabled:opacity-50`}>
                  {selectedPlatformsForAction.length === 0 ? 'Выберите платформы' : showPlatformSelect.action === 'delete' ? `Удалить (${selectedPlatformsForAction.length})` : `Републикация (${selectedPlatformsForAction.length})`}
                </button>
              </div>
            </div>
          </div>
        )}

        {promotionCheck && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPromotionCheck(null)}>
            <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-5 max-w-sm w-[calc(100%-2rem)] max-h-[80vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-[16px] font-bold text-slate-900 dark:text-white">Продвижение объекта</h3>
                <button onClick={() => setPromotionCheck(null)} className="p-1 text-slate-400"><X size={16} /></button>
              </div>
              <p className="text-[12px] text-slate-500 mb-4">Проверяем доступные рекламные действия. Оплата не выполняется.</p>
              {promotionCheck.loading ? <p className="text-sm text-slate-500 py-6 text-center">Проверка площадок...</p> : (
                <div className="space-y-3">
                  {promotionCheck.results.map(result => (
                    <div key={result.site} className="rounded-xl border border-slate-200 dark:border-white/10 p-3">
                      <div className="flex items-center justify-between">
                        <b className="text-sm text-slate-900 dark:text-white">{result.site}</b>
                        <span className={`text-[10px] font-semibold ${result.auth === 'valid' ? 'text-green-600' : 'text-red-500'}`}>{result.auth === 'valid' ? 'Авторизован' : 'Нет доступа'}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-2">Баланс: {result.balance?.checked && result.balance.amount !== null ? `${result.balance.amount} ${result.balance.currency || 'GEL'}` : 'не проверен'}</div>
                      <div className="text-xs mt-2">{result.promotion_available ? <span className="text-green-600">Найдены элементы продвижения</span> : <span className="text-slate-500">Элементы продвижения не найдены</span>}</div>
                      {result.promotion_controls?.slice(0, 5).map((control: any, index: number) => <div key={index} className="text-[11px] text-slate-500 mt-1 truncate">{control.text}</div>)}
                      {result.dashboard_url && <a href={result.dashboard_url} target="_blank" rel="noreferrer" className="inline-block mt-3 text-xs font-semibold text-[#533afd]">Открыть площадку</a>}
                      {result.errors?.map((error: string, index: number) => <div key={index} className="text-[11px] text-red-500 mt-2">{error}</div>)}
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => setPromotionCheck(null)} className="w-full mt-4 py-2.5 bg-slate-100 dark:bg-white/5 rounded-xl text-sm font-semibold">Закрыть</button>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDeleteConfirm(null)}>
            <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 max-w-sm mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-[16px] font-bold text-slate-900 dark:text-white">Удалить объект?</h3>
              <p className="text-[13px] text-slate-500 mt-2">Объект будет удалён с выбранных платформ. Это действие необратимо.</p>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 py-2.5 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-gray-300 rounded-xl text-[13px] font-semibold">Отмена</button>
                <button onClick={async () => {
                  const listingId = showDeleteConfirm;
                  setShowDeleteConfirm(null);
                  const item = history.find(h => h.id === listingId);
                  if (!item) return;
                   const platforms = selectedPlatformsForAction.length > 0 ? selectedPlatformsForAction : item.platforms;
                   try {
                     const { data: { session } } = await supabase.auth.getSession();
                     if (!session?.access_token) throw new Error('Сессия пользователя истекла');
                     const response = await fetch('/api/listings/delete', {
                       method: 'POST',
                       headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                        body: JSON.stringify({ listing_id: listingId, user_id: item.userId, platforms, listing_urls: item.listingUrls || {} }),
                     });
                     const result = await response.json();
                     if (!response.ok || !result.success) throw new Error(result.error || 'Не удалось удалить объявление на всех выбранных площадках');
                     setHistory(prev => prev.filter(h => h.id !== listingId));
                  } catch(e: any) { console.error(e); alert(`Ошибка удаления: ${e.message || e}`); }
                  setSelectedPlatformsForAction([]);
                }} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-[13px] font-semibold">Удалить</button>
              </div>
            </div>
          </div>
        )}

        {/* Republish Confirmation Modal */}
        {showRepublishConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowRepublishConfirm(null)}>
            <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 max-w-sm mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-[16px] font-bold text-slate-900 dark:text-white">Републикация</h3>
                <span className="text-[10px] bg-[#533afd]/10 text-[#533afd] px-2 py-0.5 rounded-full font-semibold cursor-help" title="Републикация: удаление текущего объявления и повторная публикация с теми же данными">?</span>
              </div>
              <p className="text-[13px] text-slate-500 mt-1">Объект будет удалён с платформы и опубликован заново с теми же данными.</p>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setShowRepublishConfirm(null)} className="flex-1 py-2.5 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-gray-300 rounded-xl text-[13px] font-semibold">Отмена</button>
                <button onClick={async () => {
                  const listingId = showRepublishConfirm;
                  setShowRepublishConfirm(null);
                  const item = history.find(h => h.id === listingId);
                  if (!item) return;
                   const platforms = selectedPlatformsForAction.length > 0 ? selectedPlatformsForAction : item.platforms;
                   try {
                     const { data: { session } } = await supabase.auth.getSession();
                     if (!session?.access_token) throw new Error('Сессия пользователя истекла');
                     const response = await fetch('/api/listings/republish', {
                       method: 'POST',
                       headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                        body: JSON.stringify({ listing_id: listingId, platforms, listing_data: { user_id: item.userId, title: item.title, description: item.desc, cover_image: item.image, images: item.images || (item.image ? [item.image] : []), photo_urls: item.images || (item.image ? [item.image] : []), listing_urls: item.listingUrls || {} } }),
                     });
                     const result = await response.json();
                     if (!response.ok || !result.success) throw new Error(result.error || 'Не удалось републиковать объявление');
                     setHistory(prev => prev.map(h => h.id === listingId ? { ...h, status: 'publishing' } : h));
                  } catch(e: any) { console.error(e); alert(`Ошибка републикации: ${e.message || e}`); }
                  setSelectedPlatformsForAction([]);
                }} className="flex-1 py-2.5 bg-[#533afd] text-white rounded-xl text-[13px] font-semibold">Републикация</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ type, text }: { type: 'success' | 'neutral' | 'error' | 'publishing', text: string }) {
  const colors = {
    success: 'bg-[#15be53]/10 text-[#15be53] dark:bg-emerald-500/10 dark:text-emerald-400',
    publishing: 'bg-[#533afd]/10 text-[#533afd] dark:bg-[#533afd]/20 dark:text-blue-400 animate-pulse',
    neutral: 'bg-gray-100 text-slate-600 dark:bg-gray-500/10 dark:text-gray-400',
    error: 'bg-[#ff4264]/10 text-[#ff4264] dark:bg-red-500/10 dark:text-red-400',
  };
  
  return (
    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full flex items-center justify-center ${colors[type]}`}>
      {text}
    </span>
  );
}

function BottomBar({ activeTab, onTabChange }: { activeTab: TabType, onTabChange: (t: TabType) => void }) {
  return (
    <div className="mini-bottom-bar w-full h-[80px] shrink-0 bg-white/90 dark:bg-[#0F0F0F]/90 backdrop-blur-xl border-t border-slate-200/80 dark:border-white/5 px-4 flex justify-between items-center z-50 pb-safe transition-colors duration-500">
      <NavItem
        icon={<FilePlus2 size={22} strokeWidth={activeTab === 'create' ? 2.5 : 2} />}
        label="Новое"
        isActive={activeTab === 'create'}
        onClick={() => onTabChange('create')}
      />
      <NavItem
        icon={<Presentation size={22} strokeWidth={activeTab === 'presentations' ? 2.5 : 2} />}
        label="Презентации"
        isActive={activeTab === 'presentations'}
        onClick={() => onTabChange('presentations')}
      />
      <NavItem
        icon={<ClipboardList size={22} strokeWidth={activeTab === 'planner' ? 2.5 : 2} />}
        label="Планер"
        isActive={activeTab === 'planner'}
        onClick={() => onTabChange('planner')}
      />
      <NavItem
        icon={<History size={22} strokeWidth={activeTab === 'history' ? 2.5 : 2} />}
        label="Объекты"
        isActive={activeTab === 'history'}
        onClick={() => onTabChange('history')}
      />
    </div>
  );
}

function NavItem({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 transition-colors ${
        isActive 
        ? "text-[#533afd] dark:text-blue-500" 
        : "text-slate-500 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-400"
      }`}
    >
      <div className={`transition-transform duration-300 ${isActive ? "scale-110" : "scale-100"}`}>
        {icon}
      </div>
      <span className={`text-[10px] ${isActive ? "font-bold text-slate-900 dark:text-white/90" : "font-semibold"} transition-colors`}>{label}</span>
    </button>
  );
}
