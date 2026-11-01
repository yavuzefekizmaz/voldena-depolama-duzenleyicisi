'use strict';
const {parentPort,workerData}=require('worker_threads');
const path=require('path');
const Scanner=require('./scanner');
const sessions=new Map();let selected=null,queue=Promise.resolve();
const key=p=>path.resolve(p).replace(/[\\/]+$/,'').toLowerCase();
function session(target){const root=key(target);if(!sessions.has(root))sessions.set(root,{rootPath:path.resolve(target),scanner:new Scanner(workerData||{}),result:null,job:null,progress:null,status:'empty'});return sessions.get(root);}
function choose(target){if(target){const normalized=key(target);const candidates=[...sessions.values()].filter(s=>normalized===key(s.rootPath)||normalized.startsWith(key(s.rootPath)+path.sep)).sort((a,b)=>b.rootPath.length-a.rootPath.length);if(selected&&(normalized===key(selected.rootPath)||normalized.startsWith(key(selected.rootPath)+path.sep)))return selected;if(candidates.length)return candidates[0];}if(!selected)throw new Error('Önce bir sürücü seçin.');return selected;}
parentPort.on('message',async({id,method,args=[]})=>{
 try{
  let result;
  if(method==='selectScan'){selected=session(args[0]);result={status:selected.status,rootPath:selected.rootPath,result:selected.result,progress:selected.progress};}
  else if(method==='startScan'){
   const current=session(args[0]);selected=current;
   if(current.result&&!args[1]?.force){result={...current.result,cached:true};}
   else{
    if(!current.job){current.status='queued';const work=async()=>{current.status='scanning';current.result=null;try{current.result=await current.scanner.startScan(current.rootPath,data=>{current.progress={...data,rootPath:current.rootPath};parentPort.postMessage({event:'progress',data:current.progress});},args[1]);current.status=current.result.cancelled?'partial':'complete';return current.result;}catch(error){current.status='error';throw error;}finally{current.job=null;}};current.job=queue.then(work);queue=current.job.catch(()=>{});}
    result=await current.job;
   }
  }else{
   const target=['getChildrenOf','getNodeInfo','removeNodeFromTree','getSpaceMap'].includes(method)?args[0]:null;
   const current=choose(target),scanner=current.scanner;
   if(typeof scanner[method]!=='function')throw new Error('Bilinmeyen tarama işlemi.');
   result=method==='findDuplicates'?await scanner.findDuplicates(args[0],data=>parentPort.postMessage({event:'analysis-progress',data:{...data,rootPath:current.rootPath}})):await scanner[method](...args);
  }
  parentPort.postMessage({id,result});
 }catch(error){parentPort.postMessage({id,error:error.message});}
});
