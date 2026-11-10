const path=require('path');
module.exports=function(backend){
 const {AnalysisService}=require(path.join(backend,'dist/modules/analysis/analysis.service'));
 AnalysisService.prototype.topicTitle=function(product,pain){return '迪拜猫砂，'+String(pain).replace(/喝|亲测|真实测评|姐妹们/g,'')+'怎么选？'};
 AnalysisService.prototype.runForCampaign=async function(id){
  await this.campaigns.findOne(id);
  const notes=await this.prisma.note.findMany({where:{campaignId:id}});
  const real=notes.filter(n=>!/(mock|示例|模拟)/i.test(n.source||'')&&/猫砂|养猫|猫咪|猫粮|养宠/.test(n.title));
  if(!real.length)return {insightCount:0,topicCount:0,commentsAnalyzed:0,message:'没有相关真实搜索笔记，未调用AI或生成模拟痛点。'};
  const groups=[['香型选择',/香型|无香|绿茶|薰衣草|香味/],['低粉尘',/粉尘|低尘|扬尘/],['结团与清理',/结团|清理|铲屎|粘底|吸水/],['补货与储存',/补货|储存|收纳|搬运|配送|送货/],['气味管理',/气味|除味|除臭|异味/],['换砂与适应',/换砂|适应|混用/]];
  let count=0;for(const [label,re] of groups){const hits=real.filter(n=>re.test(n.title));if(!hits.length)continue;const title=this.topicTitle('',label);if(await this.prisma.topic.findFirst({where:{campaignId:id,title}}))continue;
   await this.prisma.topic.create({data:{campaignId:id,title,angle:'搜索标题线索：'+label,rationale:'来源：真实搜索标题，不等于正文、评论、客户反馈或亲测证据。参考笔记ID：'+hits.slice(0,5).map(n=>n.id).join(','),hotScore:hits.length,status:'candidate'}});count++}
  return {insightCount:0,topicCount:count,notesAnalyzed:real.length,commentsAnalyzed:0,aiPainPoints:0,message:'仅按真实搜索标题提供选题线索，未调用付费AI；未删除已有选题，不代表已完成评论痛点分析。'};
 };
 const {GenerateService}=require(path.join(backend,'dist/modules/generate/generate.service'));const previous=GenerateService.prototype.updateDraft;
 GenerateService.prototype.updateDraft=async function(id,data){const edit=['title','body','images','hashtags'].some(k=>k in data);if(edit){data={...data,complianceChecked:false};if(data.status==='published')delete data.status}return previous.call(this,id,data)};
};
