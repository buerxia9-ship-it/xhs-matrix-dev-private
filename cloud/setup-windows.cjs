'use strict';
// Native Windows equivalent of setup.sh. Never installs OS tools or changes locks.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {ROOT,dataPath}=require('./preflight.cjs');
if(process.versions.node!=='24.22.1')throw Error('Select Node 24.22.1');
process.chdir(ROOT);
const dir=dataPath(),python=process.env.PYTHON_BIN||'python';
const inherited=Object.fromEntries(['SystemRoot','WINDIR','COMSPEC','PATH','PATHEXT','PYTHON_BIN'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const env={...inherited,HOME:path.join(dir,'home'),USERPROFILE:path.join(dir,'home'),APPDATA:path.join(dir,'home/appdata'),LOCALAPPDATA:path.join(dir,'home/localappdata'),CLOUD_TEST_MODE:'1',LAN_ACCESS:'0',DATABASE_URL:'file:'+path.join(dir,'fixture.db').replaceAll('\\','/'),DATA_DIR:dir,PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1',PATCHRIGHT_SKIP_BROWSER_DOWNLOAD:'1',PRISMA_SKIP_POSTINSTALL_GENERATE:'1',npm_config_audit:'false',npm_config_fund:'false',npm_config_registry:'https://registry.npmjs.org',npm_config_replace_registry_host:'always',npm_config_cache:path.join(dir,'cache/npm')};
for(const key of Object.keys(env))if(/API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|COOKIE|PASSWORD/i.test(key))delete env[key];
function run(command,args,cwd=ROOT){const r=cp.spawnSync(command,args,{cwd,env,stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);}
// Safety gate occurs BEFORE cache creation, npm path resolution or installation.
run(python,[path.join(ROOT,'cloud/ensure-fixture.py')]);
if(process.argv.includes('--preflight-only'))process.exit(0);
const npm=process.env.XHS_NPM_CLI||path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
if(!fs.existsSync(npm))throw Error('Provide XHS_NPM_CLI pointing to an existing npm-cli.js; do not install a second framework');
fs.mkdirSync(env.npm_config_cache,{recursive:true});
for(const name of ['user','global']){const p=path.join(dir,'cache/empty-'+name+'.npmrc');fs.writeFileSync(p,'');env['npm_config_'+(name==='user'?'userconfig':'globalconfig')]=p;}
run(process.execPath,[npm,'ci','--prefix','backend-ts','--ignore-scripts','--no-audit','--no-fund']);
run(process.execPath,[npm,'ci','--prefix','frontend','--no-audit','--no-fund']);
// Nested SQLite 11.10 has no Windows Node-24 prebuild. Both preview launchers
// already map it to locked top-level 12.10. Do not silently upgrade either package.
const pkg=path.join(ROOT,'backend-ts/node_modules/better-sqlite3');
if(JSON.parse(fs.readFileSync(path.join(pkg,'package.json'))).version!=='12.10.0'||process.versions.modules!=='137')throw Error('Re-review native package/ABI before changing versions');
const target=path.join(pkg,'build/Release/better_sqlite3.node');
const binarySHA='c045b58a00aeb5939d77d1901df4be384dff49ec452de93fdb02efe8d25fa9f5';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(!fs.existsSync(target)||hash(fs.readFileSync(target))!==binarySHA){
 const archive=path.join(dir,'cache/better-sqlite3-12.10.0-node137-win64.tar.gz');
 const installer=String.raw`import sys,urllib.request,hashlib,tarfile,io,pathlib
url='https://github.com/WiseLibs/better-sqlite3/releases/download/v12.10.0/better-sqlite3-v12.10.0-node-v137-win32-x64.tar.gz'
class Redirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  from urllib.parse import urlsplit
  assert urlsplit(newurl).scheme=='https' and urlsplit(newurl).hostname in ['github.com','release-assets.githubusercontent.com']
  return super().redirect_request(req,fp,code,msg,headers,newurl)
with urllib.request.build_opener(Redirect()).open(url,timeout=90) as r: data=r.read(5*1024*1024)
assert hashlib.sha256(data).hexdigest()=='0f6d948e6438f64c983d08a2048ef10d6f467f36a8c08f20d31f585c019eb83c'
pathlib.Path(sys.argv[1]).write_bytes(data)
with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as t: payload=t.extractfile(t.getmember('build/Release/better_sqlite3.node')).read()
target=pathlib.Path(sys.argv[2]);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(payload)`;
 run(python,['-c',installer,archive,target]);
}
if(hash(fs.readFileSync(target))!==binarySHA)throw Error('Native SQLite integrity mismatch');
run(process.execPath,[path.join(ROOT,'backend-ts/node_modules/prisma/build/index.js'),'generate','--schema',path.join(ROOT,'backend-ts/prisma/schema.prisma')]);
run(process.execPath,[npm,'--prefix','backend-ts','run','build']);
run(process.execPath,[npm,'--prefix','frontend','run','build']);
run(process.execPath,[npm,'test']);
