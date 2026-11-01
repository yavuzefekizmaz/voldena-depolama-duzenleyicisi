'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const path=require('path');
const {SettingsStore,validateSettings}=require('../src/services/settings');
const {AuditHistory,TechnicalLog}=require('../src/services/audit');
const {FileOperations}=require('../src/services/file-operations');
const CleanupEngine=require('../src/cleanup-engine');
async function fixture(t){const root=path.resolve(require('os').homedir());const dir=await fs.promises.mkdtemp(path.join(root,'.volde-fixture-'));t.after(async()=>{if(!path.resolve(dir).startsWith(root+path.sep+'.volde-fixture-'))throw new Error('Unsafe test cleanup');await fs.promises.rm(dir,{recursive:true,force:true});});return dir;}

test('settings reject unknown type, invalid repository and persist view preferences',async t=>{
 const dir=await fixture(t),store=new SettingsStore(dir);await store.load();
 assert.throws(()=>validateSettings({launchAtLogin:'yes'}));assert.equal(validateSettings({updateRepository:'https://evil.example/repo'}).updateRepository,'yavuzefekizmaz/voldena-depolama-duzenleyicisi');
 await store.save({theme:'blue',viewMode:'classic',groupFiles:false,updateRepository:'owner/repo'});
 const reloaded=new SettingsStore(dir);await reloaded.load();assert.equal(reloaded.get().theme,'blue');assert.equal(reloaded.get().groupFiles,false);
});
test('deletion audit retains durable intent, final result and unknown interrupted work',async t=>{
 const dir=await fixture(t),file=path.join(dir,'proof.mp4');await fs.promises.writeFile(file,'test');const stats=await fs.promises.stat(file),audit=new AuditHistory(dir);
 const a=await audit.begin(file,stats,'Test');await audit.complete(a,'success');await audit.begin(file,stats,'Interrupted test');
 const result=await audit.get();assert.equal(result.total,2);assert.equal(result.items[0].result,'unknown');assert.equal(result.items[1].result,'success');
 assert.match(await fs.promises.readFile(audit.file,'utf8'),/"pending"/);
});
test('technical logs rotate within a bounded set independently of history',async t=>{
 const dir=await fixture(t),log=new TechnicalLog(dir,{maxBytes:160,files:3});
 for(let i=0;i<30;i++)await log.write(i===29?'error':'info','entry '+i,'x'.repeat(90));
 const files=await fs.promises.readdir(log.directory);assert.ok(files.length<=3);
 const result=await log.get({level:'error'});assert.equal(result.items.length,1);assert.match(result.text,/entry 29/);
});
test('moving rejects name collisions and changed sources without deleting either',async t=>{
 const dir=await fixture(t),dest=path.join(dir,'target');await fs.promises.mkdir(dest);
 const source=path.join(dir,'personal.mp4');await fs.promises.writeFile(source,'original');
 const ops=new FileOperations({journalPath:path.join(dir,'moves.jsonl'),audit:new AuditHistory(dir)});
 await fs.promises.writeFile(path.join(dest,'personal.mp4'),'existing');await assert.rejects(ops.plan([source],dest),/aynı isimli/);
 await fs.promises.unlink(path.join(dest,'personal.mp4'));const plan=await ops.plan([source],dest);await fs.promises.appendFile(source,'changed');
 const result=await ops.execute(plan.id);assert.equal(result.movedCount,0);assert.equal(await fs.promises.readFile(source,'utf8'),'originalchanged');
});
test('same-volume move commits exclusively, preserves bytes and journals completion',async t=>{
 const dir=await fixture(t),dest=path.join(dir,'target');await fs.promises.mkdir(dest);
 const source=path.join(dir,'personal.mp4'),content=Buffer.from('personal content');await fs.promises.writeFile(source,content);
 const ops=new FileOperations({journalPath:path.join(dir,'moves.jsonl'),audit:new AuditHistory(dir)}),plan=await ops.plan([source],dest),result=await ops.execute(plan.id);
 assert.equal(result.movedCount,1);assert.equal(result.failedCount,0);assert.deepEqual(await fs.promises.readFile(path.join(dest,'personal.mp4')),content);await assert.rejects(fs.promises.stat(source),{code:'ENOENT'});
 assert.match(await fs.promises.readFile(ops.journalPath,'utf8'),/move-complete/);
});
test('copy-and-verify move engine preserves bytes and cancellation retains source',async t=>{
 const dir=await fixture(t),dest=path.join(dir,'target');await fs.promises.mkdir(dest);
 const source=path.join(dir,'personal.mp4'),content=Buffer.alloc(2*1024*1024,43);await fs.promises.writeFile(source,content);
 const ops=new FileOperations({journalPath:path.join(dir,'moves.jsonl'),audit:new AuditHistory(dir)});const plan=await ops.plan([source],dest);ops.plans.get(plan.id).items[0].sameVolume=false;
 const result=await ops.execute(plan.id);assert.equal(result.movedCount,1);assert.deepEqual(await fs.promises.readFile(path.join(dest,'personal.mp4')),content);
 const second=path.join(dir,'cancel.mp4');await fs.promises.writeFile(second,content);const canceled=await ops.plan([second],dest);ops.plans.get(canceled.id).items[0].sameVolume=false;
 ops.emit=(event,p)=>{if(p.phase==='copying')ops.cancel();};const cancelResult=await ops.execute(canceled.id);assert.equal(cancelResult.canceled,true);assert.deepEqual(await fs.promises.readFile(second),content);
});
test('cleanup only deletes snapshotted old files and audits every removal',async t=>{
 const dir=await fixture(t),cache=path.join(dir,'cache');await fs.promises.mkdir(cache);
 const old=path.join(cache,'old.txt'),recent=path.join(cache,'recent.txt'),outside=path.join(dir,'outside.txt');
 await fs.promises.writeFile(old,'old');await fs.promises.writeFile(recent,'recent');await fs.promises.writeFile(outside,'outside');
 const past=new Date(Date.now()-10*86400000);await fs.promises.utimes(old,past,past);
 const audit=new AuditHistory(dir),engine=new CleanupEngine({audit});
 engine.getDefinitions=async()=>[{id:'test',title:'Test cache',group:'safe',autoClean:true,paths:[cache],description:'Test only'}];
 await engine.scanAllRecommendations();const result=await engine.cleanCategories(['test'],[outside],false);
 assert.equal(result.deletedFiles,1);assert.equal(await fs.promises.readFile(recent,'utf8'),'recent');assert.equal(await fs.promises.readFile(outside,'utf8'),'outside');
 assert.equal((await audit.get()).items[0].result,'success');
});


