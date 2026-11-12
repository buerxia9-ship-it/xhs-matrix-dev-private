const path=require('path');
const {resolveContentProfile}=require('./content-capability.cjs');
module.exports=function(backend){
 const {BadRequestException}=require(require.resolve('@nestjs/common',{paths:[backend]}));
 const {CollectService}=require(path.join(backend,'dist/modules/collect/collect.service'));
 const run=CollectService.prototype.runForCampaign;
 CollectService.prototype.runForCampaign=async function(id){const campaign=await this.campaigns.findOne(id);if(!await this.pickCollector(campaign))throw new BadRequestException('没有已登录的采集号：请到「账号矩阵」添加采集号并扫码登录小红书主站。未调用AI、未创建采集任务，也不会使用示例数据。');return run.call(this,id)};
 const {MockCollector}=require(path.join(backend,'dist/modules/collect/collector/mock.collector'));
 MockCollector.prototype.collect=async()=>{throw new BadRequestException('生产采集禁止使用模拟数据，请登录真实采集号。')};
 CollectService.prototype.clearCampaignData=async function(id){const notes=await this.prisma.note.findMany({where:{campaignId:id},select:{id:true}});const ids=notes.map(n=>n.id);return this.prisma.$transaction(async tx=>{const comments=await tx.comment.deleteMany({where:{noteId:{in:ids}}});const removed=await tx.note.deleteMany({where:{campaignId:id}});await tx.collectTask.deleteMany({where:{campaignId:id}});return {notes:removed.count,comments:comments.count,message:'仅清空采集记录，保留人工选题、草稿与知识库'}})};
 const {GenerateService}=require(path.join(backend,'dist/modules/generate/generate.service'));
 GenerateService.prototype.buildVerifiedContext=async function(topicId){
  const topic=await this.prisma.topic.findUnique({where:{id:topicId}});if(!topic)throw new BadRequestException('选题不存在');if(topic.status==='discarded')throw new BadRequestException('已弃用选题不能生成');
  const campaign=await this.campaigns.findOne(topic.campaignId);const profile=await resolveContentProfile(this,campaign);if(profile.kind==='blocked')throw new BadRequestException(profile.reason);if(profile.kind!=='protected')throw new BadRequestException('此账号未授权专用业务知识校验。');const persona=await this.prisma.persona.findUnique({where:{id:campaign.personaId}});if(!persona)throw new BadRequestException('请先绑定有效人设');
  const spaces=JSON.parse(persona.wikiSpaceIds||'[]');const pages=await this.prisma.wikiPage.findMany({where:{spaceId:{in:spaces}},orderBy:{createdAt:'asc'}});
  // Technical handover snapshots are retained for audit, not treated as publishing facts.
  const applicable=pages.filter(p=>p.id.startsWith('yubao-profile-pack-'));
  const history=await this.prisma.draft.findMany({where:{personaId:persona.id},orderBy:{createdAt:'desc'},take:10});
  const feedback=applicable.filter(p=>p.tags?.includes('confirmed_feedback'));
  const safe=applicable.filter(p=>!['yubao-profile-pack-七','yubao-profile-pack-八','yubao-profile-pack-九'].includes(p.id));
  const messages=[{role:'system',content:'你为渝宝账号撰写待人工审核草稿。只能依据提供资料，不得编造经历。默认80—150字、2—4段、0—3表情、3—5标签；无固定开头结尾。猫砂标题含迪拜和猫砂。历史价格库存赠品排名与背书未当期确认，禁止直接用于宣传。不得把其他产品事实改名套用。资料为用户提供，不是独立验证。输出：标题: ...\n正文:\n...\n标签: ...\n\n【所选人设】\n'+JSON.stringify(persona)+'\n【绑定知识完整正文】\n'+safe.map(p=>'# '+p.title+'\n'+p.content).join('\n\n')+'\n【动态与背书状态】\n历史价格、库存、赠品、排名、SGS与复购数据待核实，本次没有可用的当期确认记录。不得引用数值或承诺。\n【最近10篇可访问稿件，状态不等于已发布，助手改稿不等于用户确认】\n'+JSON.stringify(history.map(d=>({id:d.id,status:d.status,title:d.title,body:d.body})))+'\n【已确认长期审改反馈】\n'+(feedback.length?feedback.map(p=>p.content).join('\n'):'没有独立确认反馈记录。用户资料包中的风格偏好可用；不得宣称已读取逐稿审改。')+'\n【历史充足性】\n目前仅'+history.length+'篇可访问稿件，不代表完整已发布历史。'}, {role:'user',content:'项目：'+campaign.name+'\n产品：'+campaign.productName+'\n选题：'+topic.title+'\n角度：'+topic.angle+'\n玩法：'+campaign.playbook+'\n本次未提供新配送路线、订单、客户对话或实验，不得虚构。'}];
  return {topic,campaign,persona,messages,sources:safe.map(p=>({id:p.id,title:p.title,characters:p.content.length})),historyIds:history.map(d=>d.id),confirmedFeedbackCount:feedback.length};
 };
 const originalGenerate=GenerateService.prototype.generateFromTopic;
 GenerateService.prototype.generateFromTopic=async function(id,opts={}){const topic=await this.prisma.topic.findUnique({where:{id}});if(!topic)throw new BadRequestException('选题不存在');const campaign=await this.campaigns.findOne(topic.campaignId);const profile=await resolveContentProfile(this,campaign);if(profile.kind==='blocked')throw new BadRequestException(profile.reason);if(profile.kind!=='protected')return originalGenerate.call(this,id,opts);const ctx=await this.buildVerifiedContext(id);ctx.messages[1].content+='\n本次生成选项：'+JSON.stringify(opts)+'\n若本次选择纯干货且不植入产品，正文不点名品牌产品；事实和身份限制仍适用。';const {content}=await this.gateway.chat(ctx.messages,{temperature:0.7,maxTokens:1800});if(!content?.trim())throw new BadRequestException('模型返回空文本，未保存草稿');const parsed=this.parseContent(content,ctx.topic.title);const d=await this.prisma.draft.create({data:{campaignId:ctx.campaign.id,topicId:id,personaId:ctx.persona.id,title:parsed.title,body:parsed.body,hashtags:JSON.stringify(parsed.hashtags),images:'[]',status:'ready',complianceChecked:false}});return this.deserialize(d)};
 const {MaterialService}=require(path.join(backend,'dist/modules/material/material.service'));
 const sharp=require(require.resolve('sharp',{paths:[backend]}));
 MaterialService.prototype.cropFile=async function(file,ratio){const dims={'3:4':[1080,1440],'4:5':[1080,1350],'1:1':[1080,1080],'9:16':[1080,1920],'4:3':[1440,1080]}[ratio]||[1080,1440];const name='protected_'+Date.now()+'_'+require('crypto').randomBytes(4).toString('hex')+'.png';const dir=path.join(process.env.DATA_DIR,'generated-images');await sharp(file).resize(...dims,{fit:'contain',background:'#fffaf5'}).png().toFile(path.join(dir,name));return '/generated/'+name};
 // Only the registered-asset composition route may touch protected packaging.
 const originalImage=GenerateService.prototype.generateImageForDraft;
 GenerateService.prototype.generateImageForDraft=async function(id,prompt,ratio='3:4',count=1,source='ai'){
  const d=await this.prisma.draft.findUnique({where:{id}});if(!d)throw new BadRequestException('草稿不存在');
  const campaign=await this.campaigns.findOne(d.campaignId);const profile=await resolveContentProfile(this,campaign);
  if(profile.kind==='blocked')throw new BadRequestException(profile.reason);
  if(profile.kind==='protected')throw new BadRequestException(source==='mix'?'受保护包装合成组件未安装，已阻止不安全配图。':'受保护包装仅允许已登记原图的「混合」合成，不允许AI重绘或普通图库裁切。');
  return originalImage.call(this,id,prompt,ratio,count,source);
 };

};
