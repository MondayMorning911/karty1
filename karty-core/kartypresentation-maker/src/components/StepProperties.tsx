import React, { useState, useRef } from 'react';
import { Check, Info, Plus, X, Image as ImageIcon } from 'lucide-react';
import { Property } from '../types';
import { MOCK_PROPERTIES } from '../data';

interface Props {
  selectedProperties: string[];
  setSelectedProperties: (ids: string[]) => void;
  customProperties: Property[];
  setCustomProperties: (props: Property[]) => void;
}

export function StepProperties({ selectedProperties, setSelectedProperties, customProperties, setCustomProperties }: Props) {
  const [isAdding, setIsAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [newProp, setNewProp] = useState<Partial<Property>>({
    title: '',
    price: '',
    address: '',
    description: '',
    specs: { beds: 1, baths: 1, sqft: 50 },
    images: []
  });

  const allProperties = [...customProperties, ...MOCK_PROPERTIES];

  const toggleProperty = (id: string) => {
    if (selectedProperties.includes(id)) {
      setSelectedProperties(selectedProperties.filter((pId) => pId !== id));
    } else {
      if (selectedProperties.length < 5) {
        setSelectedProperties([...selectedProperties, id]);
      }
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newImages: string[] = [...(newProp.images || [])];
      
      Array.from(files).forEach((file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          newImages.push(reader.result as string);
          setNewProp(prev => ({ ...prev, images: [...newImages] }));
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removePhoto = (index: number) => {
    const newImages = [...(newProp.images || [])];
    newImages.splice(index, 1);
    setNewProp({ ...newProp, images: newImages });
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSaveObject = async () => {
    if (!newProp.title || !newProp.price) return;
    setIsSaving(true);
    
    let mapUrl = undefined;
    if (newProp.address) {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(newProp.address)}&format=json&limit=1&accept-language=ru-RU`);
        const data = await res.json();
        if (data && data.length > 0) {
          const { lat, lon } = data[0];
          mapUrl = '/api/proxy?url=' + encodeURIComponent(`https://static-maps.yandex.ru/1.x/?ll=${lon},${lat}&size=400,300&z=16&l=map&pt=${lon},${lat},pm2rdm`);
        }
      } catch (e) {
        console.error('Failed to geocode address', e);
      }
    }

    const property: Property = {
      id: `custom_${Date.now()}`,
      title: newProp.title || '',
      price: newProp.price || '',
      address: newProp.address || '',
      description: newProp.description || '',
      specs: newProp.specs || { beds: 0, baths: 0, sqft: 0 },
      images: newProp.images?.length ? newProp.images : ['/api/proxy?url=' + encodeURIComponent('https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&q=80&w=1000')],
      mapUrl
    };
    
    setCustomProperties([property, ...customProperties]);
    setSelectedProperties([...selectedProperties, property.id]);
    setIsAdding(false);
    setIsSaving(false);
    setNewProp({
      title: '', price: '', address: '', description: '',
      specs: { beds: 1, baths: 1, sqft: 50 }, images: []
    });
  };

  if (isAdding) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-4">
           <h3 className="text-sm font-bold text-slate-800">Новый объект</h3>
           <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
        </div>

        <div>
          <label className="text-[10px] uppercase font-bold text-slate-500 mb-2 block">Фотографии ({newProp.images?.length || 0})</label>
          <div className="grid grid-cols-3 gap-2 mb-2">
            {newProp.images?.map((img, i) => (
              <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 shadow-sm group">
                <img src={img} alt="Preview" className="w-full h-full object-cover" />
                <button 
                  onClick={() => removePhoto(i)}
                  className="absolute top-1 right-1 bg-white/90 p-1 rounded-full text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-400 gap-1 hover:bg-slate-50 cursor-pointer bg-white transition-colors"
            >
               <Plus className="w-5 h-5" />
               <span className="text-[9px] font-medium text-center leading-tight">Добавить<br/>фото</span>
               <input type="file" ref={fileInputRef} onChange={handlePhotoUpload} accept="image/*" multiple className="hidden" />
            </div>
          </div>
        </div>

        <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Название (обязательно)</label>
            <input type="text" value={newProp.title} onChange={e => setNewProp({...newProp, title: e.target.value})} placeholder="Например: Вилла у моря" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Цена (обязательно)</label>
            <input type="text" value={newProp.price} onChange={e => setNewProp({...newProp, price: e.target.value})} placeholder="45 500 000 ₽" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Адрес</label>
            <input type="text" value={newProp.address} onChange={e => setNewProp({...newProp, address: e.target.value})} placeholder="г. Сочи, ул. Морская 1" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Спальни</label>
              <input type="number" value={newProp.specs?.beds} onChange={e => setNewProp({...newProp, specs: {...newProp.specs!, beds: parseInt(e.target.value) || 0}})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm outline-none" />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Ванные</label>
              <input type="number" value={newProp.specs?.baths} onChange={e => setNewProp({...newProp, specs: {...newProp.specs!, baths: parseInt(e.target.value) || 0}})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm outline-none" />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Площадь</label>
              <input type="number" value={newProp.specs?.sqft} onChange={e => setNewProp({...newProp, specs: {...newProp.specs!, sqft: parseInt(e.target.value) || 0}})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm outline-none" />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Описание</label>
            <textarea value={newProp.description} onChange={e => setNewProp({...newProp, description: e.target.value})} rows={3} placeholder="Краткое описание объекта..." className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none resize-none"></textarea>
          </div>
        </div>

        <button 
          onClick={handleSaveObject}
          disabled={!newProp.title || !newProp.price || isSaving}
          className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
        >
          {isSaving ? 'Сохранение...' : 'Сохранить объект'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">
          Выбрано: {selectedProperties.length} / 5
        </label>
      </div>

      {selectedProperties.length === 5 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-2.5 rounded-lg flex items-start gap-2 text-[11px] font-medium shadow-sm">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <p>Достигнут максимум 5 объектов.</p>
        </div>
      )}

      <div className="space-y-2">
        {allProperties.map((property) => {
          const isSelected = selectedProperties.includes(property.id);
          return (
            <div
              key={property.id}
              onClick={() => toggleProperty(property.id)}
              className={`relative flex items-center p-2.5 rounded-xl border-2 cursor-pointer transition-all ${
                isSelected ? 'border-blue-500 bg-blue-50/30 shadow-sm' : 'border-transparent bg-white shadow-sm hover:border-slate-200'
              }`}
            >
              <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-slate-200 shadow-sm border border-slate-100">
                <img src={property.images[0]} alt={property.title} className="w-full h-full object-cover" />
              </div>
              
              <div className="ml-3 flex-1 min-w-0">
                <h3 className="text-[13px] font-bold text-slate-800 truncate">{property.title}</h3>
                <p className="text-[11px] text-slate-500 truncate mt-0.5">{property.address}</p>
                <div className="text-xs font-bold text-blue-600 mt-1">{property.price}</div>
              </div>

              <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ml-3 transition-colors border ${
                isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'
              }`}>
                {isSelected && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
              </div>
            </div>
          );
        })}
      </div>
      
      <button 
        onClick={() => setIsAdding(true)}
        className="w-full py-3 mt-4 border-2 border-dashed border-blue-200 text-blue-600 rounded-xl text-sm font-bold bg-blue-50 hover:bg-blue-100 flex items-center justify-center gap-2 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Добавить свой объект
      </button>
    </div>
  );
}
