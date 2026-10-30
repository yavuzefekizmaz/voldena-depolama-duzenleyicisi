'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { describePath } = require('./file-policy');
const { metadata } = require('./services/windows-metadata');
const sameFile = (a,b) => a.dev===b.dev && a.ino===b.ino && a.size===b.size && a.mtimeMs===b.mtimeMs && a.ctimeMs===b.ctimeMs;
const identity = s => ({dev:s.dev,ino:s.ino,size:s.size,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs});
const validStream = name => name==='::$DATA' || /^:[^:\\/\0]+:\$DATA$/.test(name);

async function contentDigest(target, cancelled=()=>false) {
  const before=await fs.promises.lstat(target);
  if(!before.isFile()||before.isSymbolicLink()||before.nlink>1)throw new Error('Bağlantı veya özel dosya atlandı.');
  const details=await metadata.get(target);
  if(details.attributes & (4|0x400|0x1000|0x40000|0x400000))throw new Error('Sistem veya bulut dosyası atlandı.');
  const streams=process.platform==='win32'?details.streams:[{name:'::$DATA',size:before.size}];
  if(!Array.isArray(streams)||!streams.some(s=>s.name==='::$DATA')||streams.some(s=>!validStream(s.name)||!Number.isSafeInteger(s.size)||s.size<0))throw new Error('Dosyanın tüm veri akışları doğrulanamadı.');
  const ordered=[...streams].sort((a,b)=>a.name.localeCompare(b.name,'en'));
  const hash=crypto.createHash('sha256');
  for(const stream of ordered){
    hash.update(JSON.stringify([stream.name.toLowerCase(),stream.size])+'\n');
    const streamPath=stream.name==='::$DATA'?target:target+stream.name.replace(/:\$DATA$/,'');
    for await(const chunk of fs.createReadStream(streamPath)){if(cancelled())throw new Error('İnceleme iptal edildi.');hash.update(chunk);}
  }
  const after=await fs.promises.lstat(target),afterDetails=await metadata.get(target);
  if(!sameFile(before,after)||JSON.stringify(streams)!==JSON.stringify(process.platform==='win32'?afterDetails.streams:streams))throw new Error('Dosya inceleme sırasında değişti; sonuçtan çıkarıldı.');
  return {hash:hash.digest('hex'),identity:identity(after)};
}

function layout(items,x=0,y=0,w=1,h=1){
  if(!items.length)return;
  if(items.length===1){items[0].rect={x,y,w,h};return;}
  const total=items.reduce((n,i)=>n+i.size,0);let partial=0,split=0;
  while(split<items.length-1 && partial<total/2){partial+=items[split++].size;}
  const fraction=total?partial/total:0.5;
  if(w>=h){layout(items.slice(0,split),x,y,w*fraction,h);layout(items.slice(split),x+w*fraction,y,w*(1-fraction),h);}
  else{layout(items.slice(0,split),x,y,w,h*fraction);layout(items.slice(split),x,y+h*fraction,w,h*(1-fraction));}
}

