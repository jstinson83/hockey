import { defineConfig } from 'vite';

// Two pages: the game, and the sprite lab (sprites.html) for previewing animation frames.
export default defineConfig({
  build: {
    rollupOptions: {
      input: { main: 'index.html', sprites: 'sprites.html' },
    },
  },
});
