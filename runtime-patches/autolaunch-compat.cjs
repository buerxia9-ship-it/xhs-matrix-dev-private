const fs=require('node:fs'),path=require('node:path');
module.exports=function(backend){
 const {SettingsService}=require(path.join(backend,'dist/modules/settings/settings.service.js'));
 const startup=path.join(process.env.APPDATA,'Microsoft/Windows/Start Menu/Programs/Startup/小红书矩阵恢复版.vbs');
 SettingsService.prototype.getAutoLaunch=function(){return {enabled:fs.existsSync(startup)};};
 SettingsService.prototype.setAutoLaunch=async function(enabled){
  if(enabled){const launcher=path.join(__dirname,'launch-workbench.vbs');const exe=path.join(process.env.SystemRoot||'C:\\Windows','System32','wscript.exe');const cmd='"'+exe+'" "'+launcher+'" /background';fs.mkdirSync(path.dirname(startup),{recursive:true});fs.writeFileSync(startup,'\uFEFFCreateObject("WScript.Shell").Run "'+cmd.replaceAll('"','""')+'", 0, False\r\n','utf16le');}
  else if(fs.existsSync(startup))fs.unlinkSync(startup);
  return {enabled:fs.existsSync(startup),message:enabled?'已开启登录后后台启动':'已关闭自启动'};
 };
};
