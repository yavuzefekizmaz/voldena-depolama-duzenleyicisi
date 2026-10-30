'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { formatBytes, formatDate } = require('./utils/formatters');
const { assertMutable, describePath } = require('./file-policy');
const {verifyWindowsSafety}=require('./services/windows-metadata');
const DAY=86400000;

class CleanupEngine {
  constructor({audit,log}={}) {
    this.home=os.homedir(); this.local=process.env.LOCALAPPDATA||path.join(this.home,'AppData','Local');
    this.roaming=process.env.APPDATA||path.join(this.home,'AppData','Roaming');
    this.snapshot=new Map(); this.scanPromise=null;this.audit=audit;this.log=log||(()=>{});
  }
  async getDefinitions() {
    const defs=[
      {id:'user_temp',title:'7 günden eski geçici dosyalar',group:'safe',autoClean:true,paths:[os.tmpdir()],description:'Yalnızca 7 günden eski, değişmemiş tekil geçici dosyalar seçilir. Klasörler, bağlantılar ve yeni dosyalar korunur.'},
      {id:'d3d_shader',title:'DirectX ve ekran kartı önbellekleri',group:'safe',autoClean:true,paths:[path.join(this.local,'D3DSCache'),path.join(this.local,'NVIDIA','DXCache'),path.join(this.local,'NVIDIA','GLCache'),path.join(this.local,'AMD','DxCache'),path.join(this.local,'AMD','GLCache')],description:'7 günden eski grafik önbellekleri yeniden oluşturulabilir. Sonraki oyun açılışında derleme süresi uzayabilir.'},
      {id:'crash_dumps',title:'Eski uygulama çökme raporları',group:'safe',autoClean:true,paths:[path.join(this.local,'CrashDumps'),path.join(this.local,'Microsoft','Windows','WER','ReportArchive')],description:'7 günden eski hata raporlarıdır. Bir sorun için destek alıyorsanız raporları saklayın.'},
      {id:'discord_cache',title:'Discord medya önbelleği',group:'recommended',autoClean:false,processes:['discord.exe'],paths:[path.join(this.roaming,'discord','Cache'),path.join(this.roaming,'discord','Code Cache')],description:'Discord kapalıyken, 7 günden eski önbellekleri temizleyebilirsiniz. Mesajlar ve hesap verileri bu klasörlere dahil değildir.'},
      {id:'thumb_cache',title:'Eski küçük resim önbelleği',group:'recommended',autoClean:false,paths:[path.join(this.local,'Microsoft','Windows','Explorer')],fileFilter:n=>/^thumbcache_.*\.db$/i.test(n),description:'7 günden eski küçük resim önbellekleri. Açık Dosya Gezgini tarafından kilitli olanlar atlanır; küçük resimler yeniden oluşturulur.'},
      {id:'downloads_old_large',title:'Eski ve büyük indirilen paketler',group:'review',autoClean:false,review:true,paths:[path.join(this.home,'Downloads')],description:'30 günden eski, en az 500 MB kurulum ve arşiv dosyalarıdır. İçeriğini kontrol ederek tek tek seçin; yaş ve boyut silinebilir olduğunu kanıtlamaz.'}
    ];
    for(const [id,title,base,process] of [
      ['chrome_cache','Chrome önbellekleri',path.join(this.local,'Google','Chrome','User Data'),'chrome.exe'],
      ['edge_cache','Edge önbellekleri',path.join(this.local,'Microsoft','Edge','User Data'),'msedge.exe']]) {
      const roots=[];
      try { for(const e of await fs.promises.readdir(base,{withFileTypes:true})) if(e.isDirectory()&&!e.isSymbolicLink()&&/^(Default|Profile \d+)$/.test(e.name)) for(const folder of ['Cache','Code Cache','GPUCache']) roots.push(path.join(base,e.name,folder)); } catch {}
      defs.push({id,title,group:'recommended',autoClean:false,processes:[process],paths:roots,description:'Tarayıcı kapalıyken, tüm yerel profillerdeki 7 günden eski önbellek dosyaları. Parola, çerez ve geçmiş klasörleri dahil edilmez.'});
    }
    return defs;
  }
  scanAllRecommendations(onProgress) {
    if(this.scanPromise) return this.scanPromise;
    this.scanPromise=this.scan(onProgress).finally(()=>{this.scanPromise=null;});
    return this.scanPromise;
  }
  async scan(onProgress) {
    const defs=await this.getDefinitions(), categories=[], nextSnapshot=new Map();
    let grandTotalBytes=0,grandTotalFiles=0,safeTotalBytes=0,safeTotalFiles=0;
    for(let index=0;index<defs.length;index++) {
      const def=defs[index]; onProgress?.({current:index+1,total:defs.length,title:def.title});
      let totalBytes=0,totalFiles=0,errorsCount=0; const items=[];
      for(const root of def.paths) {
        const queue=[root];
        while(queue.length) {
          const directory=queue.pop(); let entries;
          try { const lstat=await fs.promises.lstat(directory); if(lstat.isSymbolicLink()||!lstat.isDirectory()) continue; entries=await fs.promises.readdir(directory,{withFileTypes:true}); }
          catch(e) { if(e.code!=='ENOENT')errorsCount++; continue; }
          for(const entry of entries) {
            if(entry.isSymbolicLink())continue;
            const full=path.join(directory,entry.name);
            if(entry.isDirectory()) { if(!def.review)queue.push(full); continue; }
            if(!entry.isFile() || def.fileFilter&&!def.fileFilter(entry.name))continue;
            try {
              const stats=await fs.promises.lstat(full);
              if(!stats.isFile()||stats.isSymbolicLink()||stats.nlink>1)continue;
              if(stats.mtimeMs>Date.now()-(def.review?30:7)*DAY)continue;
              if(def.review && (stats.size<500*1024*1024||! /\.(exe|msi|msix|zip|7z|rar|iso)$/i.test(entry.name)))continue;
              const windows=await verifyWindowsSafety(full,'delete');
              if(def.review&&!describePath(full,{isDir:false,nlink:stats.nlink,attributes:windows.attributes}).canDelete)continue;
              if(nextSnapshot.has(full))continue;
              if(nextSnapshot.size>=250000) {errorsCount++;continue;}
              const info={name:entry.name,path:full,size:stats.size,formattedSize:formatBytes(stats.size),mtime:stats.mtime,formattedMtime:formatDate(stats.mtime),isDir:false,
                reason:def.review?'30 günden eski, büyük paket':'7 günden eski önbellek',...describePath(full,{isDir:false,nlink:stats.nlink,attributes:windows.attributes})};
              nextSnapshot.set(full,{def,root,size:stats.size,mtimeMs:stats.mtimeMs,ctimeMs:stats.ctimeMs,ino:stats.ino,dev:stats.dev});
              totalBytes+=stats.size;totalFiles++;items.push(info);
              if(items.length>200) {items.sort((a,b)=>b.size-a.size);items.length=100;}
            } catch {errorsCount++;}
          }
          await new Promise(resolve=>setImmediate(resolve));
        }
      }
      items.sort((a,b)=>b.size-a.size);
      categories.push({id:def.id,title:def.title,group:def.group,autoClean:def.autoClean,description:def.description,
        safetyBadge:def.review?'İncele':def.autoClean?'Eski önbellek':'Uygulamayı kapat',badgeColor:def.review?'amber':def.autoClean?'green':'amber',
        paths:def.paths,totalBytes,formattedSize:formatBytes(totalBytes),totalFiles,items:items.slice(0,100),hasItems:totalFiles>0,errorsCount,
        note:'Gösterilenler en büyük 100 örnektir. Temizlikten önce tüm adaylar yeniden doğrulanır.'});
      grandTotalBytes+=totalBytes;grandTotalFiles+=totalFiles;
      if(def.autoClean){safeTotalBytes+=totalBytes;safeTotalFiles+=totalFiles;}
    }
    categories.push({id:'windows_storage',title:'Windows sistem temizliği',group:'review',autoClean:false,action:'storage',
      description:'Windows Update kalıntıları, önceki Windows sürümleri ve bileşen deposu için Windows’un kendi temizliğini açın. WinSxS dosyaları doğrudan silinmez.',
      safetyBadge:'Windows yönetsin',badgeColor:'amber',totalBytes:0,totalFiles:0,hasItems:false,items:[]});
    this.snapshot=nextSnapshot; this.scannedAt=Date.now();
    return {categories,summary:{grandTotalBytes,grandTotalFiles,safeTotalBytes,safeTotalFiles,formattedGrandTotal:formatBytes(grandTotalBytes),formattedSafeTotal:formatBytes(safeTotalBytes)},
      systemAdvice:[{title:'Windows sistem temizliği',description:'Windows Update, önceki Windows kurulumu, WinSxS ve geri yükleme alanını Windows Depolama ayarlarından yönetin. Bu dosyalar doğrudan silinmez.',action:'storage'}]};
  }
  async runningProcesses() {
    if(process.platform!=='win32')return '';
    return new Promise(resolve=>execFile('tasklist.exe',['/FO','CSV','/NH'],{windowsHide:true,timeout:10000,maxBuffer:4*1024*1024},(_error,stdout)=>resolve((stdout||'').toLowerCase())));
  }
  async cleanCategories(categoryIds=[],specificPaths=[],toTrash=true,trashFn) {
    if(!this.scannedAt||Date.now()-this.scannedAt>30*60*1000)throw new Error('Temizlik adaylarını yeniden tarayın.');
    if(!Array.isArray(categoryIds)||!Array.isArray(specificPaths))throw new Error('Seçim geçersiz.');
    const ids=new Set(categoryIds),selected=new Set(specificPaths),running=await this.runningProcesses();
    let freedBytes=0,removedBytes=0,deletedFiles=0,failedCount=0;const errors=[];
    for(const [full,snapshot] of this.snapshot) {
      const {def,root}=snapshot;
      if(!selected.has(full)&&!(ids.has(def.id)&&!def.review))continue;
      let auditRecord,deleted=false;
      try {
        if(def.processes?.some(p=>running.includes('"'+p+'"')))throw new Error(def.title+' için önce uygulamayı kapatın.');
        const checked=await assertMutable(full,{operation:'delete',allowDirectory:false,cacheRoots:def.review?[]:[root]});
        const s=checked.stats;
        if(s.size!==snapshot.size||s.mtimeMs!==snapshot.mtimeMs||s.ctimeMs!==snapshot.ctimeMs||s.ino!==snapshot.ino||s.dev!==snapshot.dev)throw new Error('Dosya taramadan sonra değişti; korundu.');
        if(!this.audit)throw new Error('Silme geçmişi kullanılamıyor; işlem durduruldu.');
        auditRecord=await this.audit.begin(full,s,toTrash?'Geri Dönüşüm Kutusu':'Kalıcı temizlik');
        const current=await assertMutable(full,{operation:'delete',allowDirectory:false,cacheRoots:def.review?[]:[root]});
        await verifyWindowsSafety(full,'delete');
        if(current.stats.size!==s.size||current.stats.mtimeMs!==s.mtimeMs||current.stats.ino!==s.ino||current.stats.dev!==s.dev)throw new Error('Dosya işlem hazırlanırken değişti; korundu.');
        if(toTrash) {if(typeof trashFn!=='function')throw new Error('Geri Dönüşüm Kutusu kullanılamıyor.');await trashFn(full);}
        else await fs.promises.unlink(full);
        deleted=true;
        await this.audit.complete(auditRecord,'success');
        removedBytes+=s.size;if(!toTrash)freedBytes+=s.size;deletedFiles++;this.snapshot.delete(full);
      }catch(e){if(auditRecord)await this.audit.complete(auditRecord,deleted?'success-with-audit-error':'failed',e.message).catch(()=>{});this.log('cleanup-file-error',e);failedCount++;if(errors.length<15)errors.push(path.basename(full)+': '+e.message);}
    }
    return {freedBytes,removedBytes,formattedFreedBytes:formatBytes(freedBytes),deletedFiles,failedCount,errors,toTrash,
      message:toTrash?'Dosyalar Geri Dönüşüm Kutusu’na gönderildi. Disk alanı, kutu boşaltılınca açılır.':'Seçilen dosyalar temizlendi. Gerçek boş alanı disk göstergesinden kontrol edin.'};
  }
}
module.exports=CleanupEngine;
