import React from 'react';
import { DesignSettings, RealtorProfile } from '../types';
import { PRESET_COLORS, FONTS } from '../data';
import { Check, LayoutTemplate, Square, Save, User, Camera } from 'lucide-react';

interface Props {
  design: DesignSettings;
  setDesign: (design: DesignSettings) => void;
  profile: RealtorProfile;
  setProfile: (profile: RealtorProfile) => void;
}

export function StepDesign({ design, setDesign, profile, setProfile }: Props) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfile({ ...profile, photoUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveTemplate = () => {
    alert("Шаблон успешно сохранен! Теперь он будет использоваться по умолчанию.");
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-800 mb-1">Дизайн и Бренд</h2>
          <p className="text-xs text-slate-500">Настройте внешний вид презентации и контактные данные.</p>
        </div>
        <button 
          onClick={handleSaveTemplate}
          className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors shadow-sm"
        >
          <Save className="w-4 h-4" />
          <span className="hidden sm:inline">Сохранить шаблон</span>
        </button>
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-3 block">Личные данные</h3>
          <div className="flex gap-4 mb-4">
            <div 
              className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center text-slate-400 cursor-pointer overflow-hidden relative shrink-0 hover:bg-slate-50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {profile.photoUrl ? (
                <img src={profile.photoUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <>
                  <Camera className="w-5 h-5 mb-1" />
                  <span className="text-[9px] font-medium">Фото</span>
                </>
              )}
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handlePhotoUpload}
                accept="image/*"
                className="hidden" 
              />
            </div>
            
            <div className="flex-1 grid grid-cols-1 gap-3">
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Ваше имя"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium"
                />
              </div>
              <input
                type="text"
                placeholder="Название агентства (опционально)"
                value={profile.agency}
                onChange={(e) => setProfile({ ...profile, agency: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium"
              />
            </div>
          </div>
          
          <input
            type="tel"
            placeholder="Номер телефона"
            value={profile.phone}
            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium"
          />
        </div>

        <div>
          <h3 className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-3 block">Цветовая палитра (Пресеты или свои)</h3>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              {PRESET_COLORS.map((colorPreset, index) => (
                <button
                  key={index}
                  onClick={() => setDesign({ ...design, primaryColor: colorPreset.primary, secondaryColor: colorPreset.secondary })}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all overflow-hidden relative ${
                    design.primaryColor === colorPreset.primary && design.secondaryColor === colorPreset.secondary ? 'ring-2 ring-offset-2 ring-blue-600 scale-110' : 'hover:scale-105 shadow-sm border border-slate-200'
                  }`}
                  style={{ backgroundColor: colorPreset.primary }}
                >
                  <div className="absolute right-0 bottom-0 w-5 h-10" style={{ backgroundColor: colorPreset.secondary }}></div>
                  {design.primaryColor === colorPreset.primary && design.secondaryColor === colorPreset.secondary && (
                    <Check className="w-5 h-5 text-white z-10" />
                  )}
                </button>
              ))}
            </div>
            
            <div className="flex gap-3 items-center mt-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex-1 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full border border-slate-300 overflow-hidden relative cursor-pointer hover:border-slate-400 transition-colors bg-white shadow-sm flex-shrink-0">
                   <input 
                      type="color" 
                      value={design.primaryColor}
                      onChange={(e) => setDesign({ ...design, primaryColor: e.target.value })}
                      className="absolute inset-0 w-[200%] h-[200%] -top-1/2 -left-1/2 cursor-pointer opacity-0"
                   />
                   <div className="w-full h-full" style={{ backgroundColor: design.primaryColor }}></div>
                </div>
                <div className="text-xs text-slate-500 font-medium">Основной<br/>цвет</div>
              </div>
              
              <div className="w-[1px] h-8 bg-slate-200"></div>
              
              <div className="flex-1 flex items-center justify-end gap-3">
                <div className="text-xs text-slate-500 font-medium text-right">Фон<br/>блоков</div>
                <div className="w-10 h-10 rounded-full border border-slate-300 overflow-hidden relative cursor-pointer hover:border-slate-400 transition-colors bg-white shadow-sm flex-shrink-0">
                   <input 
                      type="color" 
                      value={design.secondaryColor}
                      onChange={(e) => setDesign({ ...design, secondaryColor: e.target.value })}
                      className="absolute inset-0 w-[200%] h-[200%] -top-1/2 -left-1/2 cursor-pointer opacity-0"
                   />
                   <div className="w-full h-full" style={{ backgroundColor: design.secondaryColor }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-3 block">Шрифты</h3>
          <div className="grid grid-cols-1 gap-2">
            {FONTS.map((font) => (
              <button
                key={font.name}
                onClick={() => setDesign({ ...design, fontFamily: font.class })}
                className={`flex items-center justify-between p-3 rounded-md border transition-all ${
                  design.fontFamily === font.class ? 'border-2 border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300 bg-white'
                }`}
              >
                <span className={`text-sm font-medium ${font.class}`}>{font.name}</span>
                {design.fontFamily === font.class && <Check className="w-4 h-4 text-blue-600" />}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-3 block">Стиль верстки</h3>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setDesign({ ...design, layout: 'classic' })}
              className={`p-3 rounded-md border flex flex-col items-center gap-2 transition-all ${
                design.layout === 'classic' ? 'border-2 border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 bg-white hover:border-slate-300'
              }`}
            >
              <Square className={`w-6 h-6 ${design.layout === 'classic' ? 'text-blue-600' : 'text-slate-400'}`} />
              <span className="text-xs font-semibold">Классика</span>
            </button>

            <button
              onClick={() => setDesign({ ...design, layout: 'modern' })}
              className={`p-3 rounded-md border flex flex-col items-center gap-2 transition-all ${
                design.layout === 'modern' ? 'border-2 border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 bg-white hover:border-slate-300'
              }`}
            >
              <LayoutTemplate className={`w-6 h-6 ${design.layout === 'modern' ? 'text-blue-600' : 'text-slate-400'}`} />
              <span className="text-xs font-semibold">Модерн</span>
            </button>
            
            <button
              onClick={() => setDesign({ ...design, layout: 'editorial' })}
              className={`p-3 rounded-md border flex flex-col items-center gap-2 transition-all ${
                design.layout === 'editorial' ? 'border-2 border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 bg-white hover:border-slate-300'
              }`}
            >
              <LayoutTemplate className={`w-6 h-6 rotate-90 ${design.layout === 'editorial' ? 'text-blue-600' : 'text-slate-400'}`} />
              <span className="text-xs font-semibold">Журнал</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
