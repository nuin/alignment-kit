import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';
export default defineConfig({
  plugins:[svelte()], publicDir:'demo/public',
  server:{host:'127.0.0.1',port:4173,strictPort:true},
  build:{outDir:'demo-dist',rollupOptions:{input:{main:resolve('index.html'),react:resolve('examples/react/index.html'),svelte:resolve('examples/svelte/index.html')}}}
});
