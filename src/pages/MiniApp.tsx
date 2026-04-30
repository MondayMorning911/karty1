import React, { useState, MouseEvent, ChangeEvent, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { TabType } from "../types";
import { Link } from "react-router-dom";
import { Camera, Star, X, Sparkles, FilePlus2, Layers, History, RefreshCcw, CheckCircle2, MoreVertical, Moon, Sun, ArrowRight, MapPin } from "lucide-react";
import { KorterIcon, SSIcon, RealtingIcon, MyHomeIcon } from '../components/PlatformIcons';
import { KorterAuth } from '../components/KorterAuth';
import Map, { Marker } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { auth, db } from '../firebase';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, setDoc } from 'firebase/firestore';

// Same shadow constants as LandingPage
const STRIPE_SHADOW = "shadow-[0_13px_27px_-5px_rgba(50,50,93,0.05),0_8px_16px_-8px_rgba(0,0,0,0.03)] dark:shadow-none";
const ELEVATE_SHADOW = "shadow-[0_30px_60px_-12px_rgba(50,50,93,0.15),0_18px_36px_-18px_rgba(0,0,0,0.1)] dark:shadow-none";

const DUMMY_STYLES = [
  { id: 'selling', label: 'Продающий' },
  { id: 'pro', label: 'Строгий' },
  { id: 'short', label: 'Кратко' },
  { id: 'original', label: 'Не менять' },
] as const;

type StyleOption = typeof DUMMY_STYLES[number]['id'];

export interface HistoryItem {
  id: string;
  title: string;
  desc: string;
  date: string;
  platforms: string[];
  status: 'published' | 'draft' | 'error';
  image?: string;
  userId?: string;
}

interface PageProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export function MiniApp({ theme, toggleTheme }: PageProps) {
  const [activeTab, setActiveTab] = useState<TabType>("create");
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      if (user) {
        setUid(user.uid);
      } else {
        signInAnonymously(auth).catch(console.error);
      }
    });
    return () => unsub();
  }, []);

  return (
    <div className="flex justify-center w-full min-h-[100dvh] bg-[#f7f9fc] dark:bg-[#050505] font-sans text-[#061b31] dark:text-gray-200 selection:bg-[#533afd]/20 selection:text-[#533afd] transition-colors duration-500 overflow-hidden">
      <div className={`w-full sm:max-w-[375px] h-[100dvh] sm:h-[750px] sm:my-auto bg-[#ffffff] dark:bg-[#0F0F0F] relative flex flex-col sm:rounded-[32px] sm:border border-[#e5edf5] dark:border-[#1A1A1A] ${ELEVATE_SHADOW} overflow-hidden transition-colors duration-500`}>
        
        {/* Header theme toggle inside the phone app, right corner */}
        <div className="absolute top-4 right-4 z-50">
          <button onClick={toggleTheme} className="p-2 bg-[#f6f9fc] dark:bg-white/[0.03] border border-[#e5edf5] dark:border-white/10 rounded-full text-[#64748d] dark:text-gray-400 hover:text-[#533afd] dark:hover:text-white transition-colors" title="Сменить тему">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>

        <main className="flex-1 overflow-hidden relative bg-[#ffffff] dark:bg-[#0F0F0F] transition-colors duration-500">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, scale: 0.98, y: 5 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -5 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {activeTab === "create" && <CreateTab />}
              {activeTab === "platforms" && <PlatformsTab />}
              {activeTab === "history" && <HistoryTab />}
            </motion.div>
          </AnimatePresence>
        </main>
        
        <BottomBar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  );
}

