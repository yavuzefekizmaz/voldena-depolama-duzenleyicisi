'use strict';
const fs=require('fs');
const {execFile}=require('child_process');
const {formatBytes}=require('./formatters');
let pending=null;
function isCloudVolume(disk){
 const label=String(disk.VolumeName||'')+' '+String(disk.ProviderName||'');
 return /google\s*drive|googledrivefs|drivefs|pcloud|dropbox/i.test(label)||(!disk.IsPhysical&&disk.FileSystem==='FAT32'&&/@[^\s]+\./.test(label));
}
function queryDisks(){
 const script=`[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); $physical=@(Get-CimInstance Win32_LogicalDiskToPartition -ErrorAction SilentlyContinue | ForEach-Object {$_.Dependent.DeviceID}); @(Get-CimInstance Win32_LogicalDisk -ErrorAction Stop | Select-Object DeviceID,VolumeName,Size,FreeSpace,FileSystem,DriveType,ProviderName,@{Name='IsPhysical';Expression={$physical -contains $_.DeviceID}}) | ConvertTo-Json -Compress`;
 return new Promise((resolve,reject)=>execFile('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:12000,maxBuffer:1024*1024,encoding:'utf8'},(error,stdout)=>{if(error)return reject(error);try{const data=JSON.parse(stdout.replace(/^\uFEFF/,''));resolve(Array.isArray(data)?data:[data]);}catch(error){reject(error);}}));
}
function present(disk){
 const deviceId=String(disk.DeviceID).toUpperCase(),letter=deviceId[0],total=Number(disk.Size)||0,free=Number(disk.FreeSpace)||0,used=Math.max(0,total-free),isSystem=deviceId===(process.env.SystemDrive||'C:').toUpperCase(),isCloudDrive=isCloudVolume(disk);
 return {letter,path:deviceId+'\\',deviceId,volumeName:disk.VolumeName||(isSystem?'Sistem Diski':`Yerel Disk (${deviceId})`),total,free,used,usedPercent:total?Math.min(100,Math.round(used/total*100)):0,fileSystem:disk.FileSystem||'Bilinmiyor',driveType:Number(disk.DriveType)||0,isSystem,isCloudDrive,isPhysical:!!disk.IsPhysical,providerName:disk.ProviderName||'',formattedTotal:formatBytes(total),formattedFree:formatBytes(free),formattedUsed:formatBytes(used)};
}
async function getDrives(){
 if(pending)return pending;
 pending=(async()=>{try{return(await queryDisks()).filter(d=>d&&/^[A-Z]:$/i.test(d.DeviceID)).map(present);}catch{
  // Keep disk discovery asynchronous even when Windows management is unavailable.
  const drives=[];for(const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'){const root=letter+':\\';try{const s=await fs.promises.statfs(root);drives.push(present({DeviceID:letter+':',Size:s.blocks*s.bsize,FreeSpace:s.bavail*s.bsize}));}catch{}}
  return drives;
 }})().finally(()=>{pending=null;});return pending;
}
module.exports={getDrives,isCloudVolume,present};
