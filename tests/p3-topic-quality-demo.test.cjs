'use strict';
// P3 CEO demonstration of the ACTUAL compiled P2 AnalysisService.
// All text/IDs are SYNTHETIC. The note.source='search-title' models the data type,
// not actual web collection. No customer text, XHS login, model call or DB access.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {AnalysisService}=require(path.join(__dirname,'../backend-ts/dist/modules/analysis/analysis.service.js'));

function makeCase({id,role,product,clue,comment=null}) {
  const campaignId='synthetic-'+id;
  const campaign={id:campaignId,name:'Synthetic '+role,personaId:'synthetic-persona-'+role,
    productName:product,keywords:['迪拜',product]};
  const notes=[{id:'syn-note-'+id,campaignId,title:clue,source:'search-title',likes:0}];
  const comments=comment?[{id:'syn-comment-'+id,noteId:notes[0].id,content:comment}]:[];
  const rows=[];let modelCalls=0;
  const prisma={
    note:{findMany:async({where})=>notes.filter(n=>n.campaignId===where.campaignId)},
    comment:{findMany:async({where})=>comments.filter(c=>where.noteId.in.includes(c.noteId))},
    topic:{findMany:async({where})=>rows.filter(r=>r.campaignId===where.campaignId),
      create:async({data})=>{const row={id:'syn-topic-'+id+'-'+(rows.length+1),...data};rows.push(row);return row;}}
  };
  const service=new AnalysisService(prisma,{findOne:async k=>{
    assert.equal(k,campaignId);return campaign;
  }},{chat:async()=>{modelCalls++;throw Error('Paid model calls forbidden in P3 demo');}});
  return {campaign,notes,comments,service,rows,modelCalls:()=>modelCalls};
}
const scenarios=[
  {id:'B01',role:'渝宝店主',product:'猫砂',clue:'迪拜猫砂白色木薯颗粒是不是粉尘',comment:'猫砂里面的白色颗粒是什么'},
  {id:'B02',role:'渝宝店主',product:'猫砂',clue:'迪拜猫砂多猫家庭补货周期怎么算'},
  {id:'B03',role:'渝宝店主',product:'饮水机',clue:'迪拜饮水机过滤清洗频次怎么确定'},
  {id:'D01',role:'中东总代理',product:'猫砂',clue:'迪拜猫砂门店渠道合作需要哪些资料'},
  {id:'D02',role:'中东总代理',product:'饮水机',clue:'迪拜饮水机经销渠道售后资料'},
  {id:'O01',role:'TUXTOOX品牌官号',product:'猫砂',clue:'迪拜猫砂低粉尘是否等于零粉尘'},
  {id:'O02',role:'TUXTOOX品牌官号',product:'猫砂',clue:'迪拜猫砂豆腐木薯颗粒配方解释'},
  {id:'X01',role:'普通狗粮账号',product:'狗粮',clue:'迪拜狗粮效期和备货周期怎么判断'},
  {id:'X02',role:'普通宠物用品号',product:'饮水机',clue:'迪拜饮水机噪音与摆放距离'}
];
test('P3 demonstration: execute nine synthetic persona/category clues through compiled AnalysisService',async()=>{
  for(const scenario of scenarios){
    const f=makeCase(scenario);
    const result=await f.service.runForCampaign(f.campaign.id);
    assert.ok(result.topicCount>=1,'no candidate: '+scenario.id);
    assert.ok(f.rows.every(t=>t.campaignId===f.campaign.id&&t.status==='candidate'));
    assert.ok(f.rows.every(t=>t.rationale.includes('note_id=syn-note-'+scenario.id) && !t.rationale.includes('本店客户说')));
    assert.ok(f.rows.every(t=>Array.from(t.title).length<=20),'title exceeded 20 characters');
    assert.equal(f.modelCalls(),0);
    console.log('P3_DEMO_CASE '+JSON.stringify({
      id:scenario.id,role:scenario.role,product:scenario.product,
      synthetic_input:scenario.clue,candidates:f.rows.map(t=>({
        title:t.title,angle:t.angle,evidence:t.rationale
      })),scope:'synthetic_only_not_published'
    }));
  }
});
test('P3 observed limitation: identical question produces identical title across three personas',async()=>{
 const same='迪拜猫砂粉尘和碎粉有什么区别';
 const roles=['渝宝店主','中东总代理','TUXTOOX品牌官号'];
 const titles=[];
 for(let i=0;i<roles.length;i++){
   const f=makeCase({id:'S'+i,role:roles[i],product:'猫砂',clue:same});
   await f.service.runForCampaign(f.campaign.id);
   assert.equal(f.rows.length,1);
   titles.push(f.rows[0].title);
 }
 console.log('P3_PERSONA_COMPARISON '+JSON.stringify({roles,titles,identical:new Set(titles).size===1,
   verdict:'KNOWN_GAP_same_template_not_persona_adapted'}));
 assert.equal(new Set(titles).size,1,'When this starts differing, revisit P3 gap classification');
});
test('P3 evidence boundaries: comments are distinguished from note titles',async()=>{
 const f=makeCase({id:'PROV',role:'渝宝店主',product:'猫砂',
   clue:'迪拜猫砂粉尘怎么分辨',comment:'猫砂碎粉和木薯颗粒是一样的吗'});
 await f.service.runForCampaign(f.campaign.id);
 assert.ok(f.rows.some(r=>r.rationale.includes('confidence=title_clue_only')));
 assert.ok(f.rows.some(r=>r.rationale.includes('confidence=unverified_public_comment')));
 assert.ok(f.rows.some(r=>r.rationale.includes('comment_id=syn-comment-PROV')));
 assert.ok(f.rows.every(r=>!r.rationale.includes('真实客户证实')));
 assert.equal(f.modelCalls(),0);
});
