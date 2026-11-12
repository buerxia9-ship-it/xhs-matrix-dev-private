'use strict';
// P2 evidence-only regression tests. All events and IDs are synthetic; never call models or XHS.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const {AnalysisService}=require(path.join(root,'backend-ts/dist/modules/analysis/analysis.service'));
function fixture({campaigns,notes=[],comments=[],topics=[]}={}){
 const configs=campaigns||{cat:{id:'cat',name:'Pet sandbox',productName:'猫砂',keywords:['迪拜','猫砂']}};
 const rows=topics.map(x=>({...x})),writes=[];let calls=0;
 const prisma={
  note:{findMany:async({where})=>notes.filter(n=>n.campaignId===where.campaignId)},
  comment:{findMany:async({where})=>comments.filter(c=>where.noteId.in.includes(c.noteId))},
  topic:{
   findMany:async({where})=>rows.filter(x=>x.campaignId===where.campaignId),
   create:async({data})=>{const row={id:'topic-'+(rows.length+1),...data};rows.push(row);writes.push(row);return row;},
  },
  commentInsight:{create:async()=>{throw Error('no unverified analysis insight writes');},deleteMany:async()=>{throw Error('no deletions permitted');}}
 };
 const gateways={chat:async()=>{calls++;throw Error('paid model call forbidden');}};
 const svc=new AnalysisService(prisma,{findOne:async id=>{if(!configs[id])throw Error('campaign absent');return configs[id];}},gateways);
 return {svc,rows,writes,modelCalls:()=>calls};
}
const note=(id,title,campaignId='cat',source='search-title')=>({id,title,campaignId,source});
const comment=(id,noteId,content)=>({id,noteId,content});
test('zero genuine evidence leaves existing confirmed statuses untouched and never calls a model',async()=>{
 const old={id:'old',campaignId:'cat',title:'existing decision',status:'adopted',rationale:'confirmed'};
 const f=fixture({notes:[note('fake','猫砂夸张案例','cat','mock')],topics:[old]});
 const result=await f.svc.runForCampaign('cat');
 assert.equal(result.topicCount,0);assert.equal(f.writes.length,0);assert.equal(f.rows[0].status,'adopted');
 assert.match(result.message,/没有可追溯/);assert.equal(f.modelCalls(),0);
});
test('title-only evidence creates reviewable concrete candidates with note IDs, without invented comment/client claims',async()=>{
 const f=fixture({notes:[note('n1','无香猫砂和绿茶怎么选'),note('n2','猫砂粉尘怎么看')]});
 const r=await f.svc.runForCampaign('cat');
 assert.equal(r.topicCount,2);
 assert.equal(r.commentsAnalyzed,0);assert.equal(f.writes.length,2);
 assert.ok(f.writes.every(x=>x.title.includes('迪拜')&&x.title.includes('猫砂')));
 assert.ok(f.writes.every(x=>x.rationale.includes('证据类型=采集笔记标题')&&x.rationale.includes('confidence=title_clue_only')));
 assert.ok(f.writes.some(x=>x.rationale.includes('note_id=n1')&&x.rationale.includes('evidence_key=note:n1')));
 assert.ok(f.writes.some(x=>x.rationale.includes('note_id=n2')&&x.rationale.includes('evidence_key=note:n2')));
 assert.ok(f.writes.every(x=>!/(亲测|真实测评|客户说|真实客户|姐妹们)/.test(x.title)));
 assert.notEqual(f.writes[0].title,f.writes[1].title);assert.equal(f.modelCalls(),0);
});
test('actually linked public comments retain separate note and comment IDs and do not imply a customer testimonial',async()=>{
 const f=fixture({notes:[note('n1','猫砂无香选择')],
 comments:[comment('c1','n1','猫砂粉尘怎么控制？'),comment('unlinked','another-project','猫砂绝对零粉尘!')]});
 const r=await f.svc.runForCampaign('cat');
 assert.equal(r.commentsAnalyzed,1);assert.ok(r.topicCount>=2);
 const fromComment=f.writes.find(x=>x.rationale.includes('evidence_key=comment:c1'));
 assert.ok(fromComment);
 assert.match(fromComment.rationale,/note_id=n1；comment_id=c1/);
 assert.match(fromComment.rationale,/confidence=unverified_public_comment/);
 assert.match(fromComment.rationale,/公开评论不等于本店客户/);
 assert.equal(f.rows.some(x=>x.rationale.includes('unlinked')),false);
});
test('reruns are idempotent, never reset adopted/discarded/candidate topics',async()=>{
 const old=[
  {id:'a',campaignId:'cat',title:'已采纳',rationale:'manual confirmed',status:'adopted'},
  {id:'d',campaignId:'cat',title:'已弃用',rationale:'manual discarded',status:'discarded'},
  {id:'c',campaignId:'cat',title:'已留存候选',rationale:'manual candidate',status:'candidate'}
 ];
 const f=fixture({notes:[note('n1','猫砂结团能力怎么判断')],topics:old});
 assert.equal((await f.svc.runForCampaign('cat')).topicCount,1);
 assert.equal((await f.svc.runForCampaign('cat')).topicCount,0);
 assert.equal(f.rows.length,4);
 for(let i=0;i<3;i++)assert.equal(f.rows[i].status,old[i].status);
});
test('separate campaigns and non-litter product topics do not leak or match geography-only noise',async()=>{
 const f=fixture({
 campaigns:{cat:{id:'cat',name:'Litter',productName:'猫砂',keywords:['迪拜','猫砂']},
 water:{id:'water',name:'Water',productName:'饮水机',keywords:['迪拜','饮水机']}},
 notes:[
  note('litter','猫砂结团会不会粘底？','cat'),
  note('water','饮水机噪音怎么降低？','water'),
  note('irrelevant','迪拜买房避坑','water'),
  note('foreign','猫砂选购清单','water')
 ]});
 const water=await f.svc.runForCampaign('water');
 assert.equal(water.topicCount,1);
 assert.equal(f.writes[0].campaignId,'water');
 assert.match(f.writes[0].rationale,/note_id=water/);
 assert.equal(f.writes[0].title.includes('猫砂'),false);
 assert.equal(f.writes[0].rationale.includes('irrelevant'),false);
 const cat=await f.svc.runForCampaign('cat');
 assert.equal(cat.topicCount,1);
 assert.ok(f.writes.some(x=>x.campaignId==='cat'&&x.rationale.includes('note_id=litter')));
 assert.equal(f.modelCalls(),0);
});
test('effective cloud runtime uses core P2 analysis, not legacy AI or category wrappers; manual review patch remains',()=>{
 const start=fs.readFileSync(path.join(root,'cloud/start.cjs'),'utf8');
 const legacy=fs.readFileSync(path.join(root,'runtime-patches/ai-analysis-compat.cjs'),'utf8');
 const acceptance=fs.readFileSync(path.join(root,'runtime-patches/acceptance-compat.cjs'),'utf8');
 assert.equal(start.includes("'ai-analysis-compat.cjs'"),false);
 assert.equal(acceptance.includes('AnalysisService.prototype.runForCampaign'),false);
 assert.equal(legacy.includes('prototype.runForCampaign='),false);
 assert.ok(acceptance.includes('complianceChecked:false'));
 assert.ok(acceptance.includes('GenerateService.prototype.updateDraft'));
});

