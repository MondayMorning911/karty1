import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, ChevronLeft, Copy, Eye, FileText, Palette, Plus, Search, Trash2, Upload, User, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { HistoryItem, Presentation, PresentationObject, PresentationTemplate, PresentationThemeId } from '../types';

const THEMES: Array<{ id: PresentationThemeId; name: string; description: string; colors: string[]; heading: string; body: string }> = [
  { id: 'light-minimal', name: 'Light Minimal', description: 'Чистый светлый минимализм', colors: ['#ffffff', '#09090b', '#f1f5f9'], heading: 'Playfair Display', body: 'Plus Jakarta Sans' },
  { id: 'midnight-gold', name: 'Midnight Gold', description: 'Тёмный премиум и золото', colors: ['#0a0a0d', '#d4af37', '#141419'], heading: 'Cinzel', body: 'Montserrat' },
  { id: 'riviera-sand', name: 'Riviera Sand', description: 'Эко-люкс курортного объекта', colors: ['#f7f5ee', '#c86d51', '#edeae0'], heading: 'Cormorant Garamond', body: 'Manrope' },
  { id: 'ocean-blue', name: 'Ocean Blue', description: 'Свежий морской стиль', colors: ['#f0f9ff', '#0ea5e9', '#ffffff'], heading: 'Outfit', body: 'Inter' },
  { id: 'emerald-forest', name: 'Emerald Forest', description: 'Природный эко-премиум', colors: ['#f0fdf4', '#10b981', '#ffffff'], heading: 'Playfair Display', body: 'Lato' },
  { id: 'slate-industrial', name: 'Slate Industrial', description: 'Тёмный урбанистичный минимализм', colors: ['#0f172a', '#6366f1', '#1e293b'], heading: 'Space Grotesk', body: 'Roboto' },
];

const DEFAULT_TEMPLATE: PresentationTemplate = {
  themeId: 'light-minimal', coverHeadline: '', watermark: '', agentName: '', agentPosition: '', agency: '', agentPhone: '', agentPhoto: '', logoUrl: '', whatsapp: '',
};
const EMPTY_OBJECT: PresentationObject = { id: '', title: '', description: '', address: '', price: '', image: '', images: [], type: '', area: '', rooms: '', floor: '', year: '', features: [] };
type EditorTab = 'design' | 'brand' | 'objects' | 'preview';

