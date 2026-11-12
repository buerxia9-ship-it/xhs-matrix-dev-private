'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const {chromium}=require(path.join(ROOT,'backend-ts/node_modules/patchright'));
const OUT=process.env.PREVIEW_ARTIFACT_DIR||path.join(ROOT,'.cloud-data/ui-evidence');fs.mkdirSync(OUT,{recursive:true});
if(fs.existsSync(path.join(OUT,'browser-result.json'))){const archive=path.join(OUT,'attempt-'+Date.now());fs.mkdirSync(archive);for(const f of fs.readdirSync(OUT)){const p=path.join(OUT,f);if(fs.statSync(p).isFile())fs.copyFileSync(p,path.join(archive,f));}}
test('real Windows browser completes three synthetic account review paths without external or paid APIs',async t=>{
 const chrome=process.env.PREVIEW_CHROME_PATH;assert.ok(chrome&&fs.existsSync(chrome),'Explicit isolated Chrome executable required; no silent skip');
 const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run']});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});const errors=[],blocked=[],steps=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1'||!['4181','4182'].includes(u.port)){blocked.push(u.origin);return route.abort('blockedbyclient');}return route.continue();});
 async function action(button,name,status=200){
  const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/sandbox/action/'+name,{timeout:20000});
  await page.locator('#'+button).click();const response=await pending;assert.equal(response.status(),status,button+' '+await response.text());
  await page.waitForFunction(()=>document.body.dataset.busy==='0',{timeout:20000});steps.push({button,action:name,status});return response;
 }
 try{
  await page.goto('http://127.0.0.1:4182/',{waitUntil:'networkidle'});
  await page.locator('[data-account="B01"]').waitFor();assert.equal(await page.locator('.card').count(),3);
  for(const key of ['B01','D01','O01']){
   await page.locator('[data-account="'+key+'"]').click();
   assert.match(await page.locator('#selected-name').innerText(),new RegExp(key));
   const title=await page.locator('#topic-title').inputValue();
   if(key==='B01'){assert.match(title,/袋底白色颗粒/);assert.doesNotMatch(title,/木薯/);}
   if(key==='D01')assert.match(title,/渠道合作/);if(key==='O01')assert.match(title,/低粉尘是否等于零粉尘/);
   if(await page.locator('#topic-status').innerText()!=='candidate'){
    await page.locator('#topic-reason').fill('[自动化UI验收] 先标记要改，保留历史稿件后编辑候选。');
    await page.locator('#topic-verdict').selectOption({label:'要改'});await action('review-topic','review-topic');
   }
   await page.locator('#topic-angle').fill('【合成 UI 验收】只保留来源线索，不编造产品或客户事实。');
   await page.locator('#topic-reason').fill('[自动化UI验收] '+key+' 证据和人设逐项核对，仍需 CEO 最终审稿。');
   await action('save-topic','edit-topic');await page.locator('#topic-verdict').selectOption({label:'可采纳'});await action('review-topic','review-topic');
   if(key==='B01'){
    await page.locator('#provider').selectOption('none');await action('generate','copy',503);assert.match(await page.locator('#message').innerText(),/无可用 Provider/);
    await page.screenshot({path:path.join(OUT,'no-provider.png'),fullPage:true});
    await page.locator('#provider').selectOption('offline-mock-v1');await page.locator('#failure').selectOption('copy');await action('generate','copy',400);assert.match(await page.locator('#message').innerText(),/模拟文案生成失败/);
   }
   await page.locator('#failure').selectOption('');await action('generate','copy');assert.ok((await page.locator('#draft-body').inputValue()).length>=120);
   await page.locator('#draft-body').fill((await page.locator('#draft-body').inputValue())+'\n这句是合成审改标记，不增加真实经营事实。');await action('save-draft','edit-draft');
   if(key==='B01'){
    await page.locator('#failure').selectOption('image');await action('images','images',400);assert.match(await page.locator('#message').innerText(),/模拟配图生成失败/);
    await page.screenshot({path:path.join(OUT,'image-failure.png'),fullPage:true});
    await page.locator('#failure').selectOption('missing');await action('images','images',400);assert.match(await page.locator('#message').innerText(),/无可用合成素材/);
   }
   await page.locator('#failure').selectOption('');
   for(const count of key==='B01'?[1,2,3,4]:[key==='D01'?2:3]){
    await page.locator('#image-count').selectOption(String(count));await action('images','images');assert.equal(await page.locator('#images-list img').count(),count);
    await page.waitForFunction(()=>[...document.querySelectorAll('#images-list img')].every(i=>i.complete&&i.naturalWidth>0));
   }
   await action('submit-review','submit-review');assert.equal(await page.locator('#draft-status').innerText(),'review_pending');
   await page.locator('#draft-reason').fill('[自动化UI验收] '+key+' 仅验证人工审核按钮路径，并非 CEO 内容认可。');
   await page.locator('#draft-verdict').selectOption({label:'可采纳'});await action('review-draft','review-draft');assert.equal(await page.locator('#draft-status').innerText(),'approved');
   // Demonstrate that changing content revokes approval, then leave it for CEO review.
   await action('save-draft','edit-draft');assert.equal(await page.locator('#draft-status').innerText(),'ready');
   await action('submit-review','submit-review');assert.equal(await page.locator('#draft-status').innerText(),'review_pending');
   assert.equal(await page.getByRole('button',{name:'真实发布已禁用'}).isDisabled(),true);
   await page.screenshot({path:path.join(OUT,'sandbox-'+key+'.png'),fullPage:true});
  }
  await page.locator('[data-account="B01"]').click();await page.screenshot({path:path.join(OUT,'sandbox-overview.png'),fullPage:true});
  const before=await page.evaluate(()=>fetch('/api/sandbox/state').then(r=>r.json()));
  assert.equal(before.paidApiCalls,0);assert.equal(before.syntheticAccounts,3);assert.equal(before.realAccounts,0);
  assert.ok(before.accounts.every(a=>a.drafts.some(d=>d.status==='review_pending')));
  assert.ok(before.contextProofs.every(p=>p.confirmedFeedback.every(f=>!before.accounts.filter(a=>a.campaignId!==p.campaignId).some(a=>f.reason.includes(a.key+' 证据')))));
  await page.goto('http://127.0.0.1:4181/#/autopilot',{waitUntil:'networkidle'});await page.getByText('Synthetic test project',{exact:false}).first().waitFor({state:'visible',timeout:15000});await page.screenshot({path:path.join(OUT,'readonly-4181.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(OUT,'browser-result.json'),JSON.stringify({passed:true,accounts:['B01','D01','O01'],steps,jsErrors:errors,blockedBrowserRequests:blocked,paidApiCalls:0,ceoEditorialAcceptance:'PENDING_USER',previewData:'synthetic-only'},null,2));
 }catch(e){await page.screenshot({path:path.join(OUT,'test-failure.png'),fullPage:true}).catch(()=>{});fs.writeFileSync(path.join(OUT,'browser-result.json'),JSON.stringify({passed:false,error:e.message,steps,jsErrors:errors,blockedBrowserRequests:blocked},null,2));throw e;}
});
