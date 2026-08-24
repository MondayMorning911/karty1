import { Property } from './types';

const proxyUrl = (url: string) => '/api/proxy?url=' + encodeURIComponent(url);

export const MOCK_PROPERTIES: Property[] = [
  {
    id: '1',
    title: 'Апартаменты Orbi City',
    price: '4 500 000 ₽',
    address: 'Грузия, Батуми, ул. Шерифа Химшиашвили, 15',
    description: 'Панорамный вид на море и поющие фонтаны. Апартаменты полностью укомплектованы премиальной мебелью и техникой. Отличный вариант как для жизни, так и для сдачи в аренду.',
    specs: { beds: 1, baths: 1, sqft: 45 },
    images: [
      proxyUrl('https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=1000'),
      proxyUrl('https://images.unsplash.com/photo-1502672260266-1c1c2c49e5d1?auto=format&fit=crop&q=80&w=1000')
    ],
    mapUrl: proxyUrl('https://static-maps.yandex.ru/1.x/?ll=41.611,41.642&size=600,300&z=16&l=map&pt=41.611,41.642,pm2rdm')
  },
  {
    id: '2',
    title: 'Пентхаус Alliance Palace',
    price: '12 800 000 ₽',
    address: 'Грузия, Батуми, просп. Руставели, 10',
    description: 'Эксклюзивный пентхаус на 41 этаже с просторной террасой. Система "Умный дом", дизайнерский ремонт. Инфраструктура 5-звездочного отеля: бассейн, спа, фитнес, ресторан.',
    specs: { beds: 3, baths: 2, sqft: 120 },
    images: [
      proxyUrl('https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&q=80&w=1000'),
      proxyUrl('https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=1000')
    ],
    mapUrl: proxyUrl('https://static-maps.yandex.ru/1.x/?ll=41.625,41.650&size=600,300&z=16&l=map&pt=41.625,41.650,pm2rdm')
  },
  {
    id: '3',
    title: 'Вилла в Зеленом Мысе',
    price: '35 000 000 ₽',
    address: 'Грузия, Батуми, Зеленый Мыс',
    description: 'Роскошная вилла в экологически чистом районе рядом с Ботаническим садом. Свой бассейн, сад с субтропическими растениями, вид на Черное море и горы.',
    specs: { beds: 4, baths: 3, sqft: 250 },
    images: [
      proxyUrl('https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&q=80&w=1000'),
      proxyUrl('https://images.unsplash.com/photo-1600607686527-6fb886090705?auto=format&fit=crop&q=80&w=1000')
    ],
    mapUrl: proxyUrl('https://static-maps.yandex.ru/1.x/?ll=41.710,41.696&size=600,300&z=15&l=map&pt=41.710,41.696,pm2rdm')
  }
];

export const PRESET_COLORS = [
  { primary: '#000000', secondary: '#F1F5F9' }, // Classic Black / Slate 100
  { primary: '#2563EB', secondary: '#DBEAFE' }, // Royal Blue / Blue 100
  { primary: '#0F172A', secondary: '#E2E8F0' }, // Slate Dark / Slate 200
  { primary: '#059669', secondary: '#D1FAE5' }, // Emerald / Emerald 100
  { primary: '#7C3AED', secondary: '#EDE9FE' }, // Violet / Violet 100
  { primary: '#B45309', secondary: '#FEF3C7' }, // Amber / Amber 100
];

export const FONTS = [
  { name: 'Inter', class: 'font-sans' },
  { name: 'Space Grotesk', class: 'font-display' },
  { name: 'Playfair Display', class: 'font-serif' },
];
