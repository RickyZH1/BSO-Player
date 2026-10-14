import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',testMatch:'review.spec.js',timeout:30000,workers:1,use:{baseURL:'http://127.0.0.1:4173',viewport:{width:375,height:812}},projects:[{name:'chromium',use:{browserName:'chromium',...(process.env.LOCAL_CHROME?{channel:'chrome'}:{})}},{name:'webkit',use:{browserName:'webkit'}}],webServer:{command:'node scripts/serve.mjs',url:'http://127.0.0.1:4173',reuseExistingServer:false},reporter:'list'});

