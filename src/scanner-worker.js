'use strict';
const {parentPort,workerData}=require('worker_threads');
const scanner=new(require('./scanner'))(workerData||{});
parentPort.on('message',async({id,method,args=[]})=>{try{if(typeof scanner[method]!=='function')throw new Error('Bilinmeyen tarama işlemi.');const result=method==='startScan'?await scanner.startScan(args[0],data=>parentPort.postMessage({event:'progress',data}),args[1]):method==='findDuplicates'?await scanner.findDuplicates(args[0],data=>parentPort.postMessage({event:'analysis-progress',data})):await scanner[method](...args);parentPort.postMessage({id,result});}catch(error){parentPort.postMessage({id,error:error.message});}});
