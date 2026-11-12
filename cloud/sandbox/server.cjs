'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {createSandbox}=require('./core.cjs');
const PORT=4182,ORIGIN='http://127.0.0.1:'+PORT;
const networkCounters=require('./security.cjs').install();
if(process.env.CLOUD_TEST_MODE!=='1'||process.env.SYNTHETIC_SANDBOX!=='1')throw Error('Explicit synthetic mode required');
if(Object.keys(process.env).some(k=>/API_KEY|COOKIE|ACCESS_TOKEN|REFRESH_TOKEN/i.test(k)))throw Error('Production credential environment refused; use the clean Windows launcher');
const allowed=new Set(['candidates','edit-topic','review-topic','copy','edit-draft','images','submit-review','review-draft']);
let serial=Promise.resolve();
(async()=>{
 const box=await createSandbox();
 const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
 const server=http.createServer(async(req,res)=>{
  try{
   if(req.headers.host!=='127.0.0.1:'+PORT)return json(res,403,{message:'Loopback host only'});
   const u=new URL(req.url,ORIGIN);
   if(req.method==='GET'&&u.pathname==='/api/sandbox/health')return json(res,200,{status:'ok',db:'synthetic',mode:'offline-mock',realAccounts:0,paidApiCalls:0,networkCounters});
   if(req.method==='GET'&&u.pathname==='/api/sandbox/state')return json(res,200,await box.snapshot());
   if(req.method==='GET'&&u.pathname.startsWith('/sandbox-images/')){const p=box.getImage(u.pathname.split('/').pop());res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'});fs.createReadStream(p).pipe(res);return;}
   if(req.method==='GET'&&(u.pathname==='/'||u.pathname==='/index.html')){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"});res.end(fs.readFileSync(path.join(__dirname,'index.html')));return;
   }
   const action=u.pathname.replace('/api/sandbox/action/','');
   if(req.method!=='POST'||!u.pathname.startsWith('/api/sandbox/action/')||!allowed.has(action))return json(res,403,{message:'仅开放合成验收白名单。发布、登录、采集、网关、设置、文件夹、计划任务及其他 API 全部禁止。'});
   if((req.headers.origin&&req.headers.origin!==ORIGIN)||req.headers['x-sandbox-mode']!=='synthetic'||!String(req.headers['content-type']).startsWith('application/json'))return json(res,403,{message:'Same-origin synthetic JSON client required'});
   let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>65536)return json(res,413,{message:'Request too large'});}
   const input=JSON.parse(raw);if(!input||typeof input!=='object'||Array.isArray(input))return json(res,400,{message:'JSON object required'});
   const task=serial.then(()=>box.act(action,input));serial=task.catch(()=>{});const value=await task;json(res,200,{mock:true,value});
  }catch(e){json(res,e.statusCode||400,{message:e.message,mock:true,noPaidFallback:true});}
 });
 server.listen(PORT,'127.0.0.1',()=>console.log(JSON.stringify({event:'SYNTHETIC_SANDBOX_RUNNING',url:ORIGIN,pid:process.pid,db:box.dbfile,provider:'offline-mock-v1',paidApiCalls:0})));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await box.close();process.exit(0);}));
})().catch(e=>{console.error(e);process.exitCode=1;});
