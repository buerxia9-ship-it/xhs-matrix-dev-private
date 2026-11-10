'use strict';
// Shared by ordinary gateway chat (analysis) and strict copywriting/review.
function terraChatParams(input) {
 const request={...input};
 if(!/^gpt-6\.1-terra(?:-|$)/.test(request.model||''))return request;
 const effort=request.reasoning_effort||'low';
 request.reasoning_effort=effort;
 const budget=request.max_completion_tokens??request.max_tokens??4096;
 request.max_completion_tokens=effort==='none'?budget:Math.max(4096,budget);
 delete request.max_tokens;
 delete request.timeout;
 if(effort!=='none'){
  for(const key of ['temperature','top_p','top_logprobs','logprobs'])delete request[key];
 }
 return request;
}
module.exports={terraChatParams};
