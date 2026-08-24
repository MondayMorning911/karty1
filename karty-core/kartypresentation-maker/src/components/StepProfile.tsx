import React, { useRef } from 'react';
import { Camera, Building2, User, Phone } from 'lucide-react';
import { RealtorProfile } from '../types';

interface Props {
  profile: RealtorProfile;
  setProfile: (profile: RealtorProfile) => void;
}

export function StepProfile({ profile, setProfile }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProfile({ ...profile, [e.target.name]: e.target.value });
  };

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

  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="w-full h-28 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-400 gap-1 hover:bg-slate-50 cursor-pointer transition-colors relative overflow-hidden bg-slate-50/50"
        >
          {profile.photoUrl ? (
            <>
              <img src={profile.photoUrl} alt="Avatar" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                <span className="text-white text-xs font-medium">Изменить фото</span>
              </div>
            </>
          ) : (
            <>
              <Camera className="w-6 h-6 mb-1 text-slate-400" />
              <span className="text-xs font-medium text-slate-600">Загрузить лого или фото</span>
              <span className="text-[10px] text-slate-400">PNG, JPG до 5MB</span>
            </>
          )}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handlePhotoUpload} 
            accept="image/png, image/jpeg" 
            className="hidden" 
          />
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2 block">ФИО</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              name="name"
              value={profile.name}
              onChange={handleChange}
              placeholder="Александр Соколов"
              className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2 block">Название агентства</label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              name="agency"
              value={profile.agency}
              onChange={handleChange}
              placeholder="Prime Estate Realty"
              className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2 block">Номер телефона</label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="tel"
              name="phone"
              value={profile.phone}
              onChange={handleChange}
              placeholder="+7 (999) 000-00-00"
              className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
