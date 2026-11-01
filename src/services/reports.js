'use strict';
function cell(value){let text=String(value??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
function reportCSV(rows){return [['Ad','Konum','Tür','Boyut (bayt)','Ayrılmış alan (bayt)','Dosyalar','Klasörler','Son değişiklik','Açıklama'],...rows.map(r=>[r.name||r.title,r.path||r.installLocation||'',r.category||r.kind||(r.isDir?'Klasör':'Dosya'),r.logicalSize??r.totalBytes??r.estimatedSize??r.size,r.allocatedSize??r.allocatedBytes??r.size,r.filesCount??r.totalFiles,r.foldersCount,r.mtime||'',r.description||r.advice||''])].map(row=>row.map(cell).join(';')).join('\r\n');}
module.exports={reportCSV};
