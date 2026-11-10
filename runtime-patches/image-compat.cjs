const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=function(backend,OpenAI,ProxyAgent){
 const {GatewayService}=require(path.join(backend,'dist/modules/gateway/gateway.service.js'));
 const textTest=GatewayService.prototype.testText;
 GatewayService.prototype.testText=async function(id){
  if(!id)return textTest.call(this,id);
  const r=await this.resolveModel(id);
  if(r.modelType!=='image')return textTest.call(this,id);
  try{const client=new OpenAI({baseURL:r.providerConfig.apiUrl,apiKey:r.providerConfig.apiKey,timeout:45000,maxRetries:0,httpAgent:new ProxyAgent('http://127.0.0.1:7892')});await client.models.retrieve(r.modelName);return {ok:true,message:'图片模型可访问（仅检查模型权限，未执行付费生图）'};}catch(e){return {ok:false,message:'图片模型权限检查失败：'+e.message};}
 };
 const previous=GatewayService.prototype.generateImage;
 GatewayService.prototype.generateImage=async function(prompt,opts={}){
  const id=opts.modelId||(await this.getActive()).activeImageModelId;
  const r=await this.resolveModel(id);
  if(!r.modelName.startsWith('gpt-image-'))return previous.call(this,prompt,opts);
  const client=new OpenAI({baseURL:r.providerConfig.apiUrl,apiKey:r.providerConfig.apiKey,timeout:180000,maxRetries:0,httpAgent:new ProxyAgent('http://127.0.0.1:7892')});
  const size={'3:4':'1024x1360','9:16':'1024x1792','1:1':'1024x1024','4:3':'1360x1024','16:9':'1792x1024'}[opts.aspectRatio||'3:4']||'1024x1360';
  const result=await client.images.generate({model:r.modelName,prompt,size,n:1,quality:opts.quality||'low'});
  const dir=path.join(process.env.DATA_DIR,'generated-images');fs.mkdirSync(dir,{recursive:true});
  const images=[];
  for(const item of result.data||[]){if(!item.b64_json)throw new Error('图片接口未返回图片数据');const name=Date.now()+'_'+crypto.randomBytes(4).toString('hex')+'.png';fs.writeFileSync(path.join(dir,name),Buffer.from(item.b64_json,'base64'));images.push('/generated/'+name);}
  if(!images.length)throw new Error('图片接口返回为空');
  return {images};
 };
};
