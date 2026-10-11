import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/browser',testMatch:'login.spec.js',timeout:45000,workers:1,
 use:{baseURL:'http://127.0.0.1:4173',viewport:{width:390,height:844}},
 projects:[{name:'chromium',use:{browserName:'chromium'}},{name:'webkit-iphone',use:{...devices['iPhone 11'],browserName:'webkit'}}],
 webServer:{command:'npm run preview',url:'http://127.0.0.1:4173',reuseExistingServer:false},
 reporter:'list'
});