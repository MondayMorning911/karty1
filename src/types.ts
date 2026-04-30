export type TabType = 'create' | 'platforms' | 'history';

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
