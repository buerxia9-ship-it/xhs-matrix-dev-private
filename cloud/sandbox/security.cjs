'use strict';
function install(){
 const counters={outboundDenied:0};
 function deny(){counters.outboundDenied++;throw Error('SYNTHETIC_SANDBOX_OUTBOUND_NETWORK_BLOCKED');}
 for(const key of ['connect','createConnection'])require('node:net')[key]=deny;
 require('node:tls').connect=deny;global.fetch=async()=>deny();
 for(const m of ['node:http','node:https'])for(const key of ['request','get'])require(m)[key]=deny;
 for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])require('node:child_process')[key]=()=>{throw Error('SYNTHETIC_SANDBOX_SUBPROCESS_BLOCKED');};
 return counters;
}
module.exports={install};