test('Windows native safety rejects System attributes and verified moves preserve named streams', {skip:process.platform!=='win32'}, async t=>{
 const dir=await fixture(t),dest=path.join(dir,'target'),source=path.join(dir,'special.mp4');await fs.promises.mkdir(dest);await fs.promises.writeFile(source,'personal');
 const {verifyWindowsSafety}=require('../src/services/windows-metadata');
 await fs.promises.writeFile(source+':volde-test-stream','extra data');
 const ops=new FileOperations({journalPath:path.join(dir,'moves.jsonl'),audit:new AuditHistory(dir)});
 const plan=await ops.plan([source],dest);ops.plans.get(plan.id).items[0].sameVolume=false;
 const moved=await ops.execute(plan.id);assert.equal(moved.movedCount,1);assert.equal(await fs.promises.readFile(path.join(dest,'special.mp4')+':volde-test-stream','utf8'),'extra data');
 await fs.promises.writeFile(source,'personal');
 const {execFile}=require('child_process');const run=(args)=>new Promise((resolve,reject)=>execFile('attrib.exe',args,{windowsHide:true},e=>e?reject(e):resolve()));
 await run(['+s',source]);try{await assert.rejects(verifyWindowsSafety(source,'delete'),/sistem özniteliği/);}finally{await run(['-s',source]);}
 assert.equal(await fs.promises.readFile(source,'utf8'),'personal');
});
test('move stops before touching files when durable audit intent cannot be written',async t=>{
 const dir=await fixture(t),dest=path.join(dir,'target'),source=path.join(dir,'proof.mp4');await fs.promises.mkdir(dest);await fs.promises.writeFile(source,'retain');
 const ops=new FileOperations({journalPath:path.join(dir,'moves.jsonl'),audit:{begin:async()=>{throw new Error('audit disk unavailable');}}});
 const plan=await ops.plan([source],dest),result=await ops.execute(plan.id);assert.equal(result.movedCount,0);assert.equal(result.failedCount,1);assert.equal(await fs.promises.readFile(source,'utf8'),'retain');
 await assert.rejects(fs.promises.stat(path.join(dest,'proof.mp4')),{code:'ENOENT'});
});
