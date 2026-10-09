import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {qualify,lines,csv,escapeHTML} from '../web/domain.js';import {extract,ids,seed} from '../scripts/prepare.mjs';
test('Bingo: all eight lines, minimum five, duplicate cells never count',()=>{
 for(const line of lines){assert.equal(qualify(line).first,false);let extra=[1,2,3,4,5,6,7,8,9].filter(x=>!line.includes(x));assert.equal(qualify([...line,extra[0]]).first,false);assert.equal(qualify([...line,...extra.slice(0,2)]).first,true);}
 assert.equal(qualify([1,1,2,2,3]).first,false);assert.equal(qualify([1,2,3,4,5,6,7,8,9]).full,true);
});
test('HTML and CSV injection escaped',()=>{assert.equal(escapeHTML('<script>'), '&lt;script&gt;');assert.match(csv([['=1+1']]),/\'=1\+1/);});
test('Pinned source yields nine unique tasks and six identical fixed layouts',async()=>{
 const html=await readFile('.private/source.html','utf8'),d=extract(html),sql=seed(d);
 assert.equal(d.games.length,9);assert.equal(d.food.length,6);assert.equal(Object.keys(d.layouts).length,6);
 for(const [team,layout] of Object.entries(d.layouts)){assert.equal(new Set(layout).size,9);layout.forEach((id,i)=>assert.ok(sql.includes('values('+team.slice(4)+','+(i+1)+",\'"+ids[id]+"\'"))); }
 assert.equal(d.rules.length,9);for(const r of d.rules){assert.ok(r.config.cap>0);assert.ok(!r.text.includes('undefined'));}
 assert.ok(!sql.includes("clues(task_id,text,learning_source) values('focus_hunter'"));
});
