import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { execSync } from 'child_process';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { korterAuthManager } from './server/korterAuth.js';
import { startBot, sendTelegramMessage } from './server/bot.js';
import { parseListingWithDeepSeek } from './server/ai.js';
import { AuthManager } from './server/authManager.js';
import { supabaseServer } from './server/supabase.js';
import { startPythonApi } from './server/pythonApi.js';
import { crmLogin, listManagers, addManager, deleteManager, saveCrmSession, loadCrmSession, deleteCrmSession } from './server/crmAuth.js';
import { upsertChat, addMessage, getChats, getChat, getMessages, markRead, assignChat, getAccounts, addAccount, deleteAccount, getDb } from './server/crmChats.js';
import { syncRealtorLead, listLeads, removeUnqualifiedRealtorLeads, removeUnqualifiedTelegramLeads, getLead, findLeadByChat, updateLead, claimLead, addLeadEvent, listLeadEvents, createReferralLink, getReferralLink, recordPayment, recordLeadUsage, getLeadUsage, upsertTelegramLead } from './server/crmLeads.js';
import { generateGreetingVariants } from './server/crmMessaging.js';
import { executeSinglePortalFallback } from './server/skyvernOrchestrator.js';
import crypto from 'crypto';

function extractJsonObject(text: string): any | null {
  for (let start = text.indexOf('{'); start >= 0; start = text.indexOf('{', start + 1)) {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') quoted = false;
        continue;
      }
      if (ch === '"') { quoted = true; continue; }
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(text.slice(start, i + 1)); } catch { break; }
        }
      }
    }
  }
  const candidates = text.match(/\{[\s\S]*\}/g) || [];
  for (let i = candidates.length - 1; i >= 0; i--) {
    try { return JSON.parse(candidates[i]); } catch { /* keep searching */ }
  }
  return null;
}

async function getAuthenticatedUserId(req: any, res: any): Promise<string | null> {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    res.status(401).json({ error: 'Авторизация пользователя отсутствует' });
    return null;
  }
  try {
    const { data, error } = await supabaseServer.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ error: 'Недействительная авторизация пользователя' });
      return null;
    }
    return data.user.id;
  } catch (error: any) {
    res.status(401).json({ error: `Не удалось проверить авторизацию: ${error.message}` });
    return null;
  }
}

async function requirePublishIdentity(req: any, res: any, requestedUserId: string): Promise<boolean> {
  const authenticatedUserId = await getAuthenticatedUserId(req, res);
  if (!authenticatedUserId) return false;
  if (authenticatedUserId !== requestedUserId) {
    res.status(403).json({ error: 'Пользователь не имеет доступа к этой операции' });
    return false;
  }
  return true;
}

async function requireListingOwner(res: any, listingId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabaseServer.from('listings').select('user_id').eq('id', listingId).maybeSingle();
  if (error) {
    res.status(503).json({ error: 'Не удалось проверить владельца объявления' });
    return false;
  }
  if (!data) {
    res.status(404).json({ error: 'Объявление не найдено' });
    return false;
  }
  if (String(data.user_id) !== String(userId)) {
    res.status(403).json({ error: 'Объявление принадлежит другому пользователю' });
    return false;
  }
  return true;
}

async function fetchImageDataUri(url: string): Promise<string> {
  if (!url || url.startsWith('data:')) return url;
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'KartyPresentation/1.0' } });
    if (!response.ok) return url;
    const buffer = Buffer.from(await response.arrayBuffer());
    const mime = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch { return url; }
}

async function resolveMapImage(address: string, presetId: string, expectedCity = ''): Promise<{ image: string; lat: number; lng: number } | null> {
  const token = process.env.VITE_MAPBOX_TOKEN;
  if (!address || !token) return null;
  try {
    const city = String(expectedCity || '').toLowerCase();
    const query = [address, expectedCity, 'Georgia'].filter(Boolean).join(', ');
    const geocode = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=GE&language=ru&limit=1&access_token=${token}`);
    const result = await geocode.json();
    let feature = result?.features?.[0];
    const placeName = String(feature?.place_name || '').toLowerCase();
    const expectedMatches = !city || (city.includes('батум') ? /batumi|батуми/.test(placeName) : city.includes('тбили') ? /tbilisi|тбилиси/.test(placeName) : placeName.includes(city));
    if (feature && !expectedMatches && city) {
      const photonQueries = [`${address}, ${expectedCity}, Georgia`];
      const houseNumber = String(address).match(/\d+/)?.[0] || '';
      if (/пиросман/i.test(address) && city.includes('батум')) photonQueries.push(`Pirosmani Street ${houseNumber}, Batumi, Georgia`);
      let photonFeatures: any[] = [];
      for (const photonQuery of photonQueries) {
        const photonResponse = await fetch(`https://photon.komoot.io/api?q=${encodeURIComponent(photonQuery)}&lang=en&limit=10`);
        if (photonResponse.ok) {
          const photonResult = await photonResponse.json();
          photonFeatures = photonFeatures.concat(photonResult?.features || []);
        }
      }
      const photonFeature = photonFeatures.find((item: any) => {
        const cityName = String(item.properties?.city || item.properties?.town || item.properties?.locality || '').toLowerCase();
        return city.includes('батум') ? /ბათუმ|batumi|батуми/.test(cityName) : city.includes('тбили') ? /tbilisi|тбилиси/.test(cityName) : cityName.includes(city);
      });
      if (photonFeature?.geometry?.coordinates) feature = { center: photonFeature.geometry.coordinates, place_name: photonFeature.properties?.name || expectedCity };
      else {
        const cityQuery = city.includes('батум') ? 'Batumi, Georgia' : city.includes('тбили') ? 'Tbilisi, Georgia' : `${expectedCity}, Georgia`;
        const cityResponse = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cityQuery)}.json?country=GE&language=ru&limit=1&access_token=${token}`);
        const cityResult = await cityResponse.json();
        feature = cityResult?.features?.[0];
      }
    }
    const point = feature?.center;
    if (!point) return null;
    const [lng, lat] = point;
    const dark = presetId === 'dubai-luxury' || presetId === 'elegant-purple' || presetId === 'investment-bold' || presetId === 'midnight-gold' || presetId === 'slate-industrial';
    const style = dark ? 'dark-v11' : 'light-v11';
    const marker = dark ? 'f04d5d' : '1B2A4A';
    const url = `https://api.mapbox.com/styles/v1/mapbox/${style}/static/pin-s+${marker}(${lng},${lat})/${lng},${lat},13,0/1000x360@2x?access_token=${token}`;
    return { image: await fetchImageDataUri(url), lat, lng };
  } catch (error: any) {
    console.warn(`[Presentation] Map unavailable for "${address}": ${error.message}`);
    return null;
  }
}

async function attachMapImages(objects: any[], presetId: string): Promise<any[]> {
  return await Promise.all(objects.map(async (object) => {
    if (object.map_image && object.map_lat && object.map_lng) return object;
    const map = await resolveMapImage([object.city, object.district, object.address].filter(Boolean).join(', ') || object.location_summary || '', presetId, object.city || '');
    return { ...object, map_image: object.map_image || map?.image || '', map_lat: object.map_lat || map?.lat || '', map_lng: object.map_lng || map?.lng || '' };
  }));
}

