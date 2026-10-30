'use strict';
const fs=require('fs');
const path=require('path');
const {spawn,execFile}=require('child_process');
const readline=require('readline');

class WindowsMetadata {
  constructor(){this.child=null;this.pending=null;this.queue=Promise.resolve();this.idle=null;}
  start(){
    const executable=process.resourcesPath&&fs.existsSync(path.join(process.resourcesPath,'native','VoldeScan.exe'))
      ?path.join(process.resourcesPath,'native','VoldeScan.exe'):path.join(__dirname,'..','native','bin','VoldeScan.exe');
    if(!fs.existsSync(executable))throw new Error('Dosya güvenlik denetleyicisi bulunamadı. İşlem uygulanmadı.');
    const child=spawn(executable,['--metadata-server'],{windowsHide:true,stdio:['pipe','pipe','pipe']});this.child=child;
    const reader=readline.createInterface({input:child.stdout,crlfDelay:Infinity});
    reader.on('line',line=>{if(!this.pending)return;const pending=this.pending;this.pending=null;clearTimeout(pending.timer);
      try{const data=JSON.parse(line);if(data.error)throw new Error(data.error);if(!Number.isInteger(data.attributes)||typeof data.hasNamedStreams!=='boolean')throw new Error('Geçersiz güvenlik metadata yanıtı.');pending.resolve(data);}catch(e){pending.reject(e);}
    });
    child.stderr.on('data',()=>{});
    child.on('error',error=>this.failed(child,error));
    child.on('exit',(code)=>this.failed(child,new Error('Dosya güvenlik denetleyicisi kapandı ('+code+').')));
  }
  failed(child,error){if(this.child!==child)return;this.child=null;if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(error);this.pending=null;}}
  get(target){
    if(process.platform!=='win32')return Promise.resolve({attributes:0,hasNamedStreams:false});
    const work=async()=>{
      clearTimeout(this.idle);if(!this.child)this.start();
      const result=await new Promise((resolve,reject)=>{
        this.pending={resolve,reject,timer:setTimeout(()=>{this.pending=null;this.dispose();reject(new Error('Dosya güvenlik denetimi zaman aşımına uğradı.'));},10000)};
        this.child.stdin.write(Buffer.from(target,'utf8').toString('base64')+'\n',error=>{if(error&&this.pending){clearTimeout(this.pending.timer);this.pending=null;reject(error);}});
      });
      this.idle=setTimeout(()=>this.dispose(),500);this.idle.unref();return result;
    };
    const pending=this.queue.then(work);this.queue=pending.catch(()=>{});return pending;
  }
  dispose(){clearTimeout(this.idle);const child=this.child;this.child=null;child?.stdin.end();child?.kill();}
}
const metadata=new WindowsMetadata();
async function verifyWindowsSafety(target,operation='delete'){
  const result=await metadata.get(target),attributes=result.attributes;
  if(attributes&4)throw new Error('Windows sistem özniteliği olan dosyalar değiştirilemez.');
  if(attributes&(0x400|0x1000|0x40000|0x400000))throw new Error('Bağlantı, çevrimdışı dosya veya bulut yer tutucusu değiştirilemez. Dosya Gezgini’ni kullanın.');
  if(operation==='move'&&(attributes&(0x200|0x800|0x4000)))throw new Error('Seyrek, sıkıştırılmış veya şifrelenmiş dosyalar için Windows Dosya Gezgini ile taşıma kullanın; özel depolama özellikleri korunmalıdır.');
  if(operation==='move'&&result.hasNamedStreams&&!Array.isArray(result.streams))throw new Error('Ek NTFS veri akışları listelenemedi; dosya korundu.');
  if(operation==='destination'&&(attributes&0x4000))throw new Error('Şifrelenmiş hedef klasör desteklenmiyor.');
  return result;
}
function nativeExecutable(){const packed=process.resourcesPath&&path.join(process.resourcesPath,'native','VoldeScan.exe');return packed&&fs.existsSync(packed)?packed:path.join(__dirname,'..','native','bin','VoldeScan.exe');}
async function moveNoReplace(source,destination){
  if(!path.isAbsolute(source)||!path.isAbsolute(destination))throw new Error('Taşıma yolları geçersiz.');
  if(process.platform!=='win32'){try{await fs.promises.lstat(destination);throw new Error('Hedef zaten var.');}catch(error){if(error.code!=='ENOENT')throw error;}await fs.promises.rename(source,destination);return;}
  return new Promise((resolve,reject)=>execFile(nativeExecutable(),['--move-no-replace',source,destination],{windowsHide:true,timeout:30000,maxBuffer:4096,encoding:'utf8'},(error,stdout)=>{let result;try{result=JSON.parse(stdout.trim());}catch{}if(error||!result?.success)return reject(new Error(result?.error||error?.message||'Klasör taşınamadı.'));resolve(result);}));
}
async function copyMetadata(source,destination){
  if(process.platform!=='win32'){const s=await fs.promises.stat(source);await fs.promises.utimes(destination,s.atime,s.mtime);return;}
  return new Promise((resolve,reject)=>execFile(nativeExecutable(),['--copy-metadata',source,destination],{windowsHide:true,timeout:30000,maxBuffer:4096,encoding:'utf8'},(error,stdout,stderr)=>{let result;try{result=JSON.parse(stdout.trim());}catch{}if(error||!result?.success)return reject(new Error(result?.error||stderr?.trim()||error?.message||'Dosya özellikleri korunamadı.'));resolve(result);}));
}
module.exports={WindowsMetadata,metadata,verifyWindowsSafety,moveNoReplace,copyMetadata};
