from pathlib import Path
import sqlite3,json,sys,time,argparse
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'.cloud-data'
ap=argparse.ArgumentParser()
ap.add_argument('--database')
args=ap.parse_args()
db=Path(args.database).absolute() if args.database else BASE/'fixture.db'
base=BASE.resolve()
if not db.resolve().is_relative_to(base):raise SystemExit('Only repository .cloud-data may hold fixtures')
for p in [db.parent,*db.parents]:
 if p.exists() and (p.is_symlink() or (hasattr(p,'is_junction') and p.is_junction())):raise SystemExit('Symlink in fixture location')
 if p==ROOT:break
db.parent.mkdir(parents=True,exist_ok=True)
if db.exists():raise SystemExit('Existing fixture retained; choose a new file instead of overwriting')
c=sqlite3.connect(db)
try:
 c.executescript((ROOT/'fixtures/effective-schema.sql').read_text(encoding='utf-8'))
 now=int(time.time()*1000)
 def insert(table,data):
  cols={r[1]:r for r in c.execute('PRAGMA table_info("'+table+'")')}
  for n in ['created_at','updated_at','createdAt','updatedAt']:
   if n in cols:data.setdefault(n,now)
  data={k:v for k,v in data.items() if k in cols}
  names=','.join('"'+k+'"' for k in data)
  c.execute('INSERT INTO "'+table+'"('+names+') VALUES('+','.join('?' for _ in data)+')',tuple(data.values()))
 spaces=['demo-account-knowledge','demo-product-knowledge']
 for sid,name in zip(spaces,['Synthetic account rules','Synthetic product examples']):
  insert('wiki_spaces',{'id':sid,'name':name,'description':'Synthetic fixture, never business authority','template':'custom'})
 insert('personas',{'id':'demo-persona','name':'示例店主（合成）','tone':'自然、克制、只依据给定事实','positioning':'隔离测试用途','audience':'合成测试受众','taboo':'不编造客户经历、价格或检测证据','signature':'','hashtags':'[]','wiki_space_ids':json.dumps(spaces),'wikiSpaceIds':json.dumps(spaces)})
 insert('campaigns',{'id':'demo-campaign','name':'Synthetic test project','status':'active','runMode':'manual','run_mode':'manual','personaId':'demo-persona','persona_id':'demo-persona','productName':'Synthetic example','product_name':'Synthetic example','autopilot_enabled':0,'keywords':'["synthetic"]','collectAccountIds':'[]','publishAccountIds':'[]'})
 contents=[
 '账号身份：示例店主（合成）。\n主要经营产品：示例商品，无真实经营事实。',
 '核心人群：合成测试受众。\n整体客户结构：无真实客户。\n常见需求：仅测试需求。\n这些是选题方向，不是客户原话。',
 '品牌：DEMO_BRAND。\n产品名称：合成示例。\n包装标称规格：未核实。\n配方：未核实。\n配方比例与包装英文原料：无真实资料。\n香型：仅测试标签。\n无香：仅测试标签。\n绿茶与薰衣草：仅测试标签。\n三香型不代表除味性能排名。',
 '换砂可以逐步过渡：这里只是合成字符串。\n冲厕口径：无证据，不提供。\n使用表现需要结合具体测试。\n用户提供的主要特点：本 fixture 没有真实产品资料。',
 '只使用合成测试事实；固定开头和结尾留空。',
 '只读取当前明确绑定的测试空间；不把历史草稿当正面事实。',
 '无客户事件、评价、订单或个人信息。',
 '禁止无依据的排名、绝对承诺与健康功效。零粉尘不可当作已证实事实。',
 '价格、库存、到货和赠品均未核实；没有当前宣传事实。',
 '仅合成审改规则：保持范围、避免重复。\n风格校准示例：测试占位。'
 ]
 manifest=[]
 for number,content in enumerate(contents,1):
  ident='demo-page-'+str(number).zfill(2);sid=spaces[1] if number in [3,4] else spaces[0]
  insert('wiki_pages',{'id':ident,'space_id':sid,'spaceId':sid,'title':str(number).zfill(2)+' Synthetic fixture','content':content,'page_type':'topic','confidence':'UNVERIFIED','tags':'synthetic-only'})
  manifest.append({'id':ident,'number':str(number).zfill(2),'source':'synthetic-only'})
 insert('topics',{'id':'demo-topic','campaign_id':'demo-campaign','campaignId':'demo-campaign','title':'合成测试选题','angle':'核对信息边界','status':'adopted'})
 insert('drafts',{'id':'demo-draft','topic_id':'demo-topic','topicId':'demo-topic','campaign_id':'demo-campaign','campaignId':'demo-campaign','persona_id':'demo-persona','personaId':'demo-persona','title':'Synthetic draft','body':'合成测试草稿，不代表真实商品或客户事实。','hashtags':'["synthetic"]','images':'[]','status':'draft'})
 c.commit()
 assert c.execute('SELECT COUNT(*) FROM accounts').fetchone()[0]==0
 assert c.execute('SELECT COUNT(*) FROM model_providers').fetchone()[0]==0
 assert c.execute('PRAGMA quick_check').fetchone()[0]=='ok'
 assert not list(c.execute('PRAGMA foreign_key_check'))
 (BASE/'fixture-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'synthetic':True,'accounts':0,'modelProviders':0,'personaCount':1,'wikiPageCount':10,'database':str(db.relative_to(ROOT)),'integrity':'ok'}))
finally:c.close()
