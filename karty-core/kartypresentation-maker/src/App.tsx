/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, Moon, Palette, User, LayoutList, Eye, Plus } from 'lucide-react';
import { RealtorProfile, Property, DesignSettings, Tab } from './types';
import { StepProperties } from './components/StepProperties';
import { StepDesign } from './components/StepDesign';
import { StepPreview } from './components/StepPreview';
import { PRESET_COLORS, FONTS } from './data';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('design');
  
  const [profile, setProfile] = useState<RealtorProfile>({
    name: 'Александр Соколов',
    agency: 'Prime Estate Realty',
    phone: '+7 (999) 000-00-00',
    photoUrl: '',
  });

  const [customProperties, setCustomProperties] = useState<Property[]>([]);
  const [selectedProperties, setSelectedProperties] = useState<string[]>(['1', '2']);
  
  const [design, setDesign] = useState<DesignSettings>({
    primaryColor: '#0F172A', // Slate Dark default
    secondaryColor: '#E2E8F0',
    fontFamily: FONTS[0].class,
    layout: 'classic',
  });

  const TabButton = ({ id, icon, label }: { id: Tab; icon: React.ReactNode; label: string }) => {
    const isActive = activeTab === id;
    return (
      <button
        onClick={() => setActiveTab(id)}
        className={`flex items-center justify-center gap-1.5 flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
          isActive 
            ? 'bg-blue-600 text-white shadow-sm' 
            : 'text-slate-600 hover:bg-slate-200/50 bg-transparent'
        }`}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div className="h-screen bg-slate-100 flex items-center justify-center font-sans text-slate-900 sm:p-4 print:p-0 print:bg-white print:h-auto print:block">
      {/* Mobile Container Simulator */}
      <div className="w-full max-w-[500px] h-full sm:h-[900px] bg-[#f8f9fa] sm:rounded-3xl sm:border-[8px] border-slate-800 overflow-hidden flex flex-col relative sm:shadow-2xl print:max-w-none print:h-auto print:rounded-none print:border-none print:shadow-none print:overflow-visible print:block print:bg-white">
        
        {/* Telegram Top Bar */}
        <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100 shrink-0 z-20 print:hidden">
          <div className="flex items-center gap-3">
             <button className="text-slate-800 hover:bg-slate-50 p-1 rounded-full transition-colors">
                <ChevronLeft className="w-6 h-6" />
             </button>
             <h1 className="text-[17px] font-bold tracking-tight text-slate-900">Новая презентация</h1>
          </div>
          <div className="flex items-center gap-2">
             <button className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors">
                <Moon className="w-4 h-4" />
             </button>
             <button className="px-4 py-1.5 bg-blue-50 text-blue-600 rounded-full text-sm font-semibold hover:bg-blue-100 transition-colors">
                Закрыть
             </button>
          </div>
        </header>

        {/* Tabs */}
        <div className="px-4 py-3 bg-white shrink-0 z-10 border-b border-slate-100 shadow-sm print:hidden">
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto hide-scrollbar">
            <TabButton id="design" icon={<Palette className="w-4 h-4" />} label="Дизайн" />
            <TabButton id="objects" icon={<LayoutList className="w-4 h-4" />} label="Объекты" />
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto bg-slate-50 relative hide-scrollbar print:overflow-visible print:bg-white print:block">
          
          {/* Settings Section */}
          <div className="p-4 sm:p-6 bg-white border-b border-slate-200 shadow-sm mb-6 print:hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === 'design' && (
                  <StepDesign 
                    design={design} 
                    setDesign={setDesign} 
                    profile={profile} 
                    setProfile={setProfile} 
                  />
                )}
                {activeTab === 'objects' && (
                  <StepProperties 
                    selectedProperties={selectedProperties} 
                    setSelectedProperties={setSelectedProperties}
                    customProperties={customProperties}
                    setCustomProperties={setCustomProperties}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Live Preview Section */}
          <div className="px-4 pb-12 sm:px-6 print:px-0 print:pb-0">
            <div className="mb-4 print:hidden">
              <h2 className="text-lg font-bold text-slate-800">Превью документа</h2>
              <p className="text-xs text-slate-500">Автоматически обновляется при изменениях</p>
            </div>
            
            <div className="w-full max-w-[420px] mx-auto transition-all print:max-w-none print:w-full print:mx-0">
              <StepPreview 
                profile={profile}
                selectedProperties={selectedProperties}
                customProperties={customProperties}
                design={design}
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
