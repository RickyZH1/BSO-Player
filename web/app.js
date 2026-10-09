import {createClient} from '@supabase/supabase-js';
import {config} from './config.js';
import {escapeHTML as e,compress,csv} from './domain.js';
const $=s=>document.querySelector(s),app=$('#app'),dialog=$('#dialog');
const client=config.key?createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}}):null;
let data=null,tab='home',busy=false,loading=false,lastSync=null,session=null,poll=null,syncError=false;
const names={PRE_EVENT:'集合前',OPENING:'统一开场',EXPLORING:'自由探索',CLOSING:'清盘提醒',CLOSED:'比赛已截止',ARCHIVED:'已归档'};
const statusName={uploading:'上传未完成',pending:'待审核',approved:'审核通过',rejected:'已驳回'};
const time=v=>v?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(v)):'待公布';
const taskName=id=>data.tasks.find(t=>t.id===id)?.display_name||id;
const staffName=id=>data.staff?.find(s=>s.id===id)?.name||'工作人员';
const own=()=>data.profile.team_id;
const rows=t=>data.results.filter(r=>r.team_id===t);
const balance=t=>data.ledger.filter(l=>l.team_id===t).reduce((n,l)=>n+l.amount,0);
const done=t=>rows(t).filter(r=>r.completed&&r.counts_for_bingo).length;
const btn=(label,action,value='',klass='')=>'<button class="'+klass+'" data-action="'+action+'" data-value="'+e(value)+'">'+label+'</button>';
const safeImage=u=>{try{const x=new URL(u,location.href);return x.protocol==='https:'||x.origin===location.origin?e(x.href):'';}catch{return '';}};
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),6500);}
function modal(html){$('#dialog-body').innerHTML=html;if(!dialog.open)dialog.showModal();}
function close(){dialog.close();render();}
$('#close-dialog').onclick=close;
dialog.addEventListener('cancel',()=>setTimeout(render,0));
function form(id,body,label='确认提交'){return '<form id="'+id+'">'+body+'<div class="form-actions"><button type="submit">'+label+'</button></div></form>';}
function field(label,name,value='',type='text',extra=''){return '<label>'+label+'<input name="'+name+'" type="'+type+'" value="'+e(value)+'" '+extra+'></label>';}
function area(label,name,value=''){return '<label>'+label+'<textarea name="'+name+'">'+e(value)+'</textarea></label>';}
function selectTeam(){return '<label>队伍<select name="team">'+data.teams.map(t=>'<option value="'+t.id+'">'+e(t.code)+'</option>').join('')+'</select></label>';}
function selectTask(){return '<label>关卡<select name="task">'+data.tasks.filter(t=>t.kind!=='photo').map(t=>'<option value="'+t.id+'">'+e(t.display_name)+'</option>').join('')+'</select></label>';}
function login(){
 if(dialog.open)dialog.close();$('#dialog-body').innerHTML='';data=null;$('#nav').innerHTML='';$('#logout').hidden=true;
 const hint=new URLSearchParams(location.search).get('team');
 app.innerHTML='<div class="login"><p class="eyebrow">A DAY OUT, TOGETHER</p><h1>十年同行<br>一起去探索。</h1><p class="muted">BSO 10周年 · 公园团队赛</p><div class="card"><h2>'+(/^[1-6]$/.test(hint)?'Team '+hint+' 登录':'欢迎来到活动空间')+'</h2><p class="muted">队伍使用本队共享账号；工作人员使用自己的独立账号。</p>'+form('login',field('账号邮箱','email','','email','required autocomplete="username"')+field('密码','password','','password','required autocomplete="current-password"'),'进入活动')+'</div><small>2026.10.15 · Asia/Shanghai<br>43名参赛者 · 6支队伍 · 8位工作人员</small></div>';
 if(!config.key){$('#login button').disabled=true;toast('网站尚未配置Supabase公开密钥，请按部署教程配置后重新发布');}
}
async function sync(){
 if(loading||!session)return;loading=true;const syncingUser=session.user.id;
 try{
  const {data:next,error}=await client.rpc('portal_read');if(error)throw error;if(session?.user.id!==syncingUser)return;
  const hint=new URLSearchParams(location.search).get('team');
  if(next.profile.role==='team'&&/^[1-6]$/.test(hint)&&next.profile.team_id!==+hint){await client.auth.signOut();throw Error('此账号不属于链接指定队伍，请使用本队账号');}
  data=next;syncError=false;lastSync=new Date();$('#logout').hidden=false;if(!dialog.open&&!document.activeElement?.closest('form'))render();
 }catch(err){syncError=true;toast('未同步：'+err.message);if(!data)app.innerHTML='<div class="card"><h2>暂时无法进入</h2><p>'+e(err.message)+'</p>'+btn('重试','refresh')+btn('退出登录','logout','','quiet')+'</div>';}
 finally{loading=false;}
}
async function action(name,payload){
 const serialized=JSON.stringify({name,payload});
 let saved;try{saved=JSON.parse(sessionStorage.getItem('bso.retry')||'null');}catch{}
 const id=saved?.serialized===serialized?saved.id:crypto.randomUUID();
 sessionStorage.setItem('bso.retry',JSON.stringify({serialized,id}));
 const {data:out,error}=await client.rpc('portal_action',{action:name,payload,request_id:id});
 if(error){if(error.code)sessionStorage.removeItem('bso.retry');throw error;}
 sessionStorage.removeItem('bso.retry');return out;
}
function syncLabel(){return '<p class="sync">'+(navigator.onLine&&!syncError?'● 已连接':'○ 未同步，显示上次结果')+' · '+(lastSync?'上次同步 '+time(lastSync):'尚未同步')+' · 每15秒更新</p>';}
function nav(){
 const isStaff=data.profile.role==='staff';
 const items=isStaff?[['home','◫','总览'],['tasks','✓','关卡'],['photos','▧','照片'],['bingo','▦','Bingo'],['control','⚙','管理']]:[['home','⌂','Home'],['bingo','▦','My Bingo'],['explore','⌖','Explore'],['guide','☰','Guide']];
 $('#nav').innerHTML=items.map(([id,icon,label])=>'<button data-tab="'+id+'" class="'+(id===tab?'active':'')+'"><span aria-hidden="true">'+icon+'</span>'+label+'</button>').join('');
}
function home(){
 const t=own(),g=data.control;
 return '<section class="hero"><p class="eyebrow">BSO · TEN YEARS TOGETHER</p><div class="row"><h1>你好，Team '+t+'</h1><span class="pill">'+names[g.phase]+'</span></div><p class="muted">带着好奇出发，和队友一起找到答案。</p><div class="stats"><div><b>'+done(t)+' <small>/ 9</small></b><span>已点亮任务</span></div><div><b>'+balance(t)+'</b><span>团队银票 · 两</span></div></div></section>'+syncLabel()+
 '<div class="cols"><div class="card"><p class="eyebrow">YOUR NEXT STEP</p><h2>今天的冒险，从这里开始</h2><p>全队一起行动。找到工作人员后，由现场裁判讲解玩法。</p><div class="form-actions">'+btn('查看九宫格','tab','bingo')+btn('寻找线索','tab','explore','quiet')+'</div></div><div class="card"><p class="eyebrow">OPENING · FOCUS HUNTER</p><h3>统一开场集合</h3><p class="notice">'+e(g.opening_notice)+'</p><p class="muted">完成三场对阵后，由工作人员统一放行探索。</p></div></div>'+
 announcements()+'<div class="card"><h2>本队银票流水</h2>'+ledger(t)+'</div>';
}
function announcements(){return '<div class="card"><h2>活动公告</h2>'+(data.control.close_at?'<p class="notice">最终清盘：'+time(data.control.close_at)+'（上海时间）</p>':'')+(data.announcements.length?'<ul class="entries">'+data.announcements.slice(0,8).map(a=>'<li>'+e(a.message)+'<small>'+time(a.published_at)+'</small></li>').join('')+'</ul>':'<p class="muted">暂时没有公告。请留意现场工作人员通知。</p>')+'</div>';}
function ledger(t){const a=data.ledger.filter(l=>l.team_id===t);return '<ul class="entries">'+a.slice(0,60).map(l=>'<li class="row"><span>'+e(l.note||l.kind)+'<small>'+time(l.occurred_at)+'</small></span><span class="amount">'+(l.amount>=0?'+':'')+l.amount+' 两</span></li>').join('')+'</ul>';}
function bingo(){
 const t=own();
 const cards=data.cells.filter(c=>c.team_id===t).map(c=>{
  const task=data.tasks.find(x=>x.id===c.task_id),r=rows(t).find(x=>x.task_id===c.task_id);
  const pending=task.kind==='photo'&&data.photos.some(p=>p.status==='pending');
  return '<button class="cell '+(r.completed?'done':pending?'pending':'')+'" data-action="task" data-value="'+task.id+'"><span class="icon" aria-hidden="true">'+task.icon+'</span><b>'+e(task.display_name)+'</b><small>'+(r.completed?(r.counts_for_bingo?'✓ 已完成':'已结算 · 不计Bingo'):pending?'◷ 待审核':task.kind==='opening'?'统一开场':'○ 未完成')+'</small></button>';
 }).join('');
 return '<p class="eyebrow">TEAM '+t+' · YOUR FIXED CARD</p><h1>每一格，都是共同的回忆。</h1><p class="muted">完成 '+done(t)+'/9 · 固定九宫格，点击查看探索提示。</p><div class="bingo">'+cards+'</div><div class="cols">'+claimCard('first','First Bingo','至少完成5个不同任务，并有横、竖或对角线三格连线。')+claimCard('full','Full House','九格全部完成后，可独立申请满格奖励。')+'</div>';
}
function claimCard(kind,title,desc){
 const c=data.claims.filter(c=>c.kind===kind).at(-1),eligible=data.eligibility[kind],active=c&&c.status!=='rejected';
 return '<div class="card"><h2>'+title+'</h2><p>'+desc+'</p><p class="status">'+(active?statusName[c.status]+(c.status==='approved'&&c.reward===0?' · 等待系统结算':''):(eligible?'✓ 已达到条件':'尚未达到条件'))+'</p>'+(c?.rejection_reason?'<p>'+e(c.rejection_reason)+'</p>':'')+'<button data-action="claim" data-value="'+kind+'" '+(!eligible||active||!data.accepting?'disabled':'')+'>申请 '+title+'</button></div>';
}
function explore(){
 if(!data.control.exploration_released_at)return '<div class="hero"><p class="eyebrow">EXPLORE · COMING SOON</p><h1>先一起完成开场。</h1><p>全部Focus Hunter对阵结束后，工作人员会同时开放探索线索。</p></div><div class="card"><p>'+e(data.control.opening_notice)+'</p></div>';
 return '<p class="eyebrow">FOLLOW YOUR CURIOSITY</p><h1>下一站，藏在线索里。</h1><p class="muted">自由选择探索顺序，全队共同行动。</p><div class="card"><details><summary>查看鲁迅公园活动地图</summary><a href="assets/game-map/luxun-park-game-map.webp" target="_blank" rel="noopener"><img class="map" loading="lazy" src="assets/game-map/luxun-park-game-map-preview.webp" alt="鲁迅公园活动示意图"></a><p class="muted">示意图不标注隐藏关卡精确位置；以园内标识及现场通知为准。</p><p>'+e(data.control.scope_notice)+'</p></details></div><div class="cols">'+data.clues.map(c=>'<div class="card"><h3>'+e(taskName(c.task_id))+'</h3><p>'+e(c.text)+'</p>'+btn('查看探索卡','task',c.task_id,'quiet')+'</div>').join('')+'</div><h2>Hide and Seek</h2><p class="muted">找到目标图对应位置，现场拍照。照片需包含队号牌或至少一名本队成员。</p><div class="gallery">'+data.targets.map(t=>{const submissions=data.photos.filter(p=>p.target_id===t.id),current=submissions.filter(p=>p.status!=='uploading').at(-1);return '<article class="photo"><a href="'+safeImage(t.public_image)+'" target="_blank" rel="noopener"><img loading="lazy" src="'+safeImage(t.thumbnail)+'" alt="PHOTO '+String(t.id).padStart(2,'0')+' 寻找目标"></a><h3>PHOTO '+String(t.id).padStart(2,'0')+'</h3><p class="status">'+(current?statusName[current.status]:'尚未提交')+'</p>'+(current?.reject_reason?'<p>'+e(current.reject_reason)+'</p>':'')+btn('提交 / 查看记录','upload',t.id,'quiet')+'</article>';}).join('')+'</div>';
}
function guide(){return '<p class="eyebrow">BEFORE YOU GO</p><h1>一起玩，也一起照顾彼此。</h1>'+[
 ['团队行动','全队共同行动，不拆队、不派人提前占位。详细玩法由到场工作人员讲解。'],
 ['Bingo怎么达成','至少完成5个不同任务，同时横、竖或对角线三格连线，才可以申请First Bingo。九格全完成后另行申请Full House。是否完成由工作人员确认，零分也可能完成关卡。'],
 ['照片怎么拍','重拍照片需清楚识别同一地点，并包含队号牌或至少1名本队成员。不借用别队照片；驳回后按原因重拍。已完成照片任务后还可继续寻找其他目标。照片仅本队及工作人员可见。'],
 ['安全第一',data.control.scope_notice+' 不进入封闭区域，不翻围栏、不攀爬、不抢路；食品过敏或忌口可不试吃，联系工作人员处理。'],
 ['活动安排','2026年10月15日 · Asia/Shanghai。'+(data.control.close_at?'最终截止：'+time(data.control.close_at):'准确清盘时刻待工作人员公布。')+' 晚餐及后续活动线下进行。'],
 ['联络与网络应急',data.control.contact_notice+' 网络不通时先找工作人员使用纸卡和人工登记。页面未提示成功时，不代表已提交。恢复网络后点刷新核对。']
 ].map(([title,body])=>'<div class="card"><h2>'+title+'</h2><p>'+e(body)+'</p></div>').join('')+btn('立即刷新','refresh','','quiet');}
