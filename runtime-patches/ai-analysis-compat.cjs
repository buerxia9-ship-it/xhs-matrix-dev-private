const path=require('path'),fs=require('fs'),crypto=require('crypto');const locks=new Set();
module.exports=function(backend){
 const {AnalysisService}=require(path.join(backend,'dist/modules/analysis/analysis.service'));
 const {BadRequestException}=require(require.resolve('@nestjs/common',{paths:[backend]}));
 AnalysisService.prototype.runForCampaign=async function(id){
  if(locks.has(id))throw new BadRequestException('本项目正在进行AI分析，请勿重复点击');locks.add(id);
  try{
   const campaign=await this.campaigns.findOne(id);const notes=(await this.prisma.note.findMany({where:{campaignId:id},orderBy:{collectedAt:'desc'}})).filter(n=>!/(mock|模拟|示例)/i.test(n.source||'')&&/猫砂|养猫|猫咪|养宠/.test(n.title)).slice(0,40);
   if(!notes.length)throw new BadRequestException('没有相关真实搜索标题，请先采集；未调用AI。');
   const persona=await this.prisma.persona.findUnique({where:{id:campaign.personaId}});if(!persona)throw new BadRequestException('项目尚未绑定有效人设，未调用AI。');
   const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'business-cleanup/generation-manifest.json'),'utf8'));const ids=manifest.filter(p=>!['08','09'].includes(p.number)).map(p=>p.id);
   const pages=await this.prisma.wikiPage.findMany({where:{id:{in:ids},spaceId:{in:JSON.parse(persona.wikiSpaceIds)}}});
   const history=await this.prisma.draft.findMany({where:{personaId:persona.id},take:10,orderBy:{createdAt:'desc'},select:{title:true,status:true}});
   const input={project:campaign.name,persona:{name:persona.name,tone:persona.tone,positioning:persona.positioning,taboo:persona.taboo},knowledge:pages.map(p=>({title:p.title,content:p.content})),recentDrafts:history,notes:notes.map(n=>({id:n.id,title:n.title,source:n.source}))};
   const analysisModel=(await this.gateway.resolveActiveText()).modelName;
   const digest=crypto.createHash('sha256').update(JSON.stringify({model:analysisModel,input})).digest('hex').slice(0,24),source='AI搜索标题分析#'+digest;
   if(await this.prisma.commentInsight.findFirst({where:{campaignId:id,source}}))return {insightCount:0,topicCount:0,commentsAnalyzed:0,cacheHit:true,message:'相同资料已完成AI分析，已复用现有结果，未重复调用API。'};
   let content;try{({content}=await this.gateway.chat([{role:'system',content:'你是渝宝账号选题策划。只能分析提供的真实搜索标题，结合人设、业务知识和近期稿件，输出3—5条有区别的候选。关注迪拜华人养猫家庭，但没有地区证据不要假称当地高频。不把标题当正文、评论、客户反馈、亲历或实测证据。不推荐喝猫砂，不使用姐妹们、亲测、真实测评，不编造流量表现。标题自然含迪拜和猫砂，尽量20字内。严格JSON：{"insights":[{"concern":"简短需求假设","title":"候选标题","angle":"具体切入角度","sourceNoteIds":["输入中确实存在的笔记ID"]}]}。每项必须有至少1条确实支持该方向的输入ID；没有足够证据宁可少输出。所有需求均为AI推测，需人工复核，不宣称用户确实表达过。'}, {role:'user',content:JSON.stringify(input)}],{temperature:0.5,maxTokens:1800}))}catch(e){throw new BadRequestException('AI选题分析调用失败：'+e.message+'。未保存新选题，请检查模型和代理后重试。')}
   let parsed;try{parsed=JSON.parse(content.replace(/```(?:json)?/g,'').trim())}catch{throw new BadRequestException('AI返回格式不完整，未保存，请重试。')}
   const allowed=new Set(notes.map(n=>n.id));const items=(parsed.insights||[]).slice(0,5).filter(x=>typeof x.title==='string'&&typeof x.concern==='string'&&typeof x.angle==='string'&&Array.isArray(x.sourceNoteIds)&&x.sourceNoteIds.length&&x.sourceNoteIds.every(k=>allowed.has(k))&&!/喝|亲测|真实测评|姐妹们|TOP1|零粉尘|首选|必备/.test(x.title)&&x.title.includes('迪拜')&&x.title.includes('猫砂'));
   if(!items.length)throw new BadRequestException('AI候选未通过来源或标题校验，未保存；请重新分析。');
   const result=await this.prisma.$transaction(async tx=>{let topics=0;for(const x of items){await tx.commentInsight.create({data:{campaignId:id,topic:x.concern,keywords:JSON.stringify([x.concern]),frequency:0,sampleIds:JSON.stringify(x.sourceNoteIds.map(k=>'note:'+k)),source}});if(!await tx.topic.findFirst({where:{campaignId:id,title:x.title}})){await tx.topic.create({data:{campaignId:id,title:x.title,angle:x.angle,rationale:'AI分析真实搜索标题所得的需求假设，非评论或客户事实。参考笔记ID：'+x.sourceNoteIds.join(','),hotScore:0,status:'candidate'}});topics++}}return topics});
   return {insightCount:items.length,topicCount:result,notesAnalyzed:notes.length,commentsAnalyzed:0,aiAnalyzed:true,message:'AI分析完成：'+notes.length+'条相关搜索标题，新增'+items.length+'条需求假设、'+result+'个选题。未读取评论，候选需人工复核。'};
  }finally{locks.delete(id)}
 };
 const old=AnalysisService.prototype.sampleComments;
 AnalysisService.prototype.sampleComments=async function(ids){const noteIds=(ids||[]).filter(x=>x.startsWith('note:')).map(x=>x.slice(5));if(!noteIds.length)return old.call(this,ids);return (await this.prisma.note.findMany({where:{id:{in:noteIds}}})).map(n=>({id:n.id,content:'[搜索标题] '+n.title,likes:n.likes,source:n.source}))};
};