module.exports=function installAnalysis(Scanner){
  Scanner.prototype.getSpaceMap=function(target=this.rootPath,options={}){
    const id=this.idOf(target),node=this.nodes.get(id);if(!node)return {items:[],totalBytes:0,rootPath:target};
    const all=(this.children.get(id)||[]).map(id=>this.nodes.get(id)).filter(n=>n.size>0).sort((a,b)=>b.size-a.size);
    const limit=Math.max(4,Math.min(100,Number(options.limit)||60)),items=all.slice(0,limit).map(n=>this.present(n,node.size));
    const rest=all.slice(limit),omittedCount=rest.length;
    if(rest.length)items.push({name:`Diğer ${rest.length} öğe`,path:null,isDir:false,size:rest.reduce((n,i)=>n+i.size,0),description:'Bu kutu, küçük öğelerin toplamını gösterir; diskte Diğer adında bir dosya değildir.',risk:'unknown'});
    layout(items);return {items,totalBytes:node.size,rootPath:this.pathOf(node),omittedCount};
  };
  Scanner.prototype.getFileStatistics=async function(){
    const types=new Map(),ages=[{label:'Son 30 gün',filesCount:0,allocatedBytes:0},{label:'30–180 gün',filesCount:0,allocatedBytes:0},{label:'180–365 gün',filesCount:0,allocatedBytes:0},{label:'Bir yıldan eski',filesCount:0,allocatedBytes:0},{label:'Tarihi bilinmiyor',filesCount:0,allocatedBytes:0}];
    let processed=0;const now=Date.now();
    for(const n of this.nodes.values()){
      if(n.isDir)continue;const extension=path.extname(n.name).toLowerCase()||'Uzantısız';let type=types.get(extension);if(!type){type={extension,filesCount:0,allocatedBytes:0,logicalBytes:0};types.set(extension,type);}type.filesCount++;type.allocatedBytes+=n.size;type.logicalBytes+=n.logicalSize;
      const age=n.mtime?(now-n.mtime)/86400000:null,index=age==null?4:age<30?0:age<180?1:age<365?2:3;ages[index].filesCount++;ages[index].allocatedBytes+=n.size;
      if(++processed%5000===0)await new Promise(r=>setImmediate(r));
    }
    return {types:[...types.values()].sort((a,b)=>b.allocatedBytes-a.allocatedBytes),ages,totalFiles:processed,totalBytes:this.stats?.allocatedBytes||0};
  };
  Scanner.prototype.cancelAnalysis=function(){this.analysisCancelled=true;return {cancelled:true};};
  Scanner.prototype.findDuplicates=async function(options={},onProgress=()=>{}){
    if(this.isScanning)throw new Error('Mükerrer incelemesi için disk taramasını tamamlayın.');
    if(this.analysisRunning)throw new Error('Bir dosya incelemesi zaten sürüyor.');
    this.analysisRunning=true;this.analysisCancelled=false;this.duplicateGroups=[];this.duplicateFileIndex=new Map();
    const minSize=Math.max(1024,Number(options.minSize)||1024*1024),sizes=new Map(),maxFiles=100000;
    let examined=0,eligible=0,skipped=0,processed=0,last=0,limited=false;
    try{
      for(const n of this.nodes.values()){
        if(n.isDir||n.logicalSize<minSize||n.isHardlink||(n.attributes&(4|0x400|0x1000|0x40000|0x400000)))continue;
        const target=this.pathOf(n);if(!target||describePath(target,n).risk!=='personal')continue;
        if(eligible>=maxFiles){limited=true;break;}eligible++;if(!sizes.has(n.logicalSize))sizes.set(n.logicalSize,[]);sizes.get(n.logicalSize).push(n);
        if(++examined%2000===0)await new Promise(r=>setImmediate(r));
      }
      const candidates=[...sizes.values()].filter(list=>list.length>1),total=candidates.reduce((n,list)=>n+list.length,0);
      const progress=(phase,currentPath)=>{if(Date.now()-last<200&&processed!==total)return;last=Date.now();onProgress({phase,processed,total,currentPath,groupsCount:this.duplicateGroups.length,cancelled:this.analysisCancelled});};
      progress('hashing','');
      for(const candidatesOfSize of candidates){
        if(this.analysisCancelled)break;const hashes=new Map();
        for(const n of candidatesOfSize){
          if(this.analysisCancelled)break;const target=this.pathOf(n);progress('hashing',target);
          try{const digest=await contentDigest(target,()=>this.analysisCancelled);if(!hashes.has(digest.hash))hashes.set(digest.hash,[]);hashes.get(digest.hash).push({node:n,path:target,identity:digest.identity});}catch(error){if(!this.analysisCancelled)skipped++;}
          processed++;progress('hashing',target);
        }
        for(const [hash,matches] of hashes){if(matches.length<2)continue;const id=crypto.randomUUID();const group={id,hash,size:matches[0].node.logicalSize,reclaimableBytes:matches.slice(1).reduce((sum,m)=>sum+m.node.size,0),matches};this.duplicateGroups.push(group);for(const match of matches)this.duplicateFileIndex.set(this.normalizePath(match.path),group);}
      }
      this.duplicateGroups.sort((a,b)=>b.reclaimableBytes-a.reclaimableBytes);this.duplicatesCreatedAt=Date.now();
      const result=this.getDuplicateGroups({limit:50});result.summary={eligible,processed,skipped,limited,minSize,cancelled:this.analysisCancelled,groupCount:this.duplicateGroups.length,reclaimableBytes:this.duplicateGroups.reduce((sum,g)=>sum+g.reclaimableBytes,0)};onProgress({phase:this.analysisCancelled?'cancelled':'complete',processed,total,...result.summary});return result;
    }finally{this.analysisRunning=false;}
  };
  Scanner.prototype.getDuplicateGroups=function(options={}){
    const groups=this.duplicateGroups||[],offset=Math.max(0,Number(options.offset)||0),limit=Math.max(1,Math.min(50,Number(options.limit)||20));
    return {groups:groups.slice(offset,offset+limit).map(g=>({id:g.id,hash:g.hash,size:g.size,reclaimableBytes:g.reclaimableBytes,totalFiles:g.matches.length,items:g.matches.slice(0,100).map(m=>({...this.present(m.node),keepRecommended:m===g.matches[0]}))})),groupCount:groups.length,offset,limit,hasMore:offset+limit<groups.length,reclaimableBytes:groups.reduce((sum,g)=>sum+g.reclaimableBytes,0)};
  };
  Scanner.prototype.validateDuplicateSelection=async function(paths){
    if(!Array.isArray(paths)||!paths.length||paths.length>500)throw new Error('1–500 mükerrer dosya seçin.');
    if(!this.duplicatesCreatedAt||Date.now()-this.duplicatesCreatedAt>30*60000)throw new Error('Mükerrer incelemesini yeniden çalıştırın.');
    const selected=new Set(paths.map(p=>this.normalizePath(p))),byGroup=new Map(),result=[];
    for(const target of paths){const group=this.duplicateFileIndex?.get(this.normalizePath(target));if(!group)throw new Error('Seçilen dosya doğrulanmış mükerrer sonuçlarında yok.');if(!byGroup.has(group.id))byGroup.set(group.id,group);}
    for(const group of byGroup.values()){
      const keeper=group.matches.find(m=>!selected.has(this.normalizePath(m.path)));if(!keeper)throw new Error('Her mükerrer grubunda en az bir dosya korunmalıdır.');
      const keepDigest=await contentDigest(keeper.path);if(keepDigest.hash!==group.hash)throw new Error('Korunacak dosya değişti; işlem durduruldu.');
      for(const match of group.matches){if(!selected.has(this.normalizePath(match.path)))continue;const digest=await contentDigest(match.path);if(digest.hash!==group.hash)throw new Error('Seçilen dosyanın içeriği değişti; işlem durduruldu.');result.push({path:match.path,identity:digest.identity,keepPath:keeper.path,keepIdentity:keepDigest.identity});}
    }return {items:result};
  };
  Scanner.prototype.exportSnapshot=function(options={}){
    if(this.isScanning||!this.rootPath||!this.nodes.size)throw new Error('Önce disk taramasını tamamlayın.');
    const limit=Math.max(100,Math.min(50000,Number(options.maxNodes)||50000)),directories=[];let truncated=false;
    for(const node of this.nodes.values()){if(!node.isDir)continue;if(directories.length>=limit){truncated=true;break;}const target=this.pathOf(node);if(target)directories.push({relativePath:path.relative(this.rootPath,target),name:node.name,size:node.size,logicalSize:node.logicalSize,filesCount:node.filesCount,foldersCount:node.foldersCount});}
    return {schema:1,createdAt:new Date().toISOString(),rootPath:this.rootPath,stats:{...this.stats},directories,truncated};
  };
};
module.exports.contentDigest=contentDigest;
module.exports.sameFile=sameFile;
