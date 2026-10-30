'use strict';
const fs=require('fs');
const SnapshotStore=require('./services/snapshots');
const {sameFile}=require('./scan-analysis');
module.exports=function registerAnalysis({handle,scanner,baseDirectory,send,deleteOne,log,isBusy=()=>false}){
 const snapshots=new SnapshotStore(baseDirectory);let deleting=false;
 handle('get-space-map',(target,options)=>scanner.getSpaceMap(target,options));
 handle('get-file-statistics',()=>scanner.getFileStatistics());
 handle('find-duplicates',options=>{if(isBusy())throw new Error('Devam eden dosya işlemini tamamlayın.');log('Mükerrer incelemesi başladı');return scanner.findDuplicates(options,data=>send('analysis-progress',data)).then(result=>{log('Mükerrer incelemesi tamamlandı',result.summary);return result;});});
 handle('cancel-analysis',()=>scanner.cancelAnalysis());
 handle('get-duplicate-groups',options=>scanner.getDuplicateGroups(options));
 handle('delete-duplicate-files',async(paths,toTrash=true)=>{
  if(deleting||isBusy()||scanner.analysisRunning)throw new Error('Devam eden işlemi tamamlayın.');deleting=true;
  const result={successCount:0,failCount:0,freedBytes:0,deletedPaths:[],errors:[]};
  try{const plan=await scanner.validateDuplicateSelection(paths);
   for(const item of plan.items){try{const keeper=await fs.promises.lstat(item.keepPath),source=await fs.promises.lstat(item.path);if(!sameFile(keeper,item.keepIdentity)||!sameFile(source,item.identity))throw new Error('Korunan veya seçilen dosya değişti; silme uygulanmadı.');const deleted=await deleteOne(item.path,toTrash!==false);if(!deleted.success)throw new Error(deleted.error||'Silme tamamlanamadı.');result.successCount++;result.freedBytes+=deleted.freedBytes||0;result.deletedPaths.push(item.path);}catch(error){result.failCount++;result.errors.push(error.message);}}
   return result;
  }finally{deleting=false;}
 });
 handle('save-scan-snapshot',async()=>{const result=await snapshots.save(await scanner.exportSnapshot());log('Tarama görüntüsü kaydedildi',{id:result.snapshot.id});return result;});
 handle('get-scan-snapshots',()=>snapshots.list());
 handle('compare-scan-snapshot',async id=>snapshots.compare(id,await scanner.exportSnapshot()));
 return {isBusy:()=>deleting};
};
