'use strict';
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const readline=require('readline');

class AuditHistory {
  constructor(directory) {this.file=path.join(directory,'deletion-history.jsonl');this.queue=Promise.resolve();}
  append(entry) {
    const work=async()=>{
      await fs.promises.mkdir(path.dirname(this.file),{recursive:true});
      const file=await fs.promises.open(this.file,'a');
      try {await file.writeFile('\n'+JSON.stringify(entry)+'\n');await file.sync();}finally{await file.close();}
    };
    const pending=this.queue.then(work);this.queue=pending.catch(()=>{});return pending;
  }
  async begin(file,stats,method,extra={}) {
    const record={id:crypto.randomUUID(),timestamp:new Date().toISOString(),name:path.basename(file),path:file,
      type:stats.isDirectory()?'Klasör':path.extname(file)||'Uzantısız dosya',size:stats.size,method,result:'pending',...extra};
    await this.append(record);return record;
  }
  async complete(record,result,error) {await this.append({...record,timestamp:new Date().toISOString(),result,error:error||undefined});}
  async get({offset=0,limit=100,search=''}={}) {
    offset=Math.max(0,Math.min(1000000,Number(offset)||0));limit=Math.max(1,Math.min(500,Number(limit)||100));
    search=String(search).slice(0,300).toLocaleLowerCase('tr');
    const pending=new Map(),recent=[];let total=0,lines=0;
    const keep=entry=>{
      if(search&&!JSON.stringify(entry).toLocaleLowerCase('tr').includes(search))return;
      total++;recent.push(entry);if(recent.length>offset+limit)recent.shift();
    };
    try {
      const input=fs.createReadStream(this.file,{encoding:'utf8'});const reader=readline.createInterface({input,crlfDelay:Infinity});
      for await (const line of reader) {
        try {const record=JSON.parse(line);if(record.result==='pending')pending.set(record.id,record);else{pending.delete(record.id);keep(record);}}catch{/* incomplete crash tail stays in the original file */}
        if(++lines%1000===0)await new Promise(r=>setImmediate(r));
      }
    }catch(e){if(e.code!=='ENOENT')throw e;}
    for(const entry of pending.values()){
      const uncertain={...entry,result:'unknown',error:'İşlem başlamış; tamamlanma kaydı yok. Dosyanın varlığını kontrol edin.'};
      if(search&&!JSON.stringify(uncertain).toLocaleLowerCase('tr').includes(search))continue;
      total++;recent.push(uncertain);recent.sort((a,b)=>String(a.timestamp).localeCompare(String(b.timestamp)));
      if(recent.length>offset+limit)recent.shift();
    }
    const reversed=recent.reverse();return {items:reversed.slice(offset,offset+limit),total,hasMore:total>offset+limit};
  }
}

class TechnicalLog {
  constructor(directory,{maxBytes=2*1024*1024,files=4}={}){this.directory=path.join(directory,'logs');this.maxBytes=maxBytes;this.files=files;this.queue=Promise.resolve();}
  file(index=0){return path.join(this.directory,index?'voldena.'+index+'.txt':'voldena.txt');}
  write(level,message,details) {
    const work=async()=>{
      await fs.promises.mkdir(this.directory,{recursive:true});
      let size=0;try{size=(await fs.promises.stat(this.file())).size;}catch{}
      if(size>this.maxBytes){
        await fs.promises.unlink(this.file(this.files-1)).catch(()=>{});
        for(let i=this.files-2;i>=0;i--)await fs.promises.rename(this.file(i),this.file(i+1)).catch(()=>{});
      }
      const entry={timestamp:new Date().toISOString(),level,message:String(message).slice(0,2000)};
      if(details)entry.details=String(details instanceof Error?details.stack||details.message:typeof details==='string'?details:JSON.stringify(details)).slice(0,8000);
      await fs.promises.appendFile(this.file(),JSON.stringify(entry)+'\n');
    };
    this.queue=this.queue.then(work).catch(()=>{});return this.queue;
  }
  async get({offset=0,limit=200,level='',search=''}={}) {
    await this.queue;
    offset=Math.max(0,Math.min(100000,Number(offset)||0));limit=Math.max(1,Math.min(1000,Number(limit)||200));
    const result=[];let total=0;
    for(let index=0;index<this.files;index++) {
      let text;try{text=await fs.promises.readFile(this.file(index),'utf8');}catch{continue;}
      const lines=text.trim().split('\n').reverse();
      for(const line of lines)try{
        const item=JSON.parse(line);
        if(level&&level!=='all'&&item.level!==level)continue;
        if(search&&!line.toLocaleLowerCase('tr').includes(String(search).toLocaleLowerCase('tr')))continue;
        if(total>=offset&&result.length<limit)result.push(item);total++;
      }catch{}
    }
    return {items:result,text:result.map(i=>i.timestamp+' ['+i.level+'] '+i.message+(i.details?'\n'+i.details:'')).join('\n'),total,hasMore:total>offset+limit};
  }
}
module.exports={AuditHistory,TechnicalLog};
