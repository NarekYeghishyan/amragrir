import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  define: {
    // The API base is baked in at build time. Kept as a define rather than an
    // import.meta.env read scattered through the code so there is one place to
    // change when this is deployed.
    __API_URL__: JSON.stringify(process.env.VITE_API_URL ?? 'http://localhost:3000/v1'),
  },
});