function generatePresentationHTML(template: any, objects: any[], name?: string): string {
  return generatePresentationHTMLV2(template, objects, name);
  const t = template || {};

  // Map generateMap inline (no Python needed)
  function generateMapInline(address: string): string {
    // Return empty - map will be handled by CSS placeholder
    return '';
  }

  function safe(str: any) { return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function amenityIcon(text: string): string {
    const l = text.toLowerCase();
    if (/бассейн|pool/.test(l)) return '🏊 ';
    if (/паркинг|gaраж|parking/.test(l)) return '🅿️ ';
    if (/охрана|консьерж|security/.test(l)) return '🔒 ';
    if (/фитнес|gym|спорт/.test(l)) return '🏋️ ';
    if (/море|sea/.test(l)) return '🌊 ';
    if (/новострой|build/.test(l)) return '🏗️ ';
    if (/ремонт|design/.test(l)) return '✨ ';
    if (/мебел|furnish/.test(l)) return '🛋️ ';
    if (/террас|balcon|балкон/.test(l)) return '🌿 ';
    if (/умный дом|smart/.test(l)) return '🏠 ';
    return '';
  }

  // Map template colors to design tokens
  const themeTokens = [
    t.primaryColor ? `--primary:${t.primaryColor}` : null,
    t.secondaryColor ? `--surface:${t.secondaryColor}` : null,
    t.accentColor ? `--accent:${t.accentColor}` : null,
    t.goldColor ? `--gold:${t.goldColor}` : null,
    t.mutedColor ? `--border:${t.mutedColor}` : null,
    t.primaryColor ? `--title:${t.primaryColor}` : null,
    t.primaryColor ? `--text:#374151` : null,
  ].filter(Boolean).join(';');

  const properties = objects.map((obj: any) => ({
    status: (obj.type && obj.type.includes('аренд')) ? 'В аренду' : 'В продаже',
    title: obj.title || 'Объект',
    address: obj.address || '',
    price: obj.price || '',
    pricePerM: (() => {
      if (!obj.area || !obj.price) return '';
      const n = parseInt(String(obj.price).replace(/[^\d]/g, ''));
      const a = parseFloat(String(obj.area));
      if (n && a) return `≈ ${Math.round(n / a).toLocaleString()} ${String(obj.price).includes('$') ? '$' : '₽'} / м²`;
      return '';
    })(),
    area: obj.area || '',
    rooms: obj.rooms || '',
    floor: obj.floor || '',
    year: obj.year || '',
    renovation: obj.renovation || '',
    description: (obj.description || '').substring(0, 300),
    amenities: (obj.features || []).map((f: any) => String(f)).filter((f: string) => !!f),
    photos: (obj.images || []).filter((img: string) => !!img),
  }));

  const agent = {
    agency: t.agency || '',
    name: t.agentName || name || 'Риэлтор',
    role: t.agentPosition || 'Персональный риэлтор',
    phone: t.agentPhone || '',
    photo: t.agentPhoto || '',
  };

  const today = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const n = properties.length;
  const plural = (n % 10 === 1 && n % 100 !== 11) ? `${n} объект` : ([2,3,4].includes(n%10) && ![12,13,14].includes(n%100)) ? `${n} объекта` : `${n} объектов`;

  // ═══ COVER ═══
  const heroPhoto = properties[0]?.photos?.[0];
  const coverPhotoHtml = heroPhoto ? `<img src="${safe(heroPhoto)}">` : '';

  const coverItems = properties.map((p, i) => {
    const thumb = p.photos?.[0] ? `<img src="${safe(p.photos[0])}">` : '';
    const priceStr = p.price ? `<div class="cli-price">${safe(p.price)}</div>` : '';
    return `<div class="cover-list-item"><div class="cli-num">${String(i+1).padStart(2,'0')}</div><div class="cli-thumb">${thumb}</div><div class="cli-info"><div class="t">${safe(p.title)}</div><div class="a">${safe(p.address)}</div></div>${priceStr}</div>`;
  }).join('');

  const agentPhotoHtml = agent.photo ? `<img src="${safe(agent.photo)}">` : '';

  const coverPage = `<section class="page cover">
  <div class="cover-hero">${coverPhotoHtml}</div>
  <div class="cover-mid">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--spacing-lg);">
      <div class="cover-agency"><span class="dot"></span>${safe(agent.agency)}</div>
      <div class="cover-date">${today}</div>
    </div>
    <div class="eyebrow">Подборка объектов</div>
    <h1 style="margin-top:8px;">Подборка недвижимости</h1>
    <p class="cover-subtitle">Объекты, которые соответствуют вашим пожеланиям по расположению, бюджету и планировке.</p>
    <div class="cover-list" style="margin-top:auto;">
      <div class="cover-list-header"><span class="eyebrow">В подборке</span><span>${plural}</span></div>
      ${coverItems}
    </div>
  </div>
  <div class="cover-bottom">
    <div class="cover-agent">${agentPhotoHtml}<div><div class="name">${safe(agent.name)}</div><div class="role">${safe(agent.role)}</div></div></div>
    <div class="cover-contact">${safe(agent.phone)}</div>
  </div>
</section>`;

  // ═══ PROPERTY PAGES ═══
  const objectPages = properties.map((p, i) => {
    const photos = p.photos || [];

    // Gallery: hero + thumbnails
    let galleryHtml = '';
    if (photos.length === 1) {
      galleryHtml = `<div class="gallery-hero"><img src="${safe(photos[0])}"></div>`;
    } else if (photos.length >= 2) {
      const thumbs = photos.slice(0, 5).map(src => `<img src="${safe(src)}">`).join('');
      galleryHtml = `<div class="gallery-hero"><img src="${safe(photos[0])}"></div><div class="gallery-thumbs">${thumbs}</div>`;
    }

    // Feature cards
    const features = [];
    if (p.area) features.push({ icon: 'ic-area', value: safe(p.area), label: 'Площадь' });
    if (p.rooms) features.push({ icon: 'ic-rooms', value: safe(p.rooms), label: 'Комнаты' });
    if (p.floor) features.push({ icon: 'ic-floor', value: safe(p.floor), label: 'Этаж' });
    if (p.year) features.push({ icon: 'ic-year', value: safe(p.year), label: 'Год' });
    const featureCards = features.map(f => `<div class="feature-card"><div class="fc-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.6"><use href="#${f.icon}"/></svg></div><div class="fc-value">${f.value}</div><div class="fc-label">${f.label}</div></div>`).join('');

    // Advantages
    const advantages = p.amenities.map(a => `<div class="adv-item"><span class="check">✓</span>${safe(a)}</div>`).join('');

    // Map placeholder
    const mapHtml = p.address ? `<div class="map-section"><div class="map-label">📍 Расположение</div><div class="map-img" style="background:var(--surface-2);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:10px;">${safe(p.address)}</div></div>` : '';

    return `<section class="page">
  <div class="prop-header"><span class="prop-idx">Объект ${i+1}</span><span class="prop-agency">${safe(agent.agency)}</span></div>

  ${galleryHtml}

  <div class="prop-title-row">
    <div><h2>${safe(p.title)}</h2><div class="prop-address">📍 ${safe(p.address)}</div></div>
    ${p.price ? `<div class="price-box"><div class="price">${safe(p.price)}</div>${p.pricePerM ? `<div class="per-m">${safe(p.pricePerM)}</div>` : ''}</div>` : ''}
  </div>

  ${featureCards ? `<div class="feature-grid">${featureCards}</div>` : ''}

  ${p.description ? `<div class="summary-block"><h3>Описание</h3><p>${safe(p.description)}</p></div>` : ''}

  ${advantages ? `<div class="advantages"><h3>Преимущества</h3><div class="adv-list">${advantages}</div></div>` : ''}

  ${mapHtml}

  <div class="prop-footer"><span>Объект ${i+1} из ${n}</span><span>${safe(agent.phone)}</span></div>
</section>`;
  }).join('');

  // ═══ AGENT CARD ═══
  const agentCardPhoto = agent.photo ? `<img src="${safe(agent.photo)}" class="agent-photo">` : '';

  const agentCardPage = `<section class="page agent-page">
  ${agentCardPhoto}
  <h2>${safe(agent.name)}</h2>
  <p class="agent-role">${safe(agent.role)}</p>
  <div class="agent-contacts">
    ${agent.phone ? `<div class="agent-contact"><div class="label">Телефон</div><div class="value">${safe(agent.phone)}</div></div>` : ''}
    ${agent.agency ? `<div class="agent-contact"><div class="label">Агентство</div><div class="value">${safe(agent.agency)}</div></div>` : ''}
  </div>
  <div class="agent-cta">Записаться на просмотр</div>
</section>`;

  // ═══ RENDER ═══
  const templatePath = path.join(process.cwd(), 'presentation-template.html');
  try {
    let html = fs.readFileSync(templatePath, 'utf-8');
    html = html.replace('__THEME_OVERRIDES__', themeTokens ? `:root{${themeTokens}}` : '');
    html = html.replace('__CONTENT__', coverPage + objectPages + agentCardPage);
    return html;
  } catch (e) {
    console.error('[Presentation] Template not found:', templatePath);
    return `<html><body><h1>Template not found</h1></body></html>`;
  }
}

function generatePresentationHTMLV2(template: any, objects: any[], name?: string): string {
  const t = template || {};
  const presets: Record<string, any> = {
    'investment-bold': { primary: '#1B2A4A', accent: '#1B2A4A', surface: '#F5F0E8', text: '#2C2C2C', gold: '#B8963E', surface2: '#E8E0D0', onDark: '#F0EDE7', muted: '#8A8578', display: 'Fraunces', body: 'Manrope', composition: 'cards' },
    'corporate-light': { primary: '#2B2B2B', accent: '#2B2B2B', surface: '#FAFAF8', text: '#4A4A4A', gold: '#8A7A5A', surface2: '#F0EFEB', onDark: '#FAFAF8', muted: '#B0ADA5', display: 'Inter', body: 'Inter', composition: 'table' },
    'dubai-luxury': { primary: '#0D1B2A', accent: '#C9A84C', surface: '#F5F2EC', text: '#1F2937', gold: '#C9A84C', surface2: '#EBE6DA', onDark: '#F0EBE0', muted: '#9CA3AF', display: 'Playfair Display', body: 'Inter', composition: 'luxury' },
    'nordic-minimal': { primary: '#374151', accent: '#6B7280', surface: '#F9FAFB', text: '#111827', gold: '#78716C', surface2: '#F3F4F6', onDark: '#F9FAFB', muted: '#A8A29E', display: 'Inter', body: 'Inter', composition: 'minimal' },
    'forest-green': { primary: '#1A3C2A', accent: '#2D6A4F', surface: '#F5F0E8', text: '#374151', gold: '#B8963E', surface2: '#E8E0D0', onDark: '#F0EDE7', muted: '#9CA3AF', display: 'Fraunces', body: 'Manrope', composition: 'cards' },
    'elegant-purple': { primary: '#2C1654', accent: '#5B2C8E', surface: '#FAF7F1', text: '#1F2937', gold: '#C9A84C', surface2: '#F0EDE7', onDark: '#F5F0E8', muted: '#9CA3AF', display: 'Playfair Display', body: 'Inter', composition: 'luxury' },
  };
  const presetId = presets[t.presetId] ? t.presetId : 'investment-bold';
  const p = presets[presetId];
  const presetClass = `preset-${presetId}`;
  const vars = `:root{--primary:${p.primary};--accent:${p.accent};--surface:${p.surface};--text:${p.text};--gold:${p.gold};--surface-2:${p.surface2};--on-dark:${p.onDark};--muted:${p.muted};--font-display:'${p.display}', Georgia, serif;--font-body:'${p.body}', Arial, sans-serif;}`;
  const safe = (str: any) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const properties = objects.map((obj: any) => {
    const photos = (obj.images?.length ? obj.images : obj.image ? [obj.image] : []).filter(Boolean);
    const priceNumber = parseInt(String(obj.price || '').replace(/[^\d]/g, ''), 10);
    const areaNumber = parseFloat(String(obj.area || '').replace(',', '.'));
    const currency = String(obj.price || '').includes('$') ? '$' : '₾';
    return { title: obj.title || 'Объект', address: obj.address || '', price: obj.price || '', area: obj.area || '', rooms: obj.rooms || '', floor: obj.floor || '', year: obj.year || '', status: obj.status || '', description: String(obj.description || '').substring(0, 420), amenities: (obj.features || []).map((f: any) => String(f)).filter(Boolean), locationSummary: obj.location_summary || '', locationAdvantages: Array.isArray(obj.location_advantages) ? obj.location_advantages : [], investmentHighlights: Array.isArray(obj.investment_highlights) ? obj.investment_highlights : [], keyMetrics: Array.isArray(obj.key_metrics) ? obj.key_metrics : [], mapImage: obj.map_image || '', photos, pricePerM: priceNumber && areaNumber ? `≈ ${Math.round(priceNumber / areaNumber).toLocaleString()} ${currency} / м²` : '' };
  });
  const agent = { agency: t.agency || '', name: t.agentName || name || 'Риэлтор', role: t.agentPosition || 'Персональный риэлтор', phone: t.agentPhone || '', photo: t.agentPhoto || '', logo: t.logoUrl || '' };
  const today = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const plural = properties.length === 1 ? '1 объект' : `${properties.length} объектов`;
  const hero = properties[0]?.photos[0] ? `<img src="${safe(properties[0].photos[0])}" alt="">` : '';
  const logo = agent.logo ? `<img class="brand-logo" src="${safe(agent.logo)}" alt="">` : '';
  const agentPhoto = agent.photo ? `<img class="agent-avatar" src="${safe(agent.photo)}" alt="">` : '';
  const coverItems = properties.map((item, i) => `<div class="cover-item"><span class="cover-number">${String(i + 1).padStart(2, '0')}</span><span class="cover-thumb">${item.photos[0] ? `<img src="${safe(item.photos[0])}" alt="">` : ''}</span><span class="cover-item-info"><strong>${safe(item.title)}</strong><small>${safe(item.address)}</small></span><b>${safe(item.price)}</b></div>`).join('');
  const cover = `<section class="page cover"><div class="cover-hero">${hero}</div><div class="cover-content"><div class="cover-top">${logo}<span>${safe(agent.agency)}</span><time>${today}</time></div><div class="cover-heading"><span class="eyebrow">Подборка объектов</span><h1>${safe(t.coverHeadline || 'Подборка недвижимости')}</h1><p>Объекты, которые соответствуют вашим пожеланиям по расположению, бюджету и планировке.</p></div><div class="cover-list"><div class="cover-list-heading"><span>В подборке</span><b>${plural}</b></div>${coverItems}</div><div class="cover-bottom"><div class="agent-lockup">${agentPhoto}<span><strong>${safe(agent.name)}</strong><small>${safe(agent.role)}</small></span></div><span>${safe(agent.phone)}</span></div></div></section>`;
  const objectPages = properties.map((item, i) => {
    const thumbs = item.photos.slice(1, 6).map((photo: string) => `<img src="${safe(photo)}" alt="">`).join('');
    const metrics = [['Площадь', item.area, 'ic-area'], ['Комнаты', item.rooms, 'ic-rooms'], ['Этаж', item.floor, 'ic-floor'], ['Год', item.year, 'ic-year']].filter((m: any[]) => m[1]).map((m: any[]) => `<div class="metric"><svg viewBox="0 0 24 24"><use href="#${m[2]}"/></svg><strong>${safe(m[1])}</strong><small>${m[0]}</small></div>`).join('');
    const rows = [['Площадь', item.area], ['Комнаты', item.rooms], ['Этаж', item.floor], ['Год постройки', item.year]].filter((m: any[]) => m[1]).map((m: any[]) => `<div class="data-row"><span>${m[0]}</span><strong>${safe(m[1])}</strong></div>`).join('');
    const advantages = item.amenities.map((a: string) => `<span class="advantage">✓ ${safe(a)}</span>`).join('');
    const locationAdvantages = item.locationAdvantages.map((a: string) => `<li>${safe(a)}</li>`).join('');
    const investmentHighlights = item.investmentHighlights.map((a: string) => `<li>${safe(a)}</li>`).join('');
    const keyMetrics = item.keyMetrics.map((m: any) => `<div class="editorial-metric"><strong>${safe(m.value)}</strong><small>${safe(m.label)}</small></div>`).join('');
    return `<section class="page property"><header class="property-header"><span>${safe(item.status || `Объект ${i + 1}`)}</span><b>${safe(agent.agency)}</b></header><div class="gallery"><div class="gallery-hero">${item.photos[0] ? `<img src="${safe(item.photos[0])}" alt="">` : ''}</div><div class="gallery-thumbs">${thumbs}</div></div><div class="property-title"><div><h2>${safe(item.title)}</h2><p>📍 ${safe(item.address)}</p></div><div class="price"><strong>${safe(item.price)}</strong><small>${safe(item.pricePerM)}</small></div></div>${keyMetrics ? `<div class="editorial-metrics">${keyMetrics}</div>` : ''}<div class="metrics">${metrics}</div><div class="property-grid"><div><div class="property-description"><h3>Описание</h3><p>${safe(item.description)}</p></div>${item.locationSummary ? `<div class="location-story"><span>Локация</span><p>${safe(item.locationSummary)}</p></div>` : ''}${locationAdvantages ? `<div class="story-list"><h3>Рядом и вокруг</h3><ul>${locationAdvantages}</ul></div>` : ''}</div><div><div class="advantages"><h3>Преимущества объекта</h3><div>${advantages || '<span class="muted-copy">Дополнительные характеристики уточняются.</span>'}</div></div>${investmentHighlights ? `<div class="story-list investment"><h3>Ценность объекта</h3><ul>${investmentHighlights}</ul></div>` : ''}<div class="property-data">${rows}</div></div></div><div class="map">${item.mapImage ? `<img src="${safe(item.mapImage)}" alt="Карта расположения">` : ''}<div><span>📍 Расположение</span><strong>${safe(item.address || 'Адрес не указан')}</strong></div></div><footer><span>Объект ${i + 1} из ${properties.length}</span><span>${safe(agent.phone)}</span></footer></section>`;
  }).join('');
  const galleryPages = properties.map((item, i) => {
    const extraPhotos = item.photos.slice(6);
    if (!extraPhotos.length) return '';
    const photos = extraPhotos.map((photo: string) => `<img src="${safe(photo)}" alt="">`).join('');
    return `<section class="page gallery-page"><header class="property-header"><span>Галерея объекта ${i + 1}</span><b>${safe(agent.agency)}</b></header><div class="gallery-page-heading"><span class="eyebrow">Все фотографии</span><h2>${safe(item.title)}</h2><p>${safe(item.address)}</p></div><div class="gallery-all">${photos}</div><footer><span>${safe(item.title)}</span><span>${safe(agent.phone)}</span></footer></section>`;
  }).join('');
  const agentPage = `<section class="page agent-page">${logo}${agentPhoto}<h2>${safe(agent.name)}</h2><p>${safe(agent.role)}</p><div class="agent-contacts"><span><small>Телефон</small><strong>${safe(agent.phone)}</strong></span><span><small>Агентство</small><strong>${safe(agent.agency)}</strong></span></div><div class="agent-cta">Записаться на просмотр</div></section>`;
  const templatePath = path.join(process.cwd(), 'presentation-template.html');
  try {
    let html = fs.readFileSync(templatePath, 'utf-8');
    html = html.replace('__PRESET_CLASS__', presetClass).replace('__THEME_VARS__', vars).replace('__CONTENT__', cover + objectPages + galleryPages + agentPage);
    return html;
  } catch (e) {
    console.error('[Presentation] Template not found:', templatePath);
    return '<html><body><h1>Template not found</h1></body></html>';
  }
}

const WEB_THEMES = new Set(['light-minimal', 'midnight-gold', 'riviera-sand', 'ocean-blue', 'emerald-forest', 'slate-industrial']);

function cleanPropertyDescription(text: string) {
  return String(text || '').split(/\n+/).map(line => line.trim()).filter(line => line && !/^(?:[•·🔹🛌🚿🌅🏠🛁📍])?\s*(?:\d+[,.]?\d*\s*(?:кв\.?\s*м|м²|м2)|\d+\s*(?:комнат|спален|санузл|балкон|этаж|этажей))/i.test(line)).join('\n\n').trim();
}

async function enrichWebObjects(objects: any[], template: any) {
  const token = process.env.DEEPSEEK_API_KEY || '';
  const enriched = await Promise.all(objects.map(async (object: any) => {
    if (object.clean_description && object.location_summary && object.location_advantages?.length && object.address && object.address !== object.title) return object;
    try {
      const sourceAddress = object.address === object.title ? '' : object.address;
      const context = [object.title, sourceAddress, object.description, object.price, object.area, object.rooms, object.floor, object.year].filter(Boolean).join('. ');
      const prompt = `Ты редактор профессиональной презентации недвижимости в Грузии. Верни только JSON с полями title,property_type,country,city,district,address,price,price_gel,price_per_sqm,area,rooms,bedrooms,bathrooms,floor,year,status,status_line,project_label,project_subtitle,yield_percent,clean_description,location_title,location_description,location_advantages,key_specs,key_metrics,highlights,features. Страна всегда должна быть Georgia. Укажи город или населённый пункт, если он следует из текста; не подставляй другой город. Разделяй city, district и address строго. Извлеки все явно указанные характеристики в key_specs как массив объектов {label,value}: потолки, балкон, терраса, ремонт, отопление, паркинг, бассейн и другие. features — 3-8 преимуществ самого объекта, извлечённых из описания, без выдумывания. highlights — 3-6 коротких сильных преимуществ объекта. clean_description перепиши красиво в 2-3 абзаца, удалив из текста площадь, комнаты, спальни, санузлы, этаж и другие характеристики, которые будут показаны отдельными карточками. Для location_description опиши район и его сильные стороны: можно использовать общеизвестные сведения о найденном районе Грузии, но не выдумывай конкретные расстояния. location_advantages верни массив объектов {title,distance,subtitle}; distance оставляй пустым, если точного расстояния нет. key_metrics используй для 2-4 самых сильных цифр. Данные: ${context}`;
      const response = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 1600, response_format: { type: 'json_object' } }) });
      if (!response.ok) { console.warn(`[Presentation] DeepSeek web enrichment HTTP ${response.status}`); return object; }
      const data = await response.json();
      const message = data.choices?.[0]?.message || {};
      const parsed = extractJsonObject(message.content || '') || extractJsonObject(message.reasoning_content || '');
      console.log(`[Presentation] web enrichment ${object.title || 'object'}: ${parsed ? 'ok' : 'no-json'}`);
      const cleaned = parsed?.clean_description || parsed?.description || cleanPropertyDescription(object.description);
      const keySpecs = Array.isArray(parsed?.key_specs) ? parsed.key_specs : Object.entries(parsed?.key_specs || {}).map(([label, value]) => ({ label, value }));
      const locationAdvantages = Array.isArray(parsed?.location_advantages) ? parsed.location_advantages : parsed?.location_advantages ? [parsed.location_advantages] : [];
      const highlights = Array.isArray(parsed?.highlights) ? parsed.highlights : parsed?.highlights ? [parsed.highlights] : [];
      const features = Array.isArray(parsed?.features) ? parsed.features : parsed?.features ? [parsed.features] : [];
      return parsed ? { ...object, ...parsed, key_specs: keySpecs, location_advantages: locationAdvantages, highlights, features, address: parsed.address || sourceAddress, description: cleanPropertyDescription(cleaned) } : { ...object, address: sourceAddress, description: cleanPropertyDescription(object.description) };
    } catch (error: any) {
      console.warn(`[Presentation] web enrichment failed: ${error.message}`);
      return object;
    }
  }));
  return attachMapImages(enriched, template?.themeId || 'light-minimal');
}

