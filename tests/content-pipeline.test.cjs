'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {parseAccountProfile,resolveContentProfile}=require('../runtime-patches/content-capability.cjs');
const profile=JSON.stringify({hours:[8,22],contentProfile:{key:'yubao-copy-v1',version:1,protectedPackaging:true}});
const service=(rows)=>({prisma:{account:{findMany:async()=>rows}}});
const campaign=(personaId='persona-NEW',publishAccountIds=['account-1'])=>({personaId,publishAccountIds});
const read=(p)=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('capability follows account/persona binding, not a database ID',async()=>{
 const a={id:'account-1',role:'publisher',personaId:'persona-NEW',activeWindow:profile};
 assert.deepEqual(await resolveContentProfile(service([a]),campaign()),{kind:'protected'});
 assert.equal((await resolveContentProfile(service([a]),campaign('persona-CHANGED'))).kind,'blocked');
 a.personaId='persona-CHANGED';
 assert.equal((await resolveContentProfile(service([a]),campaign('persona-CHANGED'))).kind,'protected');
});
test('ordinary account isolation and missing publisher fail closed',async()=>{
 const a={id:'account-1',role:'publisher',personaId:'persona-NEW',activeWindow:'{"hours":[8,22]}'};
 assert.deepEqual(await resolveContentProfile(service([a]),campaign()),{kind:'standard'});
 assert.equal((await resolveContentProfile(service([]),campaign())).kind,'blocked');
});
test('mixed publishers and malformed capability fail closed',async()=>{
 const a={id:'account-1',role:'publisher',personaId:'persona-NEW',activeWindow:profile};
 const b={id:'account-2',role:'publisher',personaId:'persona-NEW',activeWindow:'{}'};
 assert.equal((await resolveContentProfile(service([a,b]),campaign('persona-NEW',['account-1','account-2']))).kind,'blocked');
 assert.equal(parseAccountProfile('{bad').kind,'blocked');
 assert.equal(parseAccountProfile(JSON.stringify({contentProfile:{key:'unexpected'}})).kind,'blocked');
 assert.equal((await resolveContentProfile(service([a]),campaign('persona-NEW',['account-1','account-1']))).kind,'blocked');
});
test('effective patch chain uses shared account capability and no fixed persona ID',()=>{
 const startup=read('cloud/start.cjs');
 for(const patch of ['workflow-compat.cjs','business-context.cjs','composition-compat.cjs','copywriting-compat.cjs']) {
   assert.ok(startup.includes(patch));
   const src=read('runtime-patches/'+patch);
   assert.match(src,/resolveContentProfile/);
   assert.doesNotMatch(src,/cmw1s72vh000yqcncwkg0hgx1/);
 }
});
test('image failures visible; packaging integrity and human review remain',()=>{
 const orch=read('backend-ts/src/modules/autopilot/orchestrator.service.ts');
 assert.match(orch,/this\.log\(campaignId, "image", "error"/);
 assert.match(orch,/Math\.min\(4, Math\.max\(1/);
 assert.doesNotMatch(orch,/cad\.imageSource \|\| "ai"/);
 assert.match(orch,/d\.complianceChecked === true/);
 const comp=read('runtime-patches/composition-compat.cjs');
 assert.match(comp,/sha\(original\)!==registry\[material\.id\]\.sha256/);
 assert.match(comp,/if\(!tested\|\|mismatches\)/);
 const gen=read('backend-ts/src/modules/generate/generate.service.ts');
 assert.ok(gen.includes('source === "library" ? 0 : n - newImages.length'));
 assert.ok(gen.includes('if (source !== "library") {'));
 assert.ok(gen.includes('if (newImages.length !== n)'));
 assert.ok(gen.includes('complianceChecked: false'));
 const logs=read('frontend/src/views/RunLogsView.vue');
 assert.match(logs,/image: '配图'/);
});
