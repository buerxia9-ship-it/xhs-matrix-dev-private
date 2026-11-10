const path=require('path'),fs=require('fs');
module.exports=function(backend){
 const {GenerateService}=require(path.join(backend,'dist/modules/generate/generate.service'));
 const {WikiService}=require(path.join(backend,'dist/modules/wiki/wiki.service'));
 const {BadRequestException}=require(require.resolve('@nestjs/common',{paths:[backend]}));
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'business-cleanup/generation-manifest.json'),'utf8'));
 const allowed=new Set(manifest.map(x=>x.id));const excluded=new Set(['yubao-reference-archive-20261105','yubao-water-fountain-pending']);
 for(const method of ['search','dump']){const original=WikiService.prototype[method];WikiService.prototype[method]=async function(spaces,...args){return original.call(this,spaces.filter(id=>!excluded.has(id)),...args)}}
 const previous=GenerateService.prototype.buildVerifiedContext;
 GenerateService.prototype.buildVerifiedContext=async function(topicId){
  const topic=await this.prisma.topic.findUnique({where:{id:topicId}});if(!topic)throw new BadRequestException('选题不存在');
  const campaign=await this.campaigns.findOne(topic.campaignId);if(campaign.personaId!=='cmw1s72vh000yqcncwkg0hgx1')return previous.call(this,topicId);
  if(topic.status==='discarded')throw new BadRequestException('已弃用选题不能生成');
  const persona=await this.prisma.persona.findUnique({where:{id:campaign.personaId}});const spaces=JSON.parse(persona.wikiSpaceIds||'[]');
  const pages=await this.prisma.wikiPage.findMany({where:{spaceId:{in:spaces}},orderBy:{order:'asc'}});
  const current=pages.filter(p=>allowed.has(p.id)&&p.tags?.includes('yubao_business_current'));
  if(current.length!==10)throw new BadRequestException('正式业务知识不完整或绑定已变更，请检查后再生成。');
  const safe=current.filter(p=>!p.title.startsWith('08 ')&&!p.title.startsWith('09 '));
  const feedback=current.find(p=>p.tags?.includes('confirmed_feedback'));
  const history=await this.prisma.draft.findMany({where:{personaId:persona.id},orderBy:{createdAt:'desc'},take:10});
  const mask=s=>String(s||'').replace(/\d+(?:\.\d+)?\s*(?:AED|迪拉姆)/gi,'[历史金额已屏蔽，待当期确认]').replace(/(?:82\s*%|TOP\s*1|零差评|零退货)/gi,'[历史背书已屏蔽，待证据核实]');
  const messages=[{role:'system',content:'你为渝宝账号撰写待人工审核草稿。资料均按来源和时效使用；用户提供不等于已独立核验。只采用下列正式业务知识，不引用开发、迁移或操作交接资料。历史稿件仅用于连续性和避免重复，不作为当前事实或已批准宣传。禁止虚构经历。默认80—150字、2—4段、0—3表情、3—5标签；无固定开头结尾。猫砂标题含迪拜和猫砂；其他产品按自身品类。输出严格为：标题: ...\n正文:\n...\n标签: ...\n\n【正确人设】\n'+JSON.stringify(persona)+'\n【正式业务知识，完整正文】\n'+safe.map(p=>'# '+p.title+'\n'+p.content).join('\n\n')+'\n【事实证据边界】\nSGS需完整报告和对应产品、日期及检测项目；检测不等于认证。平台排名需站点、品类、商品及日期。复购、评价及退货数据需统计周期、样本和依据。当前没有已核实背书，不可写检测结论、排名、复购率或零差评承诺。不贬低竞品，不站外导流。\n【动态有效性】\n本次没有当期确认的价格、库存、赠品、到货日期或配送承诺。历史数值不传入事实区，不能自行引用或推断。稳定产品事实仍可使用，但保持用户提供标签。\n【近期真实可访问稿件：状态保留，仅供查重】\n'+JSON.stringify(history.map(d=>({id:d.id,status:d.status,title:mask(d.title),body:mask(d.body),feedbackStatus:'无逐稿用户确认记录'})))+'\n【已确认长期风格反馈】\n'+feedback.content+'\n【历史完整性】\n只有'+history.length+'篇可访问稿件；不代表完整已发布历史。长期反馈来自用户正式业务文件，不是助手改稿认可。'}, {role:'user',content:JSON.stringify({project:campaign.name,product:campaign.productName,topic:topic.title,angle:topic.angle,playbook:campaign.playbook})+'\n本次没有新增路线、订单、实验或客户对话，不得编造。'}];
  return {topic,campaign,persona,messages,sources:safe.map(p=>({id:p.id,title:p.title,characters:p.content.length})),historyIds:history.map(d=>d.id),confirmedFeedbackCount:1,excludedPageIds:pages.filter(p=>!allowed.has(p.id)).map(p=>p.id),evidenceMode:'restrictions_only',dynamicMode:'no_current_confirmation'};
 };
};