function staffHome(){return '<p class="eyebrow">STAFF PORTAL · '+e(data.profile.display_name)+'</p><h1>现场总览</h1>'+syncLabel()+'<div class="hero"><div class="row"><h2>'+names[data.control.phase]+'</h2><span class="pill">全部业务权限</span></div><p>照片待审 '+data.photos.filter(p=>p.status==='pending').length+' · Bingo待审 '+data.claims.filter(c=>c.status==='pending').length+'</p><p class="muted">上次阶段操作：'+e(staffName(data.control.updated_by))+' · '+time(data.control.updated_at)+'</p></div><div class="card table-wrap"><table><thead><tr><th>队伍</th><th>人数</th><th>完成</th><th>银票</th><th>记录</th></tr></thead><tbody>'+data.teams.map(t=>'<tr><td>'+e(t.code)+'</td><td>'+t.member_count+'</td><td>'+done(t.id)+'/9</td><td>'+balance(t.id)+'两</td><td>'+btn('查看','team',t.id,'quiet')+'</td></tr>').join('')+'</tbody></table></div>'+announcements()+btn('导出队伍成绩 CSV','export')+btn('导出全部银票流水 CSV','export-ledger','','quiet');}
function staffTasks(){return '<p class="eyebrow">ON-SITE REVIEW</p><h1>关卡与美食审核</h1><div class="card"><p>先登记开始挑战，完成后输入成绩。请核对队伍及现场判定；所有工作人员均可代办。</p>'+form('select-task',selectTeam()+selectTask(),'进入关卡')+'</div><h2>美食清单与解锁</h2>'+data.food.map(x=>'<div class="card"><h3>Team '+x.team_id+' <span class="tag">'+(x.unlocked_at?'已解锁':'未解锁')+'</span></h3><p class="rule">'+e(x.substitute_details||x.secret_details)+'</p><div class="form-actions">'+btn('解锁本队清单','unlock',x.team_id)+btn('修改替代方案','food-edit',x.team_id,'quiet')+'</div><p class="muted">完整验收请在上方选择 Team, the eater。证明可在现场查看。</p></div>').join('');}
function photoReview(){return '<p class="eyebrow">PRIVATE PHOTO QUEUE</p><h1>照片审核</h1><p>按提交先后排列。较早待审记录会阻止首发奖金结算，基础奖可以先发。驳回或撤销需说明原因。</p>'+data.photos.filter(p=>p.status!=='uploading').map(p=>'<div class="card"><div class="row"><h3>Team '+p.team_id+' · PHOTO '+p.target_id+'</h3><span class="tag">'+statusName[p.status]+'</span></div><p>'+time(p.submitted_at)+' · '+(data.photos.some(x=>x.target_id===p.target_id&&x.status==='pending'&&new Date(x.submitted_at)<new Date(p.submitted_at))?'有更早待审，首发未决':'按服务器顺序判定首发')+'</p><p>'+e(p.reject_reason||'')+'</p><div class="form-actions">'+btn('查看证明照片','evidence',p.id,'quiet')+btn(p.status==='approved'?'更正 / 撤销':'审核此照片','photo-review',p.id)+'</div></div>').join('')+(data.photos.length?'':'<div class="empty">尚无照片提交</div>');}
function staffBingo(){return '<p class="eyebrow">CLAIM REVIEW</p><h1>Bingo申报审核</h1><p>已通过但奖金为0表示更早申请仍未裁决。系统按有效申请顺序授奖。</p>'+data.claims.map(c=>'<div class="card"><h3>Team '+c.team_id+' · '+(c.kind==='first'?'First Bingo':'Full House')+'</h3><p>'+time(c.submitted_at)+' · '+statusName[c.status]+' · 奖励 '+c.reward+'两'+(c.rank?' · 第'+c.rank+'名':'')+'</p><p>'+e(c.rejection_reason||'')+'</p>'+btn('审核 / 更正','claim-review',c.id)+'</div>').join('')+(data.claims.length?'':'<div class="empty">尚无Bingo申报</div>');}
function control(){return '<p class="eyebrow">GAME CONTROL</p><h1>活动管理</h1><div class="card"><h2>阶段控制</h2><p>当前：'+names[data.control.phase]+' · 2026-10-15 · 上海时间</p><p>最后操作者：'+e(staffName(data.control.updated_by))+'</p>'+form('phase','<label>进入阶段<select name="phase">'+Object.entries(names).filter(([k])=>k!=='PRE_EVENT').map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select></label>'+field('最终截止时间（上海时间；清盘提醒时必填）','close_at','','datetime-local'),'确认阶段变更')+'</div><div class="cols"><div class="card"><h2>公共公告</h2><p>只发布全员可见内容，勿写队伍成绩、内部规则或秘密地点。</p>'+form('announcement',area('公告正文','message'),'发布公告')+'</div><div class="card"><h2>银票更正</h2>'+form('adjust',selectTeam()+field('调整金额（10两整数倍；扣减填负数）','amount','','number','required step="10"')+area('原因（必填）','reason'),'确认追加更正流水')+'</div></div><div class="card"><h2>集合、范围及联络</h2>'+form('settings',area('统一开场集合通知 / 对阵安排','opening',data.control.opening_notice)+area('探索范围与安全禁入说明','scope',data.control.scope_notice)+area('公开联络方式','contact',data.control.contact_notice),'保存公共内容')+'</div><div class="card"><h2>地点线索编辑入口</h2><p>这里只填玩家可见的模糊线索或活动范围。精确地点请填工作人员私密备注。</p><div class="stack">'+data.clues.map(c=>btn('编辑 '+e(taskName(c.task_id)),'clue-edit',c.task_id,'quiet')).join('')+'</div></div><div class="card"><h2>工作人员规则与私密地点</h2><div class="stack">'+data.rules.map(r=>btn(e(taskName(r.task_id)),'rule-edit',r.task_id,'quiet')).join('')+'</div></div><div class="card"><h2>最近200条审计</h2>'+btn('导出当前审计 CSV','export-audit','','quiet')+'<ul class="entries">'+data.audit.map(a=>'<li>'+e(a.action)+' · '+e(staffName(a.actor_auth_id))+'<small>'+time(a.at)+' · '+e(a.object_id)+' · '+e(a.reason||'')+'</small></li>').join('')+'</ul></div>';}
function render(){if(!data)return;nav();app.innerHTML=data.profile.role==='staff'?({home:staffHome,tasks:staffTasks,photos:photoReview,bingo:staffBingo,control}[tab]||staffHome)():({home,bingo,explore,guide}[tab]||home)();}
function taskCard(id){
 const task=data.tasks.find(t=>t.id===id),clue=data.clues.find(c=>c.task_id===id),r=rows(own()).find(r=>r.task_id===id);
 let body='<p class="eyebrow">'+task.icon+' · TEAM '+own()+'</p><h2>'+e(task.display_name)+'</h2><p>'+(r.completed?'✓ 已完成':'○ 尚未完成')+'</p>';
 if(task.kind==='opening')body+='<p class="notice">'+e(data.control.opening_notice)+'</p><p>统一开场活动，无需寻找线索。</p>';
 else if(!data.control.exploration_released_at)body+='<p>统一开场结束、工作人员放行后开放。</p>';
 else if(task.kind==='photo')body+='<p>到Explore照片墙查看11张目标图，上传现场证明。</p>'+btn('前往照片墙','tab','explore');
 else{body+='<p class="notice">'+e(clue?.text||'地点线索待公布')+'</p>'+(clue?.image_asset?'<img class="map" src="'+safeImage(clue.image_asset)+'" alt="地点局部线索照片">':'')+(clue?.learning_source?'<p>学习来源：'+e(clue.learning_source)+'</p>':'')+'<p>到场后请听工作人员讲解游戏规则。</p>';
 if(task.kind==='food'){const x=data.food[0];body+='<h3>本队美食任务</h3>'+(x?'<p class="rule">'+e(x.substitute_details||x.secret_details)+'</p>':'<p>找到Seven，由工作人员解锁后显示本队清单。</p>');}}
 modal(body);
}
function staffTask(team,id){
 const r=rows(team).find(r=>r.task_id===id),rule=data.rules.find(r=>r.task_id===id);
 if(!rule)throw Error('尚未导入私密规则，请完成部署教程的私密种子步骤');
 const c=rule.score_config;
 let metrics=c.mode==='grid'?Array.from({length:c.attempts},(_,i)=>'<label>第'+(i+1)+'次落点<select name="throw'+i+'"><option value="0">出界 / 无效（0）</option>'+c.grid.map((n,p)=>'<option value="'+(p+1)+'">第'+(p+1)+'格 · '+n+'两</option>').join('')+'</select></label>').join(''):field(c.label||'有效成绩','count',0,'number','min="0" max="'+c.max_count+'" required');
 if(c.seconds_limit)metrics+=field('累计作答秒数','seconds',0,'number','min="0" max="'+c.seconds_max+'" required');
 modal('<h2>Team '+team+' · '+e(taskName(id))+'</h2><p class="status">'+(r.started_at?'开局 '+time(r.started_at):'尚未开局')+' · '+(r.completed?'已完成，'+r.score_amount+'两':'未完成')+'</p><details><summary>查看私密工作人员规则</summary><p class="rule">'+e(rule.rule_text)+'</p><p>私密位置：'+e(rule.private_location)+'</p></details>'+
 (!r.started_at?btn('登记开始挑战','start-task',team+':'+id):'')+
 form('approve-task','<input type="hidden" name="team" value="'+team+'"><input type="hidden" name="task" value="'+id+'"><input type="hidden" name="correct" value="'+r.completed+'">'+metrics+'<label><input type="checkbox" name="participated" required>确认已按要求完整参与 / 美食全部验收</label>'+(r.completed?area('更正原因（必填）','reason'):'')+'<p class="notice">提交前会由服务器计算奖励，再请你确认。</p>','计算奖励并核对')+
 (r.completed?'<div class="form-actions">'+btn('撤销任务完成与奖励','revoke-task',team+':'+id,'danger')+'</div>':''));
}
async function evidence(id){const p=data.photos.find(p=>p.id===id);const {data:s,error}=await client.storage.from('evidence').createSignedUrl(p.storage_key,60);if(error)throw error;modal('<h2>PHOTO '+p.target_id+' · Team '+p.team_id+'</h2><img class="map" src="'+safeImage(s.signedUrl)+'" alt="本次提交证明照片"><p>临时链接60秒后过期。</p>');}
function upload(target){
 const list=data.photos.filter(p=>p.target_id===target);modal('<h2>PHOTO '+target+'</h2><p>请保留可辨识地点、队号牌或本队成员。上传后等待审核。</p>'+(!data.accepting?'<p class="warning">现在不接受新照片。</p>':form('upload','<input type="hidden" name="target" value="'+target+'"><label>选择照片<input name="photo" type="file" accept="image/jpeg,image/webp,image/png" required></label>','压缩并提交照片'))+'<h3>本队历史提交</h3>'+list.map(p=>'<div class="card"><p>'+statusName[p.status]+' · '+time(p.submitted_at||p.reserved_at)+'</p><p>'+e(p.reject_reason||'')+'</p>'+btn('查看照片','evidence',p.id,'quiet')+(p.status==='uploading'?btn('重试确认上传','finalize',p.id,'quiet'):'')+'</div>').join(''));
}
function review(type,id){
 const item=(type==='photo'?data.photos:data.claims).find(x=>x.id===id);
 modal('<h2>Team '+item.team_id+' · '+(type==='photo'?'PHOTO '+item.target_id:'Bingo申报')+'</h2>'+form('review','<input type="hidden" name="type" value="'+type+'"><input type="hidden" name="id" value="'+id+'"><label>审核决定<select name="status"><option value="approved">通过</option><option value="rejected">驳回 / 撤销</option></select></label>'+area('原因（驳回、撤销、更正必须填写）','reason'),'核对并确认'));
}
function download(name,rows){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([csv(rows)],{type:'text/csv;charset=utf-8'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function clickAction(name,v){
 if(name==='tab'){tab=v;if(dialog.open)dialog.close();render();return;}
 if(name==='refresh')return sync();
 if(name==='logout'){await client.auth.signOut();return;}
 if(name==='task')return taskCard(v);
 if(name==='claim'){if(confirm('确认提交本队申报？')){await action('claim',{kind:v});toast('申请已提交，等待审核');await sync();}return;}
 if(name==='upload')return upload(+v);
 if(name==='evidence')return evidence(v);
 if(name==='finalize'){await action('submit_photo',{id:v});toast('照片已送审');close();await sync();return;}
 if(name==='photo-review'||name==='claim-review')return review(name==='photo-review'?'photo':'claim',v);
 if(name==='start-task'){const [team,task]=v.split(':');if(confirm('确认 Team '+team+' 现在开始 '+taskName(task)+'？')){await action('start_task',{team:+team,task});await sync();staffTask(+team,task);}return;}
 if(name==='revoke-task'){const reason=prompt('撤销原因（必填；相关Bingo资格和奖励也将重新计算）：');if(!reason)return;const [team,task]=v.split(':');await action('revoke_task',{team:+team,task,reason});close();await sync();return;}
 if(name==='unlock'){if(confirm('确认解锁 Team '+v+' 美食清单？')){await action('unlock_food',{team:+v});await sync();}return;}
 if(name==='food-edit'){const x=data.food.find(x=>x.team_id===+v);modal('<h2>Team '+v+' 替代方案</h2>'+form('food-edit','<input type="hidden" name="team" value="'+v+'">'+area('经现场负责人确认的完整替代清单','details',x.substitute_details||x.secret_details)+area('替代原因','reason')));return;}
 if(name==='clue-edit'){const x=data.clues.find(x=>x.task_id===v);modal('<h2>'+e(taskName(v))+' · 玩家线索</h2>'+form('clue-edit','<input type="hidden" name="task" value="'+v+'">'+area('第一层公开线索（勿填精确坐标 / 答案）','text',x.text)+field('可选真实局部图片 HTTPS 地址','image',x.image_asset||'')+area('学习来源 / 活动范围提示','learning_source',x.learning_source||'')));return;}
 if(name==='rule-edit'){const x=data.rules.find(x=>x.task_id===v);modal('<h2>'+e(taskName(v))+' · 仅Staff可见</h2>'+form('rule-edit','<input type="hidden" name="task" value="'+v+'">'+area('工作人员规则、题目和答案','text',x.rule_text)+area('真实位置 / 接待返回点（私密）','location',x.private_location)));return;}
 if(name==='team'){const t=+v;modal('<h2>Team '+t+' · '+balance(t)+'两</h2><ul class="entries">'+rows(t).map(r=>'<li>'+e(taskName(r.task_id))+' · '+(r.completed?'已完成':'未完成')+' · '+r.score_amount+'两</li>').join('')+'</ul><h3>银票流水</h3>'+ledger(t));return;}
 if(name==='export')download('BSO-teams.csv',[['队伍','人数','完成数','余额（两）'],...data.teams.map(t=>[t.code,t.member_count,done(t.id),balance(t.id)])]);
 if(name==='export-ledger')download('BSO-ledger.csv',[['ID','队伍','来源','金额','时间','操作者','说明'],...data.ledger.map(l=>[l.id,l.team_id,l.kind,l.amount,time(l.occurred_at),staffName(l.approved_by),l.note])]);
 if(name==='export-audit')download('BSO-audit-latest-200.csv',[['ID','操作','对象','操作者','上海时间','原因','变更前','提交内容'],...data.audit.map(a=>[a.id,a.action,a.object_id,staffName(a.actor_auth_id),time(a.at),a.reason,JSON.stringify(a.before_json),JSON.stringify(a.after_json)])]);
}
async function submit(formEl){
 const d=Object.fromEntries(new FormData(formEl)),id=formEl.id;
 if(id==='login'){const {data:s,error}=await client.auth.signInWithPassword({email:d.email.trim(),password:d.password});if(error)throw error;session=s.session;tab='home';await sync();return;}
 if(id==='select-task')return staffTask(+d.team,d.task);
 if(id==='upload'){
  const file=new FormData(formEl).get('photo'),blob=await compress(file);toast('照片已压缩，正在上传…');
  const reserved=await action('reserve_photo',{target:+d.target});
  const {error}=await client.storage.from('evidence').upload(reserved.key,blob,{contentType:'image/jpeg',upsert:false});if(error)throw error;
  await action('submit_photo',{id:reserved.id});toast('照片已提交，等待工作人员审核');
 }else if(id==='approve-task'){
  const rule=data.rules.find(r=>r.task_id===d.task),c=rule.score_config;
  const metrics=c.mode==='grid'?{throws:Array.from({length:c.attempts},(_,i)=>+d['throw'+i])}:{count:+d.count,...(c.seconds_limit?{seconds:+d.seconds}:{})};
  const payload={team:+d.team,task:d.task,metrics,participated:d.participated==='on',reason:d.reason||''};
  const preview=await action('preview_score',payload);
  if(!confirm('Team '+d.team+' · '+taskName(d.task)+'\n奖励 '+preview.amount+' 两，确认完整参与并记入完成状态？'))return;
  await action(d.correct==='true'?'correct_task':'approve_task',payload);
 }else if(id==='review'){
  if(!confirm('确认本次审核决定？奖金与相关资格会由服务器重新核验。'))return;
  await action(d.type==='photo'?'review_photo':'review_claim',{id:d.id,status:d.status,reason:d.reason});
 }else if(id==='phase'){
  if(!confirm('确认进入“'+names[d.phase]+'”？请与其他工作人员沟通。'))return;
  await action('phase',{phase:d.phase,version:data.control.version,...(d.close_at?{close_at:d.close_at+':00+08:00'}:{})});
 }else {
  const mapping={'food-edit':'substitute_food','clue-edit':'edit_clue','rule-edit':'edit_rule'};
  if(!confirm('确认保存本次操作？'))return;
  if(d.team)d.team=+d.team;if(d.amount)d.amount=+d.amount;
  await action(mapping[id]||id,d);
 }
 if(dialog.open)dialog.close();toast('操作已保存');await sync();render();
}
document.addEventListener('click',async ev=>{
 const b=ev.target.closest('button');if(!b)return;
 if(b.dataset.tab){tab=b.dataset.tab;render();return;}
 if(!b.dataset.action||busy)return;
 busy=true;b.disabled=true;try{await clickAction(b.dataset.action,b.dataset.value);}catch(err){toast(err.message);}finally{busy=false;b.disabled=false;}
});
document.addEventListener('submit',async ev=>{
 ev.preventDefault();if(busy)return;busy=true;const b=ev.target.querySelector('button[type=submit]');if(b)b.disabled=true;
 try{await submit(ev.target);}catch(err){toast('未完成：'+err.message);}finally{busy=false;if(b)b.disabled=false;}
});
$('#logout').onclick=()=>client.auth.signOut();
window.addEventListener('online',sync);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
if(client){
 client.auth.onAuthStateChange((_event,s)=>{session=s;if(!s){sessionStorage.removeItem('bso.retry');login();}else setTimeout(sync,0);});
 const {data:s}=await client.auth.getSession();session=s.session;if(session)await sync();else login();
 poll=setInterval(()=>{if(!document.hidden&&navigator.onLine&&!busy)sync();},15000);
}else login();
