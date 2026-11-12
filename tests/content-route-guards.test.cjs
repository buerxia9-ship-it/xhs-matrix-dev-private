'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const capability=require(path.join(root,'runtime-patches/content-capability.cjs'));
const profile=JSON.stringify({contentProfile:{key:'yubao-copy-v1',version:1,protectedPackaging:true}});
function fixture(rawIds=['acct']){
 let fallback=0,gatewayCalls=0;
 class GenerateService{}
 GenerateService.prototype.generateFromTopic=async()=>({standard:true});
 GenerateService.prototype.generateImageForDraft=async function(id,prompt,ratio,count,source){fallback++;return {images:['synthetic-sentinel'],source,count};};
 class CollectService{} CollectService.prototype.runForCampaign=async()=>{};
 class MockCollector{} class MaterialService{}
 const classes={GenerateService,CollectService,MockCollector,MaterialService};
 const fakeRequire=id=>{
   if(id.endsWith('content-capability.cjs'))return capability;
   if(id==='@nestjs/common')return{BadRequestException:class extends Error{}};
   if(id==='sharp')return()=>{throw Error('Pixel operations not executed in guard tests');};
   if(id.split(path.sep).includes('dist'))return classes;
   return require(id);
 };
 fakeRequire.resolve=id=>id;
 for(const name of ['workflow-compat.cjs','composition-compat.cjs']){
  const file=path.join(root,'runtime-patches',name),module={exports:{}};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require:fakeRequire,__dirname:path.dirname(file),process:{env:{DATA_DIR:path.join(root,'.cloud-data','guard-test')}}},{filename:file});
  module.exports('/synthetic-backend');
 }
 const campaign={id:'campaign',personaId:'persona-new',publishAccountIds:rawIds};
 const draft={id:'draft',campaignId:'campaign',personaId:'persona-new',title:'synthetic only',body:'synthetic only',images:'[]'};
 const account={id:'acct',role:'publisher',personaId:'persona-new',activeWindow:profile};
 const svc=new GenerateService();
 svc.prisma={draft:{findUnique:async()=>draft},account:{findMany:async()=>[account]},material:{findMany:async()=>[]}};
 svc.campaigns={findOne:async()=>campaign};svc.materials={list:async()=>[]};
 svc.gateway={chat:async()=>{gatewayCalls++;throw Error('No model calls permitted');},generateImage:async()=>{gatewayCalls++;throw Error('No model calls permitted');}};
 return{svc,campaign,account,fallback:()=>fallback,gatewayCalls:()=>gatewayCalls};
}
test('actual workflow guard rejects protected AI/library after persona rebind, no fallback or model',async()=>{
 const f=fixture();for(const source of ['ai','library'])await assert.rejects(f.svc.generateImageForDraft('draft',undefined,'3:4',1,source),/受保护包装/);
 f.account.personaId=f.campaign.personaId='persona-rebound';
 await assert.rejects(f.svc.generateImageForDraft('draft',undefined,'3:4',4,'ai'),/受保护包装/);
 assert.equal(f.fallback(),0);assert.equal(f.gatewayCalls(),0);
});
test('actual workflow+composition mix blocks missing registered asset before model, counts 1..4',async()=>{
 const f=fixture();for(const n of [1,2,3,4])await assert.rejects(f.svc.generateImageForDraft('draft',undefined,'3:4',n,'mix'),/缺少已确认的透明包装原图/);
 assert.equal(f.fallback(),0);assert.equal(f.gatewayCalls(),0);
});
test('actual wrapper passes ordinary account to original route without protected composition',async()=>{
 const f=fixture();f.account.activeWindow='{}';
 const result=await f.svc.generateImageForDraft('draft',undefined,'3:4',2,'library');
 assert.equal(result.source,'library');assert.equal(f.fallback(),1);assert.equal(f.gatewayCalls(),0);
});
test('malformed configured publisher IDs must block before standard AI fallback',async()=>{
 const f=fixture('not-json');
 // Assert the required safe behavior using the real installed workflow wrapper.
 await assert.rejects(f.svc.generateImageForDraft('draft',undefined,'3:4',1,'ai'));
 assert.equal(f.fallback(),0);
});

test('malformed lists and configured publishers without persona are blocked by resolver',async()=>{
 for(const raw of ['not-json','{}','null','"acct"',false,7]){
  const f=fixture(raw);
  assert.equal((await capability.resolveContentProfile(f.svc,f.campaign)).kind,'blocked');
 }
 const f=fixture();f.campaign.personaId=null;
 assert.equal((await capability.resolveContentProfile(f.svc,f.campaign)).kind,'blocked');
});
