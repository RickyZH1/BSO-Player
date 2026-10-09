// Run locally. Private seed is NEVER committed or included in Pages artifacts.
// The import is pinned to the inspected source commit. No eval of source JS.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export const SOURCE='ea34cdbc55871a9ffee9c60e7865d67dd54c03f5';
const base='https://raw.githubusercontent.com/RickyZH1/Game/'+SOURCE+'/';
export const ids={focusHunter:'focus_hunter',brickBank:'brick_bank',codeBreaker:'bso_code_breaker',miniBingo:'mini_bingo',codeTalker:'code_talker',hideAndSeek:'hide_and_seek',luxun:'luxun_quiz',blindShape:'blind_shape',foodQuest:'food_quest'};
const sql=v=>"'"+String(v).replaceAll("'","''")+"'";
export function extract(html) {
 const array=name=>JSON.parse(html.match(new RegExp('const '+name+' = ([\\s\\S]*?);\\n'))?.[1]||'null');
 const games=array('games').filter(g=>ids[g.id]);
 const layouts=array('bingoLayouts'),food=array('foodAssignments');
 const grid=[...html.match(/<div class="target-grid">([\s\S]*?)<\/figure>/)[1].matchAll(/>(\d+)两<\/div>/g)].map(m=>+m[1]);
 if(games.length!==9||grid.length!==9||Object.keys(layouts).length!==6) throw Error('源规则结构变化，停止导入');
 const rules=games.map(g=>{
  const score=g.score,cap=Number(g.max.match(/\d+/)[0]);
  let c;
  if(g.id==='miniBingo') c={mode:'grid',attempts:Number(score.match(/^(\d+)次/)[1]),grid,bonus:Number(score.match(/＋(\d+)/)[1]),cap};
  else if(g.id==='foodQuest') c={mode:'count',max_count:1,per:Number(score.match(/＋(\d+)/)[1]),bonus:0,cap,label:'全部门店和品尝要求已完成：填写1，否则0'};
  else if(g.id==='hideAndSeek') c={mode:'photo',cap};
  else {
   const per=Number(score.match(/＋(\d+)/)[1]);
   const all=score.match(/(?:拍齐|共)?(\d+)(?:人|组全对|题全对|轮全成功)/);
   const maxCount=all?Number(all[1]):Number((g.time+' '+g.completion).match(/(\d+)[题轮]/)[1]);
   const plus=[...score.matchAll(/＋(\d+)/g)].map(m=>+m[1]);
   c={mode:'count',max_count:maxCount,per,bonus:plus[1]||0,cap,label:'有效人数 / 答对题数 / 成功组数或轮数'};
   const speed=score.match(/≤(\d+)秒/);
   if(speed) {c.seconds_limit=+speed[1]; c.seconds_max=maxCount*Number(g.time.match(/×\s*(\d+)秒/)[1]);}
  }
  return {id:ids[g.id],config:c,text:[g.name,'负责人：'+g.owner,g.time,g.goal,...g.steps,g.score,'完成：'+g.completion,'判定：'+g.judgement,'禁止：'+g.ban,'提醒：'+g.staffNote].join('\n')};
 });
 for(const [team,layout] of Object.entries(layouts)) if(layout.length!==9||new Set(layout).size!==9||layout.some(k=>!ids[k])) throw Error('固定布局无效：'+team);
 return {games,layouts,food,rules,grid};
}
export function seed(data) {
 const out=['begin;'];
 for(let t=1;t<=6;t++) out.push('insert into public.teams values('+t+','+sql('Team '+t)+','+(t===6?8:7)+') on conflict do nothing;');
 for(const g of data.games) {
  const id=ids[g.id],kind=id==='focus_hunter'?'opening':id==='hide_and_seek'?'photo':id==='food_quest'?'food':'checkpoint';
  out.push('insert into public.tasks values('+[id,g.name,kind,g.icon].map(sql).join(',')+') on conflict do nothing;');
  const rule=data.rules.find(r=>r.id===id);
  out.push('insert into public.staff_rules(task_id,rule_text,score_config) values('+sql(id)+','+sql(rule.text)+','+sql(JSON.stringify(rule.config))+'::jsonb) on conflict do nothing;');
  if(kind==='checkpoint'||kind==='food') out.push('insert into public.clues(task_id,text,learning_source) values('+sql(id)+','+sql('TODO_PLACE_'+id.toUpperCase()+'：地点线索待公布')+','+(id==='luxun_quiz'?sql('TODO_LEARNING_SOURCE：学习来源待公布'):'null')+') on conflict do nothing;');
 }
 for(let t=1;t<=6;t++) {
  data.layouts['team'+t].forEach((id,i)=>out.push('insert into public.bingo_cells values('+t+','+(i+1)+','+sql(ids[id])+') on conflict do nothing;'));
  out.push('insert into public.team_task_results(team_id,task_id) select '+t+',id from public.tasks on conflict do nothing;');
  const food=data.food[t-1];
  out.push('insert into public.food_assignments(team_id,secret_details) values('+t+','+sql(food.shops+'\n'+food.items+'\n'+food.note)+') on conflict do nothing;');
  out.push("insert into public.score_ledger(team_id,kind,source_id,idempotency_key,amount,note) values("+t+",'initial','initial','initial:"+t+"',500,'团队初始银票') on conflict do nothing;");
 }
 for(let i=1;i<=11;i++) {
  const n=String(i).padStart(2,'0');
  out.push('insert into public.photo_targets values('+i+','+sql('assets/hide-and-seek/'+n+'.webp')+','+sql('assets/hide-and-seek/'+n+'-thumb.webp')+',true) on conflict do nothing;');
 }
 out.push('commit;'); return out.join('\n');
}
async function download(p) {
 const r=await fetch(base+p);if(!r.ok) throw Error('源素材读取失败：'+p+' '+r.status);return r;
}
export async function prepare() {
 await mkdir('.private',{recursive:true});
 const html=process.env.SOURCE_HTML?await readFile(process.env.SOURCE_HTML,'utf8'):await (await download('index.html')).text();
 const data=extract(html);
 await writeFile('.private/seed.sql',seed(data));
 await writeFile('.private/source.html',html);
 await writeFile('.private/reference.json',JSON.stringify(data));
 console.log('私密种子已写入 .private/seed.sql（不要上传GitHub）');
}
export async function assets() {
 const paths=['assets/game-map/luxun-park-game-map.webp','assets/game-map/luxun-park-game-map-preview.webp','assets/game-map/README.md'];
 for(let i=1;i<=11;i++){let n=String(i).padStart(2,'0');paths.push('assets/hide-and-seek/'+n+'.webp','assets/hide-and-seek/'+n+'-thumb.webp');}
 for(const p of paths){await mkdir('web/'+p.slice(0,p.lastIndexOf('/')),{recursive:true});await writeFile('web/'+p,new Uint8Array(await (await download(p)).arrayBuffer()));}
 console.log('公开地图和11张目标图已复制；没有复制工作人员页面');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 if(process.argv.includes('--assets')) await assets(); else await prepare();
}
