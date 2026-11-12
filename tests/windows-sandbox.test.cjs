'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),http=require('node:http');
const {createSandbox}=require('../cloud/sandbox/core.cjs');
const ROOT=path.resolve(__dirname,'..');
test('compiled services, synthetic identities, image integrity and review state form a controlled loop',async t=>{
 const dir=path.join(ROOT,'.cloud-data','sandbox-qa-'+crypto.randomUUID());const box=await createSandbox(dir);t.after(()=>box.close());
 let state=await box.snapshot();const [b,d,o]=state.accounts;const topic=a=>a.topics[0];
 await t.test('three synthetic identities, three isolated product knowledge scopes, zero cookies/providers',async()=>{
  assert.equal(state.syntheticAccounts,3);assert.equal(state.products,3);assert.equal(new Set(state.accounts.map(a=>a.personaId)).size,3);assert.equal(new Set(state.accounts.map(a=>a.productKnowledgeId)).size,3);
  assert.equal(box.sql.prepare('SELECT count(*) n FROM accounts WHERE cookie IS NOT NULL').get().n,0);
  assert.equal(box.sql.prepare('SELECT count(*) n FROM model_providers').get().n,0);
  assert.equal(box.sql.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(box.sql.pragma('foreign_key_check'),[]);
  assert.match(topic(b).title,/袋底白色颗粒/);assert.doesNotMatch(topic(b).title,/木薯/);assert.match(topic(d).title,/渠道合作/);assert.match(topic(o).title,/低粉尘是否等于零粉尘/);
 });
 await t.test('topic and draft writes cannot cross account bindings',async()=>{
  const before=await box.prisma.topic.findUnique({where:{id:topic(b).id}});
  await assert.rejects(box.act('edit-topic',{campaignId:d.campaignId,topicId:topic(b).id,title:'不应保存',angle:'wrong'}),/does not belong/);
  assert.deepEqual(await box.prisma.topic.findUnique({where:{id:topic(b).id}}),before);
 });
 const drafts={};
 await t.test('each adopted topic uses its own real persona/wiki and an explicitly offline provider',async()=>{
  for(const a of state.accounts){
   await box.act('review-topic',{campaignId:a.campaignId,topicId:topic(a).id,verdict:'可采纳',reason:a.key+'_CONFIRMED_MEMORY'});
   drafts[a.key]=await box.act('copy',{campaignId:a.campaignId,topicId:topic(a).id,provider:'offline-mock-v1'});
   assert.equal(drafts[a.key].personaId,a.personaId);assert.equal(drafts[a.key].complianceChecked,false);
  }
  state=await box.snapshot();assert.equal(state.contextProofs.length,3);
  for(const proof of state.contextProofs){const a=state.accounts.find(a=>a.campaignId===proof.campaignId);assert.equal(proof.knowledgeScope,a.key);assert.ok(proof.confirmedFeedback.some(x=>x.reason===a.key+'_CONFIRMED_MEMORY'));assert.ok(proof.confirmedFeedback.every(x=>!state.accounts.filter(z=>z.key!==a.key).some(z=>x.reason.includes(z.key+'_CONFIRMED_MEMORY'))));}
  await assert.rejects(box.act('edit-draft',{campaignId:d.campaignId,draftId:drafts.B01.id,title:'跨账号',body:'禁止串用'}),/does not belong/);
 });
 await t.test('missing provider and simulated copy failures never create fallback drafts',async()=>{
  const before=await box.prisma.draft.count();
  await assert.rejects(box.act('copy',{campaignId:b.campaignId,topicId:topic(b).id,provider:'none'}),/无可用 Provider/);
  await assert.rejects(box.act('copy',{campaignId:b.campaignId,topicId:topic(b).id,provider:'offline-mock-v1',failure:'copy'}),/模拟文案生成失败/);
  assert.equal(await box.prisma.draft.count(),before);assert.equal(box.stats.paidApiCalls,0);
 });
 await t.test('one through four images execute compiled planning and preserve exact synthetic packaging pixels',async()=>{
  for(const count of [1,2,3,4]){const r=await box.act('images',{campaignId:b.campaignId,draftId:drafts.B01.id,count,provider:'offline-mock-v1'});assert.equal(r.images.length,count);assert.equal(r.complianceChecked,false);}
  for(const a of [d,o]){const r=await box.act('images',{campaignId:a.campaignId,draftId:drafts[a.key].id,count:1,provider:'offline-mock-v1'});assert.equal(r.images.length,1);}
  await assert.rejects(box.act('images',{campaignId:b.campaignId,draftId:drafts.B01.id,count:5,provider:'offline-mock-v1'}),/1–4/);
  const s=await box.snapshot();assert.equal(s.imageProofs.length,12);assert.ok(s.imageProofs.every(p=>p.pixelMismatches===0));assert.equal(new Set(s.imageProofs.map(p=>p.referenceSHA)).size,3);
 });
 await t.test('image failure, unavailable material and actual reference tampering preserve earlier complete draft images',async()=>{
  const input={campaignId:b.campaignId,draftId:drafts.B01.id,count:2,provider:'offline-mock-v1'};
  const before=await box.prisma.draft.findUnique({where:{id:input.draftId}});
  await assert.rejects(box.act('images',{...input,failure:'image'}),/模拟配图生成失败/);
  await assert.rejects(box.act('images',{...input,failure:'missing'}),/无可用合成素材/);
  const ref=path.join(dir,'assets/B01.png'),raw=fs.readFileSync(ref);fs.writeFileSync(ref,Buffer.concat([raw,Buffer.from('synthetic tamper')]));
  try{await assert.rejects(box.act('images',input),/SHA 校验失败/);}finally{fs.writeFileSync(ref,raw);}
  assert.deepEqual(await box.prisma.draft.findUnique({where:{id:input.draftId}}),before);
 });
 await t.test('negated low-dust explanation passes while an affirmative zero-dust claim is rejected',async()=>{
  const input={campaignId:o.campaignId,draftId:drafts.O01.id};
  const original=await box.prisma.draft.findUnique({where:{id:input.draftId}});
  await box.act('submit-review',input);
  await box.act('edit-draft',{...input,title:original.title,body:original.body+'\n但本产品完全没有粉尘。'});
  await assert.rejects(box.act('submit-review',input),/无依据承诺/);
  await box.act('edit-draft',{...input,title:original.title,body:original.body});
 });
 await t.test('human review needs explicit submission and reason; any later editing revokes approval',async()=>{
  const input={campaignId:b.campaignId,draftId:drafts.B01.id};
  await assert.rejects(box.act('review-draft',{...input,verdict:'可采纳',reason:'before submit'}),/先提交/);
  await box.act('submit-review',input);
  await assert.rejects(box.act('review-draft',{...input,verdict:'可采纳',reason:''}),/原因必填/);
  const approved=await box.act('review-draft',{...input,verdict:'可采纳',reason:'合成文案和 4 张合成图已逐项检查'});assert.equal(approved.status,'approved');
  const edit=await box.act('edit-draft',{...input,title:approved.title,body:approved.body+'\n合成审改，不增加真实事实。'});assert.equal(edit.complianceChecked,false);assert.equal(edit.status,'ready');
  assert.equal(box.sql.prepare("SELECT count(*) n FROM drafts WHERE status='published'").get().n,0);
  const end=await box.snapshot();assert.ok(end.accounts[0].events.some(e=>e.action==='error'));assert.ok(end.accounts[0].events.some(e=>e.action==='可采纳'));assert.equal(end.paidApiCalls,0);
 });
});
test('an unrecognized existing database with a forged manifest remains byte-for-byte unchanged',async()=>{
 const dir=path.join(ROOT,'.cloud-data','sandbox-refusal-'+crypto.randomUUID());fs.mkdirSync(dir,{recursive:true});
 const Database=require(path.join(ROOT,'backend-ts/node_modules/better-sqlite3'));
 const file=path.join(dir,'fixture.db'),db=new Database(file);db.exec(fs.readFileSync(path.join(ROOT,'fixtures/effective-schema.sql'),'utf8'));db.close();
 fs.writeFileSync(path.join(dir,'sandbox-manifest.json'),JSON.stringify({mode:'synthetic-only-v1',schemaSha:crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,'fixtures/effective-schema.sql'))).digest('hex'),metas:[]}));
 const before=fs.readFileSync(file);await assert.rejects(createSandbox(dir),/registered synthetic sandbox/);assert.deepEqual(fs.readFileSync(file),before);
});
test('strict sandbox network denial has a live nonce control; child processes are blocked',async t=>{
 const nonce=crypto.randomUUID();let hits=0;const server=http.createServer((q,r)=>{hits++;r.end(nonce);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url='http://127.0.0.1:'+server.address().port;
 assert.equal(await (await fetch(url)).text(),nonce);const before=hits;
 const script=`const a=require('node:assert/strict');const x=require(${JSON.stringify(path.join(ROOT,'cloud/sandbox/security.cjs'))}).install();a.throws(()=>require('node:http').get(${JSON.stringify(url)}),/OUTBOUND_NETWORK_BLOCKED/);a.throws(()=>require('node:net').connect(${server.address().port},'127.0.0.1'),/OUTBOUND_NETWORK_BLOCKED/);a.throws(()=>require('node:https').get('https://not-authorized.invalid/'),/OUTBOUND_NETWORK_BLOCKED/);a.throws(()=>require('node:child_process').spawn(process.execPath,['--version']),/SUBPROCESS_BLOCKED/);fetch(${JSON.stringify(url)}).then(()=>process.exit(2)).catch(e=>{a.match(e.message,/OUTBOUND_NETWORK_BLOCKED/);console.log(JSON.stringify(x));});`;
 const p=cp.spawnSync(process.execPath,['-e',script],{encoding:'utf8'});assert.equal(p.status,0,p.stderr);assert.equal(JSON.parse(p.stdout).outboundDenied,4);assert.equal(hits,before);
 assert.equal(await (await fetch(url)).text(),nonce);assert.equal(hits,before+1);
});
test('live preview health, read-only mutations and unsafe API/origin requests fail closed',async()=>{
 const b='http://127.0.0.1:4181',s='http://127.0.0.1:4182';
 assert.equal((await (await fetch(b+'/api/v1/health')).json()).db,'ok');assert.equal((await fetch(b+'/api/v1/generate/from-topic',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,403);
 for(const endpoint of ['publish/draft','collect/run','accounts','gateway/image','settings/system/autolaunch','autopilot/run-once/nope','materials/folder/test']){
  const r=await fetch(s+'/api/v1/'+endpoint,{method:'POST',headers:{'content-type':'application/json','X-Sandbox-Mode':'synthetic'},body:'{}'});assert.equal(r.status,403,endpoint);
 }
 const r=await fetch(s+'/api/sandbox/action/copy',{method:'POST',headers:{'content-type':'application/json','X-Sandbox-Mode':'synthetic','origin':'https://not-authorized.invalid'},body:'{}'});assert.equal(r.status,403);
 assert.equal((await (await fetch(s+'/api/sandbox/health')).json()).paidApiCalls,0);
});
