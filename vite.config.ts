import basicSsl from '@vitejs/plugin-basic-ssl';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { relayPlugin } from './server/relay';

export default defineConfig({
  // スマホの傾きセンサーは HTTPS でないと使えないため、自己署名証明書で HTTPS にする
  plugins: [basicSsl(), relayPlugin()],
  // host: true で LAN（モバイルホットスポット）からアクセスできるようにする
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        phone: fileURLToPath(new URL('./phone.html', import.meta.url)),
      },
    },
  },
});
