'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULTS = Object.freeze({ theme: 'dark', launchAtLogin: false, startHidden: false,
  desktopShortcut: false, startMenuShortcut: true, autoScan: true, updateRepository: 'yavuzefekizmaz/voldena-depolama-duzenleyicisi', viewMode: 'mix', sidebarCollapsed: false, groupFiles: true, designVersion:2 });

function validateSettings(input, base = DEFAULTS) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Ayarlar geçersiz.');
  const out = { ...base, updateRepository: DEFAULTS.updateRepository };
  for (const key of Object.keys(DEFAULTS)) {
    if (!Object.hasOwn(input, key)) continue;
    if(key==='designVersion'){out[key]=2;continue;}
    if (key === 'theme') {
      if (!['dark', 'burgundy', 'blue', 'green', 'light'].includes(input[key])) throw new Error('Tema geçersiz.');
    } else if (key === 'viewMode') {
      if (!['volde','classic','mix'].includes(input[key])) throw new Error('Görünüm geçersiz.');
    } else if (key === 'updateRepository') {
      continue; // Release source is fixed by the application.
    } else if (typeof input[key] !== 'boolean') throw new Error('Ayar değeri geçersiz: ' + key);
    out[key] = input[key];
  }
  return out;
}

class SettingsStore {
  constructor(directory) { this.file = path.join(directory, 'settings.json'); this.value = { ...DEFAULTS }; }
  async load() {
    try { const saved=JSON.parse(await fs.promises.readFile(this.file,'utf8'));if(saved.designVersion!==2){saved.theme='dark';saved.viewMode='mix';}this.value=validateSettings(saved); }
    catch (error) { if (error.code !== 'ENOENT') this.loadError = 'Önceki ayarlar okunamadı; varsayılan ayarlar kullanılıyor.'; }
    return this.get();
  }
  get() { return { ...this.value }; }
  async save(patch) {
    const next = validateSettings(patch, this.value);
    await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
    const temp = this.file + '.tmp';
    await fs.promises.writeFile(temp, JSON.stringify(next, null, 2), { mode: 0o600 });
    await fs.promises.rename(temp, this.file);
    this.value = next;
    return this.get();
  }
}
module.exports = { SettingsStore, validateSettings, DEFAULTS };
