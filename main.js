'use strict';
const {app,BrowserWindow,ipcMain,dialog,shell,nativeTheme,clipboard,Tray,Menu,nativeImage}=require('electron');
const fs=require('fs');
const path=require('path');
const {pathToFileURL}=require('url');
const DiskScanner=require('./src/scanner-client');
const CleanupEngine=require('./src/cleanup-engine');
const {getDrives}=require('./src/utils/disk-info');
const {formatBytes,formatDate}=require('./src/utils/formatters');
const {describePath,assertMutable}=require('./src/file-policy');
const {SettingsStore}=require('./src/services/settings');
const {FileOperations}=require('./src/services/file-operations');
const {AuditHistory,TechnicalLog}=require('./src/services/audit');
const {applyWindowsIntegration}=require('./src/services/windows-integration');
const {ProgramsService,powershell}=require('./src/services/programs');
const {DesktopRelocation}=require('./src/services/desktop-relocation');
const UpdateService=require('./src/services/updater');
const {acknowledgePortableUpdate}=require('./src/services/portable-updater');
const {metadata,verifyWindowsSafety}=require('./src/services/windows-metadata');
const Thumbnails=require('./src/services/thumbnails');
const NativeIcons=require('./src/services/native-icons');

const testProfile=process.env.VOLDENA_TEST_USER_DATA||process.env.VOLDE_TEST_USER_DATA;
if(!app.isPackaged&&testProfile&&path.isAbsolute(testProfile))app.setPath('userData',testProfile);
app.setName('Voldena Depolama Düzenleyicisi');
app.setAppUserModelId('com.voldena.storage');
const baseDirectory=app.getPath('userData');
const settings=new SettingsStore(baseDirectory);
const logger=new TechnicalLog(baseDirectory);
const audit=new AuditHistory(baseDirectory);
const scanner=new DiskScanner();
let mainWindow=null,tray=null,isQuitting=false,updateInstallPending=false,updateWindow=null,scanGeneration=0,updater=null,settingsQueue=Promise.resolve(),mutationQueue=Promise.resolve(),mutationRunning=false;
let drivesSnapshot=null,analysisRegistration=null;
const pageURL=pathToFileURL(path.join(__dirname,'src','index.html')).href;
const log=(message,details)=>logger.write(details instanceof Error?'error':'info',message,details);
const restorePoints=new(require('./src/services/restore-points'))({log,directory:baseDirectory});
const send=(event,data)=>{if(mainWindow&&!mainWindow.isDestroyed()&&!mainWindow.webContents.isDestroyed())mainWindow.webContents.send(event,data);};
const cleanup=new CleanupEngine({audit,log});
const operations=new FileOperations({journalPath:path.join(baseDirectory,'move-journal.jsonl'),audit,emit:send,onRemoved:async p=>scanner.removeNodeFromTree(p)});
const desktopRelocation=new DesktopRelocation({runner:powershell,audit,log,emit:send,directory:baseDirectory});
const programs=new ProgramsService({getNodeInfo:p=>scanner.getNodeInfo(p),emit:send,log,audit});
const thumbnails=new Thumbnails({nativeImage,app,isCloudPath:async target=>{
  if(!drivesSnapshot)drivesSnapshot=await getDrives();
  return drivesSnapshot.some(d=>d.isCloudDrive&&String(d.path).toLowerCase()===path.parse(target).root.toLowerCase());
}});
const fileIcons=new NativeIcons({app,isCloudPath:async target=>{
  if(!drivesSnapshot)drivesSnapshot=await getDrives();
  return drivesSnapshot.some(d=>d.isCloudDrive&&String(d.path).toLowerCase()===path.parse(target).root.toLowerCase());
}});
async function prepareUpdateInstall(){
  updateInstallPending=true;
  while(analysisRegistration?.isBusy())await new Promise(resolve=>setTimeout(resolve,100));
  await mutationQueue;
  if(operations.active)await operations.active.finished;
  if(programs.active)await programs.active.finished;
  await settingsQueue;
  await scanner.cancel();
  await Promise.all([audit.queue,logger.queue]);
}
async function showUpdateInstallWindow(){
  updateWindow=new BrowserWindow({width:490,height:245,resizable:false,minimizable:false,maximizable:false,frame:false,alwaysOnTop:true,backgroundColor:'#17131c',title:'Voldena — Yeni sürüm yükleniyor',webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  const content='<!doctype html><html lang="tr"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><style>body{background:#17131c;color:#f8f5fb;font:15px Segoe UI;margin:34px}h2{font-size:21px;margin:0 0 18px}p{color:#c8c0ce;line-height:1.6}.bar{height:6px;background:#392c40;border-radius:5px;overflow:hidden}.bar:after{content:"";display:block;height:6px;width:40%;background:#e56186;animation:move 1.3s infinite}@keyframes move{from{transform:translateX(-100%)}to{transform:translateX(350%)}}</style><h2>Yeni sürüm yükleniyor</h2><div class="bar"></div><p>Voldena kapanacak. Kurulum penceresi açılacak ve yeni sürüm hazır olduğunda uygulama yeniden başlayacak.</p></html>';
  await updateWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(content));
  updateWindow.show();
  await new Promise(resolve=>setTimeout(resolve,1000));
  isQuitting=true;
}
function updateInstallError(error){updateInstallPending=false;isQuitting=false;if(updateWindow&&!updateWindow.isDestroyed())updateWindow.destroy();updateWindow=null;log('Güncelleme kurulumu ertelendi',error);showWindow();}
function showWindow(){if(!mainWindow||mainWindow.isDestroyed())createWindow();mainWindow.show();if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus();}
function createTray(){
  let icon=nativeImage.createFromPath(path.join(__dirname,'build','tray.png'));
  if(icon.isEmpty())icon=nativeImage.createFromPath(path.join(__dirname,'build','icon.ico'));
  tray=new Tray(icon);tray.setToolTip('Voldena Depolama Düzenleyicisi');
  tray.setContextMenu(Menu.buildFromTemplate([{label:'Voldena’yı göster',click:showWindow},{type:'separator'},{label:'Çıkış',click:()=>{isQuitting=true;app.quit();}}]));
  tray.on('double-click',showWindow);
}
function createWindow(){
  nativeTheme.themeSource=settings.get().theme==='light'?'light':'dark';
  mainWindow=new BrowserWindow({width:1440,height:900,minWidth:1080,minHeight:680,show:false,frame:false,title:'Voldena Depolama Düzenleyicisi',
    backgroundColor:settings.get().theme==='light'?'#f3f4f8':'#0d0b0f',icon:path.join(__dirname,'build','icon.ico'),
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  mainWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  mainWindow.webContents.on('will-navigate',(event,url)=>{if(url!==pageURL)event.preventDefault();});
  mainWindow.loadFile(path.join(__dirname,'src','index.html'));
  mainWindow.once('ready-to-show',()=>{if(!settings.get().startHidden&&!process.argv.includes('--background'))mainWindow.show();acknowledgePortableUpdate(app).then(confirmed=>{if(confirmed)log('Portable güncellemesi sonrası açılış doğrulandı',{version:app.getVersion()});}).catch(error=>log('Portable güncelleme açılış onayı yazılamadı',error));});
  mainWindow.on('close',event=>{if(!isQuitting&&settings.get().startHidden){event.preventDefault();mainWindow.hide();}});
  mainWindow.on('closed',()=>{mainWindow=null;scanner.cancel();});
  mainWindow.webContents.on('render-process-gone',async(_event,details)=>{
    log('Arayüz işlemi kapandı',details);if(isQuitting||!mainWindow)return;
    const answer=await dialog.showMessageBox(mainWindow,{type:'error',title:'Voldena arayüzü kapandı',message:'Arayüz beklenmedik şekilde kapandı. İşlem geçmişi diskte korunuyor.',detail:'Arayüzü yeniden yükleyebilirsiniz. Devam eden tarama durduruldu.',buttons:['Yeniden yükle','Kapat'],defaultId:0});
    scanner.cancel();if(answer.response===0&&!mainWindow.isDestroyed())mainWindow.reload();else{isQuitting=true;app.quit();}
  });
  mainWindow.on('unresponsive',()=>log('Arayüz yanıt vermiyor'));
}
if(!app.requestSingleInstanceLock()){app.quit();}else{
  app.on('second-instance',showWindow);
  app.whenReady().then(async()=>{
    if(!testProfile){
      const legacy=path.join(app.getPath('appData'),'Volde Depolama Düzenleyicisi');
      if(path.resolve(legacy)!==path.resolve(baseDirectory)){
        await fs.promises.mkdir(baseDirectory,{recursive:true});
        for(const file of ['settings.json','deletion-history.jsonl','move-journal.jsonl']){
          const source=path.join(legacy,file),destination=path.join(baseDirectory,file);
          if(!fs.existsSync(destination))await fs.promises.copyFile(source,destination,fs.constants.COPYFILE_EXCL).catch(e=>{if(e.code!=='ENOENT')log('Önceki sürüm verileri taşınamadı',e);});
        }
      }
    }
    await desktopRelocation.recover();
    const firstLaunch=!fs.existsSync(settings.file);await settings.load();
    if(firstLaunch&&app.isPackaged){try{const options=JSON.parse(await fs.promises.readFile(path.join(process.resourcesPath,'installer-options.json'),'utf8'));await settings.save(options);}catch(e){if(e.code!=='ENOENT')log('Kurulum seçenekleri okunamadı',e);}}
    createTray();createWindow();updater=new UpdateService(app,()=>settings.get(),send,log,{beforeInstall:prepareUpdateInstall,showInstallWindow:showUpdateInstallWindow,installError:updateInstallError});
    log('Uygulama açıldı',{version:app.getVersion(),packaged:app.isPackaged});
    if(app.isPackaged)setTimeout(()=>restorePoints.create('startup'),8000).unref();
    app.on('activate',showWindow);
  }).catch(e=>{log('Başlatma hatası',e);dialog.showErrorBox('Voldena başlatılamadı',e.message);app.quit();});
}
let waitingToQuit=false;
app.on('before-quit',event=>{isQuitting=true;scanner.cancel();if(waitingToQuit){event.preventDefault();return;}if(mutationRunning||operations.active||programs.active){event.preventDefault();waitingToQuit=true;operations.cancel();Promise.all([mutationQueue,operations.active?.finished,programs.active?.finished]).finally(()=>{waitingToQuit=false;app.quit();});}});
app.on('window-all-closed',()=>{if(!settings.get().startHidden)app.quit();});
app.on('will-quit',()=>{tray?.destroy();scanner.dispose?.();metadata.dispose();fileIcons.dispose();});
process.on('uncaughtException',error=>log('Beklenmeyen ana işlem hatası',error));
process.on('unhandledRejection',error=>log('İşlenmeyen işlem hatası',error));

const actionLogs={
  'window-action':(a)=>({message:'Pencere işlemi',details:{action:a[0]}}),
  'get-drives':(_a,r)=>({message:'Sürücü listesi yenilendi',details:{count:Array.isArray(r)?r.length:0}}),
  'select-folder-dialog':(_a,r)=>({message:r?'Tarama klasörü seçildi':'Klasör seçimi iptal edildi',details:r?{path:r}:null}),
  'stop-scan':()=>({message:'Taramayı durdurma istendi'}),'pause-scan':()=>({message:'Tarama duraklatıldı'}),'resume-scan':()=>({message:'Tarama sürdürüldü'}),
  'get-children':(a,r)=>({message:'Klasör ağacı açıldı',details:{path:a[0],offset:a[1]?.offset||0,shown:r.items?.length||0,total:r.total}}),
  'get-large-files':(a,r)=>({message:'Büyük dosya görünümü güncellendi',details:{minSize:a[0]?.minSize,category:a[0]?.category,search:a[0]?.search,offset:a[0]?.offset,shown:r.items?.length||0,total:r.total}}),
  'search-tree':(a,r)=>({message:'Dosya ağacında arama yapıldı',details:{query:String(a[0]).slice(0,500),total:r.total}}),
  'show-in-folder':a=>({message:'Dosya Gezgini’nde gösterildi',details:{path:a[0]}}),
  'open-path':a=>({message:'Dosya veya klasör açıldı',details:{path:a[0]}}),
  'copy-to-clipboard':a=>({message:'Metin panoya kopyalandı',details:{length:String(a[0]).length}}),
  'get-file-details':a=>({message:'Dosya açıklaması görüntülendi',details:{path:a[0]}}),
  'get-programs':(_a,r)=>({message:'Kurulu uygulamalar listelendi',details:{count:r.items?.length||0,error:r.error}}),
  'open-system-settings':a=>({message:'Windows ayarları açıldı',details:{section:a[0]}}),
  'get-recommendations':(_a,r)=>({message:'Kişisel dosya önerileri görüntülendi',details:{count:r.items?.length||0}}),
  'plan-move':(_a,r)=>({message:r.canceled?'Taşıma hedefi seçimi iptal edildi':'Taşıma planı hazırlandı',details:{id:r.plan?.id,target:r.plan?.targetDirectory,count:r.plan?.items?.length,bytes:r.plan?.totalBytes}}),
  'cancel-move':()=>({message:'Taşımayı iptal etme istendi'}),
  'check-for-updates':(_a,r)=>({message:'Güncelleme kontrolü istendi',details:{status:r.status}}),
  'download-update':(_a,r)=>({message:'Güncelleme indirildi',details:{status:r.status,version:r.availableVersion}}),
  'install-update':()=>({message:'Güncelleme kurulumu istendi'}),
  'export-report':(_a,r)=>({message:'Görünüm raporu dışa aktarıldı',details:{path:r.path,canceled:r.canceled}}),
  'export-history':(_a,r)=>({message:'İşlem geçmişi dışa aktarıldı',details:{path:r.path,canceled:r.canceled}}),
  'export-logs':(_a,r)=>({message:'Teknik günlük dışa aktarıldı',details:{path:r.path,canceled:r.canceled}})
};
function handle(name,fn){ipcMain.handle(name,async(event,...args)=>{
  if(!mainWindow||event.sender!==mainWindow.webContents||event.senderFrame?.url!==pageURL)throw new Error('Geçersiz uygulama isteği.');
  try{const result=await fn(...args);if(actionLogs[name]){const entry=actionLogs[name](args,result);log(entry.message,entry.details);}return result;}catch(error){log(name,error);return {success:false,error:error.message};}
});}
function mutate(fn,fromAnalysis=false){if(updateInstallPending&&!fromAnalysis)return Promise.reject(new Error('Yeni sürüm kuruluma hazırlanıyor. Dosya işlemini uygulama yeniden açıldığında başlatın.'));if(analysisRegistration?.isBusy()&&!fromAnalysis)return Promise.reject(new Error('Mükerrer dosya temizliğinin tamamlanmasını bekleyin.'));const work=async()=>{if(isQuitting)throw new Error('Uygulama kapanıyor.');mutationRunning=true;try{return await fn();}finally{mutationRunning=false;}};const pending=mutationQueue.then(work);mutationQueue=pending.catch(()=>{});return pending;}
const requirePath=value=>{if(typeof value!=='string'||value.length>32767||!path.isAbsolute(value)||value.includes('\0'))throw new Error('Dosya yolu geçersiz.');return value;};
handle('window-action',action=>{if(action==='minimize')mainWindow.minimize();else if(action==='maximize')mainWindow.isMaximized()?mainWindow.unmaximize():mainWindow.maximize();else if(action==='close')mainWindow.close();else if(action==='hide')mainWindow.hide();});
handle('get-drives',async()=>{drivesSnapshot=await getDrives();return drivesSnapshot;});
handle('select-folder-dialog',async()=>{const result=await dialog.showOpenDialog(mainWindow,{properties:['openDirectory'],title:'Taranacak klasörü seçin'});return result.canceled?null:result.filePaths[0];});
handle('start-scan',async(target,options={})=>{
  requirePath(target);log('Tarama istendi',{target,force:!!options.force});
  const result=await scanner.startScan(target,data=>send('scan-progress',data),options);
  log('Tarama tamamlandı',{target,stats:result.stats,diagnostics:result.diagnostics});send('scan-complete',result);return result;
});
handle('select-scan',target=>scanner.selectScan(requirePath(target)));
handle('stop-scan',()=>{scanner.cancel();return {stopped:true};});
handle('pause-scan',()=>{scanner.pause();return {paused:true};});
handle('resume-scan',()=>{scanner.resume();return {resumed:true};});
handle('get-children',(target,options)=>scanner.getChildrenOf(requirePath(target),options));
handle('get-large-files',options=>scanner.getLargeFiles(options));
handle('search-tree',(query,options)=>scanner.searchNodes(String(query).slice(0,500),options));
handle('get-scan-diagnostics',()=>scanner.getDiagnostics());
handle('get-thumbnail',target=>thumbnails.get(requirePath(target)));
handle('get-file-icon',(target,options)=>fileIcons.get(requirePath(target),options));
handle('show-in-folder',target=>{shell.showItemInFolder(requirePath(target));return {success:true};});
handle('open-path',async target=>{const error=await shell.openPath(requirePath(target));if(error)throw new Error(error);return {success:true};});
handle('copy-to-clipboard',value=>{clipboard.writeText(String(value).slice(0,100000));return {success:true};});
handle('get-file-details',async target=>{
  requirePath(target);const stats=await fs.promises.lstat(target);
  const node=scanner.getNodeInfo?await scanner.getNodeInfo(target):null;
  const windows=await metadata.get(target).catch(()=>null);
  const logicalSize=node?.logicalSize??node?.size??stats.size;
  const allocatedSize=node?.allocatedSize??null;
  return {exists:true,name:path.basename(target)||target,path:target,isDir:stats.isDirectory(),size:node?.size??stats.size,
    logicalSize,allocatedSize,allocatedKnown:node?.allocatedKnown===true,formattedSize:formatBytes(node?.size??stats.size),formattedLogicalSize:formatBytes(logicalSize),
    formattedAllocatedSize:allocatedSize===null?'Tarama verisi yok':formatBytes(allocatedSize),formattedMtime:formatDate(stats.mtime),mtime:stats.mtime,
    formattedBirthtime:formatDate(stats.birthtime),birthtime:stats.birthtime,extension:path.extname(target)||(stats.isDirectory()?'Klasör':'Uzantısız dosya'),
    isSparse:node?.isSparse||false,...describePath(target,{isDir:stats.isDirectory(),nlink:stats.nlink,attributes:windows?.attributes??node?.attributes}),
    allocationNote:allocatedSize===null?'Diskte ayrılmış alan bu dosya için henüz ölçülmedi. Görünen boyut mantıksal dosya boyutudur.':!node?.allocatedKnown?'Ayrılmış alan dizin taramasının yaklaşık değeridir; NTFS MFT taraması daha doğru ayrım sağlar.':undefined};
});
async function deleteOne(target,toTrash=true){
  requirePath(target);const checked=await assertMutable(target,{operation:'delete',allowDirectory:false});
  await verifyWindowsSafety(target,'delete');
  const record=await audit.begin(target,checked.stats,toTrash?'Geri Dönüşüm Kutusu':'Kalıcı silme');let deleted=false;
  try{
    const current=await assertMutable(target,{operation:'delete',allowDirectory:false});
    await verifyWindowsSafety(target,'delete');
    if(current.stats.size!==checked.stats.size||current.stats.mtimeMs!==checked.stats.mtimeMs||current.stats.ino!==checked.stats.ino||current.stats.dev!==checked.stats.dev)throw new Error('Dosya işlem hazırlanırken değişti; korundu.');
    if(toTrash)await shell.trashItem(checked.path);else await fs.promises.unlink(checked.path);deleted=true;
    await audit.complete(record,'success');
    const update=await scanner.removeNodeFromTree(target).catch(e=>{log('Tarama ağacı güncellenemedi',e);return null;});log('Dosya silindi',{target,toTrash,size:checked.stats.size});
    return {success:true,targetPath:target,toTrash,update,freedBytes:toTrash?0:checked.stats.size,removedBytes:checked.stats.size};
  }catch(error){await audit.complete(record,deleted?'success-with-audit-error':'failed',error.message).catch(()=>{});throw error;}
}
handle('delete-path',(...args)=>mutate(()=>deleteOne(...args)));
handle('delete-multiple',(paths,toTrash=true)=>mutate(async()=>{
  if(!Array.isArray(paths)||paths.length>500)throw new Error('En fazla 500 dosya seçin.');
  const result={total:paths.length,successCount:0,failCount:0,freedBytes:0,removedBytes:0,errors:[],toTrash};
  for(const target of [...new Set(paths)])try{const item=await deleteOne(target,toTrash);result.successCount++;result.freedBytes+=item.freedBytes;result.removedBytes+=item.removedBytes;}catch(e){result.failCount++;result.errors.push(path.basename(String(target))+': '+e.message);}
  return result;
}));
handle('scan-cleanups',async()=>{log('Temizlik adayları taranmaya başladı');const result=await cleanup.scanAllRecommendations(data=>send('cleanups-progress',data));log('Temizlik adayları tarandı',result.summary);return result;});
handle('clean-categories',(ids,paths,toTrash=true)=>mutate(async()=>{const result=await cleanup.cleanCategories(ids,paths,toTrash,p=>shell.trashItem(p));log('Temizlik tamamlandı',result);return result;}));
handle('plan-move',async paths=>{
  const answer=await dialog.showOpenDialog(mainWindow,{title:'Dosyaların taşınacağı klasörü seçin',buttonLabel:'Hedefi seç',properties:['openDirectory','createDirectory']});
  if(answer.canceled)return {success:false,canceled:true};return {success:true,plan:await operations.plan(paths,answer.filePaths[0])};
});
handle('execute-move',id=>mutate(async()=>{log('Taşıma başladı',{id});const result=await operations.execute(String(id));log('Taşıma tamamlandı',result);return result;}));
handle('cancel-move',()=>operations.cancel());
handle('get-settings',()=>({settings:settings.get(),version:app.getVersion(),isPackaged:app.isPackaged,systemDrive:(process.env.SystemDrive||'C:')+'\\',update:updater?.get(),settingsLoadError:settings.loadError}));
handle('save-settings',patch=>{
  const work=async()=>{const previous=settings.get();const {validateSettings}=require('./src/services/settings');const next=validateSettings(patch,previous);
    await applyWindowsIntegration(app,shell,next,previous);await settings.save(next);nativeTheme.themeSource=next.theme==='light'?'light':'dark';
    if(next.updateRepository!==previous.updateRepository)updater?.set({status:'idle',availableVersion:null,error:null,message:'Yeni güncelleme deposu kaydedildi. Yeniden kontrol edin.'});
    log('Ayarlar kaydedildi',{theme:next.theme,launchAtLogin:next.launchAtLogin,startHidden:next.startHidden});return {success:true,settings:settings.get()};};
  const pending=settingsQueue.then(work);settingsQueue=pending.catch(()=>{});return pending;
});
handle('check-for-updates',()=>updater.check());
handle('download-update',()=>updater.download());
handle('install-update',()=>updater.install());
handle('get-programs',()=>programs.getPrograms({force:true}));
handle('plan-desktop-move',async id=>{const item=(await programs.getPrograms()).items.find(p=>p.id===id&&p.kind==='win32'&&p.canMove);if(!item)throw new Error('Taşınabilir uygulama bulunamadı.');const choice=await dialog.showOpenDialog(mainWindow,{title:'Uygulamanın hedef üst klasörünü seçin',properties:['openDirectory','createDirectory']});if(choice.canceled)return {canceled:true};return desktopRelocation.plan(item,choice.filePaths[0]);});
handle('cancel-desktop-move',()=>desktopRelocation.cancel());
handle('execute-desktop-move',id=>mutate(async()=>{const result=await desktopRelocation.execute(String(id));await scanner.removeNodeFromTree(result.source).catch(()=>{});programs.cached=null;return result;}));
handle('get-program-move-targets',name=>programs.getProgramMoveTargets(String(name)));
handle('plan-program-move',(name,volume)=>programs.planProgramMove(String(name),String(volume)));
handle('execute-program-move',id=>mutate(()=>programs.executeProgramMove(String(id))));
handle('open-system-settings',async section=>{const links={apps:'ms-settings:appsfeatures',storage:'ms-settings:storagesense',cleanup:'ms-settings:storagesense'};if(!links[section])throw new Error('Geçersiz ayar sayfası.');await shell.openExternal(links[section]);return {success:true};});
handle('get-recommendations',async()=>{
  const page=await scanner.getLargeFiles({minSize:500*1024*1024,offset:0,limit:100});
  const items=(page.items||[]).map(item=>({...item,...describePath(item.path,item),actions:['move','review'],
    advice:describePath(item.path,item).advice||'Başka bir diske taşıyarak bu diskte alan açabilirsiniz. Yedeklediğiniz dosyayı silmeden önce kopyanın açıldığını doğrulayın.'}));
  return {items,total:page.total||items.length,note:'Kişisel dosyalar otomatik silinmez. Buluta yüklemek, yerel kopyayı kaldırmadıkça disk alanı açmaz.'};
});
handle('get-history',options=>audit.get(options));
handle('get-logs',options=>logger.get(options));
const csv=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
function checkExportTarget(target){const resolved=path.resolve(target).toLowerCase(),internal=path.resolve(baseDirectory).toLowerCase();if(resolved===internal||resolved.startsWith(internal+path.sep))throw new Error('Uygulama veri klasörünün dışında bir çıktı konumu seçin.');}
async function exportText(name,content,extension='csv'){
  const answer=await dialog.showSaveDialog(mainWindow,{defaultPath:name,filters:[{name:extension.toUpperCase(),extensions:[extension]}]});if(answer.canceled)return {canceled:true};
  checkExportTarget(answer.filePath);await fs.promises.writeFile(answer.filePath,'\ufeff'+content,'utf8');return {success:true,path:answer.filePath};
}
handle('export-report',async(options={})=>{
 const rows=[];if(options.view==='large'){for(let offset=0;;){const page=await scanner.getLargeFiles({...options.large,offset,limit:200});rows.push(...page.items);offset+=page.items.length;if(!page.hasMore||!page.items.length)break;}}
 else if(Array.isArray(options.rows))rows.push(...options.rows.slice(0,50000));
 const labels={tree:'dosya-agaci',large:'buyuk-dosyalar',programs:'kurulu-uygulamalar',cleanups:'yer-acma-onerileri',drives:'suruculer',analysis:'alan-analizi'};
 return exportText('Voldena-'+(labels[options.view]||'rapor')+'.csv',require('./src/services/reports').reportCSV(rows));
});
handle('export-history',async()=>{
  const answer=await dialog.showSaveDialog(mainWindow,{defaultPath:'Voldena-silme-gecmisi.jsonl',filters:[{name:'JSON Lines',extensions:['jsonl']}]});if(answer.canceled)return {canceled:true};
  checkExportTarget(answer.filePath);await audit.queue;await fs.promises.copyFile(audit.file,answer.filePath);return {success:true,path:answer.filePath};
});
handle('export-logs',async()=>{const result=await logger.get({limit:1000});return exportText('Voldena-teknik-gunluk.txt',result.text,'txt');});
handle('create-restore-point',()=>restorePoints.create('manual'));
handle('get-restore-point-status',()=>restorePoints.get());
analysisRegistration=require('./src/register-analysis')({handle,scanner,baseDirectory,send,deleteOne:(...args)=>mutate(()=>deleteOne(...args),true),log,isBusy:()=>mutationRunning||!!operations.active||!!programs.active||!!cleanup.isCleaning||updateInstallPending});
