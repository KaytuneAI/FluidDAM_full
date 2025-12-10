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
  
  // Development mode: use direct port
  return import.meta.env.VITE_BANNER_GEN_URL || 'http://localhost:5174';
}

/**
 * Get the base URL for FluidDAM module
 */
export function getFluidDAMUrl(): string {
  if (isProductionMode()) {
    return '/spotstudio';
  }
  
  // Development mode: use direct port
  return import.meta.env.VITE_FLUIDDAM_URL || 'http://localhost:5173';
}

/**
 * Get the Link page URL
 */
export function getLinkUrl(): string {
  if (isProductionMode()) {
    return '/link';
  }
  
  // Development mode: use direct port
  const baseUrl = import.meta.env.VITE_BANNER_GEN_URL || 'http://localhost:5174';
  return `${baseUrl}/link`;
}

/**
 * Get the home page URL
 */
export function getHomeUrl(): string {
  if (isProductionMode()) {
    return '/';
  }
  
  // Development mode: use direct port
  return import.meta.env.VITE_HOME_URL || 'http://localhost:3000';
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

