/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly MODE: string
  readonly PROD: boolean
  readonly DEV: boolean
  readonly VITE_BANNER_GEN_URL?: string
  readonly VITE_FLUIDDAM_URL?: string
  readonly VITE_HOME_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}





