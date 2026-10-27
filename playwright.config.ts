import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'tests',testMatch:'**/*.spec.ts',workers:1,timeout:30000,
 use:{baseURL:'http://127.0.0.1:4173',viewport:{width:1440,height:1000},screenshot:'only-on-failure'},
 webServer:process.env.AK_STATIC_PREVIEW?undefined:{command:'npm run dev',url:'http://127.0.0.1:4173',reuseExistingServer:true,timeout:30000},
 projects:[{name:'chromium',use:{browserName:'chromium'}},{name:'webkit',use:{browserName:'webkit'}}]
});
