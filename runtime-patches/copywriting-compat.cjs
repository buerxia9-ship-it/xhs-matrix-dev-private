const path=require('path'),fs=require('fs'),crypto=require('crypto');
const {build,payload}=require('./copywriting/context.cjs');
const {draftSchema,reviewSchema,inspect,length}=require('./copywriting/policy.cjs');
const {terraChatParams}=require('./terra-chat-compat.cjs');
const {resolveContentProfile}=require('./content-capability.cjs');
const locks=new Set(),root=process.env.YUBAO_COPY_ARTIFACT_ROOT||path.join(__dirname,'copywriting'),auditDir=path.join(root,'audits');
module.exports=function(backend){
 const {GenerateService}=require(path.join(backend,'dist/modules/generate/generate.service'));
 const {GatewayService}=require(path.join(backend,'dist/modules/gateway/gateway.service'));
 const {OpenAIAdapter}=require(path.join(backend,'dist/modules/llm-core/adapters/openai.adapter'));
 const {BadRequestException}=require(require.resolve('@nestjs/common',{paths:[backend]}));
 GatewayService.prototype.copyStructured=async function(messages,schema,name){
  const r=await this.resolveActiveText();
  if(r.providerConfig.provider!=='openai')throw new BadRequestException('渝宝文案结构化检查目前接入OpenAI供应商，请选择已配置的OpenAI文本模型。');
  const client=new OpenAIAdapter().createClient(r.providerConfig);
  const response=await client.chat.completions.create(terraChatParams({model:r.modelName,messages,temperature:0.45,max_tokens:2200,response_format:{type:'json_schema',json_schema:{name,strict:true,schema}}}));
  const choice=response.choices?.[0];
  if(!choice||choice.finish_reason!=='stop'||choice.message.refusal||!choice.message.content)throw new BadRequestException('文案结构化输出不完整或被拒绝，未保存草稿。');
  return {value:JSON.parse(choice.message.content),model:r.modelName,responseModel:response.model,usage:response.usage,requestId:response._request_id||null};
 };
 GenerateService.prototype.buildCopyContext=function(topicId,opts){return build(this,topicId,opts)};
 GenerateService.prototype.composeVerifiedCopy=async function(topicId,opts={}){
  const context=await this.buildCopyContext(topicId,opts);
  if(context.factGate.blocked)throw new BadRequestException(context.factGate.reason+' 未调用模型。');
  const audit={id:'copy_'+Date.now()+'_'+crypto.randomBytes(4).toString('hex'),version:'yubao-copy-v1',skillHash:context.skillHash,topicId,task:context.task,sourcePages:[...new Set(context.allowed_facts.map(f=>f.source_page_id))],historyIds:context.history_briefs.map(h=>h.id),feedbackSource:'正式业务知识10：用户确认长期风格；非逐稿批准',attempts:[],paidCalls:0};
  const voiceExample=/低粉尘|低尘|粉尘/.test(context.task.topic)?'我选低粉尘猫砂，会先看对应的倒砂素材，不只看包装上的几个字。':'选猫砂，我会把想不想添香味和除味表现分开看。';
  const system=context.skill+'\n口吻示意（仅参考具体判断方式，不是必用句或新事实）：'+voiceExample+'\n返回指定JSON结构。claim_map只映射最终标题和正文中实际出现的事实性短语；不写审查报告到正文。';
  const input=payload(context);let repair=[],previousCandidate=null;
  try{
   for(let attempt=0;attempt<2;attempt++){
    const messages=[{role:'system',content:system},{role:'user',content:JSON.stringify(input)}];
    if(repair.length){messages.push({role:'assistant',content:JSON.stringify(previousCandidate)});messages.push({role:'user',content:'上一候选未通过。在上面候选基础上修订以下具体问题，不改变本次主题。claim_map.quote要从最终正文或标题逐字摘抄，不要从原资料摘抄：'+JSON.stringify(repair)});}
    const generated=await this.gateway.copyStructured(messages,draftSchema,'yubao_copy');audit.paidCalls++;
    const candidate=generated.value;
    // Formatting-only normalization: keep a decorative emoji with the preceding paragraph.
    const paragraphs=[];for(const p of candidate.paragraphs||[]){if(paragraphs.length&&!/[\p{L}\p{N}]/u.test(p))paragraphs[paragraphs.length-1]+=p.trim();else paragraphs.push(p.trim());}candidate.paragraphs=paragraphs;
    previousCandidate=candidate;const local=inspect(candidate,context);
    const record={candidate,localIssues:local,model:generated.model,responseModel:generated.responseModel,usage:generated.usage,requestId:generated.requestId,request:messages};audit.attempts.push(record);
    if(local.some(x=>x.code==='missing_evidence')){audit.result='needs_information';throw new BadRequestException('本次文案缺少事实资料：'+candidate.missing_information.join('；')+'。未保存可用草稿。');}
    if(local.length){repair=local;continue;}
    const reviewMessages=[{role:'system',content:'你是渝宝文案的独立编辑复核步骤。不要默认认可候选作者或它的引用。使用提供的事实逐句检查候选：1身份口吻具体自然而非通用科普；2事实与因果确有证据；3本次干货植入要求；4标签主题及来源；5与旧稿核心主题区别。引用ID本身不是证据，需比较引用文字是否真的支持结论。一般选品判断可作为观点，但不能捏造个人经历或生理功效。不能把三香型当排名。避免同主题同角度只是换措辞。只列能定位原文的具体问题，不能因无表情、没有第一人称或没用某固定句而机械判失败。acceptable为true仅表示模型复核未发现问题，不等于人工批准。不要改写，返回指定JSON。'}, {role:'user',content:JSON.stringify({context:input,candidate})}];
    const reviewed=await this.gateway.copyStructured(reviewMessages,reviewSchema,'yubao_copy_review');audit.paidCalls++;record.review=reviewed.value;record.reviewModel=reviewed.model;record.reviewResponseModel=reviewed.responseModel;record.reviewUsage=reviewed.usage;record.reviewRequest=reviewMessages;
    if(!reviewed.value.persona_anchor_quote||!candidate.paragraphs.join('\n').includes(reviewed.value.persona_anchor_quote)){reviewed.value.acceptable=false;reviewed.value.issues.push({category:'persona',quote:'',reason:'请在正文给出一个具体选品判断或自然建议，不要只罗列定义。不要求固定用我开头。'});}
    if(!reviewed.value.acceptable||reviewed.value.issues.length){repair=reviewed.value.issues;continue;}
    audit.result='checks_passed_pending_human';audit.output=candidate;audit.bodyCharacters=length(candidate.paragraphs.join('\n'));fs.mkdirSync(auditDir,{recursive:true});fs.writeFileSync(path.join(auditDir,audit.id+'.json'),JSON.stringify(audit,null,2));
    return {candidate,audit,context};
   }
   audit.result='checks_failed';throw new BadRequestException({message:'文案经过一次修订仍未通过检查，未保存为可用草稿。请收窄选题或查看复核问题。',issues:repair,auditId:audit.id});
  }catch(e){audit.result=audit.result||'api_failed';audit.error=e.message;fs.mkdirSync(auditDir,{recursive:true});fs.writeFileSync(path.join(auditDir,audit.id+'.json'),JSON.stringify(audit,null,2));throw e;}
 };
 const previous=GenerateService.prototype.generateFromTopic;
 GenerateService.prototype.generateFromTopic=async function(topicId,opts={}){
  const topic=await this.prisma.topic.findUnique({where:{id:topicId}});if(!topic)throw new BadRequestException('选题不存在');const campaign=await this.campaigns.findOne(topic.campaignId);
  const profile=await resolveContentProfile(this,campaign);if(profile.kind==='blocked')throw new BadRequestException(profile.reason);if(profile.kind!=='protected')return previous.call(this,topicId,opts);
  if(locks.has(topicId))throw new BadRequestException('该选题正在写作与复核，请勿重复点击。');locks.add(topicId);
  try{const {candidate,audit}=await this.composeVerifiedCopy(topicId,opts);
   const draft=await this.prisma.draft.create({data:{campaignId:campaign.id,topicId,personaId:campaign.personaId,title:candidate.titles[0],body:candidate.paragraphs.join('\n\n'),hashtags:JSON.stringify(candidate.hashtags),images:'[]',status:'ready',complianceChecked:false,playbook:opts.theme||'干货'}});
   audit.draftId=draft.id;fs.writeFileSync(path.join(auditDir,audit.id+'.json'),JSON.stringify(audit,null,2));fs.mkdirSync(path.join(root,'by-draft'),{recursive:true});fs.writeFileSync(path.join(root,'by-draft',draft.id+'.json'),JSON.stringify({auditId:audit.id,titles:candidate.titles,angle:candidate.angle,characters:audit.bodyCharacters,model:audit.attempts[0].model,checks:'规则检查与模型编辑复核通过，仍待人工审核',fingerprint:crypto.createHash('sha256').update(draft.title+'\n'+draft.body+'\n'+draft.hashtags).digest('hex')},null,2));
   return {...this.deserialize(draft),copyReview:loadReview(draft)};
  }finally{locks.delete(topicId)}
 };
 function loadReview(draft){const file=path.join(root,'by-draft',draft.id+'.json');if(!fs.existsSync(file))return null;const info=JSON.parse(fs.readFileSync(file,'utf8'));const tags=typeof draft.hashtags==='string'?draft.hashtags:JSON.stringify(draft.hashtags);return {...info,editedSinceCheck:info.fingerprint!==crypto.createHash('sha256').update(draft.title+'\n'+draft.body+'\n'+tags).digest('hex')};}
 const list=GenerateService.prototype.draftsByCampaign;
 GenerateService.prototype.draftsByCampaign=async function(id){const rows=await list.call(this,id);return rows.map(d=>({...d,copyReview:loadReview(d)}))};
};
