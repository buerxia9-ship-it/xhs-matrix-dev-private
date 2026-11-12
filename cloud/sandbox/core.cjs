'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {AsyncLocalStorage}=require('node:async_hooks');
const ROOT=path.resolve(__dirname,'../..'),BACK=path.join(ROOT,'backend-ts');
const {dataPath}=require('../preflight.cjs');
const Native=require(path.join(BACK,'node_modules/better-sqlite3'));
// Match the existing read-only launcher: the locked top-level SQLite supports Node 24.
const Module=require('node:module'),load=Module._load;
Module._load=function(name,parent,isMain){if(name==='better-sqlite3')return Native;return load.call(this,name,parent,isMain);};
const {PrismaService}=require(path.join(BACK,'dist/common/database/prisma.service.js'));
const {CampaignService}=require(path.join(BACK,'dist/modules/campaign/campaign.service.js'));
const {WikiService}=require(path.join(BACK,'dist/modules/wiki/wiki.service.js'));
const {AnalysisService}=require(path.join(BACK,'dist/modules/analysis/analysis.service.js'));
const {GenerateService}=require(path.join(BACK,'dist/modules/generate/generate.service.js'));
const sharp=require(path.join(BACK,'node_modules/sharp'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const roles=[
 {key:'B01',role:'渝宝店主',positioning:'迪拜宠物店老板；合成测试身份',clue:'迪拜猫砂袋底白色颗粒是粉尘吗',knowledge:'合成样品的木薯颗粒说明需要包装资料支撑。不能把所有白色颗粒或粉末当作木薯，也没有零粉尘证明。'},
 {key:'D01',role:'中东总代理',positioning:'中东总代理与经销渠道资料；合成测试身份',clue:'迪拜猫砂门店渠道合作需要哪些资料',knowledge:'合成渠道资料目录：主体、产品信息、售后和合作范围。授权、报价、库存和到货均未核实，不作当前承诺。'},
 {key:'O01',role:'TUXTOOX品牌官号',positioning:'品牌官方配方科普；合成测试身份',clue:'迪拜猫砂低粉尘是否等于零粉尘',knowledge:'低粉尘不等于零粉尘。没有真实检测、粒径、粉尘率和使用条件证据，不提供量化宣传或排名。'}
];
function demand(ok,message,code=400){if(!ok){const e=new Error(message);e.statusCode=code;throw e;}}
function unsupportedClaim(body){
 const claim=/零粉尘保证|完全没有粉尘|100%|真实客户证实|官方授权已确认|(?:本产品|这款猫砂).{0,4}(?:零粉尘|无粉尘)|(?:保证|做到|实现)零粉尘/;
 return String(body).split(/[。！？\n；]|但是|但|然而|可是|不过/).some(clause=>{
  const affirmative=clause.replace(/(?:不能|不可|不得|不应|不要|不等于|不是|并非|不代表)[^。！？\n；]{0,40}/g,'[否定表达]');
  return claim.test(affirmative);
 });
}
async function createSandbox(candidate=path.join(ROOT,'.cloud-data/sandbox')){
 const dir=dataPath(candidate);demand(path.relative(path.join(ROOT,'.cloud-data'),dir).length>0,'Dedicated sandbox subdirectory required');
 const dbfile=dataPath(path.join(dir,'fixture.db')),manifestFile=dataPath(path.join(dir,'sandbox-manifest.json'));
 fs.mkdirSync(dir,{recursive:true});
 const schema=fs.readFileSync(path.join(ROOT,'fixtures/effective-schema.sql'),'utf8');
 const fresh=!fs.existsSync(dbfile);
 if(!fresh){demand(fs.existsSync(manifestFile),'Unrecognized existing sandbox DB; retained and refused');const m=JSON.parse(fs.readFileSync(manifestFile));demand(m.mode==='synthetic-only-v1'&&m.schemaSha===sha(schema),'Sandbox manifest mismatch; retained');}
 if(!fresh){
  const check=new Native(dbfile,{readonly:true,fileMustExist:true});
  try{
   demand(check.prepare('SELECT count(*) n FROM model_providers').get().n===0,'Existing DB contains model providers; refused before writes');
   const rows=check.prepare('SELECT id,status,cookie FROM accounts').all(),m=JSON.parse(fs.readFileSync(manifestFile));
   demand(rows.length===3&&rows.every(a=>!a.cookie&&a.status==='synthetic_only'&&m.metas.some(x=>x.accountId===a.id)),'Existing DB is not the registered synthetic sandbox; refused before writes');
   demand(m.metas.length===3&&m.metas.every(x=>roles.some(r=>r.key===x.key)),'Unrecognized synthetic identities');
  }finally{check.close();}
 }
 const sql=new Native(dbfile);sql.pragma('foreign_keys = ON');
 if(fresh)sql.exec(schema);
 sql.exec('CREATE TABLE IF NOT EXISTS sandbox_events (id INTEGER PRIMARY KEY AUTOINCREMENT,campaign_id TEXT,stage TEXT,action TEXT,reason TEXT,details TEXT,created_at TEXT)');
 const prisma=new PrismaService({get:k=>k==='DATABASE_URL'?'file:'+dbfile.replaceAll('\\','/'):undefined});await prisma.onModuleInit();
 const als=new AsyncLocalStorage(),stats={paidApiCalls:0,mockCopyCalls:0,mockImageCalls:0},proofs=[],imageProofs=[];
 function audit(campaignId,stage,action,reason='',details={}){sql.prepare('INSERT INTO sandbox_events (campaign_id,stage,action,reason,details,created_at) VALUES (?,?,?,?,?,?)').run(campaignId,stage,action,reason,JSON.stringify(details),new Date().toISOString());}
 async function pack(meta){
  const p=path.join(dir,'assets',meta.key+'.png');fs.mkdirSync(path.dirname(p),{recursive:true});
  if(!fs.existsSync(p)){const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="144"><rect width="96" height="144" fill="#f8dfea"/><rect x="8" y="12" width="80" height="120" rx="5" fill="#fff"/><text x="18" y="42" font-size="17" font-family="Arial" fill="#292431">DEMO</text><text x="21" y="69" font-size="18" font-family="Arial" fill="#784a65">${meta.key}</text><text x="16" y="94" font-size="10" fill="#333">SYNTHETIC</text><text x="19" y="116" font-size="10" fill="#333">NOT REAL</text></svg>`;fs.writeFileSync(p,await sharp(Buffer.from(svg)).png().toBuffer());}
  return {path:p,sha256:sha(fs.readFileSync(p))};
 }
 let metas;
 if(fresh){
  metas=[];
  for(const info of roles){
   const space=await prisma.wikiSpace.create({data:{name:info.key+' 合成账号知识'}});
   const productSpace=await prisma.wikiSpace.create({data:{name:info.key+' 合成产品资料'}});
   await prisma.wikiPage.create({data:{spaceId:space.id,title:'猫砂账号边界',content:`KB_SYNTH_${info.key}_ONLY。${info.role}。这些是合成演示资料，不能当作真实业务事实。固定话术留空。`}});
   await prisma.wikiPage.create({data:{spaceId:productSpace.id,title:'猫砂合成样品资料',content:info.knowledge}});
   const persona=await prisma.persona.create({data:{name:info.role+'（合成）',tone:'直给、克制、有依据',positioning:info.positioning,audience:info.key==='D01'?'门店与经销商（合成）':'迪拜养猫读者（合成）',taboo:'不编造亲历、客户、价格、库存、检测、授权',signature:'',wikiSpaceIds:JSON.stringify([space.id,productSpace.id])}});
   const account=await prisma.account.create({data:{nickname:info.role+'（合成档案，无登录）',role:'publisher',status:'synthetic_only',personaId:persona.id,cookie:null,dailyQuota:0,activeWindow:JSON.stringify({hours:[],contentProfile:null})}});
   const campaign=await prisma.campaign.create({data:{name:info.key+'｜'+info.role+'·合成验收',productName:'猫砂',personaId:persona.id,keywords:JSON.stringify(['迪拜','猫砂']),publishAccountIds:JSON.stringify([account.id]),collectAccountIds:'[]',runMode:'manual',autopilotEnabled:false,cadence:JSON.stringify({imageAiExpand:false}),gates:JSON.stringify({publishReview:'manual'})}});
   const note=await prisma.note.create({data:{campaignId:campaign.id,id:'synthetic-'+crypto.randomUUID(),title:info.clue,content:'合成标题输入；无真实采集正文',authorId:'synthetic-author',authorName:'合成来源｜未联网采集',source:'search-title'}});
   const meta={...info,campaignId:campaign.id,personaId:persona.id,accountId:account.id,productSpaceId:productSpace.id,noteId:note.id};meta.asset=await pack(meta);metas.push(meta);
  }
  fs.writeFileSync(manifestFile,JSON.stringify({mode:'synthetic-only-v1',schemaSha:sha(schema),metas},null,2));
 }else metas=JSON.parse(fs.readFileSync(manifestFile)).metas;
 demand(await prisma.modelProvider.count()===0,'No model providers may be configured',500);
 const accounts=await prisma.account.findMany();demand(accounts.length===3&&accounts.every(a=>!a.cookie&&a.status==='synthetic_only'&&metas.some(m=>m.accountId===a.id)),'Unrecognized/non-synthetic accounts',500);
 demand(await prisma.persona.count()===3&&await prisma.campaign.count()===3,'Sandbox identities must remain isolated',500);
 function meta(id){const m=metas.find(m=>m.campaignId===id);demand(m,'Unknown synthetic campaign',404);return m;}
 async function ownedTopic(id,cid){const t=await prisma.topic.findUnique({where:{id}});demand(t&&t.campaignId===cid,'Topic does not belong to selected synthetic account',403);return t;}
 async function ownedDraft(id,cid){const d=await prisma.draft.findUnique({where:{id}});demand(d&&d.campaignId===cid&&d.personaId===meta(cid).personaId,'Draft does not belong to selected synthetic account',403);return d;}
 const gateway={
  async chat(messages){
   const ctx=als.getStore();demand(ctx&&ctx.meta,'Only explicit offline mock context is allowed',503);
   demand(ctx.provider==='offline-mock-v1','无可用 Provider：只允许明确选择的离线模拟，不会回退真实 API。',503);
   if(ctx.failure==='copy')throw Error('模拟文案生成失败：用于验证失败可见，不调用模型。');
   const m=ctx.meta,raw=messages.map(x=>x.content).join('\n');
   demand(raw.includes('KB_SYNTH_'+m.key+'_ONLY'),'Bound synthetic account knowledge missing',500);
   demand(roles.filter(r=>r.key!==m.key).every(r=>!raw.includes('KB_SYNTH_'+r.key+'_ONLY')),'Cross-account knowledge leakage',500);
   const history=await prisma.draft.findMany({where:{campaignId:m.campaignId},select:{title:true}});
   const memory=sql.prepare("SELECT stage,action,reason FROM sandbox_events WHERE campaign_id=? AND action IN ('可采纳','要改','弃用')").all(m.campaignId);
   const contextProof={campaignId:m.campaignId,personaId:m.personaId,knowledgeScope:m.key,historyCount:history.length,confirmedFeedback:memory,provider:'offline-mock-v1',externalCalls:0};
   proofs.push(contextProof);stats.mockCopyCalls++;
   // Deterministic mock text, explicitly not a model quality claim.
   const bodies={
    B01:'袋底看到白色颗粒，先别急着把它叫作粉尘。只凭颜色、照片或一句标题，不能判断颗粒的成分，也不能把所有白色粉末都认作木薯。\n\n这份合成样品资料只说明：木薯颗粒需要对应包装资料支持。实际检查时，应先核对同一产品、同一袋的标识和颗粒状态，分清完整颗粒与细碎粉末，再决定是否需要补充照片或资料。\n\n没有当次检测和使用条件，就不写“零粉尘”或编造亲测结论。这里演示渝宝店主如何把问题问清楚，尚不代表真实产品表现或客户经历。',
    D01:'门店准备了解迪拜猫砂渠道合作，可以先把需要核对的资料列出来：合作主体、产品包装信息、合作范围、售后责任，以及报价适用条件。\n\n这份合成目录只能帮助整理问题，不能证明任何实际代理授权。报价、库存、到货时间和赠品都是动态事项，需要在具体合作时重新确认并保留依据。\n\n渠道沟通要说明谁负责供货、哪些资料还缺失、下一步由谁确认。没有授权文件不写“官方授权”，没有当次信息不承诺现货。这里仅模拟总代理的资料表达，不是真实招商政策或商业报价。',
    O01:'低粉尘和零粉尘不是同一个意思。讨论迪拜猫砂时，应先区分完整颗粒、细碎粉末与使用过程中可见的扬尘，再核对资料采用的定义和测试条件。\n\n包装上的一般描述不能自动转换成“完全没有粉尘”的绝对承诺。若要引用数值、检测或对比，需要能对应具体样品、方法、条件与来源的证据，不能只凭颜色或一张照片推断。\n\n这套合成资料没有真实粉尘率、检测报告或排名，因此只演示品牌官号的解释边界，不提供真实产品的性能结论。'};
   return {content:`标题: ${ctx.topic.title}\n正文:\n${bodies[m.key]}\n标签: 迪拜猫砂,猫砂知识,合成演示,信息核对,养猫资料`,mock:true,contextProof};
  },
  async generateImage(){
   const ctx=als.getStore();demand(ctx&&ctx.provider==='offline-mock-v1','无可用离线配图 Provider',503);
   if(ctx.failure==='image')throw Error('模拟配图生成失败：未保存不完整结果。');
   const m=ctx.meta;demand(path.resolve(m.asset.path)===path.join(dir,'assets',m.key+'.png'),'Asset path is not registered to the selected synthetic account',403);const reference=fs.readFileSync(dataPath(m.asset.path));demand(sha(reference)===m.asset.sha256,'合成包装 SHA 校验失败',409);
   const name=crypto.randomUUID()+'.png',imageDir=path.join(dir,'images');fs.mkdirSync(imageDir,{recursive:true});
   const refRaw=await sharp(reference).ensureAlpha().raw().toBuffer();
   const image=await sharp({create:{width:360,height:480,channels:4,background:'#f4f0e9'}}).composite([
    {input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="480"><text x="30" y="48" font-family="Arial" font-size="20" fill="#35302d">SYNTHETIC ONLY</text><text x="30" y="82" font-family="Arial" font-size="16" fill="#74655b">${m.key} / FRAME ${stats.mockImageCalls+1}</text><rect x="24" y="380" width="310" height="1" fill="#c9bbb2"/><text x="30" y="414" font-family="Arial" font-size="12" fill="#74655b">OFFLINE MOCK - NO REAL PACKAGING</text></svg>`)},
    {input:reference,left:132,top:164}]).png().toBuffer();
   const crop=await sharp(image).extract({left:132,top:164,width:96,height:144}).ensureAlpha().raw().toBuffer();
   demand(crop.equals(refRaw),'Synthetic packaging pixel integrity failed',500);
   fs.writeFileSync(path.join(imageDir,name),image);stats.mockImageCalls++;
   imageProofs.push({campaignId:m.campaignId,image:name,referenceSHA:m.asset.sha256,pixelMismatches:0});
   return {images:['/sandbox-images/'+name],mock:true};
  }
 };
 const campaigns=new CampaignService(prisma,gateway),wiki=new WikiService(prisma,gateway);
 const analysis=new AnalysisService(prisma,campaigns,gateway);
 const materials={pickForDraft:async()=>[],saveToFolder(){throw Error('Shared folder output forbidden');}};
 const generator=new GenerateService(prisma,campaigns,gateway,wiki,materials);
 async function snapshot(){
  const list=[];
  for(const m of metas){const topics=await analysis.topicsByCampaign(m.campaignId),drafts=await generator.draftsByCampaign(m.campaignId);list.push({key:m.key,role:m.role,campaignId:m.campaignId,personaId:m.personaId,productKnowledgeId:m.productSpaceId,accountId:m.accountId,evidence:[{id:m.noteId,title:m.clue,synthetic:true,confidence:'synthetic_title_clue_only'}],topics,drafts,events:sql.prepare('SELECT * FROM sandbox_events WHERE campaign_id=? ORDER BY id DESC LIMIT 40').all(m.campaignId)});}
  return {mode:'synthetic-only',provider:'offline-mock-v1',realAccounts:0,syntheticAccounts:3,personas:3,products:3,paidApiCalls:0,stats,accounts:list,contextProofs:proofs.slice(-20),imageProofs:imageProofs.slice(-40)};
 }
 async function act(action,input){
  const m=meta(input.campaignId),cid=m.campaignId;
  try{
   if(action==='candidates'){const result=await analysis.runForCampaign(cid);audit(cid,'topic','候选生成','实际编译后的 P2 规则；输入为合成证据');return result;}
   if(action==='edit-topic'){await ownedTopic(input.topicId,cid);demand(typeof input.title==='string'&&Array.from(input.title.trim()).length<=20&&input.title.trim(),'选题标题须为 1–20 字');demand(typeof input.angle==='string'&&input.angle.length<=1000,'切入角度过长');const r=await analysis.updateTopicDetails(input.topicId,{title:input.title,angle:input.angle});audit(cid,'topic','编辑',String(input.reason||'合成验收修改').slice(0,1000));return r;}
   if(action==='review-topic'){
    await ownedTopic(input.topicId,cid);demand(['可采纳','要改','弃用'].includes(input.verdict)&&typeof input.reason==='string'&&input.reason.trim().length>0&&input.reason.length<=1000,'评价和原因必填');
    const result=await analysis.updateTopicStatus(input.topicId,{'可采纳':'adopted','要改':'candidate','弃用':'discarded'}[input.verdict]);audit(cid,'topic',input.verdict,input.reason);return result;
   }
   if(action==='copy'){
    const topic=await ownedTopic(input.topicId,cid);demand(topic.status==='adopted','请先人工采纳选题');
    const r=await als.run({meta:m,topic,provider:input.provider,failure:input.failure},()=>generator.generateFromTopic(topic.id,{theme:'干货',embedProduct:true}));audit(cid,'copy','离线模拟生成','非真实 AI 模型输出');return r;
   }
   const draft=await ownedDraft(input.draftId,cid);
   if(action==='edit-draft'){demand(typeof input.title==='string'&&input.title.trim()&&input.title.length<=60&&typeof input.body==='string'&&input.body.length<=5000,'草稿内容格式不合法');const r=await generator.updateDraft(draft.id,{title:input.title,body:input.body,complianceChecked:false,status:'ready'});audit(cid,'copy','编辑',String(input.reason||'合成审改').slice(0,1000));return r;}
   if(action==='images'){
    demand(Number.isInteger(input.count)&&input.count>=1&&input.count<=4,'仅允许策划 1–4 张合成配图');demand(input.provider==='offline-mock-v1','无可用 Provider，不调用真实服务',503);
    if(input.failure==='missing')throw Error('无可用合成素材：未回退到真实图片或付费模型。');
    const topic=await ownedTopic(draft.topicId,cid);
    const r=await prisma.$transaction(async tx=>{
     await tx.draft.update({where:{id:draft.id},data:{images:'[]',complianceChecked:false,status:'ready'}});
     const g=new GenerateService(tx,campaigns,gateway,wiki,materials);
     return als.run({meta:m,topic,provider:input.provider,failure:input.failure},()=>g.generateImageForDraft(draft.id,'明确的离线合成占位画面','3:4',input.count,'ai'));
    });audit(cid,'image','合成配图完成',`${input.count} 张；包装未重绘；不代表品牌效果验收`,{referenceSHA:m.asset.sha256,pixelMismatches:0});return r;
   }
   if(action==='submit-review'){
    const images=JSON.parse(draft.images||'[]');demand(images.length>=1&&images.length<=4,'提交审核前须有 1–4 张合成图片');
    demand(!unsupportedClaim(draft.body),'模拟合规校验未通过：存在无依据承诺');
    const r=await prisma.draft.update({where:{id:draft.id},data:{complianceChecked:true,status:'review_pending'}});audit(cid,'review','待人工审核','本地规则校验不是人工通过');return r;
   }
   if(action==='review-draft'){
    demand(['可采纳','要改','弃用'].includes(input.verdict)&&typeof input.reason==='string'&&input.reason.trim()&&input.reason.length<=1000,'评价和原因必填');
    demand(draft.status==='review_pending','请先提交人工审核');
    const r=await prisma.draft.update({where:{id:draft.id},data:{status:{'可采纳':'approved','要改':'changes_requested','弃用':'discarded'}[input.verdict],complianceChecked:input.verdict==='可采纳'}});audit(cid,'review',input.verdict,input.reason);return r;
   }
   throw Object.assign(new Error('Action is not allowlisted'),{statusCode:403});
  }catch(e){audit(cid,['image','images'].includes(action)?'image':action.includes('review')?'review':'copy','error',e.message);throw e;}
 }
 for(const m of metas)await analysis.runForCampaign(m.campaignId);
 return {dir,dbfile,snapshot,act,prisma,sql,stats,close:async()=>{await prisma.onModuleDestroy();sql.close();},getImage:name=>{demand(/^[a-f0-9-]{36}\.png$/.test(name),'Unknown synthetic image',404);const p=dataPath(path.join(dir,'images',name));demand(fs.existsSync(p),'Image not found',404);return p;}};
}
module.exports={createSandbox};
