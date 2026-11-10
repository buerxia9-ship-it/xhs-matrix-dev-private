const path=require('node:path');
const {terraChatParams}=require('./terra-chat-compat.cjs');
module.exports=function(backend){
 const {OpenAIAdapter}=require(path.join(backend,'dist/modules/llm-core/adapters/openai.adapter.js'));
 const original=OpenAIAdapter.prototype.buildRequestParam;
 OpenAIAdapter.prototype.formatMessages=function(messages){return messages.map(m=>({role:m.role,content:m.content}));};
 OpenAIAdapter.prototype.buildRequestParam=function(params){const result=original.call(this,params); delete result.timeout; return terraChatParams(result);};
 const sdkRequire=require('node:module').createRequire(require.resolve('openai',{paths:[backend]}));
 const ProxyAgent=sdkRequire('https-proxy-agent');
 const {OpenAI}=require(require.resolve('openai',{paths:[backend]}));
 require('./image-compat.cjs')(backend,OpenAI,ProxyAgent);
 OpenAIAdapter.prototype.createClient=function(config){return new OpenAI({baseURL:this.normalizeApiUrl(config.apiUrl),apiKey:config.apiKey,timeout:45000,maxRetries:0,httpAgent:new ProxyAgent("http://127.0.0.1:7892")});};
};
