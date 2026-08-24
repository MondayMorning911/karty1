export type TabType = 'create' | 'presentations' | 'planner' | 'history' | 'auth';

export interface Presentation {
  id: string;
  user_id: string;
  name: string;
  template: PresentationTemplate;
  objects: PresentationObject[];
  created_at: string;
  updated_at: string;
}

export interface PresentationTemplate {
  themeId: PresentationThemeId;
  coverHeadline?: string;
  watermark?: string;
  agentName: string;
  agentPosition: string;
  agency: string;
  agentPhone: string;
  agentPhoto: string;
  logoUrl: string;
  whatsapp?: string;
}

export type PresentationThemeId =
  | 'light-minimal'
  | 'midnight-gold'
  | 'riviera-sand'
  | 'ocean-blue'
  | 'emerald-forest'
  | 'slate-industrial';

export interface PresentationObject {
  id: string;
  title: string;
  description: string;
  address: string;
  city?: string;
  district?: string;
  latitude?: number;
  longitude?: number;
  price: string;
  image: string;
  images: string[];
  type?: string;
  area?: string;
  rooms?: string;
  floor?: string;
  year?: string;
  features?: string[];
  location_summary?: string;
  location_advantages?: string[];
  investment_highlights?: string[];
  key_metrics?: Array<{ label: string; value: string }>;
}

export interface PlannerNote {
  id: string;
  user_id: string;
  text: string;
  listing_id: string | null;
  created_at: string;
  listing?: any;
}

export interface PlannerTask {
  id: string;
  user_id: string;
  text: string;
  listing_id: string | null;
  remind_at: string | null;
  done: boolean;
  created_at: string;
  listing?: any;
}

export interface HistoryItem {
  id: string;
  title: string;
  desc: string;
  date: string;
  platforms: string[];
  status: 'published' | 'draft' | 'error' | 'publishing' | 'partial' | 'publish_unknown';
  image?: string;
  images?: string[];
  listingUrls?: Record<string, string>;
  userId?: string;
  errorDetails?: string;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        initDataUnsafe?: any;
      };
    };
  }
}
