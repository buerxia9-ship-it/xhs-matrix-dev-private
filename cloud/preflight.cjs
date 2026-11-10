'use strict';
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
function dataPath(candidate){
 const base=path.join(ROOT,'.cloud-data'),resolved=path.resolve(candidate||base);
 const rel=path.relative(base,resolved);
 if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('Test data must remain inside repository .cloud-data');
 for(let p=resolved;p!==path.dirname(p);p=path.dirname(p)){
  if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('Reparse/symlink in test data path');
 }
 return resolved;
}
function testEnvironment(directory){
 const dir=dataPath(directory),env={};
 for(const key of ['SystemRoot','WINDIR','COMSPEC','PATH','PATHEXT','LANG','LC_ALL','TZ','HOME','USERPROFILE','TEMP','TMP'])if(process.env[key])env[key]=process.env[key];
 for(const key of Object.keys(env))if(/KEY|TOKEN|SECRET|COOKIE|PASSWORD|PROXY/i.test(key))delete env[key];
 Object.assign(env,{CLOUD_TEST_MODE:'1',NODE_ENV:'test',DATA_DIR:dir,DATABASE_URL:'file:'+path.join(dir,'fixture.db').replaceAll('\\','/'),PORT:'4181',LAN_ACCESS:'0',ENCRYPTION_KEY:'synthetic-local-test-value-only',FRONTEND_DIST_DIR:path.join(ROOT,'frontend/dist'),YUBAO_COPY_ARTIFACT_ROOT:path.join(dir,'copywriting')});
 return env;
}
module.exports={ROOT,dataPath,testEnvironment};
