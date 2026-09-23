import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.egliseCollecte.app',
  appName: 'EgliseCollecte',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
