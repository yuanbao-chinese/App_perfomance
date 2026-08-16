import type { ElectronApi } from '../main/preload';

declare global {
  interface Window {
    electronApi: ElectronApi;
  }
}

export {};