function generateWebPresentationHTML(template: any, objects: any[], name: string, expiresAt?: string) {
  const themeId = WEB_THEMES.has(template?.themeId) ? template.themeId : 'light-minimal';
  const normalizedObjects = objects.map((object: any) => {
    const rawPhotos = object.photos || object.images || (object.image ? [object.image] : []);
    const photos = rawPhotos.map((photo: any, index: number) => typeof photo === 'string' ? { url: photo, caption: `${object.title || 'Объект'} · фото ${index + 1}` } : photo);
    const priceNumber = parseInt(String(object.price || '').replace(/[^\d]/g, ''), 10);
    const areaNumber = parseFloat(String(object.area || '').replace(',', '.'));
    return { ...object, photos, mapImage: object.mapImage || object.map_image || '', pricePerSqm: object.pricePerSqm || (priceNumber && areaNumber ? Math.round(priceNumber / areaNumber).toLocaleString() : '') };
  });
  const payload = {
    name,
    expiresAt: expiresAt || template?.shareExpiresAt || null,
    themeId,
    brand: {
      agency: template?.agency || '', name: template?.agentName || '', title: template?.agentPosition || '', phone: template?.agentPhone || '', avatar: template?.agentPhoto || '', whatsapp: template?.whatsapp || '',
    },
    objects: normalizedObjects,
  };
  const templatePath = path.join(process.cwd(), 'presentation-template.html');
  let html = fs.readFileSync(templatePath, 'utf-8');
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  return html.replace('__THEME_CLASS__', `theme-${themeId}`).replace('__PRESENTATION_JSON__', json);
}

function expiredShareHtml() {
  return '<!doctype html><html lang="ru"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ссылка истекла</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;color:#18181b;font:16px system-ui,sans-serif;text-align:center}main{padding:32px}h1{font-size:28px;margin:0 0 8px}p{color:#64748b}</style><main><h1>Ссылка больше не активна</h1><p>Срок действия подборки недвижимости истёк.</p></main></html>';
}

