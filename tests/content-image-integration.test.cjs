'use strict';
// Real Sharp pixels + compiled NestJS services; every image, DB row and gateway is synthetic.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend-ts');
const sharp = require(path.join(backend, 'node_modules/sharp'));
const capability = require(path.join(root, 'runtime-patches/content-capability.cjs'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

async function syntheticComposition() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xhs-auto-dev-004-synthetic-'));
  for (const name of ['material-images', 'generated-images', 'composition'])
    fs.mkdirSync(path.join(tmp, name), {recursive:true});
  const transparent = await sharp({create:{width:160,height:240,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();
  const square = await sharp({create:{width:100,height:160,channels:4,background:{r:200,g:70,b:90,alpha:1}}}).png().toBuffer();
  const original = await sharp(transparent).composite([{input:square,left:30,top:40}]).png().toBuffer();
  const assetFile = path.join(tmp, 'material-images', 'synthetic-original.png');
  fs.writeFileSync(assetFile, original);
  await sharp({create:{width:450,height:600,channels:4,background:{r:235,g:245,b:249,alpha:1}}})
    .png().toFile(path.join(tmp, 'generated-images', 'synthetic-background.png'));
  const registryPath = path.join(tmp, 'composition', 'protected-assets.json');
  const registry = { 'synthetic-asset': {sha256:sha(original),flavor:'unscented',allowedCampaignIds:['synthetic-campaign']} };
  const saveRegistry = () => fs.writeFileSync(registryPath, JSON.stringify(registry));
  saveRegistry();

  let gatewayCalls = 0, fallbackCalls = 0, updates = 0;
  const account = {id:'synthetic-account',role:'publisher',personaId:'persona-rebound',activeWindow:JSON.stringify({
    contentProfile:{key:'yubao-copy-v1',version:1,protectedPackaging:true}
  })};
  const campaign = {id:'synthetic-campaign',personaId:'persona-rebound',publishAccountIds:['synthetic-account']};
  const draft = {id:'synthetic-draft',campaignId:campaign.id,topicId:'synthetic-topic',personaId:campaign.personaId,
    title:'迪拜猫砂合成验证',body:'纯合成测试，没有客户或真实产品',images:'[]',status:'ready',complianceChecked:true};
  const material = {id:'synthetic-asset',url:'/materials/synthetic-original.png',name:'synthetic packaging fixture'};
  class GenerateService {}
  GenerateService.prototype.generateImageForDraft = async function(){fallbackCalls++;throw Error('unsafe fallback');};
  const fakeRequire = id => {
    if (id.includes('content-capability.cjs')) return capability;
    if (id === '@nestjs/common') return {BadRequestException:class BadRequestException extends Error {}};
    if (id === 'sharp') return sharp;
    if (id.includes('/dist/modules/generate/generate.service')) return {GenerateService};
    return require(id);
  };
  fakeRequire.resolve = id => id;
  const file = path.join(root, 'runtime-patches/composition-compat.cjs');
  const moduleObject = {exports:{}};
  vm.runInNewContext(fs.readFileSync(file,'utf8'), {
    module:moduleObject,exports:moduleObject.exports,require:fakeRequire,__dirname:tmp,
    process:{env:{DATA_DIR:tmp}},Buffer,console
  }, {filename:file});
  moduleObject.exports(backend);
  const svc = new GenerateService();
  svc.prisma = {
    account:{findMany:async()=>[account]},
    draft:{
      findUnique:async()=>draft,
      update:async({data})=>{updates++;Object.assign(draft,data);return {...draft};}
    },
    material:{findMany:async()=>[]}
  };
  svc.campaigns = {findOne:async()=>campaign};
  svc.materials = {list:async()=>[material]};
  svc.buildVerifiedContext = async()=>({messages:[{content:'Synthetic restrictions only'}]});
  svc.gateway = {
    chat:async()=>{gatewayCalls++;return {content:JSON.stringify({headline:'迪拜猫砂原图保护',scene:'synthetic pale wall'})};},
    generateImage:async()=>{gatewayCalls++;return {images:['/generated/synthetic-background.png']};}
  };
  svc.deserialize = row => ({...row,images:JSON.parse(row.images)});
  return {tmp,svc,draft,assetFile,original,registry,saveRegistry,
    calls:()=>gatewayCalls,fallthrough:()=>fallbackCalls,updates:()=>updates,
    cleanup:()=>fs.rmSync(tmp,{recursive:true,force:true})};
}

test('real Sharp protected composition preserves opaque pixels for 1,2,3,4 images',async()=>{
  const f = await syntheticComposition();
  try {
    for(const n of [1,2,3,4]) {
      f.draft.images='[]'; f.draft.complianceChecked=true;
      const result=await f.svc.generateImageForDraft(f.draft.id,undefined,'3:4',n,'mix');
      assert.equal(result.images.length,n, 'exact planned count');
      assert.equal(f.draft.complianceChecked,false, 'new images revoke approval');
      for(const url of result.images) assert.ok(fs.existsSync(path.join(f.tmp,'generated-images',path.basename(url))));
      const records=fs.readdirSync(path.join(f.tmp,'composition')).filter(x=>x.endsWith('.json')&&x!=='protected-assets.json')
        .map(x=>JSON.parse(fs.readFileSync(path.join(f.tmp,'composition',x),'utf8')));
      const record=records.find(x=>x.draftId===f.draft.id&&x.ratio==='3:4'&&x.images.length===n);
      assert.ok(record,'composition audit exists for planned count '+n);
      assert.equal(record.assets.length,n);
      for(const asset of record.assets) {
        assert.equal(asset.sourceSha256,sha(f.original));
        assert.ok(asset.verifiedOpaquePixels>0);
        assert.equal(asset.mismatches,0);
      }
    }
    assert.equal(f.fallthrough(),0,'never calls ordinary unprotected image route');
  } finally { f.cleanup(); }
});

test('missing or tampered packaging and non-transparent asset block before gateway',async()=>{
  const f=await syntheticComposition();
  try {
    fs.unlinkSync(f.assetFile);
    await assert.rejects(f.svc.generateImageForDraft(f.draft.id,undefined,'3:4',1,'mix'),/缺少已确认/);
    fs.writeFileSync(f.assetFile,Buffer.concat([f.original,Buffer.from('tampered')]));
    await assert.rejects(f.svc.generateImageForDraft(f.draft.id,undefined,'3:4',1,'mix'),/原图已变化/);
    const rgb=await sharp({create:{width:160,height:240,channels:3,background:{r:100,g:110,b:120}}}).png().toBuffer();
    fs.writeFileSync(f.assetFile,rgb);
    f.registry['synthetic-asset'].sha256=sha(rgb);f.saveRegistry();
    await assert.rejects(f.svc.generateImageForDraft(f.draft.id,undefined,'3:4',1,'mix'),/透明背景/);
    assert.equal(f.calls(),0,'no model or image service invoked');
    assert.equal(f.updates(),0,'draft remains unchanged');
    assert.equal(f.fallthrough(),0);
  } finally { f.cleanup(); }
});

test('compiled publish service refuses unapproved, missing-image and over-count drafts',async()=>{
  const {PublishService}=require(path.join(backend,'dist/modules/publish/publish.service'));
  let sent=0,jobs=0;
  const draft={id:'synthetic-draft',campaignId:'synthetic-campaign',status:'ready',complianceChecked:false,
    images:'["/generated/synthetic.png"]',hashtags:'[]',title:'synthetic',body:'synthetic'};
  const prisma={
    draft:{findUnique:async()=>draft,update:async()=>draft},
    publishJob:{create:async()=>{jobs++;return{id:'job'};},update:async()=>({})}
  };
  const publisher={publishNote:async()=>{sent++;return{ok:true,message:'synthetic stub only'};}};
  const svc=new PublishService(prisma,publisher);
  await assert.rejects(svc.publishDraft(draft.id,'synthetic-account'),/人工审核/);
  draft.complianceChecked=true;draft.images='[]';
  await assert.rejects(svc.publishDraft(draft.id,'synthetic-account'),/人工审核/);
  draft.images=JSON.stringify(Array.from({length:5},(_,i)=>'/generated/synthetic-'+i+'.png'));
  await assert.rejects(svc.publishDraft(draft.id,'synthetic-account'),/人工审核/);
  assert.equal(sent,0);assert.equal(jobs,0);
  draft.images='["/generated/synthetic.png"]';
  const result=await svc.publishDraft(draft.id,'synthetic-account',{holdForManual:true});
  assert.equal(result.manual,true);
  assert.equal(sent,1,'only the synthetic publisher stub is called');
  assert.equal(jobs,1);
});

test('compiled autopilot does not dispatch unapproved or image-less drafts',async()=>{
  const {OrchestratorService}=require(path.join(backend,'dist/modules/autopilot/orchestrator.service'));
  const svc=Object.create(OrchestratorService.prototype);
  let calls=0;
  const drafts=[
    {id:'unapproved',title:'a',status:'ready',complianceChecked:false,images:['/generated/x.png']},
    {id:'no-image',title:'b',status:'ready',complianceChecked:true,images:[]}
  ];
  svc.generate={draftsByCampaign:async()=>drafts};
  svc.publish={publishDraft:async()=>{calls++;throw Error('no real publishing allowed');}};
  const result=await svc.autoPublish({id:'synthetic-campaign',publishAccountIds:['synthetic-account'],cadence:{}});
  assert.equal(result,'无待发布草稿');
  assert.equal(calls,0);
});
test('mark-done cannot claim publication without approval, correct manual job and account',async()=>{
  const {PublishService}=require(path.join(backend,'dist/modules/publish/publish.service'));
  const draft={id:'synthetic-draft',campaignId:'synthetic-campaign',status:'ready',
    complianceChecked:false,images:'["/generated/synthetic.png"]',accountId:null};
  let writes=0,created=0,released=0;
  const awaiting={id:'manual-job',draftId:draft.id,accountId:'synthetic-account',status:'awaiting_manual'};
  const prisma={
    draft:{
      findUnique:async()=>draft,
      update:async({data})=>{writes++;Object.assign(draft,data);return draft;}
    },
    publishJob:{
      findFirst:async({where})=>where.status===awaiting.status&&where.accountId===awaiting.accountId?awaiting:null,
      update:async({data})=>{writes++;Object.assign(awaiting,data);return awaiting;},
      create:async()=>{created++;throw Error('must reuse existing job');},
    },
    $transaction:async ops=>Promise.all(ops),
  };
  const svc=new PublishService(prisma,{releaseHeld:async()=>{released++;},publishNote:async()=>{throw Error('real publishing prohibited')}});
  await assert.rejects(svc.markPublished(draft.id,'synthetic-account'),/人工审核/);
  draft.complianceChecked=true;draft.images='[]';
  await assert.rejects(svc.markPublished(draft.id,'synthetic-account'),/人工审核/);
  draft.images='["/generated/synthetic.png"]';
  await assert.rejects(svc.markPublished(draft.id),/选择/);
  await assert.rejects(svc.markPublished(draft.id,'different-account'),/待人工确认/);
  assert.equal(writes,0);assert.equal(created,0);assert.equal(released,0);
  const done=await svc.markPublished(draft.id,'synthetic-account');
  assert.equal(done.ok,true);assert.equal(draft.status,'published');assert.equal(awaiting.status,'published');
  assert.equal(writes,2);assert.equal(created,0);assert.equal(released,1);
  await assert.rejects(svc.markPublished(draft.id,'synthetic-account'),/人工审核/);
});

test('compiled orchestrator records image errors separately from generated copy',async()=>{
  const {OrchestratorService}=require(path.join(backend,'dist/modules/autopilot/orchestrator.service'));
  const notes=[],topic={id:'synthetic-topic',status:'candidate'};
  const campaign={id:'synthetic-campaign',runMode:'semi',personaId:null,
    cadence:{imageSource:'mix',imageCount:2,collectCooldownHours:20,draftsPerTopic:1,contentMix:[{type:'干货',weight:100,embedRate:0}]}};
  const prisma={
    runLog:{create:async({data})=>{notes.push(data);return data;}},
    collectTask:{findFirst:async()=>({createdAt:new Date(),status:'done'})},
    note:{count:async()=>1},
    campaign:{
      findUnique:async()=>({cadence:'{}'}),
      update:async()=>({})
    },
  };
  const generate={
    draftsByCampaign:async()=>[],
    generateFromTopic:async()=>({id:'synthetic-draft',title:'迪拜猫砂模拟'}),
    generateImageForDraft:async()=>{throw new Error('SYNTHETIC_IMAGE_ERROR');}
  };
  let publications=0;
  const analysis={
    runForCampaign:async()=>({insightCount:0,topicCount:1}),
    topicsByCampaign:async()=>[topic],
    updateTopicStatus:async()=>{topic.status='adopted';},
  };
  const svc=new OrchestratorService(prisma,{findOne:async()=>campaign},null,analysis,generate,{publishDraft:async()=>{publications++;}},{});
  const output=await svc.runOnce(campaign.id);
  assert.ok(notes.some(n=>n.stage==='image'&&n.status==='error'&&/SYNTHETIC_IMAGE_ERROR/.test(n.detail)));
  assert.ok(output.summary.some(x=>/文案 1 篇；配图成功 0 篇、失败或阻断 1 篇/.test(x)));
  assert.equal(publications,0);
  assert.ok(notes.some(n=>n.stage==='done'&&n.status==='ok'));
});
