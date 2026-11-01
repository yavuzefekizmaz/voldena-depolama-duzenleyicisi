'use strict';
const fs=require('fs'),path=require('path'),readline=require('readline'),{spawn}=require('child_process');
class NativeIcons{
 constructor(){this.cache=new Map();this.queue=Promise.resolve();this.child=null;this.pending=null;}
 get(target,options={}){if(typeof target!=='string'||!path.isAbsolute(target)||target.startsWith('\\\\')||target.includes('\0'))return Promise.resolve({kind:'unavailable'});const task=async()=>{
  const root=path.parse(target).root;let kind=options.kind==='program'?(fs.existsSync(target)?'program':'file'):target.replace(/[\\/]+$/,'').toLowerCase()===root.replace(/[\\/]+$/,'').toLowerCase()?'drive':null;
  if(!kind){const stat=await fs.promises.lstat(target).catch(()=>null);kind=stat?.isDirectory()?'folder':'file';}
  const cacheKey=kind==='folder'?'folder':kind==='file'?'file:'+path.extname(target).toLowerCase():kind+':'+target.toLowerCase();if(this.cache.has(cacheKey))return this.cache.get(cacheKey);
  if(!this.child)this.start();const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending=null;this.dispose();reject(new Error('Windows simgesi zaman aşımı.'));},8000);this.pending={resolve,reject,timer};this.child.stdin.write(kind+'\t'+Buffer.from(target).toString('base64')+'\n');});
  if(result.dataUrl){this.cache.set(cacheKey,result);while(this.cache.size>256)this.cache.delete(this.cache.keys().next().value);}return result;
 };const pending=this.queue.then(task).catch(()=>({kind:'unavailable'}));this.queue=pending;return pending;}
 start(){const packed=process.resourcesPath&&path.join(process.resourcesPath,'native','VoldeScan.exe'),exe=packed&&fs.existsSync(packed)?packed:path.join(__dirname,'../native/bin/VoldeScan.exe');const child=spawn(exe,['--icon-server'],{windowsHide:true,stdio:['pipe','pipe','ignore']});this.child=child;readline.createInterface({input:child.stdout,crlfDelay:Infinity}).on('line',line=>{const pending=this.pending;if(!pending)return;this.pending=null;clearTimeout(pending.timer);try{const result=JSON.parse(line);result.error?pending.reject(new Error(result.error)):pending.resolve(result);}catch(e){pending.reject(e);}});const fail=()=>{if(this.child===child)this.child=null;if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(new Error('Simge yardımcısı kapandı.'));this.pending=null;}};child.on('error',fail);child.on('exit',fail);}
 dispose(){const child=this.child;this.child=null;child?.stdin.end();child?.kill();this.cache.clear();}
}
module.exports=NativeIcons;
