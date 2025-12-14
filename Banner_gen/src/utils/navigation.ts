/**
 * Unified navigation utility for cross-module navigation
 * 
 * Development mode: Use direct port URLs (http://localhost:5174, etc.)
 * Production mode: Use directory paths (/bannergen, /spotstudio, etc.)
 */

/**
 * Check if we're in production mode
 */
function isProductionMode(): boolean {
  return import.meta.env.MODE === 'production' || 
         import.meta.env.PROD ||
         (window.location.port === '' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1');
}

/**
 * Get the base URL for Banner_gen module
 */
export function getBannerGenUrl(): string {
  if (isProductionMode()) {
    return '/bannergen';
  }
  
  // Development mode: use current origin (dynamic port detection)
  if (import.meta.env.VITE_BANNER_GEN_URL) {
    return import.meta.env.VITE_BANNER_GEN_URL;
  }
  return window.location.origin;
}

/**
 * Get the base URL for FluidDAM module
 */
export function getFluidDAMUrl(): string {
  if (isProductionMode()) {
    return '/spotstudio';
  }
  
  // Development mode: use current origin with /spotstudio path
  // This allows both apps to share the same IndexedDB database
  if (import.meta.env.VITE_FLUIDDAM_URL) {
    return import.meta.env.VITE_FLUIDDAM_URL;
  }
  return `${window.location.origin}/spotstudio`;
}

/**
 * Get the Link page URL
 */
export function getLinkUrl(): string {
  if (isProductionMode()) {
    return '/bannergen/link';
  }
  
  // Development mode: use current origin
  if (import.meta.env.VITE_BANNER_GEN_URL) {
    return `${import.meta.env.VITE_BANNER_GEN_URL}/link`;
  }
  return `${window.location.origin}/link`;
}

/**
 * Get the home page URL
 */
export function getHomeUrl(): string {
  if (isProductionMode()) {
    return '/';
  }
  
  // Development mode: use environment variable or default to port 3000
  if (import.meta.env.VITE_HOME_URL) {
    return import.meta.env.VITE_HOME_URL;
  }
  // Default to port 3000 for unified entry, but allow dynamic detection if needed
  const currentPort = window.location.port;
  if (currentPort && currentPort !== '5174' && currentPort !== '5173') {
    return window.location.origin;
  }
  return 'http://localhost:3000';
}

/**
 * Navigate to Banner_gen module
 */
export function navigateToBannerGen(): void {
  window.location.href = getBannerGenUrl();
}

/**
 * Navigate to Link page
 */
export function navigateToLink(): void {
  window.location.href = getLinkUrl();
}

/**
 * Navigate to FluidDAM module
 */
export function navigateToFluidDAM(): void {
  window.location.href = getFluidDAMUrl();
}

/**
 * Navigate to home page
 */
export function navigateToHome(): void {
  window.location.href = getHomeUrl();
}

/**
 * Get the TemplateGen page URL
 */
export function getTemplateGenUrl(): string {
  if (isProductionMode()) {
    return '/bannergen/template-gen';
  }
  
  // Development mode: use current origin
  if (import.meta.env.VITE_BANNER_GEN_URL) {
    return `${import.meta.env.VITE_BANNER_GEN_URL}/template-gen`;
  }
  return `${window.location.origin}/template-gen`;
}

/**
 * Navigate to TemplateGen page
 */
export function navigateToTemplateGen(): void {
  window.location.href = getTemplateGenUrl();
}

