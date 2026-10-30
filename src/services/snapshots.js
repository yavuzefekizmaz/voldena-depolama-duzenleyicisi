'use strict';
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const zlib=require('zlib');
const {promisify}=require('util');
const gzip=promisify(zlib.gzip),gunzip=promisify(zlib.gunzip);
class SnapshotStore{
 constructor(directory){this.directory=path.join(directory,'scan-snapshots');this.queue=Promise.resolve();}
 async list(){
  let files;try{files=await fs.promises.readdir(this.directory);}catch(error){if(error.code==='ENOENT')return {items:[]};throw error;}
  const items=[];for(const file of files){if(!/^[0-9a-f-]{36}\.json$/.test(file))continue;try{const info=JSON.parse(await fs.promises.readFile(path.join(this.directory,file),'utf8'));items.push(info);}catch{}}
  items.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return {items};
 }
 save(snapshot){
  const work=async()=>{if(snapshot.schema!==1||!snapshot.rootPath||!Array.isArray(snapshot.directories))throw new Error('Tarama kaydı geçersiz.');const id=crypto.randomUUID();await fs.promises.mkdir(this.directory,{recursive:true});const payload=await gzip(Buffer.from(JSON.stringify(snapshot)));const target=path.join(this.directory,id+'.json.gz');const file=await fs.promises.open(target,'wx');try{await file.writeFile(payload);await file.sync();}finally{await file.close();}
   const info={id,createdAt:snapshot.createdAt,rootPath:snapshot.rootPath,totalBytes:snapshot.stats.allocatedBytes||snapshot.stats.totalBytes,logicalBytes:snapshot.stats.logicalBytes,filesCount:snapshot.stats.filesCount,foldersCount:snapshot.stats.foldersCount,truncated:!!snapshot.truncated,storedBytes:payload.length};await fs.promises.writeFile(path.join(this.directory,id+'.json'),JSON.stringify(info),{flag:'wx'});return {success:true,snapshot:info};};
  const result=this.queue.then(work);this.queue=result.catch(()=>{});return result;
 }
 async read(id){if(typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id))throw new Error('Tarama kaydı geçersiz.');const encoded=await fs.promises.readFile(path.join(this.directory,id+'.json.gz'));if(encoded.length>64*1024*1024)throw new Error('Tarama kaydı güvenli sınırı aşıyor.');const payload=await gunzip(encoded,{maxOutputLength:128*1024*1024});const value=JSON.parse(payload.toString('utf8'));if(value.schema!==1||!Array.isArray(value.directories))throw new Error('Tarama kaydı okunamadı.');return value;}
 async compare(id,current){
  const previous=await this.read(id);if(path.resolve(previous.rootPath).toLowerCase()!==path.resolve(current.rootPath).toLowerCase())throw new Error('Karşılaştırmak için aynı sürücü veya klasörü tarayın.');
  const now=new Map(current.directories.map(d=>[d.relativePath.toLowerCase(),d])),before=new Map(previous.directories.map(d=>[d.relativePath.toLowerCase(),d])),items=[];
  for(const relative of new Set([...now.keys(),...before.keys()])){const a=before.get(relative),b=now.get(relative);const deltaBytes=(b?.size||0)-(a?.size||0);if(!deltaBytes)continue;const original=b?.relativePath??a.relativePath;items.push({name:b?.name||a.name,path:path.join(current.rootPath,original),relativePath:original,previousBytes:a?.size||0,currentBytes:b?.size||0,deltaBytes,status:!a?'added':!b?'removed':'changed'});}
  items.sort((a,b)=>Math.abs(b.deltaBytes)-Math.abs(a.deltaBytes));return {items:items.slice(0,500),total:items.length,before:{createdAt:previous.createdAt,totalBytes:previous.stats.totalBytes},after:{createdAt:current.createdAt,totalBytes:current.stats.totalBytes},truncated:!!(previous.truncated||current.truncated),note:'Klasörler üst-alt ilişkisi içerir; satır farklarını toplayarak toplam alan hesaplamayın.'};
 }
}
module.exports=SnapshotStore;