let plannerReminderTickRunning = false;
async function processPlannerReminders() {
  if (plannerReminderTickRunning) return;
  plannerReminderTickRunning = true;
  try {
    const now = new Date().toISOString();
    const { data: tasks, error } = await supabaseServer.from('planner_tasks').select('*').eq('done', false).not('remind_at', 'is', null).lte('remind_at', now);
    if (error || !tasks?.length) return;
    const seen = new Set<string>();
    for (const task of tasks) {
      const duplicateKey = `${task.user_id}|${task.remind_at}`;
      if (seen.has(duplicateKey)) {
        await supabaseServer.from('planner_tasks').update({ done: true }).eq('id', task.id);
        continue;
      }
      seen.add(duplicateKey);
      const session = await supabaseServer.from('platform_sessions').select('state').eq('user_id', task.user_id).eq('platform', 'telegram').maybeSingle();
      const chatId = session.data?.state?.chat_id;
      if (!chatId) continue;
      try {
        await sendTelegramMessage(String(chatId), `🔔 Напоминание Karty\n\n${task.text}`);
        await supabaseServer.from('planner_tasks').update({ done: true }).eq('id', task.id);
      } catch (sendError: any) {
        console.error(`[Planner] Telegram reminder failed for ${task.id}:`, sendError.message);
      }
    }
  } finally {
    plannerReminderTickRunning = false;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Start Python backend
  startPythonApi();

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  app.post('/api/cloudinary/upload', async (req, res) => {
    try {
      const { dataUrl, userId } = req.body;
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = process.env.CLOUDINARY_API_KEY;
      const apiSecret = process.env.CLOUDINARY_API_SECRET;
      const preset = process.env.CLOUDINARY_UPLOAD_PRESET;
      if (!dataUrl || !cloudName || !apiKey || !apiSecret || !preset) return res.status(503).json({ error: 'Cloudinary is not configured' });
      const timestamp = Math.floor(Date.now() / 1000);
      const folder = `karty/${String(userId || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      const signature = crypto.createHash('sha1').update(`folder=${folder}&timestamp=${timestamp}&upload_preset=${preset}${apiSecret}`).digest('hex');
      const form = new FormData();
      form.set('file', dataUrl);
      form.set('api_key', apiKey);
      form.set('timestamp', String(timestamp));
      form.set('folder', folder);
      form.set('upload_preset', preset);
      form.set('signature', signature);
      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: form });
      const result = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: result.error?.message || 'Cloudinary upload failed' });
      res.json({ url: result.secure_url, publicId: result.public_id, width: result.width, height: result.height });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Init Telegram Bot
  startBot();
  setInterval(processPlannerReminders, 60 * 1000);

  // API Routes
  app.get('/install.sh', (req, res) => {
    const script = `#!/bin/bash
echo "Installing Steel Browser on VPS..."

# Stop pm2 orchestrator if exists
pm2 stop browser-orchestrator || true
pm2 delete browser-orchestrator || true

# Pull latest
docker pull ghcr.io/steel-dev/steel-browser:latest

# Remove old container
docker rm -f steel-browser || true

# Run new container
docker run -d \\
  --name steel-browser \\
  --restart always \\
  -p 8080:3000 \\
  -e API_KEY=karty_secret \\
  -v steel-data:/app/data \\
  --shm-size=1gb \\
  ghcr.io/steel-dev/steel-browser:latest

echo "Steel Browser is running on port 8080"
`;
    res.type('text/plain').send(script);
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Proxy to Python API for parsing and publishing
  app.use(['/api/cookies/:userId', '/api/storage-state/:userId'], async (req, res, next) => {
    if (await requirePublishIdentity(req, res, String(req.params.userId || ''))) next();
  });
  app.use(
    ['/api/parse', '/api/cookies', '/api/storage-state'],
    createProxyMiddleware({
      target: 'http://127.0.0.1:8000',
      changeOrigin: true,
    })
  );

  // Start Auth Phase 1
  app.post('/api/auth/korter/start', async (req, res) => {
    const { userId, login } = req.body;
    if (!userId || !login) {
      return res.status(400).json({ error: 'userId and login are required' });
    }
    if (!(await requirePublishIdentity(req, res, userId))) return;
    
    console.log(`Starting login for Korter: ${userId}`);
    const result = await korterAuthManager.startLogin(userId, login);
    res.json(result);
  });

  // Verify Code Phase 2
  app.post('/api/auth/korter/verify', async (req, res) => {
    const { userId, code } = req.body;
    if (!userId || !code) {
      return res.status(400).json({ error: 'userId and code are required' });
    }
    if (!(await requirePublishIdentity(req, res, userId))) return;
    
    console.log(`Verifying code for Korter: ${userId}`);
    const result = await korterAuthManager.verifyCode(userId, code);
    res.json(result);
  });

  app.post('/api/auth/test-error', async (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.get('/api/auth/debug-sessions', async (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.post('/api/auth/generic/login', async (req, res) => {
    const { userId, siteKey, login, password } = req.body;
    if (!userId || !siteKey || !login || !password) {
      return res.status(400).json({ error: 'Missing parameters' });
    }
    if (!(await requirePublishIdentity(req, res, userId))) return;

    try {
      console.log(`[API] Generic login started for: ${siteKey}`);
      await AuthManager.loginWithPassword(userId, siteKey, login, password);
      res.json({ status: 'success' });
    } catch (error: any) {
      console.error('[API] /api/auth/generic/login Error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Remove Session API
  app.post('/api/auth/remove', async (req, res) => {
    const { userId, siteKey } = req.body;
    if (!userId || !siteKey) {
      return res.status(400).json({ error: 'userId and siteKey are required' });
    }
    if (!(await requirePublishIdentity(req, res, userId))) return;

    try {
      const { error } = await supabaseServer.from('platform_sessions').delete().eq('user_id', userId).eq('platform', siteKey);
      if (error) throw error;
      const site = SITE_MAP[siteKey] || siteKey;
      await fetch(`${PYTHON_API}/api/auth/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, site }),
      });
      res.json({ success: true, message: 'Session removed' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/auth/status', async (req, res) => {
    const { userId, siteKey } = req.body;
    const site = SITE_MAP[siteKey] || siteKey;
    if (!userId || !site) return res.status(400).json({ error: 'userId and siteKey are required' });
    if (!(await requirePublishIdentity(req, res, userId))) return;
    try {
      const response = await fetch(`${PYTHON_API}/api/auth/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, site }),
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error: any) {
      res.status(503).json({ status: 'unknown', error: error.message });
    }
  });

  app.post('/api/auth/balance', async (req, res) => {
    const { userId, siteKey } = req.body;
    const site = SITE_MAP[siteKey] || siteKey;
    if (!userId || !site) return res.status(400).json({ error: 'userId and siteKey are required' });
    if (!(await requirePublishIdentity(req, res, userId))) return;
    try {
      const response = await fetch(`${PYTHON_API}/api/auth/balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, site }),
      });
      res.status(response.status).json(await response.json());
    } catch (error: any) {
      res.status(503).json({ error: error.message });
    }
  });

  app.post('/api/promotion/preflight', async (req, res) => {
    const { userId, siteKey, listingUrl } = req.body;
    const site = SITE_MAP[siteKey] || siteKey;
    if (!userId || !site) return res.status(400).json({ error: 'userId and siteKey are required' });
    if (!(await requirePublishIdentity(req, res, userId))) return;
    try {
      const response = await fetch(`${PYTHON_API}/api/promotion/preflight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, site, listing_url: listingUrl || null }),
      });
      res.status(response.status).json(await response.json());
    } catch (error: any) {
      res.status(503).json({ error: error.message });
    }
  });

  const PYTHON_API = 'http://127.0.0.1:8000';
  const disabledPublishSites = new Set(
    (process.env.PUBLISH_DISABLED_SITES || '').split(',').map(site => site.trim()).filter(Boolean)
  );
  const isPublishSiteDisabled = (site: string) => disabledPublishSites.has(site);
  const publishMonitors = new Set<string>();

  async function updateListingPublication(data: {
    listingId: string;
    userId: string;
    platform: string;
    taskId?: string;
    status: string;
    url?: string | null;
    error?: string | null;
  }) {
    const { error } = await supabaseServer.from('listing_publications').upsert({
      listing_id: data.listingId,
      user_id: data.userId,
      platform: data.platform,
      task_id: data.taskId || null,
      status: data.status,
      listing_url: data.url || null,
      error_details: data.error || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'listing_id,platform' });
    if (error) console.warn(`[Publish state] ${data.listingId}/${data.platform}: ${error.message}`);
  }

  function monitorPublishTask(taskId: string, listingId: string, platforms: string | string[], userId: string, listing: any) {
    const monitorKey = `${taskId}:${listingId}`;
    if (publishMonitors.has(monitorKey)) return;
    publishMonitors.add(monitorKey);

    void (async () => {
      try {
        for (let attempt = 0; attempt < 180; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          const response = await fetch(`${PYTHON_API}/api/publish/${taskId}`);
          if (!response.ok) continue;
          const task = await response.json() as any;
          if (!['completed', 'failed', 'partial', 'publish_unknown'].includes(task.status)) continue;

          const selectedPlatforms = Array.isArray(platforms) ? platforms : [platforms];
          const siteResults = selectedPlatforms.map(platform => {
            const siteKey = platform === 'ssge' ? 'ss_ge' : platform === 'korter' ? 'korter_ge' : platform === 'myhome' ? 'myhome_ge' : platform;
            return { platform, result: task.results?.[siteKey] };
          });
          for (const item of siteResults) {
            if (item.result?.status !== 'success' && item.result?.fallback_eligible) {
              const portal = item.platform === 'ssge' ? 'ss.ge' : item.platform === 'korter' ? 'korter.ge' : item.platform === 'myhome' ? 'myhome.ge' : item.platform;
              try {
                const fallbackPayload = {
                  deal_type: listing.deal || 'sale',
                  property_type: listing.type || 'apartment',
                  price: Number(listing.price || 0),
                  currency: listing.currency || 'USD',
                  area_total: Number(listing.area || 0),
                  rooms: Number(listing.rooms || 0),
                  floor: listing.floor == null ? undefined : Number(listing.floor),
                  floors_total: listing.floors_total == null ? undefined : Number(listing.floors_total),
                  condition: listing.condition || undefined,
                  city_ru: listing.city || '',
                  city_ge: listing.city || '',
                  address_ru: listing.address || '',
                  address_ge: listing.address || '',
                  district: listing.district || '',
                  complex_name: listing.residential_complex || null,
                  description_ru: listing.description || '',
                  photos: listing.photo_urls || [],
                  contact_phone: listing.contact_phone || '',
                  portal_targets: [portal],
                } as any;
                const fallback = await executeSinglePortalFallback(userId, listingId, fallbackPayload, portal as any);
                if (fallback.success && fallback.listing_url) {
                  item.result = { status: 'success', url: fallback.listing_url, stage: 'skyvern_fallback' };
                }
              } catch (fallbackError: any) {
                console.error(`[Skyvern fallback] ${taskId}/${portal}:`, fallbackError.message);
              }
            }
          }
          const successful = siteResults.filter(item => item.result?.status === 'success');
          const failed = siteResults.filter(item => item.result?.status !== 'success');
          const unknown = failed.some(item => item.result?.error_code === 'PUBLISH_NOT_VERIFIED' || item.result?.stage === 'submit');
          const status = failed.length === 0
            ? 'published'
            : unknown
              ? 'publish_unknown'
              : successful.length
                ? 'partial'
                : 'error';
          const update: Record<string, any> = {
            status,
            error_details: status === 'published' ? null : failed.map(item => `${item.platform}: ${item.result?.user_message || item.result?.error || task.error || 'неизвестная ошибка'}`).join('\n'),
          };
          // === Auto-alert admin on critical publish errors ===
          const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;
          const criticalFailed = failed.filter(item => {
            const err = String(item.result?.error || '').toLowerCase();
            const code = item.result?.error_code || '';
            return code === 'BOT_PROTECTION' || err.includes('bot_protection') || err.includes('captcha') || err.includes('cloudflare')
              || err.includes('security') || err.includes('challenge');
          });
          if (ADMIN_CHAT_ID && criticalFailed.length > 0) {
            const siteNames: Record<string, string> = { ssge: 'SS.ge', korter: 'Korter.ge', myhome: 'MyHome.ge' };
            const alertLines = criticalFailed.map(item =>
              `🌐 ${siteNames[item.platform] || item.platform}: ${item.result?.error_code || 'BOT_PROTECTION'}\n   ${item.result?.error || 'неизвестная ошибка'}\n   скриншот: ${item.result?.screenshot_error || item.result?.screenshot_filled || 'нет'}`
            );
            const alertText = `🚨 Ошибка публикации — требуется вмешательство\n\n👤 Пользователь: ${userId}\n📋 Объект: ${listing.title || listing.description?.slice(0, 50) || listingId}\n🆔 Task: ${taskId}\n\n${alertLines.join('\n\n')}\n\n⚠️ Юзер не может решить это самостоятельно — нужно ручное вмешательство администратора.`;
            sendTelegramMessage(ADMIN_CHAT_ID, alertText).catch((e: any) => console.error('[Admin alert] Failed:', e.message));
          }
           const listingUrls = Object.fromEntries(successful.filter(item => item.result?.url).map(item => [item.platform, item.result.url]));
           await Promise.all(siteResults.map(item => updateListingPublication({
             listingId,
             userId,
             platform: item.platform,
             taskId,
             status: item.result?.status === 'success' ? 'published' : (item.result?.error_code === 'PUBLISH_NOT_VERIFIED' ? 'publish_unknown' : 'failed'),
             url: item.result?.url,
             error: item.result?.user_message || item.result?.error,
           })));
           if (Object.keys(listingUrls).length) {
            const { data: currentListing } = await supabaseServer.from('listings').select('listing_urls').eq('id', listingId).maybeSingle();
            update.listing_urls = { ...(currentListing?.listing_urls || {}), ...listingUrls };
          }
          await supabaseServer.from('listings').update(update).eq('id', listingId);
          return;
        }
        await supabaseServer.from('listings').update({
          status: 'publish_unknown',
          error_details: 'Монитор публикации превысил 15 минут. Проверьте кабинеты площадок вручную.',
        }).eq('id', listingId);
      } catch (error: any) {
        console.error(`[Publish monitor] ${taskId}:`, error.message);
      } finally {
        publishMonitors.delete(monitorKey);
      }
    })();
  }

  async function recoverPublishMonitors() {
    const { data: publications, error } = await supabaseServer
      .from('listing_publications')
      .select('*')
      .eq('status', 'processing');
    if (error) {
      console.warn(`[Publish recovery] ${error.message}`);
      return;
    }
    for (const publication of publications || []) {
      if (!publication.task_id) continue;
      const { data: listing } = await supabaseServer.from('listings').select('*').eq('id', publication.listing_id).maybeSingle();
      if (!listing) continue;
      monitorPublishTask(
        publication.task_id,
        publication.listing_id,
        publication.platform,
        publication.user_id,
        { ...listing, photo_urls: listing.images || [] },
      );
    }
  }

  // Site key mapping: frontend site name → Python API site name
  const SITE_MAP: Record<string, string> = {
    'korter': 'korter_ge',
    'ssge': 'ss_ge',
    'ss.ge': 'ss_ge',
    'myhome': 'myhome_ge',
    'myhome.ge': 'myhome_ge',
    'realting': 'realting_com',
    'realting.com': 'realting_com',
  };

  function preflightListing(listing: any, site: string, photos: string[] = []) {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (isPublishSiteDisabled(site)) errors.push('площадка временно отключена');
    if (!listing.price || listing.price <= 0) errors.push('цена');
    if (!listing.area || listing.area <= 0) errors.push('площадь');
    if (!['sale', 'rent'].includes(listing.deal)) errors.push('тип сделки');
    if (!['apartment', 'house', 'land', 'commercial'].includes(listing.type)) errors.push('тип недвижимости');
    if (!listing.city?.trim()) errors.push('город');
    if (!listing.address?.trim()) errors.push('адрес');
    if (!listing.description || listing.description.trim().length < 10) errors.push('описание');
    if (!photos.length) errors.push('фотографии');
    const required = (fields: Array<[string, any]>) => fields.forEach(([label, value]) => { if (value === undefined || value === null || value === '' || value === 0) errors.push(label); });
    if (site === 'ss_ge' && listing.type === 'apartment') required([['количество комнат', listing.rooms], ['спальни', listing.bedrooms], ['этаж', listing.floor], ['этажность', listing.floors_total]]);
    if (site === 'ss_ge' && listing.type === 'house') required([['количество комнат', listing.rooms], ['спальни', listing.bedrooms], ['площадь двора', listing.yard_area]]);
    if (site === 'myhome_ge' && listing.type === 'apartment') required([['количество комнат', listing.rooms], ['этаж', listing.floor], ['этажность', listing.floors_total]]);
    if (site === 'myhome_ge' && listing.type === 'house') required([['количество комнат', listing.rooms], ['спальни', listing.bedrooms], ['этажность', listing.floors_total]]);
    if (site === 'myhome_ge' && listing.type === 'commercial') required([['количество комнат', listing.rooms], ['этаж', listing.floor], ['этажность', listing.floors_total]]);
    if (site === 'korter_ge' && listing.type === 'apartment') required([['количество комнат', listing.rooms], ['спальни', listing.bedrooms], ['этаж', listing.floor], ['этажность', listing.floors_total]]);
    if (site === 'korter_ge' && listing.type === 'house') required([['количество комнат', listing.rooms], ['спальни', listing.bedrooms], ['этажность', listing.floors_total]]);
    if (site === 'korter_ge' && listing.type === 'commercial') required([['этаж', listing.floor], ['этажность', listing.floors_total]]);
    if (site === 'korter_ge' && photos.length < 3) errors.push('минимум 3 фотографии для Korter');
    return { site, ready: errors.length === 0, errors, warnings };
  }

  app.post('/api/publish/preflight', async (req, res) => {
    const { text, parsedData, photos = [], sites = ['ss_ge', 'myhome_ge', 'korter_ge'], userId } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'text is required' });
    if (!userId || !(await requirePublishIdentity(req, res, userId))) return;
    const listing = buildListingForPublish(text, parsedData);
    const localChecks = sites.map((site: string) => preflightListing(listing, SITE_MAP[site] || site, photos));
    if (!userId) return res.status(400).json({ error: 'userId is required', listing, checks: localChecks });
    try {
      const response = await fetch(`${PYTHON_API}/api/publish/preflight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, sites: sites.map((site: string) => SITE_MAP[site] || site), listing: { ...listing, photo_urls: photos }, photos }),
      });
      const remote = await response.json();
      const uniqueMessages = (items: string[]) => [...new Map(items.filter(Boolean).map(item => [item.toLowerCase(), item])).values()];
      const checks = (remote.checks || []).map((check: any) => {
        const local = localChecks.find(item => item.site === check.site);
        return { ...check, errors: uniqueMessages([...(local?.errors || []), ...(check.errors || [])]), warnings: uniqueMessages([...(local?.warnings || []), ...(check.warnings || [])]) };
      });
      return res.status(response.status).json({ listing, ready: remote.ready && checks.every((check: any) => check.ready), checks });
    } catch (error: any) {
      return res.status(503).json({ error: `Не удалось проверить площадки: ${error.message}`, listing, checks: localChecks });
    }
  });

  // Publish to individual site via Python API
  app.post('/api/publish/korter', async (req, res) => {
    try {
      const { userId, objectId, text, photos, parsedData, telegramChatId, telegramUsername } = req.body;
      if (!userId || !objectId || !text) {
        return res.status(400).json({ error: 'userId, objectId and text are required' });
      }
      if (!(await requirePublishIdentity(req, res, userId))) return;
      console.log(`[Publish] korter for user=${userId} object=${objectId}`);

      const listing = buildListingForPublish(text, parsedData);
      const check = preflightListing(listing, 'korter_ge', photos || []);
      if (!check.ready) return res.status(422).json({ error: `Не хватает данных для Korter: ${check.errors.join(', ')}`, preflight: check });
      listing.photo_urls = photos || [];
      listing.contact_name = 'Даниэль';

      const resp = await fetch(`${PYTHON_API}/api/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, telegram_chat_id: telegramChatId, telegram_username: telegramUsername, listing_id: objectId, idempotency_key: `${objectId}:korter_ge`, sites: ['korter_ge'], listing }),
      });
       const result = await resp.json();
       if (!resp.ok || !result.task_id) return res.status(resp.status || 502).json({ error: result.detail || result.error || 'Python publish API failed' });
       void updateListingPublication({ listingId: objectId, userId, platform: 'korter', taskId: result.task_id, status: 'processing' });
       monitorPublishTask(result.task_id, objectId, 'korter', userId, listing);
       res.json({ status: 'started', task_id: result.task_id });
    } catch (e: any) {
      console.error('[Publish/korter] Error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/publish/ssge', async (req, res) => {
    try {
      const { userId, objectId, text, photos, parsedData, telegramChatId, telegramUsername } = req.body;
      if (!userId || !objectId || !text) {
        return res.status(400).json({ error: 'userId, objectId and text are required' });
      }
      if (!(await requirePublishIdentity(req, res, userId))) return;
      console.log(`[Publish] ssge for user=${userId} object=${objectId}`);

      const listing = buildListingForPublish(text, parsedData);
      const check = preflightListing(listing, 'ss_ge', photos || []);
      if (!check.ready) return res.status(422).json({ error: `Не хватает данных для SS.ge: ${check.errors.join(', ')}`, preflight: check });
      listing.photo_urls = photos || [];
      listing.contact_name = 'Даниэль';

      const resp = await fetch(`${PYTHON_API}/api/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, telegram_chat_id: telegramChatId, telegram_username: telegramUsername, listing_id: objectId, idempotency_key: `${objectId}:ss_ge`, sites: ['ss_ge'], listing }),
      });
       const result = await resp.json();
       if (!resp.ok || !result.task_id) return res.status(resp.status || 502).json({ error: result.detail || result.error || 'Python publish API failed' });
       void updateListingPublication({ listingId: objectId, userId, platform: 'ssge', taskId: result.task_id, status: 'processing' });
       monitorPublishTask(result.task_id, objectId, 'ssge', userId, listing);
       res.json({ status: 'started', task_id: result.task_id });
    } catch (e: any) {
      console.error('[Publish/ssge] Error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/publish/myhome', async (req, res) => {
    try {
      const { userId, objectId, text, photos, parsedData, telegramChatId, telegramUsername } = req.body;
      if (!userId || !objectId || !text) {
        return res.status(400).json({ error: 'userId, objectId and text are required' });
      }
      if (!(await requirePublishIdentity(req, res, userId))) return;
      console.log(`[Publish] myhome for user=${userId} object=${objectId}`);

      const listing = buildListingForPublish(text, parsedData);
      const check = preflightListing(listing, 'myhome_ge', photos || []);
      if (!check.ready) return res.status(422).json({ error: `Не хватает данных для MyHome: ${check.errors.join(', ')}`, preflight: check });
      listing.photo_urls = photos || [];
      listing.contact_name = 'Даниэль';

      const resp = await fetch(`${PYTHON_API}/api/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, telegram_chat_id: telegramChatId, telegram_username: telegramUsername, listing_id: objectId, idempotency_key: `${objectId}:myhome_ge`, sites: ['myhome_ge'], listing }),
      });
       const result = await resp.json();
       if (!resp.ok || !result.task_id) return res.status(resp.status || 502).json({ error: result.detail || result.error || 'Python publish API failed' });
       void updateListingPublication({ listingId: objectId, userId, platform: 'myhome', taskId: result.task_id, status: 'processing' });
       monitorPublishTask(result.task_id, objectId, 'myhome', userId, listing);
       res.json({ status: 'started', task_id: result.task_id });
    } catch (e: any) {
      console.error('[Publish/myhome] Error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/publish/realting', async (req, res) => {
    return res.status(410).json({ error: 'Realting publication is disabled' });
    /*
    try {
      const { userId, objectId, text, photos, parsedData } = req.body;
      if (!userId || !objectId || !text) {
        return res.status(400).json({ error: 'userId, objectId and text are required' });
      }
      console.log(`[Publish] realting for user=${userId} object=${objectId}`);

      const listing = buildListingForPublish(text, parsedData);
      const check = preflightListing(listing, 'realting_com', photos || []);
      if (!check.ready) return res.status(422).json({ error: `Не хватает данных для Realting: ${check.errors.join(', ')}`, preflight: check });
      listing.photo_urls = photos || [];
      listing.contact_name = 'Даниэль';

      const resp = await fetch(`${PYTHON_API}/api/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, listing_id: objectId, idempotency_key: `${objectId}:realting_com`, sites: ['realting_com'], listing }),
      });
      const result = await resp.json();
      if (!resp.ok || !result.task_id) return res.status(resp.status || 502).json({ error: result.detail || result.error || 'Python publish API failed' });
       monitorPublishTask(result.task_id, objectId, 'realting', userId, listing);
       res.json({ status: 'started', task_id: result.task_id });
    } catch (e: any) {
      console.error('[Publish/realting] Error:', e.message);
      res.status(500).json({ error: e.message });
    }
    */
  });

  // Publish to multiple sites at once
  app.post('/api/publish/auto', async (req, res) => {
    try {
      const { userId, objectId, text, photos, portals, parsedData } = req.body;
      if (!userId || !objectId || !text || !portals) {
        return res.status(400).json({ error: 'userId, objectId, text, and portals are required' });
      }
      if (!(await requirePublishIdentity(req, res, userId))) return;
      if (!(await requireListingOwner(res, objectId, userId))) return;
      console.log(`[Publish/auto] user=${userId} portals=${portals.join(',')}`);

      const listing = buildListingForPublish(text, parsedData);
      listing.photo_urls = photos || [];
      listing.contact_name = 'Даниэль';

      const sites = portals.map((p: string) => SITE_MAP[p] || p);
      if (sites.some(site => site === 'realting_com')) {
        return res.status(410).json({ error: 'Realting publication is disabled' });
      }
      const checks = sites.map((site: string) => preflightListing(listing, site, photos || []));
      const failedChecks = checks.filter(check => !check.ready);
      if (failedChecks.length) return res.status(422).json({ error: failedChecks.map(check => `${check.site}: ${check.errors.join(', ')}`).join('; '), preflight: checks });
      const resp = await fetch(`${PYTHON_API}/api/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, listing_id: objectId, idempotency_key: `${objectId}:${sites.slice().sort().join(',')}`, sites, listing }),
      });
      const result = await resp.json();
      if (!resp.ok || !result.task_id) return res.status(resp.status || 502).json({ error: result.detail || result.error || 'Python publish API failed' });
       monitorPublishTask(result.task_id, objectId, portals, userId, listing);
       res.json({ status: 'started', task_id: result.task_id });
    } catch (e: any) {
      console.error('[Publish/auto] Error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Poll publish status via Python API
  app.get('/api/publish/:taskId/status', async (req, res) => {
    try {
      const resp = await fetch(`${PYTHON_API}/api/publish/${req.params.taskId}`);
      const data = await resp.json();
      const authenticatedUserId = await getAuthenticatedUserId(req, res);
      if (!authenticatedUserId) return;
      if (!resp.ok) return res.status(resp.status).json(data);
      if (!data?.user_id || data.user_id !== authenticatedUserId) {
        return res.status(403).json({ error: 'Пользователь не имеет доступа к этой задаче' });
      }
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Helper: parse free-text listing into structured format for Python API
  function parseTextToListing(text: string): any {
    const listing: any = {
      deal: 'sale',
      type: 'apartment',
      price: 0,
      currency: 'USD',
      area: 0,
      address: '',
      city: '',
      description: text,
      contact_name: 'Даниэль',
    };

    // Try to extract deal type
    const lower = text.toLowerCase();
    if (lower.includes('аренд') || lower.includes('сдаёт') || lower.includes('сдаю')) {
      listing.deal = 'rent';
    }

    // Try to extract property type
    if (/(^|[\s,.:;!?()\[\]{}])(?:квартир\w*|апартамент\w*|студи\w*)(?=$|[\s,.:;!?()\[\]{}])/i.test(text)) listing.type = 'apartment';
    else if (/(^|[\s,.:;!?()\[\]{}])(?:дом\w*|house)(?=$|[\s,.:;!?()\[\]{}])/i.test(text)) listing.type = 'house';
    else if (/(^|[\s,.:;!?()\[\]{}])(?:земл\w*|участ\w*|land)(?=$|[\s,.:;!?()\[\]{}])/i.test(text)) listing.type = 'land';
    else if (/(^|[\s,.:;!?()\[\]{}])(?:коммерц\w*|офис\w*|магазин\w*|commercial)(?=$|[\s,.:;!?()\[\]{}])/i.test(text)) listing.type = 'commercial';

    // Try to extract price
    const priceMatch = text.match(/(\d[\d\s,.]*)\s*(USD|GEL|\$|₾)/i);
    if (priceMatch) {
      listing.price = parseInt(priceMatch[1].replace(/[\s,.]/g, ''));
      if (priceMatch[2] === '$') listing.currency = 'USD';
      else if (priceMatch[2] === '₾') listing.currency = 'GEL';
      else listing.currency = priceMatch[2];
    }

    // Try to extract area
    const areaMatch = text.match(/(\d+)\s*м[²2]/i);
    if (areaMatch) listing.area = parseInt(areaMatch[1]);

    // Try to extract address
    const addrMatch = text.match(/(ул\.?\s*[^,]+,\s*\d+)/i);
    if (addrMatch) listing.address = addrMatch[1];

    return listing;
  }

  function buildListingForPublish(text: string, parsed: any = null): any {
    const listing = parseTextToListing(text);
    const number = (value: any) => { const normalized = String(value ?? '').replace(/[^\d,.]/g, '').replace(',', '.'); const result = Number(normalized); return Number.isFinite(result) ? result : 0; };
    if (!parsed) return listing;
    if (!parsed.dealType) listing.deal = '';
    if (!parsed.propertyType) listing.type = '';
    const deal = String(parsed.dealType || '').toLowerCase();
    const type = String(parsed.propertyType || '').toLowerCase();
    if (deal.includes('аренд')) listing.deal = 'rent';
    else if (deal.includes('прод')) listing.deal = 'sale';
    if (type.includes('кварт') || type.includes('апарт') || type.includes('студи')) listing.type = 'apartment';
    else if (type.includes('дом') || type.includes('house')) listing.type = 'house';
    else if (type.includes('зем') || type.includes('участ')) listing.type = 'land';
    else if (type.includes('коммерц') || type.includes('офис') || type.includes('магаз')) listing.type = 'commercial';
    if (number(parsed.price) > 0) listing.price = Math.round(number(parsed.price));
    if (number(parsed.area) > 0) listing.area = number(parsed.area);
    if (parsed.currency) listing.currency = String(parsed.currency).toUpperCase() === 'GEL' || String(parsed.currency).includes('₾') ? 'GEL' : 'USD';
    if (parsed.address) listing.address = parsed.address;
    if (parsed.city) listing.city = parsed.city;
    if (parsed.district) listing.district = parsed.district;
    if (number(parsed.rooms) > 0) listing.rooms = Math.round(number(parsed.rooms));
    if (number(parsed.bedrooms) > 0) listing.bedrooms = Math.round(number(parsed.bedrooms));
    if (number(parsed.floor) > 0) listing.floor = Math.round(number(parsed.floor));
    if (number(parsed.floorCount) > 0) listing.floors_total = Math.round(number(parsed.floorCount));
    if (number(parsed.yard_area) > 0) listing.yard_area = Math.round(number(parsed.yard_area));
    if (number(parsed.land_area) > 0) listing.land_area = Math.round(number(parsed.land_area));
    if (listing.city && listing.address && !listing.address.toLowerCase().includes(listing.city.toLowerCase())) listing.address = `${listing.city}, ${listing.address}`;
    return listing;
  }

  function validateListingForPublish(listing: any) {
    const missing: string[] = [];
    if (!listing.price || listing.price <= 0) missing.push('цена');
    if (!listing.area || listing.area <= 0) missing.push('площадь');
    if (!listing.address?.trim()) missing.push('адрес');
    if (listing.type === 'apartment' && !listing.city?.trim()) missing.push('город');
    return missing;
  }

  // Parse Listing with deepseek (legacy)
  app.post('/api/parse-listing', async (req, res) => {
    if (!(await getAuthenticatedUserId(req, res))) return;
    const { text, styleId } = req.body;
    if (!text) return res.json(null);
    const result = await parseListingWithDeepSeek(text, styleId);
    res.json(result);
  });

  // ── Realtor Parser endpoints ──

  // Parser scheduler state is persisted by the Python parser runtime.
  let parserSchedulerActive = false;
  let parserSchedulerInterval: NodeJS.Timeout | null = null;
  let parserSchedulerLastRunDate = '';
  const DAILY_PARSE_HOUR = 22;

  function tbilisiNow() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tbilisi',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date());
    const get = (type: string) => parts.find(part => part.type === type)?.value || '';
    return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')), minute: Number(get('minute')) };
  }

  async function runScheduledParser() {
    if (!parserSchedulerActive) return;
    const now = tbilisiNow();
    if (now.hour !== DAILY_PARSE_HOUR || now.minute !== 0 || parserSchedulerLastRunDate === now.date) return;
    try {
      const healthResponse = await fetch(`${PYTHON_API}/api/parse/health`);
      const health = await healthResponse.json() as any;
      const activeTask = (health.tasks || []).some((task: any) =>
        ['running', 'in_progress', 'stalled'].includes(task.status)
      );
      if (activeTask) {
        console.log('[Scheduler] Skipping daily parse because another parser task is active');
        return;
      }
      const response = await fetch(`${PYTHON_API}/api/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'daily', sites: ['korter', 'ssge'], max_per_site: 200 }),
      });
      const result = await response.json();
      if (!response.ok) {
        console.warn(`[Scheduler] Daily parse was not started: ${result.detail || result.error || response.status}`);
        return;
      }
      parserSchedulerLastRunDate = now.date;
      console.log(`[Scheduler] Daily parse started: task_id=${result.task_id}`);
    } catch (e: any) {
      console.error('[Scheduler] Daily parse error:', e.message);
    }
  }

  async function configureParserScheduler(active: boolean, persist = true) {
    parserSchedulerActive = !!active;
    if (persist) {
      await fetch(`${PYTHON_API}/api/parse/scheduler`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: parserSchedulerActive, interval_hours: 24 }),
      });
    }
    if (parserSchedulerInterval) {
      clearInterval(parserSchedulerInterval);
      parserSchedulerInterval = null;
    }
    if (!parserSchedulerActive) {
      console.log('[Scheduler] Daily parser deactivated');
      return;
    }
    console.log('[Scheduler] Daily parser activated — runs every day at 22:00 Asia/Tbilisi');
    parserSchedulerInterval = setInterval(() => { void runScheduledParser(); }, 30 * 1000);
  }

  app.get('/api/realtors/scheduler', authMiddleware, async (_req, res) => {
    try {
      const response = await fetch(`${PYTHON_API}/api/parse/scheduler`);
      const state = await response.json();
      parserSchedulerActive = !!state.active;
      res.json(state);
    } catch (e: any) {
      res.status(503).json({ active: parserSchedulerActive, error: e.message });
    }
  });

  app.post('/api/realtors/scheduler', authMiddleware, async (req, res) => {
    try {
      await configureParserScheduler(!!req.body.active);
      res.json({ active: parserSchedulerActive, interval_hours: 24, daily_time: '22:00', timezone: 'Asia/Tbilisi' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Start realtor parsing (daily or full mode)
  const parseTaskMeta = new Map<string, { mode: string; sites: string[] }>();
  app.post('/api/realtors/run', authMiddleware, async (req, res) => {
    try {
      const { mode = 'daily', sites: requestedSites = ['korter', 'ssge'], max_per_site, skip_categories = [] } = req.body;
      const sites = (Array.isArray(requestedSites) ? requestedSites : ['korter', 'ssge'])
        .filter((site: string) => site === 'korter' || site === 'ssge');
      if (!sites.length) return res.status(400).json({ error: 'At least one supported site is required' });
      // Default: daily=200, full=2000
      const effectiveMax = max_per_site || (mode === 'full' ? 2000 : 200);
      console.log(`[Parser] Starting ${mode} parse for sites: ${sites.join(',')}, max_per_site=${effectiveMax}`);
      const resp = await fetch(`${PYTHON_API}/api/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, sites, max_per_site: effectiveMax, skip_categories }),
      });
      const data = await resp.json();
      if (data.task_id) parseTaskMeta.set(data.task_id, { mode, sites });
      res.json(data);
    } catch (e: any) {
      console.error('[Parser] Error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Poll parser status
  const seenParseTasks = new Set<string>();
  app.use('/api/realtors/status/:taskId', async (req, res) => {
    try {
      const resp = await fetch(`${PYTHON_API}/api/parse/${req.params.taskId}`);
      const data = await resp.json();
      // Save completed/failed tasks to history (once)
      if ((data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') && !seenParseTasks.has(req.params.taskId)) {
        seenParseTasks.add(req.params.taskId);
        const meta = parseTaskMeta.get(req.params.taskId) || { mode: 'unknown', sites: [] };
        parseHistory.push({
          mode: meta.mode,
          sites: meta.sites,
          realtors_found: data.realtors_found || 0,
          total_in_db: data.total_in_db || 0,
          timestamp: new Date().toISOString(),
          status: data.status,
        });
        if (parseHistory.length > 50) parseHistory.splice(0, parseHistory.length - 50);
      }
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/realtors/health', authMiddleware, async (_req, res) => {
    try {
      const response = await fetch(`${PYTHON_API}/api/parse/health`);
      res.status(response.status).json(await response.json());
    } catch (e: any) {
      res.status(503).json({ error: e.message });
    }
  });

  app.get('/api/realtors/report/:taskId', authMiddleware, async (req, res) => {
    try {
      const response = await fetch(`${PYTHON_API}/api/parse/report/${req.params.taskId}`);
      res.status(response.status).json(await response.json());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Cancel parser task
  app.post('/api/realtors/cancel/:taskId', authMiddleware, async (req, res) => {
    try {
      const resp = await fetch(`${PYTHON_API}/api/parse/${req.params.taskId}/cancel`, {
        method: 'POST',
      });
      const data = await resp.json();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Resume parser task
  app.post('/api/realtors/resume/:taskId', authMiddleware, async (req, res) => {
    try {
      const resp = await fetch(`${PYTHON_API}/api/parse/${req.params.taskId}/resume`, {
        method: 'POST',
      });
      const data = await resp.json();
      if (data.task_id) parseTaskMeta.set(data.task_id, { mode: 'full', sites: ['korter', 'ssge'] });
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Parse history — stored in-memory in Node.js
  const parseHistory: Array<{mode: string; sites: string[]; realtors_found: number; total_in_db: number; timestamp: string; status: string}> = [];
  app.get('/api/realtors/history', authMiddleware, async (_req, res) => {
    try {
      const response = await fetch(`${PYTHON_API}/api/parse/history`);
      res.status(response.status).json(await response.json());
    } catch (e: any) {
      res.status(503).json({ history: parseHistory.slice(-20).reverse(), error: e.message });
    }
  });

  // Category-level progress for the parser grid UI
  app.get('/api/realtors/categories/:taskId', authMiddleware, async (req, res) => {
    try {
      const response = await fetch(`${PYTHON_API}/api/realtors/categories/${req.params.taskId}`);
      res.status(response.status).json(await response.json());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // List realtors from DB
  app.use('/api/realtors/list', async (req, res) => {
    try {
      const { source, min_listings = 0, limit = 50 } = req.query;
      let url = `${PYTHON_API}/api/realtors?limit=${limit}`;
      if (source) url += `&source=${source}`;
      if (min_listings) url += `&min_listings=${min_listings}`;
      const resp = await fetch(url);
      res.json(await resp.json());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Realtor stats
  app.use('/api/realtors/stats', async (req, res) => {
    try {
      const resp = await fetch(`${PYTHON_API}/api/realtors/stats`);
      res.json(await resp.json());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // === Listings: Delete & Republish ===
  app.post('/api/listings/delete', async (req, res) => {
    try {
      if (!req.body?.user_id || !(await requirePublishIdentity(req, res, req.body.user_id))) return;
      if (!req.body?.listing_id || !(await requireListingOwner(res, req.body.listing_id, req.body.user_id))) return;
      const resp = await fetch(`${PYTHON_API}/api/listings/delete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      const result = await resp.json();
      await Promise.all((req.body.platforms || []).map((platform: string) => {
        const item = result.results?.[platform] || {};
        return updateListingPublication({ listingId: req.body.listing_id, userId: req.body.user_id, platform, status: item.success ? 'deleted' : 'delete_failed', url: item.url || null, error: item.error || null });
      }));
      res.status(resp.status).json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/listings/republish', async (req, res) => {
    try {
      const ownerId = req.body?.listing_data?.user_id;
      if (!ownerId || !(await requirePublishIdentity(req, res, ownerId))) return;
      if (!req.body?.listing_id || !(await requireListingOwner(res, req.body.listing_id, ownerId))) return;
      const resp = await fetch(`${PYTHON_API}/api/listings/republish`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      res.json(await resp.json());
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // === Presentations & Planner ===

  app.post('/api/planner/register-telegram', async (req, res) => {
    const { userId, chatId } = req.body;
    if (!userId || !chatId) return res.status(400).json({ error: 'userId and chatId are required' });
    if (!(await requirePublishIdentity(req, res, userId))) return;
    const result = await supabaseServer.from('platform_sessions').upsert({ user_id: userId, platform: 'telegram', state: { chat_id: String(chatId) } });
    if (result.error) return res.status(500).json({ error: result.error.message });
    res.json({ success: true });
  });

  app.post('/api/planner/parse-task', async (req, res) => {
    try {
      const { text, now } = req.body;
      if (!text?.trim()) return res.status(400).json({ error: 'text is required' });
      if (!(await getAuthenticatedUserId(req, res))) return;
      const token = process.env.DEEPSEEK_API_KEY || '';
      const prompt = `Разбери русскую заметку риэлтора в задачу и время напоминания. Текущая дата и время: ${now || new Date().toISOString()} (часовой пояс Asia/Tbilisi). Верни только JSON: {"task":"что нужно сделать кратко","remind_at":"ISO 8601 в часовом поясе Asia/Tbilisi или null"}. Понимай: сегодня, завтра, послезавтра, через N дней, в понедельник, 15 числа, 15.08, в 14:30. Если дата/время не указаны, remind_at=null. Не выдумывай дату. Текст: ${text}`;
      const response = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature: 0, max_tokens: 300, response_format: { type: 'json_object' } }) });
      if (!response.ok) return res.status(502).json({ error: 'DeepSeek unavailable' });
      const data = await response.json();
      const message = data.choices?.[0]?.message || {};
      const parsed = extractJsonObject(message.content || '') || extractJsonObject(message.reasoning_content || '');
      res.json(parsed || { task: text.trim(), remind_at: null });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Generate PDF presentation
  app.post('/api/presentations/generate', async (req, res) => {
    try {
      const { template, objects, name } = req.body;
      if (!objects?.length) return res.status(400).json({ error: 'No objects provided' });
      return res.status(410).json({ error: 'PDF generation is disabled. Use /api/presentations/share.' });

      // DeepSeek auto-enrichment: fill missing + clean description
      const enriched = await Promise.all(objects.map(async (obj: any) => {
        // Always enrich: fill missing fields AND clean description
        if (!obj.title && !obj.description && !obj.address) return obj;
        console.log(`[Presentation] DEEPSEEK enriching: "${(obj.title || '').substring(0, 30)}"`);

        try {
          const context = [obj.title, obj.address, obj.description, obj.price, `${obj.area || ''} м²`, `${obj.rooms || ''} комн`, `${obj.floor || ''}`, `${obj.year || ''}`].filter(Boolean).join('. ');
          const prompt = `Ты редактор премиальной real-estate презентации. Извлеки факты из описания объекта и подготовь структурированные данные для слайдов. Верни ТОЛЬКО JSON.

Данные: ${context}

Верни JSON с полями:
- title: короткое название объекта, максимум 8 слов
- address: точный адрес или район, только если он есть в данных
- price: цена с валютой
- area: площадь в формате "60 м²"
- rooms: только число комнат
- floor: этаж в формате "5/12"
- year: год постройки, только число
- status: "В продаже" или "В аренду"
- description: редакторское описание на 2-3 предложения, без повторения цены, площади, комнат и этажа
- features: 3-6 подтверждённых характеристик самого объекта, без выдумывания
- location_summary: одно короткое предложение о локации только на основе упомянутого адреса/района
- location_advantages: 2-4 преимущества локации. Используй только факты из текста; если фактов нет, верни []
- investment_highlights: 2-3 коротких пункта о ценности/инвестиционном потенциале только если это следует из текста; иначе []
- key_metrics: массив из 2-4 объектов {"label":"...","value":"..."} для крупных цифр на слайде

Правило: не придумывай расстояния, станции, инфраструктуру, доходность или видовые характеристики. Если данных недостаточно — оставляй поле пустым или массив пустым. Верни ТОЛЬКО валидный JSON.`;

          const resp = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY || ''}` },
            body: JSON.stringify({ model: 'deepseek-v4-flash', messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 1200, response_format: { type: 'json_object' } }),
          });

          console.log(`[Presentation] DEEPSEEK resp: ${resp.status}`);
          if (!resp.ok) {
            console.error(`[Presentation] DEEPSEEK API error: ${resp.status}`);
            return obj;
          }
          const data = await resp.json();
          const msg = data.choices?.[0]?.message;
          console.log(`[Presentation] DEEPSEEK msg: content=${(msg?.content||'').length} reasoning=${(msg?.reasoning_content||'').length}`);
          // deepseek-v4-flash uses thinking mode — content may be empty, reasoning has the answer
          const rawContent = msg?.content || '';
          const reasoning = msg?.reasoning_content || '';
          const parsed = extractJsonObject(rawContent) || extractJsonObject(reasoning);
          console.log(`[Presentation] DEEPSEEK json: ${parsed ? 'found' : 'NOT FOUND'}`);
          if (!parsed) return obj;
          console.log(`[Presentation] DEEPSEEK OK: "${obj.title || 'object'}" features=${parsed.features?.length || 0}`);
          // Always use DeepSeek description (it cleans redundant data)
          // Features: only fill if empty
          const merged = { ...obj };
          if (parsed.description) merged.description = parsed.description;
          if (parsed.features && (!obj.features || obj.features.length === 0)) merged.features = parsed.features;
          if (parsed.status) merged.status = parsed.status;
          for (const key of ['location_summary', 'location_advantages', 'investment_highlights', 'key_metrics']) {
            if (parsed[key]) merged[key] = parsed[key];
          }
          // Fill missing fields
          for (const [k, v] of Object.entries(parsed)) {
            if (v && !merged[k] && k !== 'description' && k !== 'features' && k !== 'status') merged[k] = v;
          }
          return merged;
        } catch (e: any) {
          console.error(`[Presentation] DEEPSEEK FAIL for "${obj.title}": ${e.message?.substring(0, 100)}`);
          return obj;
        }
      }));

      // Download and convert images to base64 data URIs for reliable Puppeteer rendering
      async function downloadImageAsDataUri(url: string): Promise<string> {
        if (!url || url.startsWith('data:')) return url;
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const resp = await fetch(url, { signal: controller.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
          clearTimeout(timeout);
          if (!resp.ok) return url;
          const buffer = Buffer.from(await resp.arrayBuffer());
          const ext = url.match(/\.(\w{3,4})(\?|$)/)?.[1] || 'jpg';
          const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
          return `data:${mime};base64,${buffer.toString('base64')}`;
        } catch (e) {
          console.warn(`[Presentation] Failed to download image: ${url.substring(0, 60)}...`);
          return url;
        }
      }

      // Download all images in parallel
      const allImageUrls = enriched.flatMap((obj: any) => [...(obj.images || []), obj.image || '']).filter((url: string) => !!url && !url.startsWith('data:'));
      const uniqueUrls = [...new Set(allImageUrls)];
      console.log(`[Presentation] Downloading ${uniqueUrls.length} images...`);
      const imageMap = new Map<string, string>();
      await Promise.all(uniqueUrls.map(async (url: string) => {
        imageMap.set(url, await downloadImageAsDataUri(url));
      }));

      // Replace URLs in enriched objects with data URIs
      for (const obj of enriched) {
        if (obj.images) {
          obj.images = obj.images.map((url: string) => imageMap.get(url) || url);
        }
        if (obj.image) obj.image = imageMap.get(obj.image) || obj.image;
      }
      const mappedObjects = await attachMapImages(enriched, template?.presetId || 'investment-bold');

      // Generate HTML for PDF
      const html = generatePresentationHTML(template, mappedObjects, name);

      // Use Puppeteer to generate PDF
      let puppeteer: any;
      try {
        puppeteer = await import('puppeteer-core');
      } catch {
        // Fallback: return HTML for client-side generation
        console.log('[Presentation] puppeteer-core not available, returning HTML');
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
        return;
      }

      const chromiumPath = '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';
      console.log(`[Presentation] Starting PDF generation for "${name}" with ${objects.length} objects`);

      const browser = await puppeteer.default.launch({
        headless: true,
        executablePath: chromiumPath,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      });
      console.log('[Presentation] Browser launched');

      const page = await browser.newPage();
      await page.setViewport({ width: 794, height: 1123 }); // A4 at 96dpi
      console.log('[Presentation] Setting content...');
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });
      // Wait for images to render
      await new Promise(r => setTimeout(r, 4000));
      console.log('[Presentation] Content set, waiting for images...');

      // Wait for all <img> to load
      await page.evaluate(() => {
        return Promise.all(Array.from(document.images).map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            const timeout = setTimeout(resolve, 15000);
            img.onload = () => { clearTimeout(timeout); resolve(null); };
            img.onerror = () => { clearTimeout(timeout); resolve(null); };
          });
        }));
      });
      // Let CSS settle after images load
      await new Promise(r => setTimeout(r, 1000));
      await new Promise(r => setTimeout(r, 2000)); // Extra settle time
      console.log('[Presentation] Generating PDF...');
      const pdf = await page.pdf({ format: 'A4', printBackground: true, timeout: 60000 });
      console.log(`[Presentation] PDF generated: ${pdf.length} bytes`);
      await browser.close();

      // Convert Buffer to Uint8Array for proper sending
      const pdfBuffer = Buffer.from(pdf);
      const safeName = (name || 'presentation').replace(/[^a-zA-Z0-9_-]/g, '_');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', pdfBuffer.length);
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"; filename*=UTF-8''${encodeURIComponent(name || 'presentation')}.pdf`);
      res.end(pdfBuffer);
      console.log('[Presentation] PDF sent successfully');
    } catch (e: any) {
      console.error('[Presentation] Error:', e.message, e.stack);
      res.status(500).json({ error: e.message });
    }
  });

  // Generate preview HTML (for iframe embedding — pixel-perfect to PDF)
  app.post('/api/presentations/preview-html', async (req, res) => {
    try {
      const { template, objects, name } = req.body;
      if (!objects?.length) return res.status(400).json({ error: 'No objects provided' });
      const enrichedWebObjects = await enrichWebObjects(objects, template);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(generateWebPresentationHTML(template, enrichedWebObjects, name || 'Preview'));

      // Download images
      async function downloadImageAsDataUri(url: string): Promise<string> {
        if (!url || url.startsWith('data:')) return url;
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const resp = await fetch(url, { signal: controller.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
          clearTimeout(timeout);
          if (!resp.ok) return url;
          const buffer = Buffer.from(await resp.arrayBuffer());
          const ext = url.match(/\.(\w{3,4})(\?|$)/)?.[1] || 'jpg';
          const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
          return `data:${mime};base64,${buffer.toString('base64')}`;
        } catch { return url; }
      }

      const enriched = await Promise.all(objects.map(async (obj: any) => {
        if (obj.location_summary || obj.key_metrics?.length || (!obj.description && !obj.title && !obj.address)) return obj;
        try {
          const context = [obj.title, obj.address, obj.description, obj.price, obj.area, obj.rooms, obj.floor, obj.year].filter(Boolean).join('. ');
          const prompt = `Подготовь данные для слайда презентации недвижимости. Верни только JSON с полями title,address,price,area,rooms,floor,year,status,description,features,location_summary,location_advantages,investment_highlights,key_metrics. Не выдумывай факты, расстояния, инфраструктуру или доходность. Описание: ${context}`;
      const ai = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY || ''}` }, body: JSON.stringify({ model: 'deepseek-v4-flash', messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 900, response_format: { type: 'json_object' } }) });
          if (!ai.ok) return obj;
          const response = await ai.json();
          const message = response.choices?.[0]?.message || {};
          const parsed = extractJsonObject(message.content || '') || extractJsonObject(message.reasoning_content || '');
          return parsed ? { ...obj, ...parsed, description: parsed.description || obj.description, features: obj.features?.length ? obj.features : parsed.features } : obj;
        } catch { return obj; }
      }));
      const allImageUrls = enriched.flatMap((obj: any) => [...(obj.images || []), obj.image || '']).filter((url: string) => !!url && !url.startsWith('data:'));
      const uniqueUrls = [...new Set(allImageUrls)];
      const imageMap = new Map<string, string>();
      await Promise.all(uniqueUrls.map(async (url: string) => {
        imageMap.set(url, await downloadImageAsDataUri(url));
      }));
      for (const obj of enriched) {
        if (obj.images) obj.images = obj.images.map((url: string) => imageMap.get(url) || url);
        if (obj.image) obj.image = imageMap.get(obj.image) || obj.image;
      }

      const mappedObjects = await attachMapImages(enriched, template?.presetId || 'investment-bold');
      const html = generatePresentationHTML(template, mappedObjects, name);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/presentations/share', async (req, res) => {
    try {
      const { userId, template, objects, name } = req.body;
      if (!userId || !objects?.length) return res.status(400).json({ error: 'userId and at least one object are required' });
      const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      const enrichedObjects = await enrichWebObjects(objects, template);
      const shareTemplate = { ...template, themeId: WEB_THEMES.has(template?.themeId) ? template.themeId : 'light-minimal', shareExpiresAt: expiresAt };
      // Share data lives in the existing presentations JSON columns, avoiding a second table and keeping the 3-day expiry check server-side.
      const created = await supabaseServer.from('presentations').insert({ user_id: userId, name: name || 'Подборка недвижимости', template: shareTemplate, objects: enrichedObjects }).select('id').single();
      if (created.error || !created.data) return res.status(500).json({ error: created.error?.message || 'Share storage failed' });
      const forwardedProto = String(req.headers['x-forwarded-proto'] || req.protocol).split(',')[0];
      const baseUrl = process.env.PUBLIC_APP_URL || `${forwardedProto}://${req.get('host')}`;
      res.json({ url: `${baseUrl}/p/${created.data.id}`, expiresAt: expiresAt });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // === DeepSeek: parse listing text into structured object ===
  app.post('/api/presentations/parse-listing', async (req, res) => {
    try {
      const { text, url } = req.body;
      if (!text && !url) return res.status(400).json({ error: 'text or url required' });

      const prompt = `Разбери описание объекта недвижимости и верни JSON с полями:
- title: краткое название (напр "2-комнатная квартира в Ваке")
- address: адрес
- price: цена (с символом валюты, напр "$120 000" или "350 000 ₾")
- pricePerM: цена за м² (если можно рассчитать)
- area: площадь в м² (только число + "м²")
- rooms: количество комнат (только число)
- floor: этаж (формат "5/12")
- year: год постройки
- description: описание (2-3 предложения, без эмодзи)
- features: массив особенностей (напр ["Панорамные окна", "Паркинг"])
- location_summary: короткое описание локации только по фактам из текста
- location_advantages: массив преимуществ локации или [] если фактов нет
- investment_highlights: массив инвестиционных преимуществ или [] если фактов нет
- key_metrics: массив объектов {"label":"...","value":"..."} для крупных цифр
- status: "В продаже" или "В аренду"

Не выдумывай расстояния, инфраструктуру, доходность и видовые характеристики. Если данных нет, используй пустые массивы.

Верни ТОЛЬКО валидный JSON без markdown fences.

Текст: ${text || ''}${url ? '\nURL: ' + url : ''}`;

      const resp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY || ''}`,
        },
        body: JSON.stringify({
          model: 'deepseek-v4-flash',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 500,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error('[DeepSeek] API error:', resp.status, errText.substring(0, 200));
        return res.status(500).json({ error: 'DeepSeek API error' });
      }

      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content || '';
      // Extract JSON from response (may be wrapped in markdown fences)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return res.status(500).json({ error: 'No JSON in response', raw: content });

      const parsed = JSON.parse(jsonMatch[0]);
      res.json(parsed);
    } catch (e: any) {
      console.error('[DeepSeek] Error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/p/:id', async (req, res) => {
    try {
      const result = await supabaseServer.from('presentations').select('template,objects,name').eq('id', req.params.id).single();
      if (result.error || !result.data) return res.status(404).send(expiredShareHtml());
      const template = result.data.template || {};
      const expiresAt = template.shareExpiresAt;
      if (!expiresAt || Date.now() >= new Date(expiresAt).getTime()) return res.status(410).send(expiredShareHtml());
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(generateWebPresentationHTML(template, result.data.objects || [], result.data.name, expiresAt));
    } catch {
      res.status(410).send(expiredShareHtml());
    }
  });

  // Session freshness checker — validates cookies every 30 minutes
  setInterval(async () => {
    try {
      const { data: sessions } = await supabaseServer
        .from('platform_sessions')
        .select('id, platform, user_id, state, created_at');

      if (!sessions || sessions.length === 0) return;

      for (const session of sessions) {
        try {
          const state = session.state as any;
          const cookies = state?.cookies || [];
          if (cookies.length === 0) continue;

          // Check if cookies are older than 7 days
          const createdAt = new Date(session.created_at);
          const daysSince = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

          if (daysSince > 7) {
            console.log(`[Session] ${session.platform} session for user ${session.user_id} is ${Math.floor(daysSince)} days old — may need refresh`);
          }
        } catch {}
      }
    } catch (e: any) {
      console.error('[Session] Check error:', e.message);
    }
  }, 30 * 60 * 1000); // Every 30 minutes

  // === CRM Auth ===
  const sessions = new Map<string, { userId: string; role: string; name: string; login: string; expiresAt: number }>();

  function authMiddleware(req: any, res: any, next: any) {
    const authorization = String(req.headers.authorization || '');
    const token = authorization.replace(/^Bearer\s+/i, '').trim();
    let session = token ? sessions.get(token) : null;
    if (!session && token) {
      session = loadCrmSession(token);
      if (session) sessions.set(token, session);
    }
    if (!session || Date.now() >= session.expiresAt) {
      console.warn(`[CRM auth] Rejected ${req.method} ${req.path}; token_present=${!!token}; token_length=${token.length}`);
      if (token) {
        sessions.delete(token);
        deleteCrmSession(token);
      }
      return res.status(401).json({ error: 'Session expired' });
    }
    req.crmUser = session;
    next();
  }

  function adminOnly(req: any, res: any, next: any) {
    if (req.crmUser?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    next();
  }

  app.post('/api/crm/login', (req, res) => {
    const { login, password } = req.body;
    if (!login || !password) return res.status(400).json({ error: 'login and password required' });
    const user = crmLogin(login, password);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const token = crypto.randomUUID();
    const session = { userId: user.id, name: user.name, login: user.login, role: user.role, expiresAt: Date.now() + 8 * 60 * 60 * 1000 };
    sessions.set(token, session);
    saveCrmSession(token, user, session.expiresAt);
    res.json({ token, user });
  });

  app.post('/api/crm/logout', authMiddleware, (req: any, res) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (token) {
      sessions.delete(token);
      deleteCrmSession(token);
    }
    res.json({ ok: true });
  });

  app.get('/api/crm/session', authMiddleware, (req: any, res) => {
    res.json({ user: req.crmUser });
  });

  app.get('/api/crm/managers', authMiddleware, adminOnly, (_req, res) => {
    res.json({ managers: listManagers() });
  });

  app.post('/api/crm/managers', authMiddleware, adminOnly, (req, res) => {
    const { name, login, password, role } = req.body;
    if (!name || !login || !password) return res.status(400).json({ error: 'name, login, password required' });
    try {
      const mgr = addManager(name, login, password, role || 'manager');
      res.json(mgr);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/crm/managers/:id', authMiddleware, adminOnly, (req, res) => {
    const ok = deleteManager(req.params.id);
    res.json({ success: ok });
  });

  app.get('/api/crm/leads', authMiddleware, async (req: any, res) => {
    try {
      const sourceResponse = await fetch(`${PYTHON_API}/api/realtors?limit=5000`);
      if (!sourceResponse.ok) return res.status(502).json({ error: `Realtor source API returned ${sourceResponse.status}` });
      const sourceData = await sourceResponse.json();
      for (const realtor of sourceData.realtors || []) if (Number(realtor.listings_count || 0) >= 20) syncRealtorLead(realtor);
      removeUnqualifiedRealtorLeads(20);
      const showAll = req.query.all === 'true';
      const pool = req.query.pool === 'true';
      const all = showAll ? listLeads(req.query.status as string) : pool ? listLeads(req.query.status as string).filter((lead: any) => !lead.manager_id) : listLeads(req.query.status as string, req.crmUser?.role === 'admin' ? undefined : req.crmUser?.userId);
      res.json({ leads: all });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch('/api/crm/leads/:id', authMiddleware, async (req: any, res) => {
    const lead = listLeads('all').find((item: any) => item.id === req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (req.crmUser?.role !== 'admin' && lead.manager_id && lead.manager_id !== req.crmUser.userId) return res.status(403).json({ error: 'Lead assigned to another manager' });
    const updated = updateLead(req.params.id, req.body);
    if (req.body.status && req.body.status !== lead.status) addLeadEvent(req.params.id, 'status_changed', req.crmUser.userId, { from: lead.status, to: req.body.status });
    if (req.body.manager_id !== undefined && req.body.manager_id !== lead.manager_id) addLeadEvent(req.params.id, 'assigned', req.crmUser.userId, { manager_id: req.body.manager_id });
    res.json({ lead: updated });
  });

  app.post('/api/crm/leads/:id/claim', authMiddleware, (req: any, res) => {
    if (req.crmUser.role === 'admin') return res.status(400).json({ error: 'Admin does not claim leads' });
    const result = claimLead(req.params.id, req.crmUser.userId);
    if (!result.lead) return res.status(404).json({ error: 'Lead not found' });
    if (!result.claimed && result.lead.manager_id !== req.crmUser.userId) return res.status(409).json({ error: 'Lead already belongs to another manager' });
    res.json(result);
  });

  app.get('/api/crm/leads/:id/events', authMiddleware, (req, res) => res.json({ events: listLeadEvents(req.params.id) }));

  app.post('/api/crm/leads/:id/referral-link', authMiddleware, (req: any, res) => {
    const lead = listLeads('all').find((item: any) => item.id === req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (req.crmUser.role !== 'admin' && lead.manager_id && lead.manager_id !== req.crmUser.userId) return res.status(403).json({ error: 'Lead assigned to another manager' });
    const managerId = req.crmUser.role === 'admin' ? (req.body.manager_id || lead.manager_id || req.crmUser.userId) : req.crmUser.userId;
    const token = createReferralLink(managerId, req.body.campaign || 'crm-lead', lead.id);
    updateLead(lead.id, { manager_id: lead.manager_id || managerId });
    addLeadEvent(lead.id, 'referral_link_created', managerId, { token, campaign: req.body.campaign || 'crm-lead' });
    const base = process.env.APP_URL || 'https://t.me/KartyBot';
    res.json({ token, url: `${base}?start=ref_${token}` });
  });

  app.post('/api/crm/leads/:id/greetings', authMiddleware, async (req: any, res) => {
    const lead = getLead(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (req.crmUser?.role !== 'admin' && lead.manager_id && lead.manager_id !== req.crmUser.userId) return res.status(403).json({ error: 'Lead assigned to another manager' });
    const result = await generateGreetingVariants(lead, req.crmUser.userId, process.env.TELEGRAM_BOT_USERNAME || 'KartyBot');
    addLeadEvent(lead.id, 'greetings_generated', req.crmUser.userId, { token: result.token });
    res.json(result);
  });

  app.post('/api/crm/translate', authMiddleware, async (req, res) => {
    try {
      const { text, from, to } = req.body;
      if (!text?.trim() || !from || !to) return res.status(400).json({ error: 'text, from and to are required' });
      if (from === to) return res.json({ translation: text });
      const token = process.env.DEEPSEEK_API_KEY;
      const languages: Record<string, string> = { ru: 'русский', en: 'английский', ka: 'грузинский' };
      const source = from === 'auto' ? 'определи автоматически (грузинский, английский или русский)' : (languages[from] || from);
      const response = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ model: 'deepseek-chat', temperature: 0.05, max_tokens: 800, messages: [{ role: 'user', content: `Переведи сообщение с ${source} на ${languages[to] || to}. Сначала точно определи язык, затем переведи естественно и дословно по смыслу. Не добавляй пояснений, не меняй имена, числа, адреса и валюты. Верни только перевод.\n\n${text}` }] }) });
      if (!response.ok) return res.status(502).json({ error: 'Translation service unavailable' });
      const data = await response.json();
      res.json({ translation: data.choices?.[0]?.message?.content?.trim() || text });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post('/api/attribution/track', async (req, res) => {
    const { telegramUserId, name, username, referralToken, event } = req.body;
    if (!telegramUserId) return res.status(400).json({ error: 'telegramUserId is required' });
    const leadId = upsertTelegramLead(String(telegramUserId), name || '', username || '', referralToken?.replace(/^ref_/, ''));
    addLeadEvent(leadId, event || 'mini_app_opened', undefined, { referral_token: referralToken || null });
    res.json({ success: true, lead_id: leadId });
  });

  app.post('/api/attribution/usage', async (req, res) => {
    const { telegramUserId, event } = req.body;
    if (!telegramUserId) return res.status(400).json({ error: 'telegramUserId is required' });
    const lead = listLeads('all').find((item: any) => item.telegram_user_id === String(telegramUserId));
    if (!lead) return res.status(404).json({ error: 'Attributed lead not found' });
    const usage = recordLeadUsage(lead.id, 1);
    if (event) addLeadEvent(lead.id, event, lead.manager_id, { usage });
    res.json({ success: true, usage });
  });

  app.post('/api/cryptomus/webhook', (req, res) => {
    const apiKey = process.env.CRYPTOMUS_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Cryptomus is not configured yet' });
    const payment = { ...(req.body || {}) };
    const received = String(req.headers.sign || payment.sign || '');
    delete payment.sign;
    const encoded = Buffer.from(JSON.stringify(payment)).toString('base64');
    const expected = crypto.createHash('md5').update(encoded + apiKey).digest('hex');
    if (!received || received.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))) return res.status(401).json({ error: 'Invalid Cryptomus signature' });
    const referralToken = payment.metadata?.referral_token;
    const referral = referralToken ? getReferralLink(referralToken) as any : null;
    recordPayment({ cryptomus_uuid: payment.uuid, order_id: payment.order_id, lead_id: referral?.lead_id, manager_id: referral?.manager_id, status: payment.status, amount: payment.amount, currency: payment.currency, referral_token: referralToken, payload: payment });
    if (referral?.lead_id && ['paid', 'paid_over'].includes(payment.status)) updateLead(referral.lead_id, { status: 'paid', manager_id: referral.manager_id });
    res.json({ received: true });
  });

  // === CRM Chats ===
  app.get('/api/crm/chats', authMiddleware, (req: any, res) => {
    const managerId = req.crmUser.role === 'admin' ? req.query.manager_id as string : req.crmUser.userId;
    res.json({ chats: getChats(managerId) });
  });

  app.post('/api/crm/chats', authMiddleware, (req: any, res) => {
    const { client_phone, client_name, platform, manager_id } = req.body;
    if (!client_phone || !platform) return res.status(400).json({ error: 'client_phone and platform required' });
    const chatId = `${platform === 'whatsapp' ? 'wa' : 'tg'}_${client_phone}`;
    upsertChat({
      chat_id: chatId,
      client_phone,
      client_name: client_name || 'Client',
       manager_id: manager_id || req.crmUser?.userId || 'pending',
      platform,
      last_message_text: '',
      last_message_timestamp: new Date().toISOString(),
    });
    res.json({ chat_id: chatId });
  });

  app.get('/api/crm/chats/:chatId/messages', authMiddleware, (req, res) => {
    const chat = getChat(req.params.chatId);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    if ((req as any).crmUser.role !== 'admin' && chat.manager_id !== (req as any).crmUser.userId) return res.status(403).json({ error: 'Chat assigned to another manager' });
    res.json({ messages: getMessages(req.params.chatId) });
  });

  app.post('/api/crm/chats/:chatId/messages', authMiddleware, (req: any, res) => {
    const { text, sender } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });
    const ts = addMessage(req.params.chatId, sender || 'manager', text);
    res.json({ success: true, timestamp: ts });
  });

  app.post('/api/crm/chats/:chatId/read', authMiddleware, (req, res) => {
    const chat = getChat(req.params.chatId);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    if ((req as any).crmUser.role !== 'admin' && chat.manager_id !== (req as any).crmUser.userId) return res.status(403).json({ error: 'Chat assigned to another manager' });
    markRead(req.params.chatId);
    res.json({ success: true });
  });

  app.post('/api/crm/chats/:chatId/assign', authMiddleware, adminOnly, (req, res) => {
    const { manager_id } = req.body;
    assignChat(req.params.chatId, manager_id);
    res.json({ success: true });
  });

  app.get('/api/crm/accounts', authMiddleware, (req: any, res) => {
    const rows = getAccounts() as any[];
    if (req.crmUser?.role === 'admin') return res.json({ accounts: rows });
    // Managers get a safe read-only view: enough to send messages, no secrets.
    res.json({ accounts: rows.map(a => ({ id: a.id, platform: a.platform, account_name: a.account_name, manager_id: a.manager_id })) });
  });

  app.post('/api/crm/accounts', authMiddleware, adminOnly, (req, res) => {
    const { platform, account_name, bot_token, chatwoot_url, chatwoot_token } = req.body;
    if (!platform || !account_name) return res.status(400).json({ error: 'platform and account_name required' });
    const acct = addAccount(platform, account_name, bot_token, chatwoot_url, chatwoot_token);
    res.json(acct);
  });

  app.delete('/api/crm/accounts/:id', authMiddleware, adminOnly, (req, res) => {
    deleteAccount(req.params.id);
    res.json({ success: true });
  });

  // === Telegram Userbot ===
  const USERBOT_API = 'http://127.0.0.1:8001';

  app.post('/api/crm/accounts/tg/request-code', authMiddleware, adminOnly, async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ error: 'phone required' });
      const resp = await fetch(`${USERBOT_API}/request_code`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      res.json(await resp.json());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/crm/accounts/tg/confirm', authMiddleware, adminOnly, async (req, res) => {
    try {
      const { phone, code, account_name } = req.body;
      if (!phone || !code || !account_name) return res.status(400).json({ error: 'phone, code, account_name required' });
      const resp = await fetch(`${USERBOT_API}/confirm_code`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code, account_name }),
      });
      const result = await resp.json();
      // Save session string to DB if successful
      if (result.success && result.session_string) {
        const d = getDb();
        d.prepare('UPDATE chat_accounts SET session_string = ? WHERE account_name = ?').run(result.session_string, account_name);
      }
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/crm/accounts/start', authMiddleware, adminOnly, async (req, res) => {
    try {
      const { session_string, account_name } = req.body;
      if (!session_string || !account_name) return res.status(400).json({ error: 'session_string and account_name required' });
      const resp = await fetch(`${USERBOT_API}/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_string, account_name }),
      });
      res.json(await resp.json());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/crm/accounts/dialogs/:accountName', authMiddleware, async (req, res) => {
    try {
      const resp = await fetch(`${USERBOT_API}/dialogs/${req.params.accountName}?limit=30`);
      res.json(await resp.json());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/crm/chats/:chatId/send', authMiddleware, async (req: any, res) => {
    try {
      const { text, account_name } = req.body;
      const chatId = req.params.chatId;
      if (!text || !account_name) return res.status(400).json({ error: 'text and account_name required' });
      const chat = getChat(chatId);
      if (!chat) return res.status(404).json({ error: 'Chat not found' });
      if (req.crmUser.role !== 'admin' && chat.manager_id !== req.crmUser.userId) return res.status(403).json({ error: 'Chat assigned to another manager' });

      // Send via Telegram userbot
      if (chatId.startsWith('tg_')) {
        const resp = await fetch(`${USERBOT_API}/send`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account_name, peer: chatId.replace('tg_', ''), text }),
        });
        const result = await resp.json();
        if (!result.success) return res.status(500).json({ error: result.error });
      } else if (chatId.startsWith('wa_')) {
        return res.status(501).json({ error: 'WhatsApp sending requires Chatwoot conversation mapping' });
      }
      const messageTimestamp = addMessage(chatId, 'manager', text);
      const lead = findLeadByChat(chatId);
      if (lead) addLeadEvent(lead.id, 'manager_message_sent', req.crmUser.userId, { chat_id: chatId, platform: chatId.startsWith('tg_') ? 'telegram' : 'whatsapp' });
      res.json({ success: true, timestamp: messageTimestamp });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/crm/accounts/:id/assign', authMiddleware, adminOnly, (req, res) => {
    const { manager_id } = req.body;
    const d = getDb();
    d.prepare('UPDATE chat_accounts SET manager_id = ? WHERE id = ?').run(manager_id, req.params.id);
    res.json({ success: true });
  });

  // === Telegram Parser ===
  const tgProxyRoutes = ['chats', 'accounts', 'stats', 'status', 'users'];
  for (const route of tgProxyRoutes) {
    app.get(`/api/tg/${route}`, authMiddleware, async (req, res) => {
      try {
        const resp = await fetch(`${PYTHON_API}/api/tg/${route}${req.url.includes('?') ? '?' + req.url.split('?')[1] : ''}`);
        res.status(resp.status).json(await resp.json());
      } catch (e: any) { res.status(500).json({ error: e.message }); }
    });
  }
  async function syncTelegramCandidates(minMessages = 30) {
    const response = await fetch(`${PYTHON_API}/api/tg/leads?min_messages=${minMessages}`);
    const data = await response.json() as any;
    if (!response.ok) throw new Error(data.error || `Telegram leads API returned ${response.status}`);
    const leads = (data.leads || []).map((item: any) => {
      const metadata = {
        message_count: Number(item.message_count || 0),
        // CRM qualification/display is based on chat activity, not classifier hits.
        listings_count: Number(item.message_count || 0),
        recognized_listings_count: Number(item.listing_count || 0),
        listing_urls: item.listing_urls || '[]',
        listing_samples: item.listing_samples || '[]',
        source_chat: item.source_chat || '',
      };
      const leadId = upsertTelegramLead(String(item.user_id), item.name || '', item.username || '', undefined, metadata);
      return { ...item, lead_id: leadId };
    });
    removeUnqualifiedTelegramLeads(30);
    return leads;
  }

  app.get('/api/tg/leads', authMiddleware, async (req, res) => {
    try {
      const minMessages = Number(req.query.min_messages ?? 30);
      const leads = await syncTelegramCandidates(Number.isFinite(minMessages) ? minMessages : 30);
      res.json({ leads });
    } catch (e: any) { res.status(503).json({ error: e.message }); }
  });
  setInterval(() => { void syncTelegramCandidates().catch(error => console.warn('[Telegram leads] Sync failed:', error.message)); }, 5 * 60 * 1000);
  app.post('/api/tg/chats', authMiddleware, adminOnly, async (req, res) => {
    try { const resp = await fetch(`${PYTHON_API}/api/tg/chats`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) }); res.status(resp.status).json(await resp.json()); } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.delete('/api/tg/chats/:chatId', authMiddleware, adminOnly, async (req, res) => {
    try { const resp = await fetch(`${PYTHON_API}/api/tg/chats/${req.params.chatId}`, { method: 'DELETE' }); res.status(resp.status).json(await resp.json()); } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/tg/accounts/login', authMiddleware, adminOnly, async (req, res) => {
    try { const resp = await fetch(`${PYTHON_API}/api/tg/accounts/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) }); res.status(resp.status).json(await resp.json()); } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/tg/accounts/confirm', authMiddleware, adminOnly, async (req, res) => {
    try { const resp = await fetch(`${PYTHON_API}/api/tg/accounts/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) }); res.status(resp.status).json(await resp.json()); } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/tg/start', authMiddleware, adminOnly, async (req, res) => {
    try { const resp = await fetch(`${PYTHON_API}/api/tg/start`, { method: 'POST' }); res.status(resp.status).json(await resp.json()); } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/tg/scan', authMiddleware, adminOnly, async (req, res) => {
    try { const resp = await fetch(`${PYTHON_API}/api/tg/scan`, { method: 'POST' }); res.status(resp.status).json(await resp.json()); } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Vite middleware for development (skip API routes)
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      return vite.middlewares(req, res, next);
    });
  } else {
    // Production serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  let schedulerRestored = false;
  for (let attempt = 1; attempt <= 12 && !schedulerRestored; attempt++) {
    try {
      const schedulerResponse = await fetch(`${PYTHON_API}/api/parse/scheduler`);
      const schedulerState = await schedulerResponse.json() as any;
      await configureParserScheduler(!!schedulerState.active, false);
      schedulerRestored = true;
    } catch (error: any) {
      console.warn(`[Scheduler] Could not restore persisted state (attempt ${attempt}/12): ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  await recoverPublishMonitors();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
