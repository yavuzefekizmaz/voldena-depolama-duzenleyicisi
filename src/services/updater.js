'use strict';
const finite=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
function progressState(progress){
  const total=finite(progress.total),transferred=finite(progress.transferred),bytesPerSecond=finite(progress.bytesPerSecond);
  const remaining=Math.max(0,total-transferred);
  return {status:'downloading',total,transferred,bytesPerSecond,percent:Math.min(100,Math.max(0,finite(progress.percent)||(total?100*transferred/total:0))),etaSeconds:bytesPerSecond>0?Math.ceil(remaining/bytesPerSecond):null};
}
class UpdateService {
  constructor(app,getSettings,emit,log,options={}){
    this.app=app;this.getSettings=getSettings;this.emit=emit;this.log=log;this.options=options;
    this.state={status:'idle',version:app.getVersion(),etaSeconds:null};this.busy=false;this.downloaded=false;this.autoInstallRequested=false;this.installPromise=null;
    try{
      this.updater=options.updater||require('electron-updater').autoUpdater;
      this.updater.autoDownload=false;this.updater.autoInstallOnAppQuit=false;this.updater.allowPrerelease=false;this.updater.allowDowngrade=false;
      this.updater.on('checking-for-update',()=>this.set({status:'checking',error:null,message:'GitHub yayınları denetleniyor…'}));
      this.updater.on('update-available',info=>this.set({status:'available',availableVersion:info.version,releaseDate:info.releaseDate,error:null,message:info.version+' sürümü indirilebilir.'}));
      this.updater.on('update-not-available',()=>this.set({status:'not-available',error:null,checkedAt:new Date().toISOString(),message:'Güncel sürümü kullanıyorsunuz.'}));
      this.updater.on('download-progress',progress=>this.set({...progressState(progress),error:null,message:'Yeni sürüm indiriliyor. İndirme bitince kurulum otomatik başlayacak.'}));
      this.updater.on('update-downloaded',info=>{
        this.downloaded=true;this.set({status:'downloaded',availableVersion:info.version,percent:100,etaSeconds:0,error:null,message:'İndirme doğrulandı. Yeni sürüm kuruluma hazırlanıyor.'});
        if(this.autoInstallRequested)this.requestInstall().catch(error=>this.installFailed(error));
      });
      this.updater.on('error',error=>{this.log('Güncelleme hatası',error);this.set({status:'error',error:'Güncelleme alınamadı. İnternet bağlantısını ve GitHub yayınını kontrol edin. '+error.message});if(this.installPromise)this.options.installError?.(error);});
    }catch(error){this.log('Güncelleme bileşeni başlatılamadı',error);}
  }
  set(patch){if(patch.error)patch.message=patch.error;this.state={...this.state,...patch};this.emit('update-status',this.get());return this.get();}
  get(){return {...this.state};}
  async check(){
    if(this.busy||this.installPromise)return this.get();
    if(!this.app.isPackaged)return this.set({status:'unavailable',error:'Güncelleme kontrolü paketlenmiş sürümde kullanılabilir.'});
    if(process.env.PORTABLE_EXECUTABLE_FILE)return this.set({status:'portable',releaseUrl:this.releaseUrl(),error:'Portable sürüm için GitHub yayınındaki yeni EXE’yi indirin. Uygulamayı kapatıp eski EXE’nin yerine koyun. Otomatik kurulum, kurulu sürümde kullanılabilir.'});
    const repository=this.getSettings().updateRepository;
    if(!repository)return this.set({status:'unconfigured',error:'Önce GitHub güncelleme deposunu kullanıcı/depo biçiminde belirtin.'});
    if(!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(repository))return this.set({status:'unconfigured',error:'Güncelleme deposu geçersiz.'});
    if(!this.updater)return this.set({status:'error',error:'Güncelleme bileşeni yüklenemedi.'});
    const [owner,repo]=repository.split('/');this.updater.setFeedURL({provider:'github',owner,repo,private:false,releaseType:'release'});
    this.busy=true;this.autoInstallRequested=false;
    this.set({status:'checking',error:null,percent:0,transferred:0,total:0,bytesPerSecond:0,etaSeconds:null,message:'GitHub yayınları denetleniyor…'});
    try{await this.updater.checkForUpdates();}catch(error){if(this.state.status!=='error')this.set({status:'error',error:error.message});}finally{this.busy=false;}
    return this.get();
  }
  releaseUrl(){const repo=this.getSettings().updateRepository;return repo&&/^[\w.-]+\/[\w.-]+$/.test(repo)?'https://github.com/'+repo+'/releases/latest':null;}
  async download(){
    if(this.state.status!=='available'||this.busy||this.installPromise)throw new Error('Önce kullanılabilir bir güncelleme bulun.');
    this.busy=true;this.autoInstallRequested=true;this.downloaded=false;
    this.set({status:'downloading',error:null,percent:0,transferred:0,total:0,bytesPerSecond:0,etaSeconds:null,message:'İndirme başlıyor. Doğrulama bitince yeni sürüm otomatik kurulacak.'});
    try{await this.updater.downloadUpdate();}catch(error){this.autoInstallRequested=false;if(this.state.status!=='error')this.set({status:'error',error:error.message});throw error;}finally{this.busy=false;}
    return this.get();
  }
  installFailed(error){this.installPromise=null;this.options.installError?.(error);this.log('Güncelleme kurulumu başlatılamadı',error);return this.set({status:'downloaded',error:'Kurulum başlatılamadı; mevcut sürüm korunuyor. '+error.message,canRetryInstall:true});}
  async requestInstall(){
    if(this.installPromise)return this.installPromise;
    if(!this.downloaded)throw new Error('Doğrulanmış güncelleme indirmesi yok.');
    this.installPromise=(async()=>{
      this.set({status:'waiting-for-operations',error:null,message:'Yeni sürüm hazır. Devam eden dosya işlemleri tamamlanınca kurulum başlayacak.'});
      await this.options.beforeInstall?.();
      this.set({status:'installing',error:null,canRetryInstall:false,message:'Yeni sürüm yükleniyor. Voldena kapanacak ve kurulum tamamlanınca yeniden açılacak.'});
      await this.options.showInstallWindow?.();
      // Interactive NSIS supplies an installation progress window. forceRunAfter
      // launches the replacement executable (whose manifest requests elevation).
      await this.updater.quitAndInstall(false,true);
      return this.get();
    })();
    return this.installPromise;
  }
  async install(){try{return await this.requestInstall();}catch(error){return this.installFailed(error);}}
}
module.exports=UpdateService;
module.exports.progressState=progressState;
