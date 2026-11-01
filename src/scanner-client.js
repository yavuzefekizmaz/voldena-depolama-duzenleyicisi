'use strict';
const {Worker}=require('worker_threads'),path=require('path'),fs=require('fs');
class ScannerClient{
 constructor(options={}){this.options=options;this.sequence=0;this.pending=new Map();this.worker=null;this.onProgress=null;}
 ensure(){if(this.worker)return;const packed=process.resourcesPath&&path.join(process.resourcesPath,'native','VoldeScan.exe');this.worker=new Worker(path.join(__dirname,'scanner-worker.js'),{workerData:{helperPath:this.options.helperPath||(packed&&fs.existsSync(packed)?packed:undefined)},resourceLimits:{maxOldGenerationSizeMb:3072}});this.worker.on('message',m=>{if(m.event==='progress')this.onProgress?.(m.data);else if(m.event==='analysis-progress')this.onAnalysisProgress?.(m.data);else{const p=this.pending.get(m.id);if(p){this.pending.delete(m.id);m.error?p.reject(new Error(m.error)):p.resolve(m.result);}}});this.worker.on('error',e=>this.fail(e));this.worker.on('exit',code=>{if(code!==0)this.fail(new Error('Tarama işlemi beklenmedik biçimde kapandı.'));this.worker=null;});}
 fail(error){for(const p of this.pending.values())p.reject(error);this.pending.clear();this.worker=null;}
 call(method,...args){this.ensure();return new Promise((resolve,reject)=>{const id=++this.sequence;this.pending.set(id,{resolve,reject});this.worker.postMessage({id,method,args});});}
 startScan(target,onProgress,options={}){this.onProgress=onProgress;this.isScanning=true;return this.call('startScan',target,options).finally(()=>{this.isScanning=false;});}
 selectScan(target){return this.call('selectScan',target);}
 findDuplicates(options={},onProgress){this.onAnalysisProgress=onProgress;this.analysisRunning=true;return this.call('findDuplicates',options).finally(()=>{this.analysisRunning=false;});}
 cancelAnalysis(){return this.call('cancelAnalysis');}getSpaceMap(...a){return this.call('getSpaceMap',...a);}getFileStatistics(){return this.call('getFileStatistics');}getDuplicateGroups(...a){return this.call('getDuplicateGroups',...a);}validateDuplicateSelection(...a){return this.call('validateDuplicateSelection',...a);}exportSnapshot(...a){return this.call('exportSnapshot',...a);}
 cancel(){return this.worker?this.call('cancel'):Promise.resolve();}pause(){return this.call('pause');}resume(){return this.call('resume');}
 getDiagnostics(){return this.call('getDiagnostics');}
 getChildrenOf(...a){return this.call('getChildrenOf',...a);}getLargeFiles(...a){return this.call('getLargeFiles',...a);}searchNodes(...a){return this.call('searchNodes',...a);}removeNodeFromTree(...a){return this.call('removeNodeFromTree',...a);}getNodeInfo(...a){return this.call('getNodeInfo',...a);}getRootNode(){return this.call('getRootNode');}
 async dispose(){if(this.worker){const worker=this.worker;this.worker=null;await worker.terminate();}this.fail(new Error('Tarayıcı kapatıldı.'));}
}
module.exports=ScannerClient;
