/**
 * Console utility for production environment
 * Disables console.log, console.debug, console.info in production
 * Keeps console.error and console.warn for error tracking
 */

/**
 * Check if we're in production mode
 */
function isProductionMode(): boolean {
  return (
    import.meta.env.MODE === 'production' ||
    import.meta.env.PROD ||
    (typeof window !== 'undefined' &&
      window.location.port === '' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1')
  );
}

/**
 * Initialize console override for production
 * This should be called early in the application lifecycle
 */
export function initConsoleOverride(): void {
  if (isProductionMode()) {
    // Override console.log, console.debug, console.info to no-op
    const noop = () => {};
    
    // Store original console methods (in case we need them for debugging)
    const originalConsole = {
      log: console.log,
      debug: console.debug,
      info: console.info,
    };
    
    // Override in production
    console.log = noop;
    console.debug = noop;
    console.info = noop;
    
    // Keep console.error and console.warn for error tracking
    // They remain functional
  }
}

