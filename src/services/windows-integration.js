'use strict';
const fs=require('fs');
const path=require('path');
const {execFile}=require('child_process');
const TASK_NAME='VoldenaStorageStartup';
const run=(exe,args)=>new Promise((resolve,reject)=>execFile(exe,args,{windowsHide:true,timeout:15000,maxBuffer:1024*1024},(error,stdout,stderr)=>error?reject(new Error((stderr||stdout||error.message).trim())):resolve(stdout)));
const xml=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));

async function applyWindowsIntegration(app,shell,settings,previous={}) {
  if(process.platform!=='win32')return;
  if(!app.isPackaged) {
    if(settings.launchAtLogin||settings.desktopShortcut!==previous.desktopShortcut||settings.startMenuShortcut!==previous.startMenuShortcut)throw new Error('Başlangıç ve kısayol ayarları kurulu sürümde kullanılabilir.');
    return;
  }
  if(process.env.PORTABLE_EXECUTABLE_FILE) {
    if(settings.launchAtLogin||settings.desktopShortcut!==previous.desktopShortcut||settings.startMenuShortcut!==previous.startMenuShortcut)throw new Error('Başlangıç ve kısayollar için kurulum sürümünü kullanın.');
    return;
  }
  if(settings.launchAtLogin!==previous.launchAtLogin || settings.startHidden!==previous.startHidden&&settings.launchAtLogin) {
    if(settings.launchAtLogin) {
      const account=(await run('whoami.exe',[])).trim();
      const content='<?xml version="1.0" encoding="UTF-16"?>'+
        '<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><Triggers><LogonTrigger><Enabled>true</Enabled><UserId>'+xml(account)+'</UserId></LogonTrigger></Triggers>'+
        '<Principals><Principal id="Author"><UserId>'+xml(account)+'</UserId><LogonType>InteractiveToken</LogonType><RunLevel>HighestAvailable</RunLevel></Principal></Principals>'+
        '<Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><ExecutionTimeLimit>PT0S</ExecutionTimeLimit></Settings>'+
        '<Actions Context="Author"><Exec><Command>'+xml(process.execPath)+'</Command><Arguments>'+(settings.startHidden?'--background':'--startup')+'</Arguments><WorkingDirectory>'+xml(path.dirname(process.execPath))+'</WorkingDirectory></Exec></Actions></Task>';
      const taskFile=path.join(app.getPath('userData'),'startup-task.xml');
      await fs.promises.mkdir(path.dirname(taskFile),{recursive:true});
      await fs.promises.writeFile(taskFile,'\ufeff'+content,'utf16le');
      try {await run('schtasks.exe',['/Create','/TN',TASK_NAME,'/XML',taskFile,'/F']);}
      finally {await fs.promises.unlink(taskFile).catch(()=>{});}
    } else {
      try {await run('schtasks.exe',['/Query','/TN',TASK_NAME]);}
      catch { /* absent means already disabled */ return applyShortcuts(app,shell,settings); }
      await run('schtasks.exe',['/Delete','/TN',TASK_NAME,'/F']);
    }
  }
  return applyShortcuts(app,shell,settings);
}
function applyShortcuts(app,shell,settings) {
  for(const [enabled,folder] of [[settings.desktopShortcut,app.getPath('desktop')],[settings.startMenuShortcut,path.join(app.getPath('appData'),'Microsoft','Windows','Start Menu','Programs')]]) {
    const shortcut=path.join(folder,'Voldena Depolama Düzenleyicisi.lnk');
    if(enabled) {
      fs.mkdirSync(folder,{recursive:true});
      if(!shell.writeShortcutLink(shortcut,'create',{target:process.execPath,cwd:path.dirname(process.execPath),description:'Voldena Depolama Düzenleyicisi',icon:process.execPath,iconIndex:0,appUserModelId:'com.voldena.storage'}))throw new Error('Kısayol oluşturulamadı.');
    } else if(fs.existsSync(shortcut))fs.unlinkSync(shortcut);
  }
}
module.exports={applyWindowsIntegration,TASK_NAME};
