'use strict';
const fs=require('fs');
const path=require('path');
const {describePath}=require('../file-policy');
const {metadata}=require('./windows-metadata');

class Thumbnails {
  constructor({nativeImage,app,isCloudPath=async()=>false}){this.nativeImage=nativeImage;this.app=app;this.isCloudPath=isCloudPath;this.cache=new Map();this.active=0;this.queue=[];}
  get(target){
    if(typeof target!=='string'||!path.isAbsolute(target)||target.startsWith('\\\\')||target.includes('\0'))return Promise.resolve({kind:'unavailable'});
    const policy=describePath(target,{isDir:false});
    if(policy.risk!=='personal'||!['Video','Fotoğraf ve görsel'].includes(policy.category))return Promise.resolve({kind:'unavailable'});
    if(this.queue.length>=64)return Promise.resolve({kind:'unavailable'});
    return new Promise(resolve=>{this.queue.push({target,resolve});this.pump();});
  }
  pump(){while(this.active<2&&this.queue.length){const job=this.queue.shift();this.active++;this.load(job.target).then(job.resolve,()=>job.resolve({kind:'unavailable'})).finally(()=>{this.active--;this.pump();});}}
  async load(target){
    if(await this.isCloudPath(target))return {kind:'unavailable'};
    const stat=await fs.promises.lstat(target);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink>1)return {kind:'unavailable'};
    const windows=await metadata.get(target);
    if(windows.attributes&(4|0x400|0x1000|0x40000|0x400000))return {kind:'unavailable'};
    const cacheKey=target.toLowerCase()+'|'+stat.size+'|'+stat.mtimeMs;
    if(this.cache.has(cacheKey)){const value=this.cache.get(cacheKey);this.cache.delete(cacheKey);this.cache.set(cacheKey,value);return value;}
    let image,kind='thumbnail';
    try{image=await this.nativeImage.createThumbnailFromPath(target,{width:96,height:72});}
    catch{image=await this.app.getFileIcon(target,{size:'normal'});kind='icon';}
    if(!image||image.isEmpty())return {kind:'unavailable'};
    const result={dataUrl:image.toDataURL(),kind};this.cache.set(cacheKey,result);
    while(this.cache.size>64)this.cache.delete(this.cache.keys().next().value);
    return result;
  }
}
module.exports=Thumbnails;
