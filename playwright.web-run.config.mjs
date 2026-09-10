import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'./tests/e2e',
  timeout:90_000,
  workers:1,
  reporter:'list',
  use:{
    headless:true,
    baseURL:'http://127.0.0.1:5190',
    viewport:{width:1280,height:720},
    screenshot:'only-on-failure',
  },
  webServer:{
    command:'./node_modules/.bin/vite --host 127.0.0.1 --port 5190 --strictPort',
    url:'http://127.0.0.1:5190',
    reuseExistingServer:false,
  },
});
