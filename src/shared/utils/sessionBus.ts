// sessionStorage 跨页面临时总线工具
import type { TempAsset } from '../types/assets';

export const SessionBusKeys = {
  LINK_TO_BANNERGEN: 'fluiddam.linkToBannerGen.v1',
  BANNERGEN_TO_SPOT: 'fluiddam.bannerGenToSpot.v1',
  LINK_TO_SPOT: 'fluiddam.linkToSpot.v1',
};

export type LinkToBannerGenPayload = {
  from: 'link';
  createdAt: number;
  assets: TempAsset[];
};

export type BannerGenToSpotPayload = {
  from: 'bannergen';
  createdAt: number;
  // 预留结构，后续 BannerGen→SpotStudio 用
  banners: Array<{
    id: string;
    name: string;
    previewDataUrl?: string;  // 可选，小图
    canvasJson?: any;         // 画布 JSON
  }>;
};

export type LinkToSpotPayload = {
  from: 'link';
  createdAt: number;
  assets: TempAsset[];
};

export function writeSessionPayload<T>(key: string, payload: T) {
  try {
    sessionStorage.setItem(key, JSON.stringify(payload));
  } catch (err) {
    console.error('[sessionBus] write error', key, err);
  }
}

export function readSessionPayload<T>(key: string): T | null {
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  sessionStorage.removeItem(key); // 用完即删，避免脏数据
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error('[sessionBus] read error', key, err);
    return null;
  }
}



