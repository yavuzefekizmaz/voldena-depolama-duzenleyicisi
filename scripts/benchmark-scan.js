'use strict';
// Explicit read-only benchmark; output is excluded from publication.
const fs=require('fs'),path=require('path');
const Scanner=require('../src/scanner-client');
const target=process.argv[2],output=process.argv[3];
(async()=>{const started=Date.now(),scanner=new Scanner();let firstDataMs=null,updates=0,peakRows=0;
try{const result=await scanner.startScan(target,data=>{updates++;if(data.filesCount>0&&firstDataMs===null)firstDataMs=Date.now()-started;peakRows=Math.max(peakRows,data.rootChildren?.length||0);});const queryStart=Date.now();const winsxs=await scanner.getChildrenOf(path.join(target,'Windows','WinSxS'),{limit:100});const queryMs=Date.now()-queryStart;const summary={...result,firstDataMs,updates,peakRootRows:peakRows,winSxSQuery:{total:winsxs.total,returned:winsxs.items.length,hasMore:winsxs.hasMore,durationMs:queryMs}};await fs.promises.writeFile(output,JSON.stringify(summary,null,2));}finally{await scanner.dispose();}})().catch(error=>{fs.writeFileSync(output,JSON.stringify({error:error.stack}));process.exitCode=1;});
