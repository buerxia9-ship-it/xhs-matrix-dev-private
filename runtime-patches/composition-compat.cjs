const fs=require('fs'),path=require('path'),crypto=require('crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const xml=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
const locks=new Set();
module.exports=function(backend){
 const {GenerateService}=require(path.join(backend,'dist/modules/generate/generate.service'));
 const {BadRequestException}=require(require.resolve('@nestjs/common',{paths:[backend]}));
 const sharp=require(require.resolve('sharp',{paths:[backend]}));const previous=GenerateService.prototype.generateImageForDraft;
 GenerateService.prototype.generateImageForDraft=async function(id,prompt,ratio='3:4',count=1,source='mix'){
  if(source!=='mix')return previous.call(this,id,prompt,ratio,count,source);
  if(locks.has(id))throw new BadRequestException('此草稿正在配图，请等本次完成，不要重复点击。');
  locks.add(id);try{
   const d=await this.prisma.draft.findUnique({where:{id}});if(!d)throw new BadRequestException('草稿不存在');
   const dims={'3:4':[1080,1440],'4:5':[1080,1350],'1:1':[1080,1080],'9:16':[1080,1920],'4:3':[1440,1080]};if(!dims[ratio])throw new BadRequestException('不支持的图片比例');
   const n=Math.max(1,Math.min(4,Number(count)||1));const [w,h]=dims[ratio];
   const all=await this.materials.list(d.campaignId);const registry=JSON.parse(fs.readFileSync(path.join(__dirname,'composition/protected-assets.json'),'utf8'));
   const shared=await this.prisma.material.findMany({where:{id:{in:Object.keys(registry).filter(k=>registry[k].allowedCampaignIds?.includes(d.campaignId))}}});
   const available=[...new Map([...all,...shared].map(m=>[m.id,m])).values()].filter(m=>registry[m.id]&&fs.existsSync(path.join(process.env.DATA_DIR,'material-images',path.basename(m.url))));
   const txt=d.title+' '+d.body;const flavor=/薰衣草/.test(txt)&&!/无香|绿茶/.test(txt)?'lavender':/绿茶/.test(txt)&&!/无香|薰衣草/.test(txt)?'green tea':'unscented';
   const material=available.find(m=>registry[m.id].flavor===flavor)||available[0];
   if(!material)throw new BadRequestException('当前项目缺少已确认的透明包装原图。请上传并登记包装素材，不能用纸箱、配送照片或AI假包装替代。');
   const assetFile=path.join(process.env.DATA_DIR,'material-images',path.basename(material.url));const original=fs.readFileSync(assetFile);if(sha(original)!==registry[material.id].sha256)throw new BadRequestException('包装原图已变化，请重新核验后使用。');
   const meta=await sharp(original).metadata();if(!meta.hasAlpha)throw new BadRequestException('需要透明背景包装原图，以免背景遮挡设计。');
   const fingerprint=sha(Buffer.from(JSON.stringify({id,title:d.title,body:d.body,prompt,ratio,n,asset:sha(original),version:1})));
   const auditDir=path.join(__dirname,'composition');const recordFile=path.join(auditDir,fingerprint+'.json');
   if(fs.existsSync(recordFile)){const record=JSON.parse(fs.readFileSync(recordFile));if(record.images.every(u=>fs.existsSync(path.join(process.env.DATA_DIR,'generated-images',path.basename(u))))){const current=JSON.parse(d.images||'[]');const row=await this.prisma.draft.update({where:{id},data:{images:JSON.stringify([...new Set([...current,...record.images])]),complianceChecked:false}});return this.deserialize(row);}}
   const businessContext=await this.buildVerifiedContext(d.topicId);
   const {content}=await this.gateway.chat([{role:'system',content:'你是小红书配图设计师。根据文案给出一个图文设计方案，严格JSON：{"headline":"18字内中文标题，含迪拜猫砂","scene":"英文背景描述"}。画面干净自然低饱和，非实拍，背景不得出现任何产品、包装、袋子、箱子、logo或文字。不是实验、客户、订单或配送证据。主体只用后续合成的原图。不要创造功效数据或文案未提供的事实。画面右下方留出45%宽、65%高的干净空间给真实产品；顶部留白供标题。'}, {role:'user',content:JSON.stringify({title:d.title,body:d.body,request:prompt||'',flavor:registry[material.id].flavor,businessRules:businessContext.messages[0].content})}],{temperature:0.5,maxTokens:500});
   let plan;try{plan=JSON.parse(content.replace(/```(?:json)?/g,'').trim())}catch{throw new BadRequestException('设计方案解析失败，未调用生图，请重试。')}
   if(typeof plan.headline!=='string'||typeof plan.scene!=='string'||!plan.scene.trim())throw new BadRequestException('设计方案缺少标题或场景，未调用生图。');
   const headline=Array.from(plan.headline).slice(0,18).join('');const outputs=[],audits=[];
   for(let i=0;i<n;i++){
    const generated=await this.gateway.generateImage('Editorial background illustration ONLY. '+plan.scene+'\nNo products, packaging, bags, boxes, logos, labels, lettering or text anywhere. Reserve clean negative space in upper 25% and lower right 45% for a separate photographic product overlay. Muted cream and pale blue palette, subtle home cat-care context, not a real customer residence. Variant '+(i+1),{aspectRatio:ratio,quality:'medium'});
    const bgUrl=generated.images?.[0];if(!bgUrl?.startsWith('/generated/'))throw new BadRequestException('背景未保存到本机，未合成包装。');
    const bgFile=path.join(process.env.DATA_DIR,'generated-images',path.basename(bgUrl));const background=await sharp(bgFile).resize(w,h,{fit:'cover'}).png().toBuffer();
    const product=await sharp(original).resize(Math.round(w*.43),Math.round(h*.64),{fit:'inside'}).ensureAlpha().png().toBuffer();const pm=await sharp(product).metadata();const left=w-pm.width-Math.round(w*.07),top=h-pm.height-Math.round(h*.07);
    const font=Math.round(w*.052);const chars=Array.from(headline);const split=chars.length>10?Math.ceil(chars.length/2):chars.length;const lines=[chars.slice(0,split).join(''),chars.slice(split).join('')].filter(Boolean);
    const overlay=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><rect width="'+w+'" height="'+Math.round(h*.24)+'" fill="#fffaf5" fill-opacity="0.94"/>'+lines.map((l,j)=>'<text x="'+Math.round(w*.065)+'" y="'+Math.round(h*.085+j*font*1.3)+'" font-family="Microsoft YaHei" font-size="'+font+'" font-weight="bold" fill="#263c42">'+xml(l)+'</text>').join('')+'<text x="'+Math.round(w*.05)+'" y="'+Math.round(h*.965)+'" font-family="Microsoft YaHei" font-size="'+Math.round(w*.022)+'" fill="#394e55">AI场景示意 · 产品为原图合成</text></svg>');
    const final=await sharp(background).composite([{input:overlay,top:0,left:0},{input:product,top,left}]).png().toBuffer();
    const actual=await sharp(final).extract({left,top,width:pm.width,height:pm.height}).ensureAlpha().raw().toBuffer();const expected=await sharp(product).ensureAlpha().raw().toBuffer();let tested=0,mismatches=0;for(let k=0;k<expected.length;k+=4)if(expected[k+3]===255){tested++;if(expected[k]!==actual[k]||expected[k+1]!==actual[k+1]||expected[k+2]!==actual[k+2])mismatches++;}
    if(!tested||mismatches)throw new BadRequestException('包装像素保护校验失败，未保存成品。');
    const name='composite_'+Date.now()+'_'+crypto.randomBytes(4).toString('hex')+'.png';fs.writeFileSync(path.join(process.env.DATA_DIR,'generated-images',name),final);outputs.push('/generated/'+name);audits.push({background:bgUrl,materialId:material.id,sourceSha256:sha(original),left,top,width:pm.width,height:pm.height,verifiedOpaquePixels:tested,mismatches});
   }
   fs.writeFileSync(recordFile,JSON.stringify({draftId:id,plan,ratio,images:outputs,assets:audits,createdAt:new Date().toISOString()},null,2));
   const row=await this.prisma.draft.update({where:{id},data:{images:JSON.stringify([...JSON.parse(d.images||'[]'),...outputs]),complianceChecked:false}});return this.deserialize(row);
  }finally{locks.delete(id)}
 };
};
