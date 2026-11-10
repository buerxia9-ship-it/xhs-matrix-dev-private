'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),http=require('node:http'),crypto=require('node:crypto');
const {ROOT,dataPath,testEnvironment}=require('../cloud/preflight.cjs');
test('test data cannot escape the isolated repository',()=>{
 assert.equal(dataPath(),path.join(ROOT,'.cloud-data'));
 assert.throws(()=>dataPath(path.join(ROOT,'..','forbidden')),/inside/);
 assert.throws(()=>dataPath(path.parse(ROOT).root),/inside/);
});
test('production credentials and DB settings are not forwarded',()=>{
 const before=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='synthetic-unit-placeholder';
 try{const env=testEnvironment();assert.equal(env.OPENAI_API_KEY,undefined);assert.equal(env.LAN_ACCESS,'0');assert.match(env.DATABASE_URL,/\.cloud-data/);assert.equal(env.PORT,'4181');}
 finally{if(before===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=before;}
});
test('no production data, credentials, bitmaps or caches in code baseline',()=>{
 const bad=[];
 function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  if(['.git','.cloud-data','node_modules','dist'].includes(e.name))continue;
  const file=path.join(dir,e.name);
  if(e.isSymbolicLink())bad.push(file);
  else if(e.isDirectory())walk(file);
  else if(/\.(db|sqlite|png|jpg|jpeg|webp|log|enc|dpapi|zip)$/i.test(e.name)||(/^\.env/.test(e.name)&&e.name!=='.env.example'))bad.push(file);
 }}
 walk(ROOT);assert.deepEqual(bad,[]);
});
test('existing 25 language-policy regression cases run without a model',()=>{
 const out=cp.execFileSync(process.execPath,[path.join(ROOT,'runtime-patches/copywriting/test-policy.cjs')],{encoding:'utf8'});
 const result=JSON.parse(out.trim());assert.equal(result.passed,25);assert.equal(result.networkCalls,0);
});
test('Terra parameter compatibility remains an offline test',()=>{
 const result=JSON.parse(cp.execFileSync(process.execPath,[path.join(ROOT,'tests/terra-parameters.cjs')],{encoding:'utf8'}).trim());
 assert.equal(result.passed,true);assert.equal(result.networkCalls,0);
});
test('synthetic SQLite fixture has zero accounts/providers and valid associations',()=>{
 const python=process.env.PYTHON_BIN||(process.platform==='win32'?'python':'python3');
 const file=path.join(ROOT,'.cloud-data','test-'+crypto.randomUUID()+'.db');
 const out=cp.execFileSync(python,[path.join(ROOT,'cloud/create-fixture.py'),'--database',file],{encoding:'utf8'});
 const result=JSON.parse(out.trim());assert.equal(result.synthetic,true);assert.equal(result.accounts,0);assert.equal(result.modelProviders,0);assert.equal(result.wikiPageCount,10);assert.equal(result.integrity,'ok');
});
test('network denial has a live localhost positive control',async()=>{
 const guard=require('../cloud/network-guard.cjs');guard.install();
 const nonce=crypto.randomBytes(16).toString('hex'),server=http.createServer((req,res)=>res.end(nonce));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url='http://127.0.0.1:'+server.address().port;
  assert.equal(await (await fetch(url)).text(),nonce);
  await assert.rejects(fetch('https://api.openai.com/'),/EXTERNAL_NETWORK_BLOCKED/);
  assert.throws(()=>require('node:https').request('https://example.com/'),/EXTERNAL_NETWORK_BLOCKED/);
  assert.throws(()=>require('node:net').connect(443,'example.com'),/EXTERNAL_NETWORK_BLOCKED/);
  assert.equal(await (await fetch(url)).text(),nonce);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('upstream license retained and fixtures explicitly non-authoritative',()=>{
 assert.match(fs.readFileSync(path.join(ROOT,'LICENSE'),'utf8'),/MIT License/);
 assert.match(fs.readFileSync(path.join(ROOT,'fixtures/README.md'),'utf8'),/no production rows/);
 assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT,'runtime-patches/composition/protected-assets.json'),'utf8')).constructor,Object);
});

test('fixture creator rejects a reparse path instead of writing into another directory',()=>{
 const base=dataPath();fs.mkdirSync(base,{recursive:true});
 const link=path.join(base,'reparse-'+crypto.randomUUID());
 const target=path.join(ROOT,'fixtures');
 fs.symlinkSync(target,link,process.platform==='win32'?'junction':'dir');
 try{
  assert.throws(()=>dataPath(path.join(link,'never-created.db')),/Reparse/);
  const python=process.env.PYTHON_BIN||(process.platform==='win32'?'python':'python3');
  const r=cp.spawnSync(python,[path.join(ROOT,'cloud/create-fixture.py'),'--database',path.join(link,'never-created.db')],{encoding:'utf8'});
  assert.notEqual(r.status,0);
  assert.equal(fs.existsSync(path.join(target,'never-created.db')),false);
 }finally{
  if(!link.startsWith(base+path.sep)||!fs.lstatSync(link).isSymbolicLink())throw Error('Refusing unexpected cleanup target');
  fs.unlinkSync(link);
 }
});
