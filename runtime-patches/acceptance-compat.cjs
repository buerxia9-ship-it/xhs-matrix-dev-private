const path=require('path');
module.exports=function(backend){
 const {GenerateService}=require(path.join(backend,'dist/modules/generate/generate.service'));
 const previous=GenerateService.prototype.updateDraft;
 GenerateService.prototype.updateDraft=async function(id,data){
  const edit=['title','body','images','hashtags'].some(k=>k in data);
  if(edit){data={...data,complianceChecked:false};if(data.status==='published')delete data.status}
  return previous.call(this,id,data);
 };
};
