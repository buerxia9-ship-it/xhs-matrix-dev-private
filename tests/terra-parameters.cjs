'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {terraChatParams}=require('../runtime-patches/terra-chat-compat.cjs');
const schema={type:'object',additionalProperties:false,properties:{ok:{type:'boolean'}},required:['ok']};
const input={model:'gpt-6.1-terra',messages:[{role:'user',content:'test'}],temperature:0.45,top_p:0.9,max_tokens:2200,timeout:45000,response_format:{type:'json_schema',json_schema:{name:'test',strict:true,schema}}};
const next=terraChatParams(input);
assert.equal(next.model,'gpt-6.1-terra');assert.equal(next.reasoning_effort,'low');assert.equal(next.max_completion_tokens,4096);
for(const key of ['temperature','top_p','max_tokens','timeout'])assert(!(key in next));
assert.equal(next.response_format,input.response_format);assert.equal(input.temperature,0.45);
const old={...input,model:'gpt-4.1-mini'};assert.deepEqual(terraChatParams(old),old);
assert.deepEqual(terraChatParams({...input,model:'gpt-image-2'}),{...input,model:'gpt-image-2'});
const none=terraChatParams({...input,reasoning_effort:'none'});assert.equal(none.temperature,0.45);assert.equal(none.max_completion_tokens,2200);

console.log(JSON.stringify({passed:true,mode:'deterministic_mock',networkCalls:0}));