export function PresentationsTab({ uid }: { uid: string | null }) {
  const [presentations, setPresentations] = useState<Presentation[]>([]);
  const [listings, setListings] = useState<HistoryItem[]>([]);
  const [editing, setEditing] = useState<Presentation | null>(null);
  const [template, setTemplate] = useState<PresentationTemplate>(DEFAULT_TEMPLATE);
  const [objects, setObjects] = useState<PresentationObject[]>([]);
  const [section, setSection] = useState<EditorTab>('design');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [shareLoading, setShareLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [objectSearch, setObjectSearch] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [customObject, setCustomObject] = useState<PresentationObject>({ ...EMPTY_OBJECT });
  const [editingObject, setEditingObject] = useState<number | null>(null);

  useEffect(() => { if (uid) loadData(); }, [uid]);

  async function loadData() {
    if (!uid) return;
    setLoading(true);
    const [pres, list] = await Promise.all([
      supabase.from('presentations').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
      supabase.from('listings').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
    ]);
    if (pres.data) setPresentations(pres.data as Presentation[]);
    if (list.data) setListings(list.data.map((row: any) => ({
      id: row.id, title: row.title, desc: row.description || '', date: row.created_at, platforms: row.platforms || [], status: row.status, image: row.cover_image, images: row.images || row.photos || [], userId: row.user_id,
    })));
    setLoading(false);
  }

  function normalizeTemplate(value: any): PresentationTemplate {
    const oldMap: Record<string, PresentationThemeId> = { 'investment-bold': 'midnight-gold', 'corporate-light': 'light-minimal', 'dubai-luxury': 'midnight-gold', 'nordic-minimal': 'light-minimal', 'forest-green': 'emerald-forest', 'elegant-purple': 'midnight-gold' };
    return {
      ...DEFAULT_TEMPLATE,
      ...value,
      themeId: value?.themeId || oldMap[value?.presetId] || 'light-minimal',
      whatsapp: value?.whatsapp || '',
    };
  }

  function startNew() {
    const next = { ...DEFAULT_TEMPLATE };
    setTemplate(next); setObjects([]); setShareUrl(''); setSection('design');
    setEditing({ id: '', user_id: uid || '', name: `Подборка ${new Date().toLocaleDateString('ru-RU')}`, template: next, objects: [], created_at: '', updated_at: '' });
  }

  function editPresentation(presentation: Presentation) {
    setEditing(presentation); setTemplate(normalizeTemplate(presentation.template)); setObjects(presentation.objects || []); setShareUrl(''); setSection('design');
  }

  async function savePresentation() {
    if (!uid || !editing) return;
    setSaving(true);
    const data = { user_id: uid, name: editing.name, template, objects, updated_at: new Date().toISOString() };
    if (editing.id) await supabase.from('presentations').update(data).eq('id', editing.id);
    else { const created = await supabase.from('presentations').insert(data).select().single(); if (created.data) setEditing({ ...editing, id: created.data.id }); }
    setSaving(false); setEditing(null); loadData();
  }

  async function createShare() {
    if (!uid || objects.length === 0) return;
    const missingCity = objects.find(object => !object.city?.trim());
    if (missingCity) { alert(`Укажите город или населённый пункт для объекта «${missingCity.title || 'Без названия'}»`); setSection('objects'); return; }
    setShareLoading(true);
    const response = await fetch('/api/presentations/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: uid, template, objects, name: editing?.name || 'Подборка недвижимости' }) });
    const result = await response.json();
    if (response.ok && result.url) { setShareUrl(result.url); await navigator.clipboard?.writeText(result.url).catch(() => {}); }
    else alert(result.error || 'Не удалось создать ссылку');
    setShareLoading(false);
  }

  function toggleObject(listing: HistoryItem) {
    if (objects.some(object => object.id === listing.id)) { setObjects(prev => prev.filter(object => object.id !== listing.id)); return; }
    if (objects.length >= 5) return;
    let images = listing.images || [];
    try { const stored = JSON.parse(localStorage.getItem(`karty:listing:${listing.id}:images`) || '[]'); if (stored.length) images = stored; } catch { /* database fallback */ }
    if (!images.length && listing.image) images = [listing.image];
    setObjects(prev => [...prev, { ...EMPTY_OBJECT, id: listing.id, title: listing.title, description: listing.desc, address: listing.title, image: images[0] || '', images }]);
  }

  function saveCustomObject() {
    if (!customObject.title.trim() || !customObject.city?.trim()) return;
    const object = { ...customObject, id: customObject.id || `custom_${Date.now()}` };
    if (editingObject === null) setObjects(prev => prev.length < 5 ? [...prev, object] : prev);
    else setObjects(prev => prev.map((item, index) => index === editingObject ? object : item));
    setCustomOpen(false); setEditingObject(null); setCustomObject({ ...EMPTY_OBJECT });
  }

  async function uploadPresentationPhoto(dataUrl: string) {
    try {
      const response = await fetch('/api/cloudinary/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl, userId: uid }) });
      const result = await response.json();
      return response.ok && result.url ? result.url : dataUrl;
    } catch { return dataUrl; }
  }

  if (customOpen) return <CustomObjectForm value={customObject} setValue={setCustomObject} editing={editingObject !== null} onBack={() => { setCustomOpen(false); setEditingObject(null); }} onSave={saveCustomObject} onUpload={uploadPresentationPhoto} />;
  if (!editing) return <PresentationList presentations={presentations} loading={loading} search={search} setSearch={setSearch} onNew={startNew} onEdit={editPresentation} onDelete={async id => { await supabase.from('presentations').delete().eq('id', id); loadData(); }} />;

  return <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0A0A0A]">
    <div className="flex items-center gap-2 px-3 py-3 pr-16 bg-white/90 dark:bg-[#0A0A0A]/80 border-b border-slate-200/80 dark:border-white/5 shrink-0">
      <button onClick={() => setEditing(null)} className="p-2 hover:bg-slate-100 rounded-xl"><ChevronLeft size={20} /></button>
      <div className="flex-1 min-w-0"><label className="block text-[9px] uppercase tracking-wider text-slate-400">Название подборки</label><input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className="w-full bg-transparent font-semibold text-[15px] outline-none" placeholder="Например: Пентхаусы Батуми" /></div>
      <button onClick={savePresentation} disabled={saving} className="p-2 bg-[#533afd] text-white rounded-xl"><Check size={18} /></button>
    </div>
    <div className="flex gap-1 px-3 py-2 bg-white/90 dark:bg-[#0A0A0A]/80 border-b border-slate-200/80 dark:border-white/5 shrink-0">
      {([{ id: 'design', label: 'Дизайн', icon: <Palette size={14} /> }, { id: 'brand', label: 'Бренд', icon: <User size={14} /> }, { id: 'objects', label: 'Объекты', icon: <FileText size={14} /> }, { id: 'preview', label: 'Превью', icon: <Eye size={14} /> }] as const).map(tab => <button key={tab.id} onClick={() => setSection(tab.id)} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-medium ${section === tab.id ? 'bg-[#533afd] text-white' : 'bg-slate-100 dark:bg-white/[0.03] text-slate-600 dark:text-gray-400'}`}>{tab.icon}{tab.label}</button>)}
    </div>
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {section === 'design' && <Section title="Тема одностраничника"><div className="grid grid-cols-2 gap-3">{THEMES.map(theme => <ThemeCard key={theme.id} theme={theme} selected={template.themeId === theme.id} onClick={() => setTemplate(prev => ({ ...prev, themeId: theme.id }))} />)}</div></Section>}
      {section === 'brand' && <BrandSection template={template} setTemplate={setTemplate} />}
      {section === 'objects' && <ObjectsSection objects={objects} listings={listings} search={objectSearch} setSearch={setObjectSearch} onToggle={toggleObject} onNew={() => { setCustomObject({ ...EMPTY_OBJECT }); setEditingObject(null); setCustomOpen(true); }} onEdit={(object, index) => { setCustomObject(object); setEditingObject(index); setCustomOpen(true); }} onRemove={index => setObjects(prev => prev.filter((_, i) => i !== index))} />}
      {section === 'preview' && <LivePreview template={template} objects={objects} />}
    </div>
    <div className="p-4 border-t border-slate-200/80 dark:border-white/5 bg-white/90 dark:bg-[#0A0A0A]/80 shrink-0">
      {shareUrl ? <div className="space-y-2"><div className="flex gap-2"><input readOnly value={shareUrl} className="min-w-0 flex-1 px-3 py-2 rounded-xl bg-slate-100 text-[11px] outline-none" /><button onClick={() => navigator.clipboard?.writeText(shareUrl)} className="px-3 rounded-xl bg-[#533afd] text-white"><Copy size={16} /></button></div><button onClick={startNew} className="w-full py-2 text-[12px] font-semibold text-[#533afd] border border-[#533afd]/20 rounded-xl">Создать новую подборку</button></div> : <><button onClick={createShare} disabled={objects.length === 0 || shareLoading} className="w-full py-3 bg-[#533afd] text-white rounded-xl font-semibold text-[14px] disabled:opacity-50">{shareLoading ? 'Создание ссылки...' : 'Создать ссылку'}</button><p className="text-center text-[10px] text-slate-400 mt-2">Ссылка действует 3 дня</p></>}
    </div>
  </div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="bg-white dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/5 rounded-[16px] p-4"><h3 className="font-semibold text-[13px] mb-3 text-slate-700 dark:text-gray-300">{title}</h3>{children}</section>; }

function ThemeCard({ theme, selected, onClick }: { key?: React.Key; theme: typeof THEMES[number]; selected: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`text-left overflow-hidden rounded-2xl border-2 transition-all hover:scale-[1.02] ${selected ? 'border-[#533afd] shadow-lg' : 'border-slate-200 dark:border-white/10'}`}><div className="aspect-[1.25/1] p-3 flex flex-col justify-between" style={{ background: theme.colors[0], color: theme.id.includes('midnight') || theme.id.includes('slate') ? '#f8fafc' : theme.colors[1] }}><div className="flex gap-1">{theme.colors.map(color => <i key={color} className="w-3 h-3 rounded-full" style={{ background: color, border: '1px solid rgba(0,0,0,.12)' }} />)}</div><div><div className="text-[8px] uppercase tracking-widest opacity-60">Карточка объекта</div><div className="text-[18px] font-semibold leading-none mt-1" style={{ fontFamily: `'${theme.heading}', serif` }}>Residence</div><div className="text-[8px] opacity-70 mt-1" style={{ fontFamily: `'${theme.body}', sans-serif` }}>60 м² · 2 комнаты</div></div><div className="h-1 rounded-full w-1/2" style={{ background: theme.colors[1] }} /></div><div className="px-3 py-2 bg-white dark:bg-[#151515]"><div className="text-[11px] font-bold text-slate-800 dark:text-white">{theme.name}</div><div className="text-[9px] text-slate-500 mt-0.5">{theme.description}</div></div></button>;
}

function BrandSection({ template, setTemplate }: { template: PresentationTemplate; setTemplate: React.Dispatch<React.SetStateAction<PresentationTemplate>> }) {
  const update = (key: keyof PresentationTemplate, value: string) => setTemplate(prev => ({ ...prev, [key]: value }));
  const upload = (event: React.ChangeEvent<HTMLInputElement>, key: 'logoUrl' | 'agentPhoto') => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => update(key, String(reader.result)); reader.readAsDataURL(file); };
  return <Section title="Данные риэлтора"><div className="space-y-3"><input value={template.agency} onChange={e => update('agency', e.target.value)} className="field" placeholder="Название компании" /><input value={template.agentName} onChange={e => update('agentName', e.target.value)} className="field" placeholder="Имя риэлтора" /><input value={template.agentPosition} onChange={e => update('agentPosition', e.target.value)} className="field" placeholder="Должность" /><input value={template.agentPhone} onChange={e => update('agentPhone', e.target.value)} className="field" placeholder="Телефон" /><input value={template.whatsapp || ''} onChange={e => update('whatsapp', e.target.value)} className="field" placeholder="WhatsApp-ссылка или номер" /><label className="upload"><Upload size={15} />{template.logoUrl ? 'Лого загружено' : 'Загрузить лого'}<input type="file" accept="image/*" onChange={e => upload(e, 'logoUrl')} /></label><label className="upload"><Upload size={15} />{template.agentPhoto ? 'Фото загружено' : 'Загрузить фото риэлтора'}<input type="file" accept="image/*" onChange={e => upload(e, 'agentPhoto')} /></label></div></Section>;
}

function ObjectsSection({ objects, listings, search, setSearch, onToggle, onNew, onEdit, onRemove }: any) {
  const available = listings.filter((item: HistoryItem) => !objects.some((object: PresentationObject) => object.id === item.id) && (!search || `${item.title} ${item.desc}`.toLowerCase().includes(search.toLowerCase())));
  return <Section title={`Объекты (${objects.length}/5)`}><div className="flex justify-end mb-3"><button onClick={onNew} disabled={objects.length >= 5} className="flex items-center gap-1 px-2.5 py-1 bg-[#533afd] text-white rounded-lg text-[11px] disabled:opacity-40"><Plus size={12} /> Добавить свой</button></div><div className="space-y-2 mb-4">{objects.map((object: PresentationObject, index: number) => <div key={object.id} className="flex items-center gap-3 p-2.5 bg-slate-50 dark:bg-white/[0.03] rounded-xl"><span className="w-5 text-center font-bold text-[#533afd]">{index + 1}</span>{object.image ? <img src={object.image} className="w-12 h-12 rounded-lg object-cover" /> : <div className="w-12 h-12 rounded-lg bg-slate-200" />}<div className="flex-1 min-w-0"><p className="text-[12px] font-medium truncate">{object.title}</p><p className="text-[10px] text-slate-500">{object.images?.length || 0} фото</p></div><button onClick={() => onEdit(object, index)} className="p-1.5 text-slate-400"><Palette size={13} /></button><button onClick={() => onRemove(index)} className="p-1.5 text-slate-400 hover:text-red-500"><X size={14} /></button></div>)}</div><div className="flex items-center gap-2 field"><Search size={14} className="text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Найти объект..." className="flex-1 bg-transparent outline-none text-[12px]" /></div><div className="mt-2 max-h-48 overflow-y-auto">{available.map((listing: HistoryItem) => <button key={listing.id} onClick={() => onToggle(listing)} className="w-full flex items-center gap-3 p-2 text-left hover:bg-slate-50 rounded-xl"><div className="w-9 h-9 rounded-lg bg-slate-200 overflow-hidden">{listing.image && <img src={listing.image} className="w-full h-full object-cover" />}</div><span className="text-[12px] truncate">{listing.title}</span></button>)}</div></Section>;
}

function CustomObjectForm({ value, setValue, editing, onBack, onSave, onUpload }: { value: PresentationObject; setValue: React.Dispatch<React.SetStateAction<PresentationObject>>; editing: boolean; onBack: () => void; onSave: () => void; onUpload: (dataUrl: string) => Promise<string> }) {
  const update = (key: keyof PresentationObject, next: any) => setValue(prev => ({ ...prev, [key]: next }));
  const addPhotos = (event: React.ChangeEvent<HTMLInputElement>) => { const files = Array.from(event.target.files || []) as File[]; files.forEach(file => { const reader = new FileReader(); reader.onload = async () => { const localUrl = String(reader.result); setValue(prev => ({ ...prev, image: prev.image || localUrl, images: [...(prev.images || []), localUrl] })); const uploadedUrl = await onUpload(localUrl); if (uploadedUrl !== localUrl) setValue(prev => ({ ...prev, image: prev.image === localUrl ? uploadedUrl : prev.image, images: (prev.images || []).map(image => image === localUrl ? uploadedUrl : image) })); }; reader.readAsDataURL(file); }); };
  return <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0A0A0A]"><div className="flex items-center gap-2 px-3 py-3 bg-white dark:bg-[#0A0A0A] border-b"><button onClick={onBack} className="p-2"><ChevronLeft size={20} /></button><b>{editing ? 'Редактировать объект' : 'Новый объект'}</b></div><div className="flex-1 overflow-y-auto p-4 space-y-3"><label className="upload"><Camera size={15} />Добавить фотографии<input type="file" accept="image/*" multiple onChange={addPhotos} /></label><div className="grid grid-cols-4 gap-2">{(value.images || []).map((image, index) => <img key={index} src={image} className="aspect-square rounded-lg object-cover" />)}</div><input value={value.title} onChange={e => update('title', e.target.value)} className="field" placeholder="Название объекта" /><input required value={value.city || ''} onChange={e => update('city', e.target.value)} className="field" placeholder="Город или населённый пункт *" /><input value={value.address} onChange={e => update('address', e.target.value)} className="field" placeholder="Район, улица, номер дома" /><div className="grid grid-cols-2 gap-2"><input value={value.price} onChange={e => update('price', e.target.value)} className="field" placeholder="Цена" /><input value={value.area || ''} onChange={e => update('area', e.target.value)} className="field" placeholder="Площадь" /></div><div className="grid grid-cols-3 gap-2"><input value={value.rooms || ''} onChange={e => update('rooms', e.target.value)} className="field" placeholder="Комнаты" /><input value={value.floor || ''} onChange={e => update('floor', e.target.value)} className="field" placeholder="Этаж" /><input value={value.year || ''} onChange={e => update('year', e.target.value)} className="field" placeholder="Год" /></div><textarea value={value.description} onChange={e => update('description', e.target.value)} className="field min-h-24" placeholder="Описание объекта — преимущества извлечёт AI" /><button onClick={onSave} disabled={!value.title.trim() || !value.city?.trim()} className="w-full py-3 bg-[#533afd] text-white rounded-xl font-semibold disabled:opacity-50">{editing ? 'Сохранить' : 'Добавить объект'}</button></div></div>;
}

function LivePreview({ template, objects }: { template: PresentationTemplate; objects: PresentationObject[] }) {
  const [url, setUrl] = useState<string | null>(null); const [loading, setLoading] = useState(false); const ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { if (!objects.length) { setUrl(null); return; } setLoading(true); if (ref.current) clearTimeout(ref.current); ref.current = setTimeout(async () => { try { const response = await fetch('/api/presentations/preview-html', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template, objects, name: 'Preview' }) }); const html = String(await response.text()); const blob = new Blob([html], { type: 'text/html' }); setUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); }); } finally { setLoading(false); } }, 500); return () => { if (ref.current) clearTimeout(ref.current); }; }, [template, objects]);
  if (!objects.length) return <div className="text-center py-16 text-slate-400 text-[13px]">Добавьте хотя бы один объект для превью</div>;
  return <Section title="Живое превью одностраничника"><div className="flex items-center justify-end h-4">{loading && <span className="text-[10px] text-slate-400">Обновление...</span>}</div>{url && <iframe src={url} title="Предпросмотр карточки недвижимости" className="w-full h-[680px] rounded-2xl border border-slate-200 bg-white" />}</Section>;
}

function PresentationList({ presentations, loading, search, setSearch, onNew, onEdit, onDelete }: any) {
  return <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0A0A0A]"><div className="px-4 pt-4 pb-4 pr-4 bg-white/90 dark:bg-[#0A0A0A]/80 border-b"><div className="flex items-center justify-between"><h1 className="text-[26px] font-bold">Презентации</h1></div><p className="text-[13px] text-slate-500 mt-1">Одностраничники для отправки клиенту</p><button onClick={onNew} className="mt-3 w-full py-2.5 bg-[#533afd] text-white rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2"><Plus size={17} /> Создать одностраничник</button><div className="field mt-3 flex items-center gap-2"><Search size={15} className="text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} className="flex-1 bg-transparent outline-none" placeholder="Поиск..." /></div></div><div className="flex-1 overflow-y-auto p-4 space-y-3">{loading && <p className="text-center text-sm text-slate-500">Загрузка...</p>}{!loading && !presentations.length && <div className="text-center py-12 text-slate-500">Создайте первую подборку кнопкой выше</div>}{presentations.filter((item: Presentation) => !search || item.name.toLowerCase().includes(search.toLowerCase())).map((item: Presentation) => <div key={item.id} className="bg-white dark:bg-white/[0.03] border rounded-2xl p-4 flex items-center justify-between"><div><b className="text-[14px]">{item.name}</b><p className="text-[11px] text-slate-500 mt-1">{item.objects?.length || 0} объектов · {new Date(item.created_at).toLocaleDateString('ru-RU')}</p></div><div className="flex gap-1"><button onClick={() => onEdit(item)} className="p-2 text-slate-500"><Palette size={16} /></button><button onClick={() => onDelete(item.id)} className="p-2 text-slate-400 hover:text-red-500"><Trash2 size={16} /></button></div></div>)}</div></div>;
}
