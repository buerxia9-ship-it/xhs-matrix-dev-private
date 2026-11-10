'use strict';
// Defense for the trusted test app only. This is not an OS sandbox for an Agent.
const net=require('node:net'),tls=require('node:tls'),http=require('node:http'),https=require('node:https');
function local(host){return ['localhost','127.0.0.1','::1','[::1]'].includes(String(host||'localhost').toLowerCase());}
function checkHost(host){if(!local(host))throw Error('CLOUD_TEST_EXTERNAL_NETWORK_BLOCKED');}
function checkUrl(value){const u=new URL(typeof value==='string'||value instanceof URL?value:value.url);checkHost(u.hostname);return u;}
function install(){
 if(global.__xhsCloudGuard)return;global.__xhsCloudGuard=true;
 const oldFetch=global.fetch;
 if(oldFetch)global.fetch=async function(input,options={}){checkUrl(input);return oldFetch(input,{...options,redirect:'error'});};
 for(const mod of [http,https]){
  for(const key of ['request','get']){
   const old=mod[key];mod[key]=function(input,options,...rest){
    if(typeof input==='string'||input instanceof URL)checkUrl(input);
    else checkHost(input?.hostname||input?.host);
    if(options&&typeof options==='object')checkHost(options.hostname||options.host||'localhost');
    return old.call(this,input,options,...rest);
   };
  }
 }
 for(const [mod,keys] of [[net,['connect','createConnection']],[tls,['connect']]]){
  for(const key of keys){const old=mod[key];mod[key]=function(...args){
   const first=args[0];if(typeof first==='object'){if(first.path)throw Error('CLOUD_TEST_IPC_BLOCKED');checkHost(first.host||first.hostname);}
   else checkHost(typeof args[1]==='string'?args[1]:'localhost');
   return old.apply(this,args);
  };}
 }
}
module.exports={install,checkUrl,checkHost};
