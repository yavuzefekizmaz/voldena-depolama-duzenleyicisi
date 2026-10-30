'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('events');
const UpdateService=require('../src/services/updater');
const {validateManifest,newerVersion}=require('../src/services/portable-updater');
const wait=()=>new Promise(resolve=>setImmediate(resolve));
class Updater extends EventEmitter{
 setFeedURL(value){this.feed=value;}
 async checkForUpdates(){this.emit('update-available',{version:'2.1.0'});}
 async downloadUpdate(){this.emit('download-progress',{total:1000,transferred:250,bytesPerSecond:100,percent:25});this.emit('update-downloaded',{version:'2.1.0'});}
 quitAndInstall(silent,relaunch){this.installed={silent,relaunch};}
}
const app={isPackaged:true,getVersion:()=> '2.0.0'};
test('update download reports remaining time and waits for active operations before automatic install',async()=>{
 const adapter=new Updater(),events=[];let release,shown=false;const operations=new Promise(resolve=>{release=resolve;});
 const service=new UpdateService(app,()=>({updateRepository:'owner/repo'}),(_event,data)=>events.push(data),()=>{},{updater:adapter,beforeInstall:()=>operations,showInstallWindow:async()=>{shown=true;}});
 await service.check();await service.download();await wait();
 const progress=events.find(e=>e.status==='downloading'&&e.transferred===250);assert.equal(progress.etaSeconds,8);assert.equal(progress.total,1000);assert.equal(service.get().status,'waiting-for-operations');assert.equal(adapter.installed,undefined);
 release();await service.installPromise;assert.equal(shown,true);assert.deepEqual(adapter.installed,{silent:false,relaunch:true});assert.equal(service.get().status,'installing');
});
test('failed update download never starts an installer',async()=>{
 const adapter=new Updater();adapter.downloadUpdate=async()=>{throw new Error('Connection lost');};const service=new UpdateService(app,()=>({updateRepository:'owner/repo'}),()=>{},()=>{},{updater:adapter});await service.check();await assert.rejects(service.download(),/Connection lost/);assert.equal(adapter.installed,undefined);assert.equal(service.get().status,'error');
});
test('installer launch failure restores usable downloaded state and invokes recovery hook',async()=>{
 const adapter=new Updater();let recovered=false;adapter.quitAndInstall=()=>{throw new Error('Launch failed');};const service=new UpdateService(app,()=>({updateRepository:'owner/repo'}),()=>{},()=>{},{updater:adapter,installError:()=>{recovered=true;}});await service.check();await service.download();await wait();assert.equal(recovered,true);assert.equal(service.get().status,'downloaded');assert.equal(service.get().canRetryInstall,true);
});
test('progress never invents an ETA when speed is unknown',()=>{assert.equal(UpdateService.progressState({total:100,transferred:30,bytesPerSecond:0}).etaSeconds,null);assert.equal(UpdateService.progressState({total:100,transferred:130,bytesPerSecond:10}).etaSeconds,0);});
test('portable manifest parser rejects traversal, inconsistent versions and bad hashes',()=>{
 const valid={version:'2.1.0',path:'Voldena-Storage-2.1.0-x64-portable.exe',size:1000,sha512:Buffer.alloc(64).toString('base64')};assert.equal(validateManifest(valid,'2.1.0').size,1000);assert.throws(()=>validateManifest({...valid,path:'../update.exe'},'2.1.0'));assert.throws(()=>validateManifest(valid,'2.2.0'));assert.throws(()=>validateManifest({...valid,sha512:'bad'},'2.1.0'));assert.equal(newerVersion('2.1.0','2.0.9'),true);assert.equal(newerVersion('2.0.0','2.1.0'),false);
});
