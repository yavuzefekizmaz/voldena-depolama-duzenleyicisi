'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {isCloudVolume,present}=require('../src/utils/disk-info');
test('cloud mounts are identified without hiding physical FAT32 disks',()=>{
 assert.equal(isCloudVolume({VolumeName:'user@example.com - ...',FileSystem:'FAT32',IsPhysical:false}),true);
 assert.equal(isCloudVolume({VolumeName:'Google Drive',FileSystem:'FAT32',IsPhysical:false}),true);
 assert.equal(isCloudVolume({VolumeName:'Camera backup',FileSystem:'FAT32',IsPhysical:true}),false);
});
test('drive presentation keeps byte totals, availability, usage and system identity',()=>{
 const disk=present({DeviceID:process.env.SystemDrive||'C:',Size:1000,FreeSpace:200,FileSystem:'NTFS',DriveType:3,IsPhysical:true});
 assert.equal(disk.total,1000);assert.equal(disk.free,200);assert.equal(disk.usedPercent,80);assert.equal(disk.isSystem,true);assert.equal(disk.isCloudDrive,false);
});
