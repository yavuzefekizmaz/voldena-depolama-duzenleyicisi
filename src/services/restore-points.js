'use strict';
const {execFile}=require('child_process');
function runPowerShell(script){return new Promise((resolve,reject)=>execFile('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:180000,maxBuffer:1024*1024,encoding:'utf8'},(error,stdout)=>{if(error)return reject(error);try{resolve(JSON.parse(stdout.trim().replace(/^\uFEFF/,'')));}catch{reject(new Error('Windows geri yükleme yanıtı okunamadı.'));}}));}
class RestorePoints{
 constructor({run=runPowerShell,log=()=>{}}={}){this.run=run;this.log=log;this.state={status:'idle'};this.pending=null;}
 get(){return {...this.state};}
 create(reason='manual'){
  if(this.pending)return this.pending;
  this.state={status:'creating',message:'Windows geri yükleme noktası oluşturuluyor…'};
  const description='Voldena '+(reason==='startup'?'startup ':'manual ')+new Date().toISOString();
  const script=`[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $ErrorActionPreference='Stop'; try { $before=Get-ComputerRestorePoint -ErrorAction SilentlyContinue | Sort-Object SequenceNumber -Descending | Select-Object -First 1; Checkpoint-Computer -Description '${description}' -RestorePointType MODIFY_SETTINGS -WarningAction SilentlyContinue -ErrorAction Stop; $after=Get-ComputerRestorePoint -ErrorAction Stop | Sort-Object SequenceNumber -Descending | Select-Object -First 1; if($after -and (!$before -or $after.SequenceNumber -ne $before.SequenceNumber)) { @{success=$true;status='created';sequenceNumber=$after.SequenceNumber;description=$after.Description;message='Windows geri yükleme noktası oluşturuldu.'} | ConvertTo-Json -Compress } else { @{success=$false;status='limited';message='Windows yeni nokta oluşturmadı. Günlük oluşturma sınırı veya sistem koruması ayarları nedeniyle mevcut nokta kullanılıyor.'} | ConvertTo-Json -Compress } } catch { @{success=$false;status='unavailable';message=('Windows geri yükleme noktası oluşturulamadı: '+$_.Exception.Message)} | ConvertTo-Json -Compress }`;
  this.pending=this.run(script).then(result=>{if(!result||typeof result.success!=='boolean')throw new Error('Windows geri yükleme yanıtı geçersiz.');this.state={...result,checkedAt:new Date().toISOString()};this.log('Geri yükleme noktası isteği',{reason,...this.state});return this.get();}).catch(error=>{this.state={success:false,status:'error',message:error.message};this.log('Geri yükleme noktası hatası',error);return this.get();}).finally(()=>{this.pending=null;});return this.pending;
 }
}
module.exports=RestorePoints;
