'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {ROOT,dataPath,testEnvironment}=require('./preflight.cjs');
if(process.env.CLOUD_TEST_MODE!=='1')throw Error('Explicit CLOUD_TEST_MODE=1 required');
const env=testEnvironment(dataPath());
Object.assign(process.env,env);
for(const key of Object.keys(process.env))if(/API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|COOKIE|PASSWORD|PROXY/i.test(key))delete process.env[key];
if(!fs.existsSync(path.join(env.DATA_DIR,'fixture.db')))throw Error('Run the synthetic fixture creator first');
const runtime=path.join(env.DATA_DIR,'runtime');
fs.cpSync(path.join(ROOT,'runtime-patches'),runtime,{recursive:true});
const fixtureManifest=path.join(env.DATA_DIR,'fixture-manifest.json');
if(fs.existsSync(fixtureManifest))fs.copyFileSync(fixtureManifest,path.join(runtime,'business-cleanup/generation-manifest.json'));
require('./network-guard.cjs').install();
for(const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])cp[name]=()=>{throw Error('CLOUD_TEST_SUBPROCESS_BLOCKED');};
const backend=path.join(ROOT,'backend-ts');process.chdir(backend);
const Module=require('node:module'),load=Module._load;
const sqlite=require(path.join(backend,'node_modules/better-sqlite3'));
Module._load=function(name,parent,isMain){
 if(name==='better-sqlite3')return sqlite;
 if(name==='patchright')return {chromium:{launch(){throw Error('CLOUD_TEST_BROWSER_BLOCKED');},launchPersistentContext(){throw Error('CLOUD_TEST_BROWSER_BLOCKED');}}};
 if(name==='express'&&parent?.filename===path.join(backend,'dist/main.js')){
  const fromNest=Module.createRequire(require.resolve('@nestjs/platform-express/package.json',{paths:[backend]}));return fromNest('express');
 }
 return load.call(this,name,parent,isMain);
};
const http=require('node:http'),emit=http.Server.prototype.emit;
http.Server.prototype.emit=function(event,...args){
 if(event==='request'){
  const [req,res]=args,url=new URL(req.url,'http://127.0.0.1:4181');
  if(!['GET','HEAD','OPTIONS'].includes(req.method)||/^\/api\/v1\/(publish|collect|autopilot|account)/.test(url.pathname)){
   res.writeHead(403,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Synthetic cloud preview is read-only; accounts, external AI and publishing disabled'}));return true;
  }
 }
 return emit.call(this,event,...args);
};
for(const name of ['openai-compat.cjs','workflow-compat.cjs','business-context.cjs','acceptance-compat.cjs','composition-compat.cjs','copywriting-compat.cjs'])require(path.join(runtime,name))(backend);
const {SettingsService}=require(path.join(backend,'dist/modules/settings/settings.service.js'));
SettingsService.prototype.getAutoLaunch=()=>({enabled:false,cloudTest:true});
SettingsService.prototype.setAutoLaunch=()=>{throw Error('CLOUD_TEST_OS_SETTINGS_BLOCKED');};
require(path.join(backend,'dist/main.js'));
