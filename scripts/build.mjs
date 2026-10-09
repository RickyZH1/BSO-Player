import {build} from 'esbuild';
import {mkdir,cp,readFile,writeFile,access} from 'node:fs/promises';
import {assets} from './prepare.mjs';
try{await access('web/assets/hide-and-seek/11.webp');}catch{await assets();}
let url=process.env.SUPABASE_URL||'https://jckxxmswznlvmdtuioep.supabase.co',key=process.env.SUPABASE_PUBLISHABLE_KEY||'sb_publishable_6yB5jPOa4siMlgkcQYqcQg_0rRehxL3';
try {const env=await readFile('.env','utf8');for(const line of env.split(/\r?\n/)){const [name,...rest]=line.split('=');if(name==='SUPABASE_URL')url=rest.join('=').trim();if(name==='SUPABASE_PUBLISHABLE_KEY'&&!key)key=rest.join('=').trim();}}catch{}
if(key.startsWith('sb_secret_'))throw Error('拒绝将管理员密钥打包');
if(key.startsWith('eyJ')){const p=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));if(p.role!=='anon')throw Error('只允许anon公钥');}
if(key&&!key.startsWith('sb_publishable_')&&!key.startsWith('eyJ'))throw Error('公开密钥格式错误');
await mkdir('dist',{recursive:true});await cp('web/assets','dist/assets',{recursive:true});
for(const file of ['index.html','styles.css'])await cp('web/'+file,'dist/'+file);
await writeFile('dist/config.js','export const config='+JSON.stringify({url,key})+';\n');
await build({entryPoints:['web/app.js'],bundle:true,format:'esm',outfile:'dist/app.js',external:['./config.js'],minify:true,sourcemap:false});
await writeFile('dist/.nojekyll','');
console.log(key?'静态站构建完成':'静态站构建完成，但未配置公钥：登录将显示配置提示');
