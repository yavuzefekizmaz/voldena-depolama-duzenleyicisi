'use strict';
const fs=require('fs');const path=require('path');const {spawnSync}=require('child_process');
const queue=['main.js','preload.js','src','scripts','tests'];let count=0,failed=false;
while(queue.length){const target=queue.pop();if(!fs.existsSync(target))continue;const stat=fs.statSync(target);if(stat.isDirectory()){for(const name of fs.readdirSync(target))queue.push(path.join(target,name));}else if(target.endsWith('.js')){const result=spawnSync(process.execPath,['--check',target],{encoding:'utf8'});if(result.status!==0){process.stderr.write(result.stderr);failed=true;}count++;}}
console.log(count+' JavaScript dosyasının sözdizimi kontrol edildi.');process.exitCode=failed?1:0;
