'use strict';
const {EventEmitter}=require('events');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {spawn}=require('child_process');
const {metadata}=require('./windows-metadata');
const plainVersion=value=>/^\d+\.\d+\.\d+$/.test(String(value));
function newerVersion(next,current){if(!plainVersion(next)||!plainVersion(current))return false;const a=next.split('.').map(Number),b=current.split('.').map(Number);for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;}
function validateManifest(data,version){
  if(!data||!plainVersion(data.version)||data.version!==version)throw new Error('Portable yayın sürümü doğrulanamadı.');
  if(typeof data.path!=='string'||!/^Voldena-Storage-[0-9]+\.[0-9]+\.[0-9]+-x64-portable\.exe$/.test(data.path)||path.basename(data.path)!==data.path)throw new Error('Portable yayın dosyası geçersiz.');
  if(!Number.isSafeInteger(data.size)||data.size<=0||data.size>2*1024**3)throw new Error('Portable yayın boyutu geçersiz.');
  if(typeof data.sha512!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(data.sha512)||Buffer.from(data.sha512,'base64').length!==64)throw new Error('Portable yayın doğrulama özeti geçersiz.');
  return {...data};
}
function allowedResponse(response){const url=new URL(response.url);if(url.protocol!=='https:'||!['api.github.com','github.com','release-assets.githubusercontent.com','objects.githubusercontent.com','github-releases.githubusercontent.com'].includes(url.hostname))throw new Error('Güncelleme beklenmeyen bir sunucuya yönlendirildi.');}
class PortableUpdater extends EventEmitter {
  constructor(app,options={}){super();this.app=app;this.fetch=options.fetch||globalThis.fetch;this.target=options.target||process.env.PORTABLE_EXECUTABLE_FILE;this.publish=null;this.release=null;this.manifest=null;this.plan=null;this.options=options;}
  setFeedURL(publish){this.publish=publish;}
  async request(url,timeout=30000){const response=await this.fetch(url,{headers:{'Accept':'application/vnd.github+json','User-Agent':'Voldena-Storage/'+this.app.getVersion()},redirect:'follow',signal:AbortSignal.timeout(timeout)});allowedResponse(response);if(!response.ok)throw new Error('GitHub isteği başarısız ('+response.status+').');return response;}
  async json(url,maxBytes){const response=await this.request(url);let bytes=0;const chunks=[];for await(const chunk of response.body){bytes+=chunk.length;if(bytes>maxBytes)throw new Error('Güncelleme bilgisi beklenenden büyük.');chunks.push(Buffer.from(chunk));}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  assetUrl(name){return 'https://github.com/'+this.publish.owner+'/'+this.publish.repo+'/releases/download/'+encodeURIComponent(this.release.tag_name)+'/'+encodeURIComponent(name);}
  async checkForUpdates(){
    this.emit('checking-for-update');
    try{
      this.release=await this.json('https://api.github.com/repos/'+this.publish.owner+'/'+this.publish.repo+'/releases/latest',2*1024*1024);
      const version=String(this.release.tag_name||'').replace(/^v/,'');
      if(this.release.draft||this.release.prerelease||!plainVersion(version))throw new Error('Uygun bir kararlı yayın bulunamadı.');
      if(!newerVersion(version,this.app.getVersion())){this.emit('update-not-available',{version});return {updateInfo:{version}};}
      const assets=Array.isArray(this.release.assets)?this.release.assets:[];
      if(!assets.some(asset=>asset.name==='portable-update.json'))throw new Error('Bu yayında doğrulanabilir portable güncelleme bilgisi bulunmuyor.');
      this.manifest=validateManifest(await this.json(this.assetUrl('portable-update.json'),16384),version);
      const asset=assets.find(asset=>asset.name===this.manifest.path);if(!asset||Number(asset.size)!==this.manifest.size)throw new Error('Portable yayın dosyası ve boyutu eşleşmiyor.');
      const info={version,releaseDate:this.release.published_at};this.emit('update-available',info);return {updateInfo:info};
    }catch(error){this.emit('error',error);throw error;}
  }
  async validateTarget(){
    if(typeof this.target!=='string'||!path.isAbsolute(this.target)||this.target.startsWith('\\\\')||!this.target.toLowerCase().endsWith('.exe'))throw new Error('Portable uygulama yolu doğrulanamadı.');
    const target=path.resolve(this.target),stat=await fs.promises.lstat(target),parent=path.dirname(target);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink>1)throw new Error('Portable EXE bağlantı üzerinden değiştirilemez.');
    if((await fs.promises.realpath(target)).toLowerCase()!==target.toLowerCase())throw new Error('Portable EXE bağlantı üzerinden çalışıyor. Doğrudan yerel bir klasör kullanın.');
    const windows=await metadata.get(target);if(windows.attributes&(4|0x400|0x1000|0x40000|0x400000))throw new Error('Portable EXE sistem dosyası veya bulut yer tutucusu. Önce yerel bir klasöre kopyalayın.');
    const space=await fs.promises.statfs(parent);if(space.bavail*space.bsize<this.manifest.size+stat.size+32*1024**2)throw new Error('Güncelleme ve geri dönüş yedeği için yeterli disk alanı yok.');
    return target;
  }
  async downloadUpdate(){
    if(!this.manifest)throw new Error('Önce güncelleme kontrolü yapın.');
    let stage,handle;
    try{
      const target=await this.validateTarget(),nonce=crypto.randomBytes(16).toString('hex');
      stage=path.join(path.dirname(target),'.voldena-update-'+nonce+'.exe');
      const response=await this.request(this.assetUrl(this.manifest.path),30*60*1000);
      handle=await fs.promises.open(stage,'wx',0o600);let transferred=0,last=0;const start=Date.now(),sha=crypto.createHash('sha512');
      for await(const value of response.body){const chunk=Buffer.from(value);transferred+=chunk.length;if(transferred>this.manifest.size)throw new Error('İndirilen dosya yayın boyutunu aşıyor.');sha.update(chunk);let offset=0;while(offset<chunk.length){const wrote=await handle.write(chunk,offset,chunk.length-offset);if(!wrote.bytesWritten)throw new Error('İndirme dosyası yazılamadı.');offset+=wrote.bytesWritten;}if(Date.now()-last>150){last=Date.now();this.emit('download-progress',{transferred,total:this.manifest.size,percent:100*transferred/this.manifest.size,bytesPerSecond:transferred/Math.max(0.001,(Date.now()-start)/1000)});}}
      await handle.sync();await handle.close();handle=null;
      if(transferred!==this.manifest.size||sha.digest('base64')!==this.manifest.sha512)throw new Error('Portable indirmesinin SHA-512 doğrulaması başarısız. Eski EXE korundu.');
      const directory=path.join(this.app.getPath('userData'),'updates',nonce);await fs.promises.mkdir(directory,{recursive:true});
      const helperSource=process.resourcesPath&&fs.existsSync(path.join(process.resourcesPath,'native','VoldenaUpdate.exe'))?path.join(process.resourcesPath,'native','VoldenaUpdate.exe'):path.join(__dirname,'..','native','bin','VoldenaUpdate.exe');
      const helper=path.join(directory,'VoldenaUpdate.exe');await fs.promises.copyFile(helperSource,helper,fs.constants.COPYFILE_EXCL);
      const plan={source:stage,target,backup:target+'.voldena-backup-'+nonce,sha512:this.manifest.sha512,size:this.manifest.size,version:this.manifest.version,nonce,parentPid:process.pid,ackPath:path.join(directory,'started.json'),createdAt:new Date().toISOString()};
      const planFile=path.join(directory,'plan.json');const planHandle=await fs.promises.open(planFile,'wx',0o600);try{await planHandle.writeFile(JSON.stringify(plan));await planHandle.sync();}finally{await planHandle.close();}
      this.plan={helper,planFile,...plan};this.emit('download-progress',{transferred,total:transferred,percent:100,bytesPerSecond:0});this.emit('update-downloaded',{version:this.manifest.version});return [stage];
    }catch(error){if(handle)await handle.close().catch(()=>{});if(stage)await fs.promises.unlink(stage).catch(()=>{});this.emit('error',error);throw error;}
  }
  async quitAndInstall(){
    if(!this.plan)throw new Error('Doğrulanmış portable güncellemesi yok.');
    const child=spawn(this.plan.helper,[this.plan.planFile],{detached:true,stdio:'ignore',windowsHide:false});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();this.app.quit();
  }
}
async function acknowledgePortableUpdate(app){
  const option=process.argv.find(value=>value.startsWith('--voldena-update-plan='));if(!option)return false;
  const file=path.resolve(option.slice('--voldena-update-plan='.length)),updates=path.join(app.getPath('userData'),'updates');
  if(path.dirname(path.dirname(file)).toLowerCase()!==updates.toLowerCase()||path.basename(file)!=='plan.json')return false;
  const info=await fs.promises.stat(file);if(info.size>32768)return false;
  const plan=JSON.parse(await fs.promises.readFile(file,'utf8'));
  if(!/^[a-f0-9]{32}$/.test(plan.nonce)||path.basename(path.dirname(file))!==plan.nonce||plan.version!==app.getVersion()||path.resolve(plan.ackPath)!==path.join(path.dirname(file),'started.json')||path.resolve(plan.target).toLowerCase()!==path.resolve(process.env.PORTABLE_EXECUTABLE_FILE||'').toLowerCase())return false;
  const ack=await fs.promises.open(plan.ackPath,'wx',0o600);try{await ack.writeFile(JSON.stringify({nonce:plan.nonce,version:app.getVersion(),target:plan.target}));await ack.sync();}finally{await ack.close();}return true;
}
module.exports={PortableUpdater,validateManifest,newerVersion,acknowledgePortableUpdate};
