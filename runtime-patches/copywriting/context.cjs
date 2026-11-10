const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {inspect}=require('./policy.cjs');
async function build(service,topicId,opts={}) {
  // Reuse the production binding/archival checks; do not reuse its old prose/history prompt.
  const verified=await service.buildVerifiedContext(topicId);
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../business-cleanup/generation-manifest.json'),'utf8'));
  const pages=await service.prisma.wikiPage.findMany({where:{id:{in:manifest.filter(p=>p.number!=='09').map(p=>p.id)},spaceId:{in:JSON.parse(verified.persona.wikiSpaceIds)}}});
  const page=n=>pages.find(p=>p.title.startsWith(n+' '));
  const skillPath=path.join(__dirname,'skills/yubao-copywriter/SKILL.md');
  const skill=fs.readFileSync(skillPath,'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'').trim();
  const theme=opts.theme||'干货';
  const pure=!(theme==='种草'||theme==='测评'||opts.embedProduct===true);
  const task={topic:verified.topic.title,angle:verified.topic.angle,theme,pure_information:pure,product:pure?'猫砂':verified.campaign.productName,default_body_length:[80,150],preferred_body_length:[100,120]};
  const facts=[];
  function add(id,number,needle){const p=page(number);if(!p)throw Error('正式业务页缺失：'+number);const lines=p.content.split(/\n+/).map(x=>x.trim());const text=lines.find(x=>x.includes(needle));if(text)facts.push({id,source_page_id:p.id,source_title:p.title,status:'user_provided_not_independently_verified',text});}
  add('identity','01','账号身份：');add('scope','01','主要经营产品：');
  add('local-needs','02','核心人群：');add('local-apartment','02','整体客户结构：');
  const needs=page('02').content.split('常见需求：')[1]?.split('这些是选题方向')[0];if(needs)facts.push({id:'customer-profile-needs',source_page_id:page('02').id,source_title:page('02').title,status:'user_provided_profile_not_customer_quotes',text:needs.trim()});
  add('scent-options','03','香型：');add('unscented-boundary','03','无香：');add('scent-preference','03','绿茶与薰衣草：');add('scent-not-ranking','03','三香型不代表除味性能排名');
  add('transition','04','换砂可以逐步过渡');add('flushing-conditions','04','冲厕口径：');
  add('absolute-claims-boundary','08','禁止无依据的');
  add('test-boundary','04','使用表现需要结合具体测试');
  if(page('08').content.includes('零粉尘'))facts.push({id:'low-dust-boundary',source_page_id:page('08').id,source_title:page('08').title,status:'business_expression_rule',text:'低粉尘是相对描述，不能替换成零粉尘；未提供量化粉尘试验，不得给出数值、绝对安全或呼吸健康功效。'});
  if(!pure){add('brand','03','品牌：');add('product-name','03','产品名称：');add('weight','03','包装标称规格：');add('formula','03','配方：');add('formula-caveat','03','配方比例与包装英文原料');add('features','04','用户提供的主要特点：');}
  // Raw old draft prose is intentionally excluded from API context. It remains available to deterministic duplicate checks.
  const history=await service.prisma.draft.findMany({where:{personaId:verified.persona.id},orderBy:{createdAt:'desc'},take:10});
  const history_briefs=history.map(d=>({id:d.id,status:d.status,title:d.title,approved:false,role:'avoid_repeating_this_subject_not_a_positive_example',known_issues:inspect({titles:[d.title,d.title,d.title],paragraphs:d.body.split(/\n\s*\n/),hashtags:JSON.parse(d.hashtags||'[]'),claim_map:[],missing_information:[],publishable:true},{task,allowed_facts:facts,history_internal:[]}).filter(i=>!['missing_citation','titles'].includes(i.code)).map(i=>i.code)}));
  const confirmed=page('10').content.split('风格校准示例')[0];
  let factGate={blocked:false,reason:''};
  if(theme==='测评'||/亲测|实测|真实测评/.test(task.topic))factGate={blocked:true,reason:'本选题需要当次实测资料。目前没有可核对的实验记录，请补充素材或选择产品知识／干货主题。'};
  if(/今天.*(?:送|跑|路线)|当日.*配送|客户.*(?:说|告诉|故事)/.test(task.topic))factGate={blocked:true,reason:'本选题缺少当次配送／客户事实，请先补充最少的时间、事件和可公开资料。'};
  if(/价格|多少钱|优惠|赠品|库存|现货|到货日期|配送时效/.test(task.topic))factGate={blocked:true,reason:'没有当期确认的价格、库存或活动记录，不能使用历史值。请补充本次有效资料。'};
  const publicContext={task,business_context:{persona:{name:verified.persona.name,tone:verified.persona.tone,positioning:verified.persona.positioning,audience:verified.persona.audience,taboo:verified.persona.taboo,signature:''},content_rules:page('05').content,continuity_rules:page('06').content,source_policy:'仅有用户提供资料，没有独立检测和当前活动确认。不得引用开发归档或未核实动态信息。'},allowed_facts:facts,confirmed_feedback:confirmed,history_briefs,hasCustomerEvidence:false,hasEventEvidence:false};
  // Explicitly remove branded profile snippets from pure-information fact evidence.
  if(pure)publicContext.allowed_facts=publicContext.allowed_facts.filter(f=>!['scope'].includes(f.id));
  const selection=task.topic+' '+task.angle;
  if(/低粉尘|低尘|粉尘/.test(selection)){
    task.focus='只说明低粉尘与零粉尘的区别、选购时看对应倒砂素材或试验依据，给出店主的具体判断。不转成香型或除味介绍。不凭植物基品类、原料或生产工艺推断粉尘少，不谈呼吸或健康效果。';
    publicContext.allowed_facts=publicContext.allowed_facts.filter(f=>!['scent-options','unscented-boundary','scent-preference','scent-not-ranking','transition','flushing-conditions'].includes(f.id));
  }else if(/气味|味道|除味|除臭|香型/.test(selection)){
    task.focus='在原选题内收窄到香味选择不等于除味能力排名。先给选品判断，再说明香型接受度；不要转去讲通风、清理频次或换砂过渡。';
    publicContext.allowed_facts=publicContext.allowed_facts.filter(f=>!['transition','flushing-conditions','low-dust-boundary'].includes(f.id));
  }
  return {...publicContext,history_internal:history,verified,skill,skillHash:crypto.createHash('sha256').update(skill).digest('hex'),factGate};
}
function payload(ctx){const {history_internal,verified,skill,skillHash,factGate,...out}=ctx;return out;}
module.exports={build,payload};