test('candidate detail editing only changes title/angle and preserves original source provenance and status',async()=>{
 const original={id:'candidate',title:'猫砂旧问题',angle:'旧角度',status:'candidate',
   rationale:'证据类型=采集笔记标题；evidence_key=note:n1；note_id=n1；confidence=title_clue_only'};
 let changed=0;
 const prisma={topic:{
   findUnique:async()=>original,
   update:async({data})=>{changed++;assert.deepEqual(Object.keys(data).sort(),['angle','title']);Object.assign(original,data);return original;}
 }};
 const service=new AnalysisService(prisma,{}, {});
 const result=await service.updateTopicDetails('candidate',{title:'迪拜猫砂怎么选',angle:'从无香与绿茶的选择角度说明',status:'published',rationale:'fake evidence'});
 assert.equal(result.title,'迪拜猫砂怎么选');assert.equal(result.angle,'从无香与绿茶的选择角度说明');
 assert.equal(result.status,'candidate');assert.match(result.rationale,/evidence_key=note:n1/);
 assert.equal(changed,1);
 original.status='adopted';
 await assert.rejects(service.updateTopicDetails('candidate',{title:'新标题',angle:'新角度'}),/不能在这里修改/);
 assert.equal(changed,1);
 original.status='candidate';
 await assert.rejects(service.updateTopicDetails('candidate',{title:'短',angle:'合法角度'}),/2–20/);
 await assert.rejects(service.updateTopicDetails('candidate',{title:'合法标题',angle:''}),/2–180/);
 assert.equal(changed,1);
});