function CreateTab() {
  const [desc, setDesc] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<StyleOption>('selling');
  
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [parsedData, setParsedData] = useState<any>(null);
  const [showAddressConfirmation, setShowAddressConfirmation] = useState(false);
  const [showFullscreenMap, setShowFullscreenMap] = useState(false);
  
  // Real coordinates from geocoding or drag
  const [addressCoords, setAddressCoords] = useState<{lat: number, lng: number} | null>(null);

  // Debounced API call for AI parsing
  useEffect(() => {
    if (!desc || desc.length < 10) return;
    
    const handler = setTimeout(async () => {
      setIsAiLoading(true);
      try {
        const res = await fetch('/api/parse-listing', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ text: desc, styleId: selectedStyle })
        });
        const data = await res.json();
        setParsedData(data);
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
  }, [desc, selectedStyle]);

  // Derived parsed fields for UI
  const parsedAddress = parsedData?.address;
  const parsedArea = parsedData?.area;
  const parsedPrice = parsedData?.price;
  const parsedRooms = parsedData?.rooms;
  const parsedFloor = parsedData?.floor;
  
  const handleMapConfirmation = (confirm: boolean) => {
    setShowAddressConfirmation(false);
    if (!confirm) {
      setShowFullscreenMap(true);
    }
  };

  const [isPublishing, setIsPublishing] = useState(false);

  const handlePublish = async () => {
    if (!desc.trim()) return;
    if (!auth.currentUser) {
      alert("Авторизуйтесь для публикации");
      return;
    }
    setIsPublishing(true);
    try {
      // Collect valid active platforms
      const activePlatforms = ['Korter', 'SS.ge']; // Mocks for now

      // Real title calculation
      const displayTitle = [parsedRooms ? `${parsedRooms}-к. квартира` : 'Объект', parsedArea].filter(Boolean).join(', ');

      const listingData = {
        userId: auth.currentUser.uid,
        title: displayTitle === 'Объект' && parsedAddress ? parsedAddress : displayTitle,
        desc: parsedData?.enhanced_text || desc,
        date: new Date().toISOString(),
        status: 'published',
        platforms: activePlatforms,
        image: ''
      };

      await addDoc(collection(db, 'listings'), listingData);
      
      setDesc("");
      setParsedData(null);
      setAddressCoords(null);
      // Reset is handled, could navigate to history:
      // (Depends on parent state, let's just show alert or success for now since we don't have direct access to setActiveTab)
      alert("Успешно опубликовано!");
    } catch (e) {
      console.error(e);
      alert("Ошибка при публикации");
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#fcfdfd] dark:bg-[#0A0A0A] transition-colors duration-500 relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[40%] bg-[#533afd]/5 dark:bg-[#533afd]/15 blur-[80px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[40%] bg-[#533afd]/5 dark:bg-[#533afd]/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="flex flex-col justify-start px-4 pt-4 pb-2 bg-[#ffffff]/90 dark:bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-[#e5edf5] dark:border-white/5 z-10 transition-colors">
        <div className="flex items-center gap-1.5 opacity-80 mb-2">
          <svg width="18" height="18" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="25" y="20" width="16" height="60" rx="4" className="fill-[#0a2540] dark:fill-white" />
            <path d="M38 52 L 70 20 C 72 18, 76 18, 78 20 L 78 28 C 78 30, 77 32, 75 33 L 38 70 Z" fill="#533afd" />
            <path fillRule="evenodd" clipRule="evenodd" d="M48 64 L 62 50 H 76 C 79.3137 50 82 52.6863 82 56 V 76 C 82 79.3137 79.3137 82 76 82 H 54 C 50.6863 82 48 79.3137 48 76 V 64 Z M 58 58 C 58 56.8954 58.8954 56 60 56 H 64 C 65.1046 56 66 56.8954 66 58 V 62 C 66 63.1046 65.1046 64 64 64 H 60 C 58.8954 64 58 63.1046 58 62 V 58 Z M 60 68 C 58.8954 68 58 68.8954 58 70 V 74 C 58 75.1046 58.8954 76 60 76 H 64 C 65.1046 76 66 75.1046 66 74 V 70 C 66 68.8954 65.1046 68 64 68 H 60 Z" fill="#533afd" />
          </svg>
          <span className="text-[15px] font-bold text-[#0a2540] dark:text-white tracking-tight">Karty</span>
        </div>
        <h1 className="text-[26px] font-bold tracking-tight text-[#061b31] dark:text-white/90 leading-tight pr-12">Новое объявление</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* Text Area block */}
        <div className="space-y-3">
          <div className={`relative flex flex-col bg-[#ffffff] dark:bg-white/[0.02] border border-[#e5edf5] dark:border-white/10 rounded-2xl p-4 transition-all focus-within:border-[#533afd] focus-within:ring-4 focus-within:ring-[#533afd]/10 ${STRIPE_SHADOW}`}>
            <textarea 
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder={"Например: 2к квартира у метро в Батуми, 55 метров, 120 000 $..."}
              className="w-full h-32 bg-transparent text-[15px] sm:text-[16px] text-[#061b31] dark:text-gray-200 placeholder:text-[#64748d] dark:placeholder:text-gray-600 focus:outline-none resize-none border-none leading-relaxed" 
            />
            
            <div className="mt-2 pt-3 border-t border-[#e5edf5] dark:border-white/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[11px] uppercase tracking-wider text-[#64748d] dark:text-gray-500 font-bold flex items-center gap-1">
                  <Sparkles size={10} className="text-[#533afd] dark:text-blue-400" /> 
                  Распознано AI {isAiLoading && <span className="animate-pulse">...</span>}
                </span>
                <span className="text-[11px] text-[#a0aabf] dark:text-gray-600 font-medium">{desc.length}/2000</span>
              </div>

              {showAddressConfirmation && parsedAddress && (
                <div className="mb-3 bg-[#e8f7ec] dark:bg-[#15be53]/10 border border-[#15be53]/20 dark:border-[#15be53]/30 rounded-xl p-3 shadow-sm">
                  <div className="flex items-start gap-2 mb-2">
                    <MapPin size={16} className="text-[#15be53] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[13px] text-[#061b31] dark:text-white font-medium leading-tight">
                        Я нашел адрес: {parsedAddress}. <br/>Верно?
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleMapConfirmation(true)} className="flex-1 py-1.5 bg-[#15be53] hover:bg-[#12a849] text-white text-[12px] font-bold rounded-lg transition-colors">
                      Да, подтверждаю
                    </button>
                    <button onClick={() => handleMapConfirmation(false)} className="flex-1 py-1.5 bg-[#ffffff] dark:bg-white/10 hover:bg-gray-50 dark:hover:bg-white/20 border border-[#e5edf5] dark:border-white/10 text-[12px] font-bold text-[#061b31] dark:text-white rounded-lg transition-colors">
                      Уточнить на карте
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 min-h-[26px]">
                {(!parsedAddress && !parsedArea && !parsedPrice && !parsedRooms) && <span className="text-[11px] text-[#a0aabf] dark:text-gray-600 font-medium my-auto">Начните вводить текст...</span>}
                {parsedAddress && (
                  <div className="flex items-center gap-1.5 bg-[#f6f9fc] dark:bg-white/[0.03] border border-[#e5edf5] dark:border-white/10 px-2.5 py-1 rounded-md text-[11px] transition-all">
                    <span className="text-[#a0aabf]">📍 Адрес:</span> <span className="font-semibold text-[#061b31] dark:text-white">{parsedAddress}</span>
                  </div>
                )}
                {parsedArea && (
                  <div className="flex items-center gap-1.5 bg-[#f6f9fc] dark:bg-white/[0.03] border border-[#e5edf5] dark:border-white/10 px-2.5 py-1 rounded-md text-[11px] transition-all">
                    <span className="text-[#a0aabf]">📏 Площадь:</span> <span className="font-semibold text-[#061b31] dark:text-white">{parsedArea}</span>
                  </div>
                )}
                {parsedPrice && (
                  <div className="flex items-center gap-1.5 bg-[#f6f9fc] dark:bg-white/[0.03] border border-[#e5edf5] dark:border-white/10 px-2.5 py-1 rounded-md text-[11px] transition-all">
                    <span className="text-[#a0aabf]">💰 Цена:</span> <span className="font-semibold text-[#061b31] dark:text-white">{parsedPrice}</span>
                  </div>
                )}
                {parsedRooms && (
                  <div className="flex items-center gap-1.5 bg-[#f6f9fc] dark:bg-white/[0.03] border border-[#e5edf5] dark:border-white/10 px-2.5 py-1 rounded-md text-[11px] transition-all">
                    <span className="text-[#a0aabf]">🛏 Комнат:</span> <span className="font-semibold text-[#061b31] dark:text-white">{parsedRooms}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pb-2 pt-1 px-1">
            {DUMMY_STYLES.map((style) => (
              <button
                key={style.id}
                onClick={() => setSelectedStyle(style.id)}
                className={`w-full justify-center px-3 py-2 rounded-lg text-[13px] sm:text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  selectedStyle === style.id && style.id !== 'original'
                    ? 'bg-[#533afd] text-white shadow-md shadow-[#533afd]/20' 
                    : selectedStyle === style.id && style.id === 'original'
                    ? 'bg-[#061b31] dark:bg-white text-white dark:text-black' 
                    : 'bg-[#ffffff] dark:bg-white/[0.03] text-[#64748d] dark:text-gray-400 border border-[#e5edf5] dark:border-white/10 hover:border-[#533afd]/30 dark:hover:border-white/20 hover:bg-[#533afd]/5 dark:hover:bg-white/[0.08]'
                }`}
              >
                {style.id !== 'original' && <Sparkles size={12} className={selectedStyle === style.id ? 'text-white' : 'text-[#533afd] dark:text-blue-400'} />}
                {style.label}
              </button>
            ))}
          </div>
        </div>

        {/* Photos */}
        <div className="space-y-3">
          <h3 className="text-[12px] uppercase tracking-wider text-[#64748d] dark:text-gray-500 font-bold">Фотографии</h3>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
            <button className="shrink-0 w-28 h-28 rounded-[16px] bg-[#ffffff] dark:bg-white/[0.02] border border-[#e5edf5] dark:border-white/10 flex flex-col items-center justify-center gap-2 text-[#64748d] dark:text-gray-400 hover:text-[#533afd] dark:hover:text-white hover:bg-[#f6f9fc] dark:hover:bg-white/[0.05] hover:border-[#533afd]/40 dark:hover:border-white/20 transition-all active:scale-95 shadow-sm dark:shadow-none">
              <Camera size={24} />
              <span className="text-[12px] font-medium">Добавить</span>
            </button>
            
            {/* Example photo */}
            <div className={`relative shrink-0 w-28 h-28 rounded-[16px] border border-[#533afd] overflow-hidden ${STRIPE_SHADOW}`}>
              <img src="https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400&q=80" alt="Room" className="w-full h-full object-cover" />
              <div className="absolute top-2 left-2 bg-[#533afd] text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm flex items-center gap-1 backdrop-blur-md">
                <Star size={8} className="fill-white" /> Обложка
              </div>
              <button className="absolute top-2 right-2 p-1.5 bg-[#ffffff] dark:bg-black/50 rounded-full text-[#64748d] dark:text-white/70 hover:text-[#e71d36] dark:hover:text-red-400 shadow-sm transition-colors backdrop-blur-md">
                <X size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Platforms */}
        <div className="space-y-3 pb-24">
          <h3 className="text-[12px] uppercase tracking-wider text-[#64748d] dark:text-gray-500 font-bold">Площадки для публикации</h3>
          <div className="space-y-2">
            <PlatformCheckbox name="Korter" active={true} logoBg="bg-gray-100 dark:bg-white/5" logoColor="text-[#061b31] dark:text-white" logo={<KorterIcon className="w-4 h-4" />} />
            <PlatformCheckbox name="SS.ge" active={true} logoBg="bg-gray-100 dark:bg-white/5" logoColor="text-[#061b31] dark:text-white" logo={<SSIcon className="w-4 h-4" />} />
            <PlatformCheckbox name="Realting" active={false} logoBg="bg-gray-100 dark:bg-white/5" logoColor="text-[#061b31] dark:text-white" logo={<RealtingIcon className="w-4 h-4" />} />
            <PlatformCheckbox name="MyHome" active={false} logoBg="bg-gray-100 dark:bg-white/5" logoColor="text-[#061b31] dark:text-white" logo={<MyHomeIcon className="w-4 h-4" />} />
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
            <div className="flex justify-between items-center p-4 border-b border-[#e5edf5] dark:border-[#1A1A1A] bg-white/50 dark:bg-black/50 backdrop-blur-md absolute top-0 w-full z-10">
              <h3 className="font-bold text-[16px] text-[#061b31] dark:text-white">Укажите точку</h3>
              <button onClick={() => setShowFullscreenMap(false)} className="p-2 bg-gray-100 dark:bg-white/10 rounded-full">
                <X size={18} />
              </button>
            </div>
            
            <div className="flex-1 w-full bg-gray-100 dark:bg-[#050505] relative">
              <Map
                mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
                initialViewState={{
                  longitude: addressCoords?.lng || 41.6168,
                  latitude: addressCoords?.lat || 41.6366,
                  zoom: 14
                }}
                mapStyle="mapbox://styles/mapbox/streets-v12"
              >
                <Marker 
                  longitude={addressCoords?.lng || 41.6168} 
                  latitude={addressCoords?.lat || 41.6366} 
                  anchor="bottom"
                  draggable
                  onDragEnd={(e) => setAddressCoords({ lng: e.lngLat.lng, lat: e.lngLat.lat })}
                >
                  <MapPin size={32} className="text-[#533afd] fill-white" />
                </Marker>
              </Map>
            </div>
            
            <div className="p-4 border-t border-[#e5edf5] dark:border-[#1A1A1A]">
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
      <div className="sticky bottom-0 w-full p-4 bg-gradient-to-t from-[#f6f9fc] dark:from-[#050505] via-[#f6f9fc]/90 dark:via-[#050505]/90 to-transparent pb-8 z-40">
        <button 
          onClick={handlePublish}
          disabled={isPublishing || !desc.trim()}
          className={`w-full bg-[#15be53] hover:bg-[#12a849] disabled:opacity-50 text-white rounded-[14px] py-4 font-semibold text-[15px] transition-transform active:scale-[0.98] ${STRIPE_SHADOW} flex items-center justify-center gap-2`}>
          {isPublishing ? "Публикация..." : "Опубликовать"} <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

function PlatformsTab() {
  const [authPlatform, setAuthPlatform] = React.useState<string | null>(null);

  if (authPlatform === 'Korter') {
    return <KorterAuth onBack={() => setAuthPlatform(null)} userId="user_123" />;
  }

  return (
    <div className="flex flex-col h-full bg-[#fcfdfd] dark:bg-[#0A0A0A] transition-colors duration-500 relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[40%] bg-[#533afd]/5 dark:bg-[#533afd]/15 blur-[80px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[40%] bg-[#533afd]/5 dark:bg-[#533afd]/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="flex flex-col px-4 pt-4 pb-2 bg-[#ffffff]/90 dark:bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-[#e5edf5] dark:border-white/5 z-10 transition-colors">
        <h1 className="text-[26px] font-bold tracking-tight text-[#061b31] dark:text-white/90 leading-tight">Авторизация</h1>
        <p className="text-[#64748d] dark:text-gray-400 text-sm mt-1">Управление сессиями площадок</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-8">
        <PlatformAuthCard onClick={() => setAuthPlatform('Korter')} name="Korter" isConnected={false} total={245} activeViews={1240} logoBg="bg-gray-100 dark:bg-white/5" logoColor="text-[#061b31] dark:text-white" logo={<KorterIcon className="w-4 h-4" />} />
        <PlatformAuthCard name="SS.ge" isConnected={true} total={42} activeViews={380} logoBg="bg-gray-100 dark:bg-white/5" logoColor="text-[#061b31] dark:text-white" logo={<SSIcon className="w-4 h-4" />} />
        <PlatformAuthCard name="Realting" isConnected={false} total={0} activeViews={0} logoBg="bg-gray-100 dark:bg-white/5" logoColor="text-[#061b31] dark:text-white" logo={<RealtingIcon className="w-4 h-4" />} />
        <PlatformAuthCard name="MyHome" isConnected={false} total={0} activeViews={0} logoBg="bg-gray-100 dark:bg-white/5" logoColor="text-[#061b31] dark:text-white" logo={<MyHomeIcon className="w-4 h-4" />} />
      </div>
    </div>
  );
}

function PlatformCheckbox({ name, active, logoBg, logoColor, logo }: any) {
  return (
    <div className="flex items-center justify-between p-3 rounded-[14px] bg-[#ffffff] dark:bg-white/[0.02] border border-[#e5edf5] dark:border-white/5 hover:border-[#c1d1e0] dark:hover:border-white/10 shadow-sm dark:shadow-none cursor-pointer transition-colors">
      <div className="flex items-center gap-3">
        <div className={`relative w-8 h-8 rounded-full ${logoBg} flex items-center justify-center ${logoColor} font-bold text-sm border border-[#e5edf5] dark:border-white/5`}>
          {logo}
        </div>
        <p className="text-[14px] font-semibold text-[#061b31] dark:text-white/90">{name}</p>
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

function PlatformAuthCard({ name, isConnected, total, activeViews, logoBg, logoColor, logo, onClick }: any) {
  return (
    <div onClick={onClick} className="flex flex-col p-4 rounded-[16px] bg-[#ffffff] dark:bg-white/[0.02] border border-[#e5edf5] dark:border-white/5 cursor-pointer hover:border-[#c1d1e0] dark:hover:border-white/10 shadow-sm dark:shadow-none transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full ${logoBg} flex items-center justify-center ${logoColor} font-bold text-lg border border-[#e5edf5] dark:border-white/5`}>
            {logo}
          </div>
          <div>
            <p className="text-[15px] font-semibold text-[#061b31] dark:text-white/90 leading-tight">{name}</p>
            <p className={`text-[11px] font-bold mt-0.5 ${isConnected ? 'text-[#15be53]' : 'text-[#ff4264] dark:text-red-400'}`}>
              {isConnected ? '• Сессия активна' : '• Требуется вход'}
            </p>
          </div>
        </div>
      </div>
      
      {isConnected ? (
        <div className="grid grid-cols-2 gap-2 mt-2 pt-3 border-t border-[#e5edf5] dark:border-white/5">
          <div className="flex flex-col">
            <span className="text-[11px] text-[#64748d] dark:text-gray-500 uppercase font-bold tracking-wider">Всего объектов</span>
            <span className="text-[16px] font-semibold text-[#061b31] dark:text-white mt-0.5">{total}</span>
          </div>
          <div className="flex flex-col">
             <span className="text-[11px] text-[#64748d] dark:text-gray-500 uppercase font-bold tracking-wider">Просмотров за 30 дн.</span>
             <span className="text-[16px] font-semibold text-[#061b31] dark:text-white mt-0.5">{activeViews}</span>
          </div>
        </div>
      ) : (
        <div className="mt-2 pt-3 border-t border-[#e5edf5] dark:border-white/5 flex gap-2">
          <input 
            type="text" 
            placeholder="Логин" 
            className="flex-1 bg-[#f6f9fc] dark:bg-white/[0.02] border border-[#e5edf5] dark:border-white/10 rounded-lg px-3 py-2 text-sm text-[#061b31] dark:text-white focus:outline-none focus:border-[#533afd]"
          />
          <button className="bg-[#533afd] text-white px-4 py-2 rounded-lg text-sm font-semibold active:scale-95 transition-transform">Войти</button>
        </div>
      )}
    </div>
  );
}

function HistoryTab() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(collection(db, 'listings'), where('userId', '==', auth.currentUser.uid));
    const unsub = onSnapshot(q, (snap) => {
      const items: HistoryItem[] = [];
      snap.forEach(doc => {
        items.push({ id: doc.id, ...doc.data() } as HistoryItem);
      });
      // Simple date sort descending
      items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setHistory(items);
      setLoading(false);
    }, (error) => {
      console.error(error);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#fcfdfd] dark:bg-[#0A0A0A] transition-colors duration-500 relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[40%] bg-[#533afd]/5 dark:bg-[#533afd]/15 blur-[80px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[40%] bg-[#533afd]/5 dark:bg-[#533afd]/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="flex flex-col px-4 pt-4 pb-4 bg-[#ffffff]/90 dark:bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-[#e5edf5] dark:border-white/5 z-10 transition-colors">
        <h1 className="text-[26px] font-bold tracking-tight text-[#061b31] dark:text-white/90 leading-tight">Мои объекты</h1>
        
        {/* Search / Filter bar mock */}
        <div className="mt-4 flex gap-2">
          <div className="flex-1 bg-[#f6f9fc] dark:bg-white/[0.03] border border-[#e5edf5] dark:border-white/10 rounded-[12px] px-3 py-2 text-sm text-[#64748d] dark:text-gray-400 flex items-center">
            Поиск по адресу...
          </div>
          <button className="w-10 h-10 bg-[#f6f9fc] dark:bg-white/[0.03] border border-[#e5edf5] dark:border-white/10 rounded-[12px] flex items-center justify-center text-[#64748d] dark:text-gray-400">
            <RefreshCcw size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-8 text-[#061b31] dark:text-gray-200">
        {loading && <p className="text-center text-sm text-gray-500 mt-4">Загрузка...</p>}
        {!loading && history.length === 0 && <p className="text-center text-sm text-gray-500 mt-4">У вас пока нет объектов.</p>}
        {history.map((item) => (
          <div key={item.id} className="bg-[#ffffff] dark:bg-white/[0.02] border border-[#e5edf5] dark:border-white/5 rounded-[16px] p-3 shadow-sm dark:shadow-none transition-colors">
            <div className="flex gap-3">
              <div className="w-[72px] h-[72px] rounded-[10px] bg-[#f6f9fc] dark:bg-white/[0.05] border border-[#e5edf5] dark:border-white/5 shrink-0 overflow-hidden flex items-center justify-center text-gray-300 dark:text-gray-600 transition-colors">
                {item.image ? (
                  <img src={item.image} className="w-full h-full object-cover" />
                ) : (
                  <Camera size={20} />
                )}
              </div>
              <div className="flex-1 min-w-0 py-1">
                <div className="flex justify-between items-start">
                  <h3 className="font-semibold text-[14px] text-[#061b31] dark:text-white/90 truncate pr-2">{item.title}</h3>
                  <button className="text-[#a0aabf] dark:text-gray-500 hover:text-[#061b31] dark:hover:text-white shrink-0">
                    <MoreVertical size={16} />
                  </button>
                </div>
                <p className="text-[12px] text-[#64748d] dark:text-gray-400 mt-1 line-clamp-2 leading-snug">{item.desc}</p>
                <p className="text-[11px] text-[#a0aabf] dark:text-gray-500 mt-1.5">
                  {new Date(item.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
                
                <div className="flex items-center gap-1.5 mt-2">
                  {item.status === 'published' && <StatusBadge type="success" text="Опубликовано" />}
                  {item.status === 'draft' && <StatusBadge type="neutral" text="Черновик" />}
                  {item.status === 'error' && <StatusBadge type="error" text="Ошибка платформ" />}
                </div>
              </div>
            </div>
            
            {/* Platforms row */}
            <div className="mt-3 pt-3 border-t border-[#e5edf5] dark:border-white/5 flex gap-2">
               {item.platforms.map(p => (
                 <div key={p} className="text-[10px] uppercase font-bold px-2 py-1 bg-[#f6f9fc] dark:bg-white/5 text-[#64748d] dark:text-gray-400 rounded-md border border-[#e5edf5] dark:border-white/5">
                   {p}
                 </div>
               ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ type, text }: { type: 'success' | 'neutral' | 'error', text: string }) {
  const colors = {
    success: 'bg-[#15be53]/10 text-[#15be53] dark:bg-emerald-500/10 dark:text-emerald-400',
    neutral: 'bg-gray-100 text-[#64748d] dark:bg-gray-500/10 dark:text-gray-400',
    error: 'bg-[#ff4264]/10 text-[#ff4264] dark:bg-red-500/10 dark:text-red-400',
  };
  
  return (
    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${colors[type]}`}>
      {text}
    </span>
  );
}

function BottomBar({ activeTab, onTabChange }: { activeTab: TabType, onTabChange: (t: TabType) => void }) {
  return (
    <div className="w-full h-[80px] shrink-0 bg-[#ffffff]/90 dark:bg-[#0F0F0F]/90 backdrop-blur-xl border-t border-[#e5edf5] dark:border-white/5 px-8 flex justify-between items-center z-50 pb-safe transition-colors duration-500">
      <NavItem 
        icon={<FilePlus2 size={24} strokeWidth={activeTab === 'create' ? 2.5 : 2} />} 
        label="Новое" 
        isActive={activeTab === 'create'} 
        onClick={() => onTabChange('create')} 
      />
      <NavItem 
        icon={<Layers size={24} strokeWidth={activeTab === 'platforms' ? 2.5 : 2} />} 
        label="Площадки" 
        isActive={activeTab === 'platforms'} 
        onClick={() => onTabChange('platforms')} 
      />
      <NavItem 
        icon={<History size={24} strokeWidth={activeTab === 'history' ? 2.5 : 2} />} 
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
        : "text-[#a0aabf] dark:text-gray-500 hover:text-[#64748d] dark:hover:text-gray-400"
      }`}
    >
      <div className={`transition-transform duration-300 ${isActive ? "scale-110" : "scale-100"}`}>
        {icon}
      </div>
      <span className={`text-[10px] ${isActive ? "font-bold text-[#061b31] dark:text-white/90" : "font-semibold"} transition-colors`}>{label}</span>
    </button>
  );
}
