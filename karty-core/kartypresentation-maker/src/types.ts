export interface RealtorProfile {
  name: string;
  agency: string;
  phone: string;
  photoUrl: string;
}

export interface Property {
  id: string;
  title: string;
  price: string;
  address: string;
  description?: string;
  specs: {
    beds: number;
    baths: number;
    sqft: number;
  };
  images: string[];
  mapUrl?: string;
}

export interface DesignSettings {
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  layout: 'classic' | 'modern' | 'editorial';
}

export type Tab = 'design' | 'brand' | 'objects';
