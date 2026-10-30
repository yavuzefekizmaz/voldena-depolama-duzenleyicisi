'use strict';
(() => {
 const general=document.getElementById('settings-general');if(!general)return;
 const card=document.createElement('div');card.className='settings-card';
 const heading=document.createElement('h3');heading.textContent='Windows geri yükleme';
 const button=document.createElement('button');button.id='btnCreateRestorePoint';button.className='button';button.textContent='Geri yükleme noktası oluştur';
 const status=document.createElement('p');status.className='settings-hint';status.setAttribute('aria-live','polite');status.textContent='Sistem dosyaları ve Windows ayarları için geri yükleme noktası. Kişisel dosya yedeği değildir.';
 card.append(heading,button,status);general.append(card);
 button.onclick=async()=>{button.disabled=true;status.textContent='Windows geri yükleme noktası oluşturuluyor…';try{const result=await window.api.createRestorePoint();status.textContent=result.message||result.error||'İstek tamamlandı.';}catch(error){status.textContent=error.message;}finally{button.disabled=false;}};
})();
