'use strict';
const fs=require('fs');
const path=require('path');
const os=require('os');
const {metadata}=require('./windows-metadata');

// Shell icon requests are bounded independently of thumbnail extraction. For
// offline/cloud paths we ask Windows for an empty local file's associated icon,
// so rendering an icon never downloads the user's file.
class NativeIcons {
  constructor({app,isCloudPath=async()=>false,maxEntries=128}){
    this.app=app;this.isCloudPath=isCloudPath;this.maxEntries=maxEntries;
    this.cache=new Map();this.pending=new Map();this.queue=[];this.active=0;
    this.sampleDirectory=null;this.samplePromise=null;this.closed=false;
  }
  get(target,options={}){
    if(this.closed||typeof target!=='string'||!path.isAbsolute(target)||target.startsWith('\\\\')||target.includes('\0')||target.length>32767)return Promise.resolve({kind:'unavailable'});
    const size=options.size==='small'?'small':'normal',requestKey=target.toLowerCase()+'|'+size;
    if(this.pending.has(requestKey))return this.pending.get(requestKey);
    if(this.queue.length>=128)return Promise.resolve({kind:'unavailable'});
    const result=new Promise(resolve=>{this.queue.push({target,size,resolve});this.pump();});
    this.pending.set(requestKey,result);result.finally(()=>this.pending.delete(requestKey));return result;
  }
  pump(){while(!this.closed&&this.active<2&&this.queue.length){const job=this.queue.shift();this.active++;this.load(job.target,job.size).then(job.resolve,()=>job.resolve({kind:'unavailable'})).finally(()=>{this.active--;this.pump();});}}
  async sample(target,isDir){
    if(!this.samplePromise)this.samplePromise=fs.promises.mkdtemp(path.join(os.tmpdir(),'voldena-shell-icons-')).then(directory=>{this.sampleDirectory=directory;return directory;});
    await this.samplePromise;
    if(isDir)return this.sampleDirectory;
    const extension=path.extname(target).toLowerCase();
    const safe=/^\.[a-z0-9]{1,12}$/.test(extension)?extension:'.file';
    const file=path.join(this.sampleDirectory,'sample'+safe);
    await fs.promises.writeFile(file,'',{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});
    return file;
  }
  async load(target,size){
    const stat=await fs.promises.lstat(target);
    let iconPath=target,useSample=stat.isSymbolicLink()||await this.isCloudPath(target);
    if(!useSample){const windows=await metadata.get(target).catch(()=>null);useSample=!windows||!!(windows.attributes&(0x400|0x1000|0x40000|0x400000));}
    if(useSample)iconPath=await this.sample(target,stat.isDirectory());
    const key=iconPath.toLowerCase()+'|'+size+'|'+(useSample?'stock':stat.size+'|'+stat.mtimeMs);
    if(this.cache.has(key)){const result=this.cache.get(key);this.cache.delete(key);this.cache.set(key,result);return result;}
    const icon=await this.app.getFileIcon(iconPath,{size});
    if(!icon||icon.isEmpty())return {kind:'unavailable'};
    const result={kind:'icon',dataUrl:icon.toDataURL()};
    if(result.dataUrl.length>1024*1024)return {kind:'unavailable'};
    this.cache.set(key,result);while(this.cache.size>this.maxEntries)this.cache.delete(this.cache.keys().next().value);
    return result;
  }
  async dispose(){this.closed=true;for(const job of this.queue)job.resolve({kind:'unavailable'});this.queue=[];this.cache.clear();
    // Only a directory created by this instance is removed.
    if(this.sampleDirectory&&path.dirname(this.sampleDirectory)===os.tmpdir()&&path.basename(this.sampleDirectory).startsWith('voldena-shell-icons-'))await fs.promises.rm(this.sampleDirectory,{recursive:true,force:true}).catch(()=>{});
  }
}
module.exports=NativeIcons;
