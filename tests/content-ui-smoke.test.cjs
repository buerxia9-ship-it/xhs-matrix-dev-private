'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'frontend', 'dist');
const {chromium} = require(path.join(root, 'backend-ts', 'node_modules', 'patchright'));

const syntheticDrafts = [
  {id:'unapproved',title:'SYNTH-UNAPPROVED',status:'ready',complianceChecked:false,images:['/generated/fake.png']},
  {id:'approved-no-job',title:'SYNTH-NO-MANUAL-JOB',status:'ready',complianceChecked:true,images:['/generated/fake.png']},
  {id:'approved-manual',title:'SYNTH-MANUAL-READY',status:'ready',complianceChecked:true,images:['/generated/fake.png']}
];
const syntheticJobs = [
  {id:'manual-job',draftId:'approved-manual',accountId:'synthetic-account',status:'awaiting_manual',createdAt:'2026-11-12T00:00:00Z'}
];
const json = (res,code,data) => {
  res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(data));
};
function fixtureServer(count) {
  return http.createServer((req,res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if(url.pathname.startsWith('/api/v1/')) {
      if(url.pathname === '/api/v1/health') return json(res,200,{status:'ok',db:'synthetic'});
      if(url.pathname === '/api/v1/campaigns') return json(res,200,[{
        id:'synthetic-campaign',name:'Synthetic local only',productName:'SYNTH',publishAccountIds:['synthetic-account']
      }]);
      if(url.pathname === '/api/v1/accounts') return json(res,200,[{
        id:'synthetic-account',nickname:'SYNTHETIC',role:'publisher',status:'active'
      }]);
      if(url.pathname === '/api/v1/generate/drafts') return json(res,200,syntheticDrafts);
      if(url.pathname === '/api/v1/publish/jobs') return json(res,200,syntheticJobs);
      if(url.pathname === '/api/v1/autopilot/logs') return json(res,200,[{
        id:'synthetic-log-1',stage:'image',status:'error',detail:'SYNTHETIC_IMAGE_ERROR',createdAt:'2026-11-12T00:00:00Z'
      }]);
      if(url.pathname === '/api/v1/publish/mark-done') {
        count.calls++;
        return json(res,200,{ok:true,synthetic:true});
      }
      return json(res,404,{message:'fixture endpoint not configured'});
    }
    const relative = decodeURIComponent(url.pathname);
    const file = path.resolve(dist,'.'+(relative === '/' ? '/index.html' : relative));
    if(!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);res.end('not found');return;
    }
    const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.json':'application/json'};
    res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream'});
    fs.createReadStream(file).pipe(res);
  });
}
test('built Vue review controls and image error log are visible with only synthetic local fixtures',async t => {
  assert.ok(fs.existsSync(path.join(dist,'index.html')),'real Vue build required');
  const chrome=['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(x=>fs.existsSync(x));
  assert.ok(chrome,'CI runner must provide a Chrome browser; never silently skip UI test');
  const count={calls:0};
  const server=fixtureServer(count);
  await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  t.after(async()=>{await browser.close();});
  const page=await browser.newPage();
  const pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(e.message));
  await page.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.hostname!=='127.0.0.1') return route.abort('blockedbyclient');
    return route.continue();
  });
  const url='http://127.0.0.1:'+server.address().port;
  await page.goto(url+'/#/publish',{waitUntil:'networkidle'});
  const rowFor=title=>page.locator('.el-table__body tbody tr').filter({hasText:title}).first();
  const unapproved=rowFor('SYNTH-UNAPPROVED');
  const noJob=rowFor('SYNTH-NO-MANUAL-JOB');
  const ready=rowFor('SYNTH-MANUAL-READY');
  await ready.waitFor({state:'visible',timeout:10000});
  assert.equal(await unapproved.getByRole('button',{name:'拟人填写·自己发'}).isDisabled(),true);
  assert.equal(await unapproved.getByRole('button',{name:'标记已发布'}).isDisabled(),true);
  assert.equal(await noJob.getByRole('button',{name:'标记已发布'}).isDisabled(),true);
  assert.equal(await ready.getByRole('button',{name:'标记已发布'}).isEnabled(),true);
  assert.equal(count.calls,0);
  await ready.getByRole('button',{name:'标记已发布'}).click();
  await page.waitForFunction(()=>document.body.textContent.includes('已标记为已发布'));
  assert.equal(count.calls,1,'only approved pending manual confirmation can invoke synthetic mark-done');
  await page.goto(url+'/#/runlogs',{waitUntil:'networkidle'});
  await page.getByText('SYNTHETIC_IMAGE_ERROR').waitFor({state:'visible',timeout:10000});
  assert.ok((await page.locator('body').innerText()).includes('配图'));
  assert.deepEqual(pageErrors,[]);
  await page.close();
});
