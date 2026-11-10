const text = { type: 'string' }, strings = { type: 'array', items: text };
const object = properties => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const draftSchema = object({
  angle: text, titles: strings, paragraphs: strings, hashtags: strings,
  claim_map: { type: 'array', items: object({ quote: text, fact_ids: strings }) },
  missing_information: strings, publishable: { type: 'boolean' },
});
draftSchema.properties.titles={type:'array',minItems:3,maxItems:3,items:{type:'string',maxLength:20,pattern:'迪拜.*猫砂|猫砂.*迪拜',description:'每个标题均须自然包含迪拜和猫砂'}};
draftSchema.properties.paragraphs={type:'array',minItems:2,maxItems:4,items:{type:'string'}};
draftSchema.properties.hashtags={type:'array',minItems:3,maxItems:5,items:{type:'string'}};
draftSchema.properties.claim_map.items.properties.quote={type:'string',description:'从最终paragraphs或titles中逐字复制的一段事实性短语；不是抄来源资料、角度或说明。必须在最终正文或标题实际出现。'};
const reviewSchema = object({
  acceptable: { type: 'boolean' },
  issues: { type: 'array', items: object({ category: text, quote: text, reason: text }) },
  persona_reason: text, persona_anchor_quote: {...text,description:'从成稿正文逐字摘出体现具体选品判断或自然建议的一句话；若整篇只有百科定义则留空'}, fact_support_reason: text,
});
const length = s => Array.from(String(s).replace(/\s/g, '')).length;
const normalize = s => String(s).replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
function grams(s) { s=normalize(s); const set=new Set(); for(let i=0;i<s.length-3;i++)set.add(s.slice(i,i+4));return set; }
function similarity(a,b) { const aa=grams(a),bb=grams(b);if(!aa.size||!bb.size)return 0;let n=0;for(const v of aa)if(bb.has(v))n++;return 2*n/(aa.size+bb.size); }
function inspect(output, context) {
  const errors=[];
  if(!output || typeof output!=='object')return [{code:'format',message:'文案不是结构化结果'}];
  const strArrays=['titles','paragraphs','hashtags','missing_information'];
  if(strArrays.some(k=>!Array.isArray(output[k])||output[k].some(v=>typeof v!=='string'))||!Array.isArray(output.claim_map)||typeof output.publishable!=='boolean')return [{code:'format',message:'文案字段缺失或类型错误'}];
  const body=output.paragraphs.join('\n\n'),title=output.titles[0]||'',all=output.titles.join('\n')+'\n'+body+'\n'+output.hashtags.join(' ');
  const add=(code,message)=>errors.push({code,message});
  if(output.missing_information.length||!output.publishable)add('missing_evidence','缺少本次必需资料：'+output.missing_information.join('；'));
  if(output.titles.length!==3||output.titles.some(t=>length(t)>20||!t.includes('迪拜')||!t.includes('猫砂')))add('titles','需3个20字内、含迪拜与猫砂的标题');
  if(output.paragraphs.length<2||output.paragraphs.length>4||length(body)<80||length(body)>150)add('length','正文应80—150字、2—4段；当前'+length(body)+'字。请改写到100—120字，删除重复结论和多余免责声明，不截断句子。');
  if((body.match(/\p{Extended_Pictographic}/gu)||[]).length>3)add('emoji','表情超过3个');
  if(output.hashtags.length<3||output.hashtags.length>5||new Set(output.hashtags).size!==output.hashtags.length)add('tags','需3—5个不重复标签');
  if(output.hashtags.some(t=>/客户|反馈|补货|配送|实测|测评/.test(t)&&!body.includes((t.match(/客户|反馈|补货|配送|实测|测评/)||[])[0])))add('tag_relevance','标签的主题未在正文出现');
  if(/真实客户|客户反馈|客户问题/.test(output.hashtags.join(' '))&&!context.hasCustomerEvidence)add('false_customer_source','没有真实客户来源，不能使用客户来源标签');
  if(/首先|其次|此外|综上/.test(body))add('lecture_style','请移除首先其次等说明文结构，改为店主直接说明');
  if(/(?:气味管理|猫砂|养猫).{0,14}是.{0,20}(?:关注|关心|常遇到).{0,10}问题/.test(output.paragraphs[0]||''))add('generic_opening','开头是泛泛背景，应直接给出本篇具体选品判断');
  const affirmative=all.replace(/(?:不等于|并非|不是|不代表|不能(?:宣称|承诺|保证)|不得(?:宣称|承诺)|不能当作)(?:.{0,3})(?:绝对安全|永不堵塞)/g,'[否定绝对承诺]');
  const zeroClaims=all.split(/[。！？\n]/).some(s=>/零粉尘/.test(s)&&(!/不等于|不代表|不一样|区别|别期待|不能期待|不能承诺|不能保证|不能.{0,8}相信|不要.{0,8}相信|不应|≠|不是|并非|不现实|不意味着|无证据|相对/.test(s)||/做到零粉尘|实现零粉尘|真正零粉尘|保证零粉尘|TUXTOOX零粉尘/.test(s)));
  if(zeroClaims||/最有效|大幅降低|百分百|100%|绝对安全|永不堵塞|必备|全网第一/.test(affirmative))add('unsupported_absolute','出现没有证据支持的功效或绝对承诺');
  if(/分批|分次|少量/.test(body)&&/倒入.{0,16}(?:气味|异味)|(?:减少|避免).{0,10}(?:气味|异味)/.test(body))add('unsupported_causality','没有分批倒砂减少异味的证据');
  if(/透气性.{0,5}猫砂盆/.test(body))add('unsupported_causality','没有该盆型与除味关系的证据');
  if(/呼吸|抗菌|抑菌|治疗|驱虫|镇静|助眠|除甲醛/.test(body))add('unsupported_health','本次没有支持呼吸健康或其他健康功效的资料，不应由低粉尘推导这些结论');
  if(/(?:实际|一定|全部|均).{0,5}(?:有微量粉尘|无粉尘|零粉尘)/.test(body))add('unmeasured_result','没有本次测量记录，不能把低粉尘的含义写成某产品实际测量结果');
  if(/植物基猫砂.{0,10}粉尘.{0,8}(?:少|低)/.test(body))add('category_overgeneralization','不能由植物基品类或原料推断粉尘一定更少，需要对应产品与测试依据');
  if(/今天.{0,10}(?:送|跑|接单|订单)|客户.{0,6}(?:说|告诉|反馈)|我家猫.{0,6}(?:用了|试了)|亲测|实测/.test(all)&&!context.hasEventEvidence)add('invented_event','缺少本次配送、客户或实测证据');
  if(/\d+(?:\.\d+)?\s*(?:AED|迪拉姆)|TOP\s*1|82\s*%|SGS|零差评|零退货/.test(all))add('stale_or_unverified','历史价格或未核实背书不得进入当前稿件');
  if(/微信|二维码|加微|vx|v信/i.test(all))add('contact','出现站外联系方式');
  if(context.task.pure_information&&/TUXTOOX|豆腐木薯植物基猫砂|80%|15%|5%/i.test(all))add('unwanted_product','纯干货模式不应带品牌、锁定商品名或配方');
  if(!context.task.pure_information&&!/TUXTOOX/i.test(body))add('missing_product','本篇要求带产品，请自然点明TUXTOOX及一个相关商品信息');
  if(/迪拜的?猫砂香型(?:有|只有)/.test(body))add('product_scope','不能把本商品三香型扩大为迪拜所有猫砂的香型范围');
  if(body.split(/[。！？\n]/).some(s=>/猫砂的?香型(?:主要)?(?:是|有|包括).{0,30}三种/.test(s)&&!s.includes('TUXTOOX')))add('product_scope','三种香型是本商品资料，不是整个猫砂品类的范围；纯干货请用香型举例，不声称主要只有三种');
  if(/\[[^\]]*(?:实际|真实|区域|确认)[^\]]*\]/.test(all))add('placeholder','占位符不是可审核成稿');
  const facts=new Map(context.allowed_facts.map(f=>[f.id,f]));
  for(const claim of output.claim_map){if(!claim||typeof claim.quote!=='string'||!Array.isArray(claim.fact_ids)||!claim.quote||!all.includes(claim.quote)||!claim.fact_ids.length||claim.fact_ids.some(id=>!facts.has(id)))add('invalid_citation','事实引文或来源ID无效');}
  if(!output.claim_map.length)add('missing_citation','缺少事实来源映射');
  for(const old of context.history_internal||[]){if(normalize(old.body)===normalize(body)||similarity(old.body,body)>.68){add('duplicate','与历史稿件高度重复：'+old.id);break;}}
  if(context.factGate?.blocked)add('missing_evidence',context.factGate.reason);
  return errors;
}
module.exports={draftSchema,reviewSchema,inspect,length,similarity};
