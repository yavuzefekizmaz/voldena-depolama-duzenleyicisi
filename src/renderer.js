'use strict';

// Render only bounded pages. The scanner and filesystem work run outside this renderer.
const $ = (id) => document.getElementById(id);
const PAGE_SIZE = 100;
const MAX_TREE_ROWS = 1200;
const DEFAULT_MIN_SIZE = 500 * 1024 * 1024;
const state = {
  drives: [], settings: { theme: 'burgundy', autoScan: true, viewMode: 'volde', groupFiles: false },
  currentTarget: 'C:\\', treePath: 'C:\\', tab: 'tree', isScanning: false, isPaused: false,
  scanGeneration: 0, scanStats: null, scanStarted: 0, scanTimer: null, lastTreePaint: 0,
  treeCache: new Map(), expanded: new Set(), fileGroups: new Set(), treeSearch: '', treeSearchPage: null,
  treeSort: { sortBy: 'size', sortOrder: 'desc' }, treeRequests: new Set(), treeSearchToken: 0,
  large: { minSize: DEFAULT_MIN_SIZE, category: 'all', search: '', offset: 0, limit: PAGE_SIZE, sortBy: 'size', sortOrder: 'desc' },
  largePage: { items: [], total: 0, hasMore: false }, largeRequest: 0, selected: new Map(),
  cleanup: null, selectedCleanup: new Set(), cleanupBusy: false, recommendations: [], programs: [],
  history: { offset: 0, limit: 50, search: '' }, historyPage: null, historyRequest: 0,
  modalBusy: false, modalContext: null, moveId: null, autoStarted: false, saveQueue: Promise.resolve(),
  analysis: { section: 'map', mapPath: null, mapItems: [], duplicateResult: null, duplicateLimit: 20, selected: new Set(), busy: false, request: 0 }
};

function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function bytes(value, digits = 2) {
  const n = Number(value); if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']; const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toLocaleString('tr-TR', { maximumFractionDigits: digits })} ${units[i]}`;
}
function number(value) { return Number(value || 0).toLocaleString('tr-TR'); }
function date(value, compact = false) {
  if (!value) return '—'; const d = new Date(value); if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString('tr-TR', compact ? { dateStyle: 'short' } : { dateStyle: 'short', timeStyle: 'short' });
}
function elapsed(ms) { const t = Math.max(0, Math.floor(Number(ms || 0) / 1000)); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; }
function key(p) { return String(p || '').replace(/\\+$/, '').toLowerCase(); }
function base(p) { return String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p; }
function page(result) { return Array.isArray(result) ? { items: result, total: result.length, hasMore: false } : { items: result?.items || [], total: result?.total || 0, hasMore: !!result?.hasMore, ...result }; }
function debounce(fn, delay = 220) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; }
function toast(message, type = '') { const el = document.createElement('div'); el.className = `toast ${type}`; el.textContent = String(message); $('toastContainer').append(el); setTimeout(() => el.remove(), type === 'error' ? 9000 : 5500); }
function errorMessage(error) { return error?.message || String(error || 'İşlem tamamlanamadı.'); }
async function call(name, ...args) { if (typeof window.api?.[name] !== 'function') throw new Error('Bu özellik bu sürümde kullanılamıyor.'); const result = await window.api[name](...args); if (result?.error && result.success !== true) throw new Error(result.error); return result; }
function busy(button, value, label) { if (!button) return; button.disabled = value; if (label) button.textContent = label; }
function empty(title, message, symbol = '▤', colspan = 5) { return `<tr class="empty-row"><td colspan="${colspan}"><div class="empty-state"><span class="empty-symbol">${symbol}</span><h3>${esc(title)}</h3><p>${esc(message)}</p></div></td></tr>`; }
function info(item = {}) {
  const c = item.classification || item.policy || {};
  return { category: item.category || c.category || (item.isDir ? 'Klasör' : 'Diğer'), risk: item.risk || c.risk || 'unknown',
    riskLabel: item.riskLabel || c.riskLabel || item.label || c.label || 'Önce incele',
    description: item.description || c.description || (item.isDir ? 'Bu klasörün içeriğini genişleterek inceleyebilirsin.' : 'Bu dosyanın kullanım amacı kesin belirlenemedi. Konumunu ve bağlı olduğu uygulamayı kontrol et.'),
    advice: item.advice || c.advice || '', canDelete: (item.canDelete ?? c.canDelete) === true,
    canMove: (item.canMove ?? c.canMove) === true, icon: item.icon || c.icon || '' };
}
function svgIcon(name) {
  const shapes = {
    drive: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 14h20M6 17h.01M10 17h.01M6 8h12"/>',
    folder: '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M3 8h18"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    video: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m10 8 6 4-6 4Z" fill="currentColor" stroke="none"/>',
    image: '<rect x="2" y="3" width="20" height="18" rx="3"/><circle cx="8" cy="8" r="1.7"/><path d="m3 17 5-5 4 4 4-5 5 6"/>',
    audio: '<path d="M9 18V5l12-3v13M9 8l12-3"/><ellipse cx="5.5" cy="18" rx="3.5" ry="3"/><ellipse cx="17.5" cy="15" rx="3.5" ry="3"/>',
    archive: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M10 2v3h4v3h-4v3h4v3h-4v4h4v-4"/>',
    document: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 12h8M8 16h8M8 19h5"/>',
    system: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z"/><path d="M12 7v6m0 3h.01"/>',
    apps: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'
  };
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name] || shapes.file}</svg>`;
}
function icon(item) {
  const c = info(item); const ext = String(item.extension || base(item.path || item.name).split('.').pop() || '').replace('.', '').toLowerCase();
  const native = item.path ? `data-native-icon-path="${esc(item.path)}"` : '';
  if (item.isDir) return `<span class="file-icon folder" aria-hidden="true" ${native}>${svgIcon('folder')}</span>`;
  let cls = '', label = ext.length <= 5 && ext !== base(item.path || item.name) ? ext.toUpperCase() : 'FILE';
  if (/video|film/i.test(c.category)) { cls = 'video'; label = '▶'; }
  else if (/görsel|foto|image/i.test(c.category)) { cls = 'image'; label = '▧'; }
  else if (/arşiv|archive|imaj/i.test(c.category)) { cls = 'archive'; label = ext.toUpperCase().slice(0, 4) || 'ZIP'; }
  else if (/ses|müzik|audio/i.test(c.category)) { cls = 'audio'; label = '♫'; }
  else if (/belge|document/i.test(c.category)) cls = 'document';
  else if (c.risk === 'protected') { cls = 'system'; label = '◆'; }
  const kind = cls === 'image' || cls === 'video' ? cls : '';
  return `<span class="file-icon ${cls}" aria-hidden="true" ${native} ${kind && c.risk === 'personal' ? `data-thumbnail-path="${esc(item.path)}"` : ''}>${svgIcon(cls || 'file')}</span>`;
}
const nativeIconCache = new Map(), nativeIconPending = new Map(), nativeIconObserved = new Set(), nativeIconQueue = [];
let nativeIconActive = 0;
function applyNativeIcon(element, dataUrl) {
  if (!element.isConnected || element.dataset.mediaThumbnail === 'true') return;
  const img = document.createElement('img'); img.src = dataUrl; img.alt = ''; img.draggable = false;
  element.replaceChildren(img); element.classList.add('native-shell-icon');
}
function rememberIcon(target, dataUrl) {
  nativeIconCache.delete(target); nativeIconCache.set(target, dataUrl);
  while (nativeIconCache.size > 256) nativeIconCache.delete(nativeIconCache.keys().next().value);
}
const nativeIconObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const el = entry.target, target = el.dataset.nativeIconPath;
    nativeIconObserver.unobserve(el); nativeIconObserved.delete(el);
    if (nativeIconCache.has(target)) { const value = nativeIconCache.get(target); rememberIcon(target, value); applyNativeIcon(el, value); continue; }
    if (nativeIconPending.has(target)) nativeIconPending.get(target).push(el);
    else { nativeIconPending.set(target, [el]); nativeIconQueue.push(target); }
  }
  pumpNativeIcons();
});
function scheduleNativeIcons() {
  if (!window.api?.getFileIcon) return;
  for (const el of nativeIconObserved) if (!el.isConnected) { nativeIconObserver.unobserve(el); nativeIconObserved.delete(el); }
  document.querySelectorAll('[data-native-icon-path]:not([data-native-observed])').forEach(el => { el.dataset.nativeObserved = 'true'; nativeIconObserved.add(el); nativeIconObserver.observe(el); });
}
function pumpNativeIcons() {
  while (nativeIconActive < 2 && nativeIconQueue.length) {
    const target = nativeIconQueue.shift(), elements = nativeIconPending.get(target) || [];
    if (!elements.some(el => el.isConnected)) { nativeIconPending.delete(target); continue; }
    nativeIconActive++;
    call('getFileIcon', target, { size: 'normal' }).then(result => {
      const value = result?.dataUrl;
      if (typeof value !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/i.test(value) || value.length > 2000000) return;
      rememberIcon(target, value); (nativeIconPending.get(target) || []).forEach(el => applyNativeIcon(el, value));
    }).catch(() => {}).finally(() => { nativeIconActive--; nativeIconPending.delete(target); pumpNativeIcons(); });
  }
}
const thumbnailCache = new Map(), thumbnailQueued = new Set(), thumbnailVisible = new WeakMap(), thumbnailQueue = [], thumbnailObserved = new Set();
let thumbnailActive = 0, thumbnailScheduled = false;
function applyThumbnail(element, dataUrl) { if (!dataUrl || !element.isConnected) return; const img = document.createElement('img'); img.src = dataUrl; img.alt = ''; img.draggable = false; element.replaceChildren(img); element.dataset.mediaThumbnail = 'true'; element.classList.add('has-thumbnail'); }
const thumbnailObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    thumbnailVisible.set(entry.target, entry.isIntersecting); if (!entry.isIntersecting) continue;
    const p = entry.target.dataset.thumbnailPath;
    if (thumbnailCache.has(p)) { applyThumbnail(entry.target, thumbnailCache.get(p)); continue; }
    if (!thumbnailQueued.has(p)) { thumbnailQueued.add(p); thumbnailQueue.push({ element: entry.target, path: p }); }
  }
  pumpThumbnails();
});
function scheduleThumbnails() { scheduleNativeIcons(); if (thumbnailScheduled || !window.api?.getThumbnail) return; thumbnailScheduled = true; requestAnimationFrame(() => { thumbnailScheduled = false; for (const old of thumbnailObserved) if (!old.isConnected) { thumbnailObserver.unobserve(old); thumbnailObserved.delete(old); } document.querySelectorAll('[data-thumbnail-path]:not([data-observed])').forEach(el => { el.dataset.observed = 'true'; thumbnailObserved.add(el); thumbnailObserver.observe(el); }); }); }
function pumpThumbnails() {
  while (thumbnailActive < 2 && thumbnailQueue.length) {
    const entry = thumbnailQueue.shift(); if (!entry.element.isConnected || !thumbnailVisible.get(entry.element)) { thumbnailQueued.delete(entry.path); continue; }
    thumbnailActive++;
    call('getThumbnail', entry.path).then(result => {
      const data = result?.dataUrl; if (typeof data !== 'string' || !/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(data) || data.length > 2000000) return;
      thumbnailCache.set(entry.path, data); while (thumbnailCache.size > 200) thumbnailCache.delete(thumbnailCache.keys().next().value);
      document.querySelectorAll('[data-thumbnail-path]').forEach(el => { if (el.dataset.thumbnailPath === entry.path) applyThumbnail(el, data); });
    }).catch(() => {}).finally(() => { thumbnailActive--; thumbnailQueued.delete(entry.path); pumpThumbnails(); });
  }
}
function riskTag(item) { const c = info(item); return `<span class="risk-label ${esc(c.risk)}" title="${esc(c.description)}">${esc(c.riskLabel)}</span>`; }
function rowActions(item, canDelete = true) {
  const c = info(item); return `<div class="row-actions"><button class="icon-button" data-action="details" data-path="${esc(item.path)}" title="Ne dosyası? Ayrıntıları gör" aria-label="Dosya ayrıntıları">ⓘ</button><button class="icon-button" data-action="move" data-path="${esc(item.path)}" ${c.canMove ? '' : 'disabled'} title="Başka klasöre veya diske taşı" aria-label="Dosyayı taşı">↗</button>${canDelete ? `<button class="icon-button danger-action" data-action="delete" data-path="${esc(item.path)}" ${c.canDelete ? '' : 'disabled'} title="Silme seçenekleri" aria-label="Dosyayı sil">×</button>` : ''}</div>`;
}
function findItem(p) {
  for (const entry of state.treeCache.values()) { const node = entry.items.find(x => key(x.path) === key(p)); if (node) return node; }
  return state.largePage.items.find(x => key(x.path) === key(p)) || state.recommendations.find(x => key(x.path) === key(p)) || state.analysis.mapItems.find(x => key(x.path) === key(p)) || (state.analysis.duplicateResult?.groups || []).flatMap(g => g.items || []).find(x => key(x.path) === key(p)) || { path: p, name: base(p) };
}

function renderDrives() {
  const localDrives = state.drives.filter(d => !d.isCloudDrive); $('drivesList').style.setProperty('--drive-count', Math.max(1, localDrives.length));
  $('drivesList').innerHTML = localDrives.map(d => `<button class="drive-item ${(key(d.path) === key(state.currentTarget) || key(state.currentTarget).startsWith(key(d.path) + '\\')) ? 'active' : ''}" data-drive="${esc(d.path)}" title="${esc(`${d.letter || ''}: ${d.volumeName || ''} · ${d.isSystem ? 'Sistem diski · ' : ''}${bytes(d.free)} boş / ${bytes(d.total)} · %${d.usedPercent || 0} dolu`)}"><span class="drive-icon" data-native-icon-path="${esc(d.path)}">${svgIcon('drive')}</span><span class="drive-card-content"><span class="drive-item-head"><span class="drive-item-title">${esc(d.letter ? `${d.letter}:` : d.deviceId || d.path)} <span class="drive-volume-name">${esc(d.volumeName || 'Yerel disk')}</span></span><span class="drive-percent">${d.usedPercent || 0}%</span></span><span class="drive-item-footer">${bytes(d.free)} boş / ${bytes(d.total)}</span>${d.isSystem ? '<span class="drive-system-label">Sistem diski</span>' : ''}<span class="drive-meter ${(d.usedPercent || 0) > 90 ? 'danger' : ''}"><i style="width:${Math.min(100, Math.max(0, d.usedPercent || 0))}%"></i></span></span></button>`).join('') || '<p class="muted">Yerel sürücü bulunamadı. Klasör seçebilirsin.</p>';
  $('allDrivesGrid').innerHTML = state.drives.map(d => `<article class="drive-card"><div class="drive-card-heading"><div><h3>${esc(d.letter ? `${d.letter}:` : d.deviceId)} ${esc(d.volumeName || '')}</h3><p>${esc(d.fileSystem || 'Dosya sistemi')} ${d.isSystem ? '· Sistem diski' : ''}${d.isCloudDrive ? '· Bulut bağlantısı' : ''}</p></div><span class="drive-icon" data-native-icon-path="${esc(d.path)}">${svgIcon('drive')}</span></div><div class="capacity-meter ${d.usedPercent > 90 ? 'danger' : ''}"><i style="width:${Math.min(100, Math.max(0, d.usedPercent || 0))}%"></i></div><div class="drive-card-metrics"><div><strong>${bytes(d.used)}</strong>Kullanılan</div><div><strong>${bytes(d.free)}</strong>Boş</div><div><strong>${bytes(d.total)}</strong>Toplam</div></div>${d.isCloudDrive ? '<p class="cloud-volume-note">Windows’un sanal sürücü için bildirdiği alan. Bulut hesabının kotası değildir.</p>' : ''}<button class="button" data-drive="${esc(d.path)}">Bu sürücüyü tara →</button></article>`).join('');
  scheduleNativeIcons();
}
async function loadDrives() { try { state.drives = await call('getDrives'); if (!Array.isArray(state.drives)) state.drives = state.drives.items || []; renderDrives(); } catch (e) { toast(errorMessage(e), 'error'); } }
function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab-content').forEach(x => x.classList.toggle('active', x.id === `tab-${tab}`));
  document.querySelectorAll('.nav-tab').forEach(x => x.classList.toggle('active', x.dataset.tab === tab || tab === 'analysis' && x.dataset.tab === 'tree'));
  if (tab === 'large') loadLarge();
  if (tab === 'cleanups') { renderCleanup(); loadRecommendations(); }
  if (tab === 'programs' && !state.programs.length) loadPrograms();
  if (tab === 'analysis') analysisTab(state.analysis.section);
}

function scanControls() {
  $('btnStartScan').hidden = state.isScanning; $('btnPauseScan').hidden = !state.isScanning; $('btnStopScan').hidden = !state.isScanning;
  $('btnPauseScan').textContent = state.isPaused ? '▶ Sürdür' : 'Ⅱ Duraklat';
  $('scanStatusBadge').classList.toggle('scanning', state.isScanning && !state.isPaused);
  document.querySelector('.scan-panel').classList.toggle('is-scanning', state.isScanning && !state.isPaused);
  $('scanStatusBadge').textContent = state.isScanning ? state.isPaused ? 'DURAKLATILDI' : 'TARANIYOR' : state.scanStats ? 'TARAMA TAMAMLANDI' : 'HAZIR';
}
function progress(data) {
  if (!state.isScanning) return;
  state.scanStats = { ...state.scanStats, ...data };
  $('scanTotalBytes').textContent = bytes(data.totalBytes || data.logicalBytes || 0);
  $('scanFilesCount').textContent = number(data.filesCount); $('scanFoldersCount').textContent = number(data.foldersCount);
  $('scanElapsed').textContent = elapsed(data.elapsedMs || Date.now() - state.scanStarted);
  $('scanCurrentPathText').textContent = data.currentPath || state.currentTarget;
  $('scanCurrentPathText').title = data.currentPath || '';
  const methods = { 'ntfs-mft': 'NTFS hızlı tarama', 'native-enumeration': 'Yerel Windows taraması', 'node-fallback': 'Uyumlu dosya taraması' };
  $('scanMethod').textContent = data.phase === 'indexing' ? `${number(data.indexedRecords)} kayıt okunuyor` : methods[data.engine] || 'Gizli dosyalar dahil taranıyor';
  if (data.phase === 'indexing') { $('scanStatusBadge').textContent = 'DOSYA DİZİNİ HAZIRLANIYOR'; $('scanCurrentPathText').textContent = 'Klasör bilgileri hazırlanıyor · İlk sonuçlar birazdan görünecek.'; }
  else if (data.phase === 'inventory') $('scanStatusBadge').textContent = state.isPaused ? 'DURAKLATILDI' : 'TARANIYOR';
  if (Array.isArray(data.rootChildren) && !state.treeSearch) {
    const old = state.treeCache.get(key(state.currentTarget));
    // Root snapshots are bounded by the worker; preserve pages explicitly loaded by the user.
    if (!old || !old.loadedAdditional) state.treeCache.set(key(state.currentTarget), { items: data.rootChildren, total: data.rootChildrenTotal || data.rootChildren.length, hasMore: !!data.rootChildrenHasMore });
    if (state.tab === 'tree' && Date.now() - state.lastTreePaint > 650) { renderTree(); state.lastTreePaint = Date.now(); }
  }
}
async function startScan(target = state.currentTarget) {
  if (!target) return;
  const generation = ++state.scanGeneration;
  state.currentTarget = target; state.treePath = target; state.isScanning = true; state.isPaused = false;
  state.scanStarted = Date.now(); state.scanStats = null; state.treeCache.clear(); state.expanded.clear(); state.fileGroups.clear(); state.treeSearch = ''; state.treeSearchPage = null;
  state.selected.clear(); state.largeRequest++; state.largePage = { items: [], total: 0, hasMore: false }; state.large.offset = 0; $('treeSearchInput').value = ''; $('scanTargetLabel').textContent = target;
  $('scanCoverage').hidden = true; $('scanTotalBytes').textContent = '0 B'; $('scanFilesCount').textContent = '0'; $('scanFoldersCount').textContent = '0'; $('scanElapsed').textContent = '00:00';
  $('scanCurrentPathText').textContent = 'Tarama hazırlanıyor…'; $('scanMethod').textContent = 'Tarama başlatılıyor';
  scanControls(); renderDrives(); renderTree(); renderLarge();
  clearInterval(state.scanTimer); state.scanTimer = setInterval(() => { if (state.isScanning && !state.isPaused) $('scanElapsed').textContent = elapsed(Date.now() - state.scanStarted); }, 1000);
  try {
    const result = await call('startScan', target, { minLargeFileSize: DEFAULT_MIN_SIZE });
    if (generation !== state.scanGeneration) return;
    state.isScanning = false; state.isPaused = false; clearInterval(state.scanTimer);
    state.scanStats = { ...state.scanStats, ...result.stats }; scanControls();
    const s = state.scanStats || {}; $('scanTotalBytes').textContent = bytes(s.totalBytes || s.logicalBytes || 0);
    $('scanFilesCount').textContent = number(s.filesCount); $('scanFoldersCount').textContent = number(s.foldersCount);
    $('scanElapsed').textContent = elapsed(s.durationMs || s.elapsedMs || Date.now() - state.scanStarted);
    $('scanStatusBadge').textContent = result.canceled || result.cancelled || s.canceled || s.cancelled ? 'TARAMA DURDURULDU' : 'TARAMA TAMAMLANDI';
    $('scanCurrentPathText').textContent = result.canceled || result.cancelled || s.canceled || s.cancelled ? 'Kısmi sonuçlar gösteriliyor.' : 'Sonuçlar hazır. Bir klasörü genişleterek inceleyebilirsin.';
    $('scanMethod').textContent = s.engine === 'ntfs-mft' ? 'NTFS hızlı tarama' : s.engine === 'native-enumeration' ? 'Yerel Windows taraması' : 'Uyumlu dosya taraması';
    renderCoverage(s); state.treeCache.clear(); await fetchChildren(state.treePath); if (generation !== state.scanGeneration) return; renderTree();
    $('badgeLargeFiles').textContent = result.largeFilesCount ? number(result.largeFilesCount) : '';
    if (state.tab === 'large') await loadLarge(); if (state.tab === 'cleanups') await loadRecommendations();
  } catch (e) {
    if (generation !== state.scanGeneration) return; state.isScanning = false; state.isPaused = false; clearInterval(state.scanTimer); scanControls();
    $('scanStatusBadge').textContent = 'TARAMA TAMAMLANAMADI'; $('scanMethod').textContent = 'Sonuçları kontrol et'; toast(errorMessage(e), 'error');
    if (state.treeCache.size) renderTree();
  }
}
function renderCoverage(s) {
  const notes = [];
  if (s.coverageNote) notes.push(s.coverageNote);
  if (s.engineNote) notes.push(s.engineNote);
  if (!s.coverageNote && s.volumeUsedBytes != null) notes.push(`Windows kullanılan alan: ${bytes(s.volumeUsedBytes)}. Bulunan dosya boyutu: ${bytes(s.totalBytes || s.logicalBytes)}.${s.allocatedBytes != null ? ` Ölçülen ayrılmış alan: ${bytes(s.allocatedBytes)}.` : ''}${s.unaccountedBytes > 0 ? ` Açıklanamayan / erişilemeyen fark: ${bytes(s.unaccountedBytes)}.` : ''}`);
  if (s.errorsCount) notes.push(`${number(s.errorsCount)} öğe okunamadı. Sonuç tam sürücü kullanımını temsil etmeyebilir.`);
  if (s.skippedLinks) notes.push(`${number(s.skippedLinks)} bağlantı döngü ve çift sayım için takip edilmedi.`);
  const el = $('scanCoverage'); el.hidden = notes.length === 0; el.textContent = notes.join(' ');
  if (s.errorsCount) { const b = document.createElement('button'); b.className = 'button small'; b.textContent = 'Okunamayan öğeleri incele'; b.onclick = showDiagnostics; el.append(b); }
  if (s.errorsCount && typeof window.api?.restartAsAdmin === 'function') { const b = document.createElement('button'); b.className = 'button small'; b.textContent = 'Yönetici olarak yeniden aç'; b.onclick = () => call('restartAsAdmin').catch(e => toast(errorMessage(e), 'error')); el.append(b); }
}
async function showDiagnostics() {
  let diagnostics = { stats: state.scanStats || {}, errorSamples: state.scanStats?.errorSamples || [] };
  try { if (window.api?.getScanDiagnostics) diagnostics = await call('getScanDiagnostics'); } catch (e) { toast(errorMessage(e), 'error'); }
  const samples = (diagnostics.errorSamples || diagnostics.stats?.errorSamples || []).slice(0, 30);
  const explanations = { 5: 'Erişim izni verilmedi. Windows veya ilgili uygulama bu öğeyi koruyor olabilir.', EACCES: 'Erişim izni verilmedi.', EPERM: 'Bu öğe için yeterli izin yok.', 32: 'Öğe başka bir uygulama tarafından kullanılıyor.', 2: 'Dosya tarama sırasında kaldırılmış veya taşınmış olabilir.', 3: 'Klasör yolu tarama sırasında bulunamadı.', ENOENT: 'Öğe tarama sırasında kaldırılmış veya taşınmış olabilir.', 123: 'Windows bu yolun biçimini kabul etmedi.' };
  openModal('Okunamayan öğeler', 'GERÇEK TARAMA KAPSAMI', `<p class="modal-subtitle">${number(diagnostics.stats?.errorsCount || state.scanStats?.errorsCount)} öğe okunamadı. Aşağıda en fazla 30 örnek gösterilir. Bu öğelerin boyutları eksik olabilir.</p><div class="modal-item-list">${samples.map(x => `<div class="modal-item"><div class="modal-item-info"><strong>${esc(x.path || x.name || 'Konum kaydedilmedi')}</strong><small>${esc(explanations[x.code] || x.message || x.error || 'Windows bu öğeyi okumaya izin vermedi.')} · Kod: ${esc(x.code ?? 'Bilinmiyor')}</small></div></div>`).join('') || '<div class="modal-item">Bu taramada örnek konum kaydı bulunmuyor.</div>'}</div><div class="inline-message">Yönetici izinleri bazı erişim engellerini çözebilir; kilitli ve korunan tüm öğelere erişimi garanti etmez. Dosya sistemi kayıtları, gölge kopyalar ve sistemin yönettiği alanlar dosya toplamıyla sürücü doluluğu arasında fark oluşturabilir. Bu öğeler temizlik önerisi değildir.</div>`, [{ label: 'Kapat', className: 'primary', click: closeModal }]);
}

async function fetchChildren(target, append = false) {
  const k = key(target); if (state.treeRequests.has(k)) return;
  const generation = state.scanGeneration; const old = state.treeCache.get(k); const offset = append ? old?.items.length || 0 : 0;
  state.treeRequests.add(k);
  try {
    const p = page(await call('getChildren', target, { ...state.treeSort, offset, limit: PAGE_SIZE }));
    if (generation !== state.scanGeneration) return;
    state.treeCache.set(k, { ...p, items: append ? [...(old?.items || []), ...p.items] : p.items, loadedAdditional: append });
    if (state.treeCache.size > 80) for (const cached of state.treeCache.keys()) { if (cached !== key(state.currentTarget) && cached !== key(state.treePath) && cached !== k && !state.expanded.has(cached)) { state.treeCache.delete(cached); if (state.treeCache.size <= 80) break; } }
  } catch (e) { toast(errorMessage(e), 'error'); }
  finally { state.treeRequests.delete(k); }
}
function treeHeader() {
  const table = $('treeTable'); const classic = state.settings.viewMode === 'classic';
  table.querySelector('colgroup').innerHTML = classic ? '<col style="width:auto"><col style="width:89px"><col style="width:89px"><col style="width:62px"><col style="width:62px"><col style="width:48px"><col style="width:78px"><col style="width:82px">' : '<col class="tree-name-col"><col class="tree-type-col"><col class="size-col"><col class="tree-share-col"><col class="actions-col">';
  table.querySelector('thead').innerHTML = classic ? '<tr><th><button class="sort-button" data-scope="tree" data-sort="name">Ad ↕</button></th><th class="align-right"><button class="sort-button" data-scope="tree" data-sort="size">Boyut ↓</button></th><th class="align-right">Ayrılmış</th><th class="align-right">Dosyalar</th><th class="align-right">Klasörler</th><th class="align-right">%</th><th>Değiştirilme</th><th class="align-right">İşlemler</th></tr>' : '<tr><th><button class="sort-button" data-scope="tree" data-sort="name">Ad ↕</button></th><th>Açıklama / durum</th><th class="align-right"><button class="sort-button" data-scope="tree" data-sort="size">Boyut ↓</button></th><th>Üst klasörde</th><th class="align-right">İşlemler</th></tr>';
}
function renderBreadcrumb() {
  const root = state.currentTarget; const relative = state.treePath.slice(root.length).split(/[\\/]/).filter(Boolean); let path = root;
  const crumbs = [{ label: root, path }]; for (const name of relative) { path = `${path.replace(/[\\/]$/, '')}\\${name}`; crumbs.push({ label: name, path }); }
  $('treeBreadcrumb').innerHTML = state.treeSearch ? `<span>Arama: ${esc(state.treeSearch)}</span><button data-action="clear-search">Aramayı temizle ×</button>` : crumbs.map((c, i) => `${i ? '<span>›</span>' : ''}<button data-action="focus" data-path="${esc(c.path)}">${esc(c.label)}</button>`).join('');
}
function treeRow(item, depth, group = false) {
  const classic = state.settings.viewMode === 'classic'; const c = info(item); const p = item.path;
  const open = group ? state.fileGroups.has(key(p)) : state.expanded.has(key(p));
  const toggle = group ? `<button class="expand-button" data-action="group" data-path="${esc(p)}" aria-label="Dosya grubunu genişlet">${open ? '▾' : '▸'}</button>` : item.isDir ? `<button class="expand-button" data-action="expand" data-path="${esc(p)}" aria-label="Klasörü genişlet" aria-expanded="${open}">${state.treeRequests.has(key(p)) ? '·' : open ? '▾' : '▸'}</button>` : '<span class="expand-spacer"></span>';
    const name = group ? `<span class="file-group-name">{${number(item.count)} Dosyalar}</span>${item.loadedCount < item.count ? `<span class="group-loaded-count"> · ${number(item.loadedCount)} yüklenmiş</span>` : ''}` : `<span class="node-title"><button class="node-title-button" data-action="${item.isDir ? 'expand' : 'open'}" data-path="${esc(p)}" title="${esc(item.name)}">${esc(item.name)}</button></span>`;
  const percent = Math.min(100, Math.max(0, Number(item.percent || 0)));
  const size = Number(item.size || item.logicalBytes || 0); const allocated = item.allocatedBytes ?? item.allocatedSize;
  const nameCell = `<td><div class="node-name" style="padding-left:${Math.min(depth, 15) * (classic ? 14 : 18)}px" data-node-path="${esc(p)}" ${item.isDir && !group ? `data-folder="${esc(p)}"` : ''}>${toggle}${group ? `<span class="file-icon">${svgIcon('file')}</span>` : icon(item)}<div class="node-name-main">${name}${group ? '' : classic ? `<span class="risk-inline">${c.risk === 'protected' || c.risk === 'caution' || c.risk === 'unknown' ? riskTag(item) : ''}</span>` : `<span class="node-subtitle">${esc(item.isDir ? `${number(item.filesCount)} dosya · ${number(item.foldersCount)} klasör` : c.category)}</span>`}</div></div></td>`;
  const rowTarget = group ? `data-tree-group="${esc(p)}"` : item.isDir ? `data-tree-folder="${esc(p)}"` : `data-tree-file="${esc(p)}"`;
  if (classic) return `<tr ${rowTarget}>${nameCell}<td class="align-right"><span class="size-value">${bytes(size)}</span>${item.partialSize ? '<span class="size-note">Yüklenenler</span>' : ''}</td><td class="align-right"><span class="size-value" title="${item.allocatedKnown === false ? 'Yaklaşık ayrılmış alan' : 'Diskte ayrılan alan'}">${allocated == null ? '—' : `${item.allocatedKnown === false ? '≈ ' : ''}${bytes(allocated)}`}</span></td><td class="classic-number">${number(item.isDir || group ? item.filesCount || item.count : 1)}</td><td class="classic-number">${number(item.foldersCount)}</td><td class="classic-number">${percent.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%</td><td class="classic-date">${date(item.mtime, true)}</td><td>${group ? '' : rowActions(item)}</td></tr>`;
  return `<tr ${rowTarget}>${nameCell}<td class="description-cell"><div class="row-description" title="${esc(c.description)}">${esc(group ? 'Bu klasördeki dosyalar' : c.description)}</div>${group ? '' : riskTag(item)}</td><td class="align-right"><span class="size-value">${bytes(size)}</span>${item.partialSize ? '<span class="size-note">Yüklenenler</span>' : item.isSparse ? '<span class="size-note">Seyrek dosya</span>' : ''}</td><td><div class="share-bar"><i style="width:${percent}%"></i></div><span class="share-label">${percent.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%</span></td><td>${group ? '' : rowActions(item)}</td></tr>`;
}
function renderTree() {
  scheduleThumbnails();
  treeHeader(); renderBreadcrumb(); const colspan = state.settings.viewMode === 'classic' ? 8 : 5;
  let html = '', visible = 0, truncated = false;
  const renderNodes = (target, depth) => {
    const data = state.treeCache.get(key(target)); if (!data) return;
    let nodes = data.items; let files = [];
    if (state.settings.groupFiles && !state.treeSearch) { files = nodes.filter(n => !n.isDir); nodes = nodes.filter(n => n.isDir); }
    for (const item of nodes) {
      if (++visible > MAX_TREE_ROWS) { truncated = true; break; }
      html += treeRow(item, depth); if (item.isDir && state.expanded.has(key(item.path))) {
        if (state.treeCache.has(key(item.path))) renderNodes(item.path, depth + 1);
        else html += `<tr><td colspan="${colspan}" style="padding-left:${35 + depth * 16}px"><span class="loading-inline">Klasör yükleniyor…</span></td></tr>`;
      }
    }
    if (files.length && !truncated) {
      const totalFiles = data.directFilesCount ?? files.length;
      const group = { path: target, name: 'Dosyalar', count: totalFiles, loadedCount: files.length, filesCount: totalFiles,
        size: data.directFilesBytes ?? files.reduce((s, f) => s + (f.size || 0), 0), partialSize: data.directFilesBytes == null && totalFiles > files.length,
        allocatedKnown: files.every(f => f.allocatedKnown === true),
        allocatedBytes: data.directFilesAllocatedBytes ?? (files.every(f => (f.allocatedBytes ?? f.allocatedSize) != null) ? files.reduce((s, f) => s + (f.allocatedBytes ?? f.allocatedSize), 0) : null) };
      const parentTotal = key(target) === key(state.currentTarget) ? state.scanStats?.totalBytes : findItem(target).size;
      group.percent = parentTotal ? Math.min(100, 100 * group.size / parentTotal) : files.reduce((sum, f) => sum + (f.percent || 0), 0);
      html += treeRow(group, depth, true); visible++;
      if (state.fileGroups.has(key(target))) for (const item of files) { if (++visible > MAX_TREE_ROWS) { truncated = true; break; } html += treeRow(item, depth + 1); }
    }
    if (data.hasMore && !truncated) html += `<tr class="load-more-row"><td colspan="${colspan}"><button class="load-more-button" style="margin-left:${20 + depth * 16}px" data-action="more-tree" data-path="${esc(target)}">＋ Sonraki ${PAGE_SIZE} öğeyi yükle · ${number(data.items.length)} / ${number(data.total)}</button></td></tr>`;
  };
  if (state.treeSearch && state.treeSearchPage) {
    for (const item of state.treeSearchPage.items) { html += treeRow(item, 0); visible++; }
    if (state.treeSearchPage.hasMore) html += `<tr class="load-more-row"><td colspan="${colspan}"><button class="load-more-button" data-action="more-search">＋ Sonraki sonuçları yükle</button></td></tr>`;
  } else renderNodes(state.treePath, 0);
  $('treeTableBody').innerHTML = html || empty(state.isScanning ? 'Tarama sürüyor' : state.treeSearch ? 'Sonuç bulunamadı' : 'Bu klasörde gösterilecek öğe yok', state.isScanning ? 'İlk klasör sonuçları geldikçe ağaç burada güncellenir.' : state.scanStats ? 'Başka bir klasör seçebilir veya aramayı değiştirebilirsin.' : 'Sistem diski pencere hazır olduğunda taranır. Bir klasör de seçebilirsin.', '▤', colspan);
  $('treeCountLabel').textContent = `${number(Math.min(visible, MAX_TREE_ROWS))} satır${state.isScanning ? ' · Canlı sonuçlar' : ''}${truncated ? ' · Daha ayrıntılı incelemek için klasöre çift tıkla.' : ''}`;
}
async function expandNode(p) {
  if (state.treeSearch) { await focusFolder(p); return; }
  const k = key(p); if (state.expanded.has(k)) { state.expanded.delete(k); renderTree(); return; }
  state.expanded.add(k); renderTree(); if (!state.treeCache.has(k)) await fetchChildren(p); renderTree();
}
async function focusFolder(p) { state.treePath = p; state.treeSearch = ''; state.treeSearchPage = null; $('treeSearchInput').value = ''; if (!state.treeCache.has(key(p))) await fetchChildren(p); renderTree(); }
async function searchTree(append = false) {
  const query = $('treeSearchInput').value.trim(); state.treeSearch = query; const token = ++state.treeSearchToken;
  if (!query) { state.treeSearchPage = null; renderTree(); return; }
  try { const old = state.treeSearchPage; const result = page(await call('searchTree', query, { offset: append ? old?.items.length || 0 : 0, limit: PAGE_SIZE, ...state.treeSort })); if (token !== state.treeSearchToken) return; state.treeSearchPage = { ...result, items: append ? [...(old?.items || []), ...result.items] : result.items }; renderTree(); }
  catch (e) { toast(errorMessage(e), 'error'); }
}

async function loadLarge() {
  const token = ++state.largeRequest;
  try {
    const data = page(await call('getLargeFiles', state.large)); if (token !== state.largeRequest) return;
    // The backend is authoritative; the UI also refuses protected and uncertain entries.
    state.largePage = { ...data, items: data.items.filter(x => !['protected', 'caution', 'unknown'].includes(info(x).risk)) };
    renderLarge();
  } catch (e) { toast(errorMessage(e), 'error'); }
}
function renderLarge() {
  scheduleThumbnails();
  const data = state.largePage;
  $('largeFilesTableBody').innerHTML = data.items.map(item => `<tr><td><input type="checkbox" data-select-path="${esc(item.path)}" ${state.selected.has(item.path) ? 'checked' : ''} aria-label="${esc(item.name)} seç"></td><td><div class="node-name">${icon(item)}<div class="node-name-main"><div class="node-title"><button class="node-title-button" data-action="open" data-path="${esc(item.path)}" title="${esc(item.name)} · Aç">${esc(item.name)}</button></div><span class="node-subtitle">${esc(info(item).advice || info(item).description)}</span></div></div></td><td><span class="category-label"><i class="category-dot"></i>${esc(info(item).category)}</span></td><td class="align-right"><span class="size-value">${bytes(item.size)}</span>${item.allocatedBytes != null && item.allocatedBytes < item.size * .9 ? `<span class="size-note">Diskte ${bytes(item.allocatedBytes)}</span>` : ''}</td><td>${rowActions(item)}</td></tr>`).join('') || empty(state.isScanning ? 'Tarama devam ediyor' : 'Bu filtrede büyük dosya yok', state.isScanning ? 'Büyük kişisel dosyalar tarama tamamlandığında listelenir.' : 'En küçük boyutu veya dosya türünü değiştirebilirsin. Korunan dosyalar bu listede gösterilmez.', '▣');
  $('largeCountLabel').textContent = `${number(data.total)} dosya${data.total ? ` · ${number(state.large.offset + 1)}–${number(Math.min(state.large.offset + data.items.length, data.total))} gösteriliyor` : ''}`;
  $('largePageLabel').textContent = `${Math.floor(state.large.offset / PAGE_SIZE) + 1} / ${Math.max(1, Math.ceil(data.total / PAGE_SIZE))}`;
  $('btnLargePrev').disabled = state.large.offset === 0; $('btnLargeNext').disabled = !data.hasMore; renderSelection();
}
function renderSelection() {
  const items = [...state.selected.values()]; const size = items.reduce((s, f) => s + (f.size || 0), 0);
  $('largeSelectionCounter').textContent = `${number(items.length)} dosya seçildi${items.length ? ` · ${bytes(size)}` : ''}`;
  $('btnDeleteSelectedLarge').disabled = !items.length || items.some(x => !info(x).canDelete);
  $('btnMoveSelectedLarge').disabled = !items.length || items.some(x => !info(x).canMove);
  $('checkAllLargeFiles').checked = state.largePage.items.length > 0 && state.largePage.items.every(x => state.selected.has(x.path));
  $('checkAllLargeFiles').indeterminate = state.largePage.items.some(x => state.selected.has(x.path)) && !$('checkAllLargeFiles').checked;
}

async function loadCleanup() {
  if (state.cleanupBusy) return; state.cleanupBusy = true; $('btnRescanCleanups').disabled = true; $('cleanProgress').hidden = false; $('cleanProgress').textContent = 'Temizleme adayları inceleniyor…';
  try { state.cleanup = await call('scanCleanups'); state.selectedCleanup.clear(); renderCleanup(); }
  catch (e) { toast(errorMessage(e), 'error'); }
  finally { state.cleanupBusy = false; $('btnRescanCleanups').disabled = false; $('cleanProgress').hidden = true; loadRecommendations(); }
}
function categories() { return state.cleanup?.categories || []; }
function renderCleanup() {
  if (!state.cleanup) return;
  const s = state.cleanup.summary || {}; $('cleanTotalReclaimable').textContent = bytes(s.grandTotalBytes); $('cleanSafeReclaimable').textContent = bytes(s.safeTotalBytes); $('cleanTotalFilesCount').textContent = `${number(s.grandTotalFiles)} aday dosya`;
  $('btnQuickClean').disabled = !categories().some(c => c.autoClean && c.totalBytes > 0);
  $('cleanupGrid').innerHTML = categories().filter(c => c.hasItems || c.totalBytes > 0 || c.action).map(c => `<article class="cleanup-card ${state.selectedCleanup.has(c.id) ? 'selected' : ''}"><div class="cleanup-card-top">${c.action || c.group === 'review' ? '<span class="file-icon">ⓘ</span>' : `<input type="checkbox" data-cleanup-id="${esc(c.id)}" ${state.selectedCleanup.has(c.id) ? 'checked' : ''} aria-label="${esc(c.title)} seç">`}<h3>${esc(c.title)}</h3><span class="risk-label ${c.autoClean ? 'cache' : 'caution'}">${esc(c.autoClean ? 'Düşük riskli' : c.safetyBadge || 'İncele')}</span></div><p>${esc(c.description)}</p><div class="cleanup-card-footer"><span class="cleanup-card-size">${bytes(c.totalBytes)}<small>${number(c.totalFiles)} dosya</small></span><button class="button small" data-action="cleanup-details" data-category="${esc(c.id)}">Ayrıntılar →</button></div></article>`).join('') || '<div class="empty-state"><span class="empty-symbol">✦</span><h3>Temizleme adayı bulunmadı</h3><p>Diğer önerilerde büyük kişisel dosyalarını inceleyebilirsin.</p></div>';
  const selectedBytes = categories().filter(c => state.selectedCleanup.has(c.id)).reduce((sum, c) => sum + (c.totalBytes || 0), 0); $('selectedCleanSum').textContent = `Seçilen: ${bytes(selectedBytes)}`; $('btnCleanSelected').disabled = !state.selectedCleanup.size;
}
async function loadRecommendations() {
  const generation = state.scanGeneration;
  try {
    const response = window.api?.getRecommendations ? await call('getRecommendations') : await call('getLargeFiles', { minSize: DEFAULT_MIN_SIZE, offset: 0, limit: 12 });
    if (generation !== state.scanGeneration) return; state.recommendations = page(response).items; scheduleThumbnails();
    $('recommendationsList').innerHTML = state.recommendations.slice(0, 30).map(item => `<article class="recommendation-card">${icon(item)}<div class="recommendation-content"><h3><button class="node-title-button" data-action="open" data-path="${esc(item.path)}">${esc(item.title || item.name)}</button></h3><p>${esc(item.advice || info(item).advice || 'Gerekiyorsa başka diske taşı veya bir kopyasını bulutta yedekle. Yedeği doğrulamadan yerel dosyayı silme.')}</p></div><span class="recommendation-size">${bytes(item.size)}</span><div class="recommendation-buttons"><button class="button small" data-action="details" data-path="${esc(item.path)}">İncele</button><button class="button small" data-action="move" data-path="${esc(item.path)}" ${info(item).canMove ? '' : 'disabled'}>Diske taşı ↗</button></div></article>`).join('') || '<div class="inline-message">Sürücü tarandığında büyük kişisel dosyalar için taşıma ve yedekleme önerileri burada görünür.</div>';
  } catch (e) { $('recommendationsList').innerHTML = `<div class="inline-message">${esc(errorMessage(e))}</div>`; }
}

function openModal(title, eyebrow, html, buttons = []) {
  if (state.modalBusy) return false;
  $('modalTitle').textContent = title; $('modalEyebrow').textContent = eyebrow; $('modalBody').innerHTML = html; $('modalFooter').replaceChildren();
  for (const cfg of buttons) { const b = document.createElement('button'); b.className = `button ${cfg.className || ''}`; b.textContent = cfg.label; b.disabled = !!cfg.disabled; if (cfg.id) b.id = cfg.id; b.addEventListener('click', cfg.click); $('modalFooter').append(b); }
  scheduleThumbnails(); $('modalOverlay').hidden = false; $('btnModalClose').disabled = false; $('btnModalClose').focus(); return true;
}
function closeModal() { if (state.modalBusy) return; $('modalOverlay').hidden = true; state.modalContext = null; }
function modalBusy(value) { state.modalBusy = value; $('btnModalClose').disabled = value; $('modalFooter').querySelectorAll('button').forEach(b => b.disabled = value); }
async function showDetails(item) {
  const p = item.path; if (!p) return;
  if (!openModal(item.name || base(p), 'DOSYAYI TANI', '<div class="loading-inline">Dosya bilgisi alınıyor…</div>', [{ label: 'Kapat', click: closeModal }])) return;
  state.modalContext = p;
  try {
    const details = await call('getFileDetails', p); if (state.modalContext !== p || $('modalOverlay').hidden) return;
    const full = { ...item, ...details, classification: details.classification || item.classification }; const c = info(full);
    const size = item.isDir ? item.size : full.logicalSize ?? full.size; const allocated = full.allocatedBytes ?? full.allocatedSize ?? (full.physicalSizeKnown ? full.size : item.allocatedBytes);
    const description = `<div class="detail-explanation">${riskTag(full)}<p>${esc(c.description)}</p>${c.advice ? `<div class="detail-advice">${esc(c.advice)}</div>` : ''}</div>`;
    const html = `${description}<dl class="details-grid"><dt>Ad</dt><dd>${esc(full.name || item.name)}</dd><dt>Tür</dt><dd>${esc(c.category)}</dd><dt>Tam konum</dt><dd class="mono">${esc(p)}</dd><dt>Dosya boyutu</dt><dd>${bytes(size)}${item.isDir ? ' · Tarama sonucu' : ''}</dd><dt>Diskte ayrılan</dt><dd>${allocated == null ? 'Bu dosya için ölçüm bulunmuyor.' : `${full.allocatedKnown === false ? 'Yaklaşık ' : ''}${bytes(allocated)}`}</dd><dt>Son değişiklik</dt><dd>${date(full.mtime)}</dd><dt>Oluşturulma</dt><dd>${date(full.birthtime)}</dd>${full.isSparse ? '<dt>Depolama özelliği</dt><dd>Seyrek dosya: görünen boyutunun tamamı diskte ayrılmamış olabilir.</dd>' : ''}${item.isDir ? `<dt>İçerik</dt><dd>${number(item.filesCount)} dosya · ${number(item.foldersCount)} klasör</dd>` : ''}</dl>${full.allocationNote ? `<p class="settings-hint">${esc(full.allocationNote)}</p>` : ''}${c.risk === 'unknown' ? '<div class="warning-box">Bu açıklama dosya adı, uzantısı ve konumuna dayanır. İçeriğin gerçekten gereksiz olduğu doğrulanamaz. Dosyayı üreten uygulamayı kontrol et.</div>' : ''}`;
    state.modalContext = null;
    openModal(full.name || base(p), 'DOSYAYI TANI', html, [
      { label: 'Konumu kopyala', click: () => call('copyToClipboard', p).then(() => toast('Konum kopyalandı.')).catch(e => toast(errorMessage(e), 'error')) },
      { label: 'Klasörde göster', click: () => call('showInFolder', p).catch(e => toast(errorMessage(e), 'error')) },
      ...(c.canMove ? [{ label: 'Diske taşı ↗', click: () => { closeModal(); moveItems([full]); } }] : []),
      { label: 'Kapat', className: 'primary', click: closeModal }
    ]);
  } catch (e) { if (state.modalContext === p) { $('modalBody').innerHTML = `<p class="error-text">${esc(errorMessage(e))}</p>`; state.modalContext = null; } }
}
function itemList(items, showPath = false) { return `<div class="modal-item-list">${items.slice(0, 100).map(x => `<div class="modal-item">${icon(x)}<div class="modal-item-info"><strong>${esc(x.name || base(x.path || x.source))}</strong>${showPath ? `<small>${esc(x.path || x.source)}${x.destination ? ` → ${esc(x.destination)}` : ''}</small>` : ''}</div><span class="size-value">${bytes(x.size)}</span></div>`).join('')}${items.length > 100 ? `<div class="modal-item">ve ${number(items.length - 100)} öğe daha…</div>` : ''}</div>`; }
function confirmDelete(items) {
  if (!items.length) return; if (items.some(x => !info(x).canDelete)) { toast('Bu öğeler arasında korunan veya silinmesi önerilmeyen dosyalar var.', 'error'); return; }
  openModal(`${number(items.length)} öğe için silme seçenekleri`, 'SİLMEDEN ÖNCE KONTROL ET', `<p class="modal-subtitle">Seçtiğin dosyaları kontrol et. Kişisel dosyaların gerekli olup olmadığına sen karar verirsin.</p>${itemList(items, true)}<label class="radio-choice"><input type="radio" name="deleteMode" value="trash" checked><span><strong>Geri Dönüşüm Kutusu'na taşı</strong><small>Geri alabilirsin. Kutuyu boşaltana kadar sürücüdeki boş alan artmayabilir.</small></span></label><label class="radio-choice"><input type="radio" name="deleteMode" value="permanent"><span><strong>Kalıcı olarak sil</strong><small>Dosyalar Geri Dönüşüm Kutusu'na gitmez. Bu işlem geri alınamaz.</small></span></label>`, [{ label: 'Vazgeç', click: closeModal }, { id: 'btnExecuteConfirm', label: 'Seçilenleri sil', className: 'danger', click: async () => {
    const trash = document.querySelector('input[name=deleteMode]:checked')?.value !== 'permanent'; modalBusy(true);
    try {
      const result = items.length === 1 ? await call('deletePath', items[0].path, trash) : await call('deleteMultiple', items.map(x => x.path), trash);
      if (result.success === false) throw new Error(result.error || 'Dosya silinemedi.');
      const success = result.successCount ?? (result.success ? 1 : 0); const fail = result.failCount || 0;
      toast(`${number(success)} öğe ${trash ? 'Geri Dönüşüm Kutusu’na gönderildi' : 'kalıcı olarak silindi'}.${fail ? ` ${number(fail)} öğe işlenemedi.` : ''}`, fail ? 'error' : 'success');
      if (fail && result.errors?.length) toast(result.errors.slice(0, 3).map(e => typeof e === 'string' ? e : e.error || e.message).join('\n'), 'error');
      state.selected.clear(); modalBusy(false); closeModal(); await refreshAfterMutation();
    } catch (e) { modalBusy(false); toast(errorMessage(e), 'error'); }
  } }]);
}
async function refreshAfterMutation() { state.treeCache.clear(); await fetchChildren(state.treePath); renderTree(); await loadLarge(); await loadDrives(); if (state.tab === 'cleanups') { await loadCleanup(); await loadRecommendations(); } }

async function moveItems(items) {
  if (!items.length) return; if (items.some(x => !info(x).canMove)) { toast('Korunan veya kullanım amacı belirsiz dosyalar bu yolla taşınamaz.', 'error'); return; }
  try {
    const result = await call('planMove', items.map(x => x.path)); if (!result || result.canceled || result.cancelled || result.success === false && !result.error) return;
    const plan = result.plan || result; if (!plan.id) return; state.moveId = plan.id;
    const target = plan.targetDirectory || plan.destination || ''; const warnings = (Array.isArray(plan.warnings) ? plan.warnings : []).join(' ');
    openModal('Taşıma planını kontrol et', 'KONTROLLÜ DOSYA TAŞIMA', `<p class="modal-subtitle">Hedef klasör:</p><div class="inline-message mono hidden-path">${esc(target)}</div><p class="modal-subtitle">${number(plan.items?.length || items.length)} öğe · ${bytes(plan.totalBytes || items.reduce((s, x) => s + x.size, 0))}</p>${itemList((plan.items || items).map(x => ({ ...x, path: x.source || x.path })), true)}<div class="warning-box">Hedefteki mevcut dosyaların üzerine yazılmaz. Diskler arası taşımada kopya doğrulanmadan kaynak dosya kaldırılmaz.${warnings ? ` ${esc(warnings)}` : ''}</div>`, [{ label: 'Vazgeç', click: () => { state.moveId = null; closeModal(); } }, { label: 'Taşımayı başlat', className: 'primary', id: 'btnExecuteMove', click: async () => {
      modalBusy(true); $('modalBody').innerHTML = '<div class="loading-inline">Dosyalar kontrollü olarak taşınıyor…</div><progress id="moveProgress" class="move-progress" max="100" value="0"></progress><p id="moveProgressText" class="modal-subtitle">Başlatılıyor…</p>';
      const cancel = document.createElement('button'); cancel.className = 'button danger-outline'; cancel.textContent = 'Taşımayı durdur'; cancel.id = 'btnCancelMove'; cancel.onclick = async () => { cancel.disabled = true; try { await call('cancelMove'); if ($('moveProgressText')) $('moveProgressText').textContent = 'Güvenli durdurma bekleniyor…'; } catch (e) { cancel.disabled = false; toast(errorMessage(e), 'error'); } }; $('modalFooter').append(cancel);
      try {
        const done = await call('executeMove', plan.id); const failed = done.failedCount || done.failCount || done.errors?.length || 0; const count = done.movedCount ?? done.successCount ?? done.items?.filter(x => x.success).length ?? 0;
        toast(`${number(count)} öğe taşındı.${done.canceled ? ' Taşıma durduruldu; tamamlanan işlemler korunur.' : ''}${failed ? ` ${number(failed)} öğe işlenemedi; sonuçları kontrol et.` : ''}`, failed ? 'error' : done.canceled ? '' : 'success'); state.selected.clear(); modalBusy(false); state.moveId = null;
        if (failed || done.canceled) openModal(done.canceled ? 'Taşıma durduruldu' : 'Taşıma sonuçlarını incele', 'İŞLEM SONUCU', `<p class="modal-subtitle">${number(count)} öğe taşındı. ${number(failed)} öğe işlenemedi. Tamamlanan taşımalar geri alınmaz.</p><div class="warning-box">Başarısız dosyalar için kaynak ve hedefi kontrol et. Doğrulanmış iki kopya varsa ayrıntılarda belirtilir.</div><div class="error-text">${esc((done.errors || []).map(x => typeof x === 'string' ? x : x.error || x.message).join('\n'))}</div>`, [{ label: 'Hedefi göster', click: () => call('showInFolder', target).catch(e => toast(errorMessage(e), 'error')) }, { label: 'Kapat', className: 'primary', click: closeModal }]);
        else closeModal(); await refreshAfterMutation();
      }
      catch (e) { modalBusy(false); state.moveId = null; $('modalBody').innerHTML = `<div class="error-text">${esc(errorMessage(e))}</div><p class="settings-hint">Kaynak ve hedef konumu kontrol et. Başarısız işlemler işlem geçmişine kaydedilir.</p>`; }
    } }]);
  } catch (e) { toast(errorMessage(e), 'error'); }
}

function cleanupDetails(id) {
  const cat = categories().find(x => x.id === id); if (!cat) return;
  const items = cat.items || []; const review = cat.group === 'review';
  const warning = cat.warning || (cat.autoClean ? 'Açık uygulamaların kilitli veya yeni dosyaları atlanabilir. Önbellekler ihtiyaç halinde yeniden oluşturulur.' : 'Bu kategori için açıklamayı incele. İhtiyaç duyabileceğin veriler bulunabilir.');
  let html = `<p class="modal-subtitle">${esc(cat.description)}</p><div class="warning-box">${esc(warning)}</div><p class="modal-subtitle">${bytes(cat.totalBytes)} · ${number(cat.totalFiles)} aday dosya${items.length < cat.totalFiles ? ' · Aşağıda sınırlı sayıda örnek gösteriliyor.' : ''}</p>`;
  html += `<div class="modal-item-list">${items.map((x, i) => `<div class="modal-item">${review ? `<input type="checkbox" data-review-index="${i}" aria-label="${esc(x.name)} seç">` : icon(x)}<div class="modal-item-info"><strong>${esc(x.name || base(x.path))}</strong><small>${esc(x.path)}</small></div><span class="size-value">${bytes(x.size)}</span><button class="icon-button" data-action="details" data-path="${esc(x.path)}" title="Dosya ayrıntıları">ⓘ</button></div>`).join('')}</div>`;
  const buttons = [{ label: 'Kapat', click: closeModal }];
  if (cat.action) buttons.push({ label: 'Windows temizleme ayarlarını aç ↗', className: 'primary', click: () => call('openSystemSettings', cat.action === 'storage' ? 'storage' : 'cleanup').catch(e => toast(errorMessage(e), 'error')) });
  else buttons.push({ label: review ? 'Seçili dosyaları sil…' : 'Bu kategoriyi temizle…', className: 'primary', click: () => {
    if (review) { const selected = [...$('modalBody').querySelectorAll('[data-review-index]:checked')].map(x => items[Number(x.dataset.reviewIndex)]); if (!selected.length) { toast('Önce incelemek istediğin dosyaları seç.'); return; } closeModal(); confirmDelete(selected); }
    else { closeModal(); confirmCleanup([cat]); }
  } });
  openModal(cat.title, 'TEMİZLEME AYRINTILARI', html, buttons);
}
function confirmCleanup(selected) {
  selected = selected.filter(c => c.group !== 'review' && !c.action); if (!selected.length) return;
  openModal('Temizlenecek kategorileri incele', 'TEMİZLİK ONAYI', `<p class="modal-subtitle">${number(selected.length)} kategori · yaklaşık ${bytes(selected.reduce((s, c) => s + c.totalBytes, 0))}. Gerçek boşalan alan kilitli dosyalara ve depolama özelliklerine göre değişebilir.</p><div class="modal-item-list">${selected.map(c => `<div class="modal-item"><div class="modal-item-info"><strong>${esc(c.title)}</strong><small>${esc(c.description)}</small></div><span class="size-value">${bytes(c.totalBytes)}</span></div>`).join('')}</div><label class="radio-choice"><input type="radio" name="cleanupMode" value="trash" checked><span><strong>Geri Dönüşüm Kutusu'na gönder</strong><small>Kutuyu boşaltana kadar sürücüdeki boş alan artmayabilir.</small></span></label><label class="radio-choice"><input type="radio" name="cleanupMode" value="permanent"><span><strong>Kalıcı temizle</strong><small>Geri alınamaz. Aday dosyalar silinmeden önce yeniden kontrol edilir.</small></span></label>`, [{ label: 'Vazgeç', click: closeModal }, { label: 'Onayla ve temizle', className: 'danger', id: 'btnExecuteCleanup', click: async () => {
    const trash = document.querySelector('input[name=cleanupMode]:checked')?.value !== 'permanent'; modalBusy(true);
    try { const result = await call('cleanCategories', selected.map(c => c.id), [], trash); const count = result.deletedFiles ?? result.successCount ?? 0; const failed = result.failedCount ?? result.failCount ?? 0; toast(`${number(count)} dosya ${trash ? 'Geri Dönüşüm Kutusu’na gönderildi' : 'temizlendi'}.${failed ? ` ${number(failed)} dosya atlandı veya işlenemedi.` : ''}`, failed ? '' : 'success'); modalBusy(false); closeModal(); await loadCleanup(); await loadDrives(); }
    catch (e) { modalBusy(false); toast(errorMessage(e), 'error'); }
  } }]);
}

async function loadPrograms() {
  $('programsList').innerHTML = '<div class="loading-inline">Kurulu uygulamalar okunuyor…</div>';
  try { state.programs = page(await call('getPrograms')).items; renderPrograms(); } catch (e) { $('programsList').innerHTML = `<div class="inline-message">${esc(errorMessage(e))}</div>`; }
}
function renderPrograms() {
  const query = $('programSearchInput').value.toLocaleLowerCase('tr-TR'); const all = state.programs.filter(x => `${x.name} ${x.publisher || ''}`.toLocaleLowerCase('tr-TR').includes(query));
  $('programsList').innerHTML = `<div class="program-count">${number(all.length)} uygulama · Boyutlar programların Windows'a bildirdiği tahminlerdir.</div>${all.slice(0, 200).map(p => `<article class="program-card"><span class="file-icon" ${p.installLocation ? `data-native-icon-path="${esc(p.installLocation)}"` : ''}>${svgIcon('apps')}</span><div class="program-info"><h3>${esc(p.name)}</h3><p>${esc([p.publisher, p.version, p.canMove ? 'Windows üzerinden taşınabilir' : 'Yeniden kurulum / uygulamanın taşıma aracı'].filter(Boolean).join(' · '))}</p></div><span class="program-size">${p.estimatedSize ? bytes(p.estimatedSize) : 'Boyut bilinmiyor'}</span><button class="button small" data-action="program-advice" data-program="${esc(p.packageFullName || p.id || p.name)}">${p.canMove ? 'Başka diske taşı' : 'Taşıma seçenekleri'}</button></article>`).join('')}${all.length > 200 ? '<div class="inline-message">İlk 200 eşleşme gösteriliyor. Arama ile listeyi daralt.</div>' : ''}`;
  scheduleNativeIcons();
}
async function programAdvice(name) {
  const p = state.programs.find(x => x.packageFullName === name || x.id === name || x.name === name); if (!p) return;
  if (p.canMove && p.packageFullName) {
    if (!openModal(p.name, 'WINDOWS UYGULAMASINI TAŞI', '<div class="loading-inline">Uygun hedef sürücüler okunuyor…</div>', [{ label: 'Kapat', click: closeModal }])) return;
    state.modalContext = p.packageFullName;
    try {
      const result = await call('getProgramMoveTargets', p.packageFullName); if (state.modalContext !== p.packageFullName || $('modalOverlay').hidden) return;
      const targets = result.items || [];
      openModal(p.name, 'WINDOWS UYGULAMASINI TAŞI', `<p class="modal-subtitle">Windows bu uygulamayı desteklediği paket taşıma yöntemiyle yönetecek. Hedef sürücüyü seç; dosyaların konumunu ve uygulama kayıtlarını Windows günceller.</p>${targets.length ? `<select id="programMoveVolume" class="program-volume-select" aria-label="Hedef sürücü">${targets.map(t => `<option value="${esc(t.path)}">${esc(t.name || t.path)} · ${bytes(t.freeBytes)} boş</option>`).join('')}</select>` : '<div class="warning-box">Taşıma için uygun başka bir Windows uygulama sürücüsü bulunamadı.</div>'}<div class="warning-box">Önce uygulamayı kapat. Taşıma sürerken kurulum veya kaldırma işlemi başlatma. Windows’un yönetmediği programlar bu yöntemle taşınmaz.</div>`, [{ label: 'Vazgeç', click: closeModal }, ...(targets.length ? [{ label: 'Planı göster', className: 'primary', click: async () => {
        modalBusy(true); try { const plan = await call('planProgramMove', p.packageFullName, $('programMoveVolume').value); modalBusy(false); confirmProgramMove(plan); } catch (e) { modalBusy(false); toast(errorMessage(e), 'error'); }
      } }] : [])]);
    } catch (e) { state.modalContext = null; $('modalBody').innerHTML = `<div class="error-text">${esc(errorMessage(e))}</div>`; }
    return;
  }
  openModal(p.name, 'UYGULAMAYI BAŞKA DİSKE ALMA', `<div class="detail-explanation"><p>${esc(p.advice || 'Windows uygulama ayarlarında Taşı seçeneği varsa kullanabilirsin. Bu seçenek yoksa programın kendi taşıma aracını kullan veya dosyalarını yedekleyerek programı diğer diske yeniden kur.')}</p></div><dl class="details-grid"><dt>Yayıncı</dt><dd>${esc(p.publisher || 'Bilinmiyor')}</dd><dt>Bildirilen boyut</dt><dd>${p.estimatedSize ? bytes(p.estimatedSize) : 'Bilinmiyor'}</dd><dt>Kurulum konumu</dt><dd class="mono">${esc(p.installLocation || 'Program bildirmedi.')}</dd></dl><div class="warning-box">Kurulu program klasörleri dosya taşıma özelliğiyle taşınmaz. Kayıt defteri girdileri, servisler ve güncelleme yolları eski konuma bağlı kalabilir.</div>`, [{ label: 'Kapat', click: closeModal }, { label: 'Windows uygulama ayarları ↗', className: 'primary', click: () => call('openSystemSettings', 'apps').catch(e => toast(errorMessage(e), 'error')) }]);
}
function confirmProgramMove(plan) {
  openModal(plan.program?.name || 'Uygulamayı taşı', 'TAŞIMA PLANINI KONTROL ET', `<dl class="details-grid"><dt>Uygulama</dt><dd>${esc(plan.program?.name)}</dd><dt>Hedef sürücü</dt><dd>${esc(plan.destination?.name || plan.destination?.path)}</dd><dt>Boş alan</dt><dd>${bytes(plan.destination?.freeBytes)}</dd></dl><div class="warning-box">${(plan.warnings || []).map(esc).join('<br>')}</div><p class="settings-hint">Taşımayı Windows yapacak. İşlem süresi uygulamanın boyutuna ve sürücülere bağlıdır.</p>`, [{ label: 'Vazgeç', click: closeModal }, { label: 'Windows ile taşı', className: 'primary', click: async () => {
    modalBusy(true); $('modalBody').innerHTML = '<div class="loading-inline">Windows uygulamayı yeni sürücüye taşıyor…</div><p class="program-move-status">Taşıma tamamlanana kadar bu pencere açık kalacak. Kurulum konumunu Windows güncelliyor.</p>';
    try { const result = await call('executeProgramMove', plan.id); modalBusy(false); closeModal(); toast(result.message || 'Windows uygulama taşımasını tamamladı.', 'success'); state.programs = []; await loadPrograms(); await loadDrives(); }
    catch (e) { modalBusy(false); $('modalBody').innerHTML = `<div class="error-text">${esc(errorMessage(e))}</div><p class="settings-hint">Uygulamanın güncel konumunu Windows Uygulamalar bölümünden kontrol edebilirsin.</p>`; }
  } }]);
}

function analysisTab(section) {
  state.analysis.section = section;
  document.querySelectorAll('[data-analysis-tab]').forEach(x => x.classList.toggle('active', x.dataset.analysisTab === section));
  ['map', 'statistics', 'duplicates', 'snapshots'].forEach(name => $(`analysis-${name}`).hidden = name !== section);
  if (section === 'map') loadSpaceMap(state.analysis.mapPath || state.treePath || state.currentTarget);
  if (section === 'statistics') loadStatistics();
  if (section === 'snapshots') loadSnapshots();
}
async function loadSpaceMap(target = state.currentTarget) {
  const token = ++state.analysis.request;
  $('spaceMap').innerHTML = '<div class="loading-inline">Alan haritası hazırlanıyor…</div>';
  try {
    const result = await call('getSpaceMap', target, { limit: 60 }); if (token !== state.analysis.request) return;
    state.analysis.mapPath = result.rootPath || target; state.analysis.mapItems = result.items || [];
    $('spaceMapTitle').textContent = result.rootPath || target;
    $('spaceMapSummary').textContent = `${bytes(result.totalBytes)} ayrılmış alan · ${number(state.analysis.mapItems.length)} öğe${result.omittedCount ? ` · ${number(result.omittedCount)} küçük öğe haritada birleştirildi` : ''}`;
    $('spaceMap').innerHTML = state.analysis.mapItems.map((item, i) => {
      const r = item.rect || {}, x = Math.max(0, Math.min(1, Number(r.x) || 0)), y = Math.max(0, Math.min(1, Number(r.y) || 0)), w = Math.max(0, Math.min(1 - x, Number(r.w) || 0)), h = Math.max(0, Math.min(1 - y, Number(r.h) || 0));
      return `<button class="space-tile ${info(item).risk === 'protected' ? 'protected' : ''}" data-action="map-drill" data-path="${esc(item.path)}" style="left:${x * 100}%;top:${y * 100}%;width:${w * 100}%;height:${h * 100}%;--tile-hue:${(i * 37 + 330) % 360}" title="${esc(`${item.name} · ${bytes(item.size)} · ${item.path}`)}"><strong>${esc(item.name)}</strong><span>${bytes(item.size)}</span>${item.isDir ? '<small>Klasör →</small>' : ''}</button>`;
    }).join('') || '<div class="empty-state"><h3>Bu konumda ölçülen alan yok</h3><p>Taramayı tamamla veya başka bir klasör seç.</p></div>';
  } catch (e) { if (token === state.analysis.request) $('spaceMap').innerHTML = `<div class="empty-state"><h3>Harita oluşturulamadı</h3><p>${esc(errorMessage(e))}</p></div>`; }
}
async function loadStatistics() {
  $('typeStatsBody').innerHTML = empty('İstatistikler hazırlanıyor', 'Dosya türleri hesaplanıyor.', '', 4);
  try {
    const result = await call('getFileStatistics');
    $('typeStatsBody').innerHTML = (result.types || []).slice(0, 100).map(t => `<tr><td>${esc(t.extension || 'Uzantısız')}</td><td class="align-right">${number(t.filesCount)}</td><td class="align-right mono">${bytes(t.allocatedBytes)}</td><td class="align-right mono">${bytes(t.logicalBytes)}</td></tr>`).join('') || empty('Henüz istatistik yok', 'Önce bir sürücü veya klasör tara.', '', 4);
    $('ageStatsBody').innerHTML = (result.ages || []).map(a => `<tr><td>${esc(a.label)}</td><td class="align-right">${number(a.filesCount)}</td><td class="align-right mono">${bytes(a.allocatedBytes)}</td></tr>`).join('') || empty('Henüz istatistik yok', 'Taranan dosyaların tarihleri burada gruplandırılır.', '', 3);
  } catch (e) { $('typeStatsBody').innerHTML = empty('İstatistik alınamadı', errorMessage(e), '', 4); $('ageStatsBody').innerHTML = ''; }
}
function duplicateProgress(data) {
  if (!state.analysis.busy) return;
  $('duplicateProgress').hidden = false;
  $('duplicateProgress').textContent = `${data.message || (data.phase === 'hashing' ? 'Dosya içerikleri doğrulanıyor' : 'Aynı boyuttaki adaylar inceleniyor')}${data.total ? ` · ${number(data.processed || 0)} / ${number(data.total)}` : ''}${data.currentPath ? ` · ${base(data.currentPath)}` : ''}`;
}
async function findDuplicates() {
  if (state.analysis.busy) return; state.analysis.busy = true; state.analysis.selected.clear(); state.analysis.duplicateResult = null;
  $('btnFindDuplicates').disabled = true; $('btnCancelAnalysis').hidden = false; $('btnDeleteDuplicates').disabled = true;
  $('duplicatesList').innerHTML = '<div class="loading-inline">Mükerrer dosyalar aranıyor…</div>'; $('duplicateProgress').hidden = false; $('duplicateProgress').textContent = 'Adaylar hazırlanıyor…';
  try { state.analysis.duplicateResult = await call('findDuplicates', { minSize: Number($('duplicateMinSize').value) }); state.analysis.duplicateLimit = 20; renderDuplicates(); }
  catch (e) { $('duplicatesList').innerHTML = `<div class="inline-message error-text">${esc(errorMessage(e))}</div>`; }
  finally { state.analysis.busy = false; $('btnFindDuplicates').disabled = false; $('btnCancelAnalysis').hidden = true; $('duplicateProgress').hidden = true; }
}
function renderDuplicates() {
  const result = state.analysis.duplicateResult || {}, groups = result.groups || [];
  $('duplicateSummary').textContent = `${number(result.groupCount ?? groups.length)} grup · ${bytes(result.reclaimableBytes)} tekrar alanı${result.cancelled ? ' · Arama durduruldu; kısmi sonuçlar' : ''}`;
  $('duplicatesList').innerHTML = groups.slice(0, state.analysis.duplicateLimit).map((group, i) => `<article class="duplicate-group"><div class="duplicate-group-heading"><h3>${number((group.items || []).length)} aynı içerik <small>${bytes(group.size)} / dosya</small></h3><span class="muted">SHA-256 ${esc(String(group.hash || '').slice(0, 12))}…</span></div>${(group.items || []).slice(0, 100).map((item, j) => `<div class="duplicate-file"><input type="checkbox" data-duplicate-path="${esc(item.path)}" ${j === 0 ? 'disabled' : ''} ${state.analysis.selected.has(item.path) ? 'checked' : ''} aria-label="${j === 0 ? 'Korunacak kopya' : 'Tekrarı seç'}">${icon(item)}<div class="duplicate-file-info"><button class="node-title-button" data-action="details" data-path="${esc(item.path)}">${esc(item.name || base(item.path))}</button><p title="${esc(item.path)}">${esc(item.path)}</p></div>${j === 0 ? '<span class="retained-copy">Bu kopya korunur</span>' : `<button class="icon-button" data-action="details" data-path="${esc(item.path)}" title="Ayrıntılar">ⓘ</button>`}</div>`).join('')}${(group.items || []).length > 100 ? '<p class="settings-hint">Bu gruptaki ilk 100 kopya gösteriliyor.</p>' : ''}</article>`).join('') || '<div class="empty-state"><h3>Mükerrer bulunmadı</h3><p>Seçilen boyutun üzerinde, güvenle karşılaştırılabilecek aynı içerik bulunamadı.</p></div>';
  $('btnMoreDuplicates').hidden = state.analysis.duplicateLimit >= groups.length;
  $('btnDeleteDuplicates').disabled = !state.analysis.selected.size || !window.api?.deleteDuplicateFiles;
  scheduleThumbnails();
}
function confirmDuplicateDelete() {
  const paths = [...state.analysis.selected]; if (!paths.length) return;
  const items = paths.map(findItem);
  openModal(`${number(paths.length)} tekrarı kaldır`, 'BİR KOPYA KORUNACAK', `<p class="modal-subtitle">Seçili tekrarlar silinmeden önce korunacak kopyaların hâlâ bulunduğu ve aynı içerikte olduğu yeniden doğrulanır.</p>${itemList(items, true)}<label class="radio-choice"><input type="radio" name="duplicateDeleteMode" value="trash" checked><span><strong>Geri Dönüşüm Kutusu'na gönder</strong><small>Alan, kutu boşaltılınca açılır.</small></span></label><label class="radio-choice"><input type="radio" name="duplicateDeleteMode" value="permanent"><span><strong>Kalıcı sil</strong><small>Geri alınamaz. Korunacak dosyayı önce kontrol et.</small></span></label>`, [{ label: 'Vazgeç', click: closeModal }, { label: 'Seçili tekrarları kaldır', className: 'danger', click: async () => {
    const toTrash = document.querySelector('input[name=duplicateDeleteMode]:checked')?.value !== 'permanent'; modalBusy(true);
    try { const result = await call('deleteDuplicateFiles', paths, toTrash); modalBusy(false); closeModal(); toast(`${number(result.successCount || 0)} tekrar kaldırıldı.${result.failCount ? ` ${number(result.failCount)} dosya korunarak atlandı.` : ''}`, result.failCount ? '' : 'success'); state.analysis.selected.clear(); state.analysis.duplicateResult = null; $('duplicatesList').innerHTML = '<div class="inline-message">İşlem tamamlandı. Güncel kopyaları görmek için aramayı yeniden başlat.</div>'; $('btnDeleteDuplicates').disabled = true; await loadDrives(); }
    catch (e) { modalBusy(false); toast(errorMessage(e), 'error'); }
  } }]);
}
async function loadSnapshots() {
  $('scanSnapshotsList').innerHTML = '<div class="loading-inline">Kaydedilen taramalar okunuyor…</div>';
  try {
    const result = await call('getScanSnapshots');
    $('scanSnapshotsList').innerHTML = (result.items || []).map(s => `<article class="scan-snapshot"><div><strong>${esc(s.rootPath || s.path)}</strong><p>${date(s.createdAt || s.timestamp)} · ${bytes(s.totalBytes ?? s.stats?.totalBytes)}</p></div><button class="button small" data-action="compare-snapshot" data-snapshot-id="${esc(s.id)}">Şimdiki taramayla karşılaştır</button></article>`).join('') || '<div class="empty-state"><h3>Kaydedilmiş tarama yok</h3><p>Tam taramayı kaydet; sonraki taramada hangi klasörün büyüdüğünü gör.</p></div>';
  } catch (e) { $('scanSnapshotsList').innerHTML = `<div class="inline-message error-text">${esc(errorMessage(e))}</div>`; }
}
async function compareSnapshot(id) {
  $('snapshotComparison').hidden = false; $('snapshotCompareBody').innerHTML = empty('Karşılaştırılıyor', 'Klasör boyutları karşılaştırılıyor.', '', 4);
  try {
    const result = await call('compareScanSnapshot', id), items = result.items || [];
    $('snapshotCompareSummary').textContent = `${number(items.length)} değişen öğe`;
    $('snapshotCompareBody').innerHTML = items.slice(0, 300).map(item => `<tr><td><strong>${esc(item.name || base(item.path))}</strong><span class="snapshot-item-path">${esc(item.path)}</span></td><td class="align-right mono">${bytes(item.previousBytes)}</td><td class="align-right mono">${bytes(item.currentBytes)}</td><td class="align-right mono ${item.deltaBytes > 0 ? 'text-growth' : 'text-shrink'}">${item.deltaBytes > 0 ? '+' : item.deltaBytes < 0 ? '−' : ''}${bytes(Math.abs(item.deltaBytes || 0))}</td></tr>`).join('') || empty('Boyut değişikliği bulunmadı', 'Aynı kökteki ölçülen öğelerin boyutları aynı.', '', 4);
  } catch (e) { $('snapshotCompareBody').innerHTML = empty('Karşılaştırılamadı', errorMessage(e), '', 4); }
}

function applySettings() {
  const s = state.settings; document.body.dataset.theme = ['burgundy', 'blue', 'green', 'light'].includes(s.theme) ? s.theme : 'burgundy';
  document.body.classList.toggle('classic-view', s.viewMode === 'classic'); document.body.classList.toggle('sidebar-collapsed', !!s.sidebarCollapsed);
  document.querySelectorAll('.theme-option').forEach(x => x.classList.toggle('active', x.dataset.theme === s.theme));
  const fields = { settingLaunchAtLogin: 'launchAtLogin', settingStartHidden: 'startHidden', settingDesktopShortcut: 'desktopShortcut', settingStartMenuShortcut: 'startMenuShortcut', settingAutoScan: 'autoScan', settingGroupFiles: 'groupFiles' };
  for (const [id, field] of Object.entries(fields)) $(id).checked = !!s[field];
  $('settingViewMode').value = s.viewMode === 'classic' ? 'classic' : 'volde'; $('settingUpdateRepository').value = s.updateRepository || '';
}
async function saveSettings(patch) {
  const previous = { ...state.settings }; state.settings = { ...state.settings, ...patch }; applySettings(); if ('viewMode' in patch || 'groupFiles' in patch) renderTree(); $('settingsSaveStatus').textContent = 'Kaydediliyor…';
  state.saveQueue = state.saveQueue.catch(() => {}).then(async () => {
    try { const r = await call('saveSettings', patch); state.settings = { ...state.settings, ...(r.settings || {}) }; applySettings(); $('settingsSaveStatus').textContent = 'Kaydedildi'; }
    catch (e) { state.settings = previous; applySettings(); $('settingsSaveStatus').textContent = 'Kaydedilemedi'; toast(errorMessage(e), 'error'); }
  }); return state.saveQueue;
}
function updateStatus(data) {
  state.updateState = data;
  const status = data?.status || ''; const message = data?.message || (status === 'available' ? `Yeni sürüm: ${data.availableVersion || data.version || ''}` : status === 'not-available' ? 'Güncel sürümü kullanıyorsun.' : 'Güncelleme durumu alındı.');
  $('updateStatus').textContent = message;
  const updating = ['downloading', 'waiting-for-operations', 'installing'].includes(status);
  $('updateProgressWrap').hidden = !updating;
  if (updating) {
    const percent = Math.max(0, Math.min(100, Number(data.percent) || (status !== 'downloading' ? 100 : 0)));
    $('updateProgress').value = percent;
    $('updateProgressPercent').textContent = status === 'downloading' ? `%${Math.round(percent)}` : status === 'installing' ? 'Kurulum başlatılıyor' : 'İşlem bekleniyor';
    $('updateProgressBytes').textContent = status === 'downloading' ? `${bytes(data.transferred || 0)} / ${data.total ? bytes(data.total) : 'Boyut alınıyor'}` : 'İndirme tamamlandı';
    $('updateProgressSpeed').textContent = status === 'downloading' && data.bytesPerSecond ? `${bytes(data.bytesPerSecond)}/sn` : '';
    const eta = Number(data.etaSeconds);
    $('updateProgressEta').textContent = status === 'downloading' ? data.etaSeconds == null || !Number.isFinite(eta) ? 'Kalan süre hesaplanıyor…' : eta < 1 ? 'İndirme tamamlanıyor…' : `Yaklaşık ${eta >= 60 ? `${Math.floor(eta / 60)} dk ` : ''}${Math.ceil(eta % 60)} sn kaldı` : status === 'waiting-for-operations' ? 'Açık dosya işlemi tamamlanınca otomatik devam edecek.' : 'Yeni sürüm yüklendikten sonra Voldena yeniden açılacak.';
  }
  $('btnCheckUpdates').disabled = ['checking', ...['downloading', 'waiting-for-operations', 'installing']].includes(status);
  $('btnDownloadUpdate').hidden = status !== 'available'; $('btnInstallUpdate').hidden = status !== 'downloaded';
}
function settingsTab(tab) {
  document.querySelectorAll('[data-settings-tab]').forEach(x => x.classList.toggle('active', x.dataset.settingsTab === tab));
  ['general', 'history', 'logs'].forEach(t => $(`settings-${t}`).hidden = t !== tab);
  if (tab === 'history') loadHistory(); if (tab === 'logs') loadLogs();
}
async function loadHistory() {
  const token = ++state.historyRequest;
  try {
    const data = page(await call('getHistory', state.history)); if (token !== state.historyRequest) return; state.historyPage = data;
    $('historyTableBody').innerHTML = data.items.map(x => `<tr><td>${date(x.timestamp || x.date)}</td><td><div class="history-name">${esc(x.name || base(x.path))}</div><div class="history-path">${esc(x.path || x.source || '')}${x.destination ? `<br>→ ${esc(x.destination)}` : ''}</div></td><td>${esc(x.type || 'Dosya')}</td><td class="align-right mono">${bytes(x.size)}</td><td>${esc(({ trash: 'Geri Dönüşüm', permanent: 'Kalıcı silme', move: 'Taşıma', cleanup: 'Temizleme', 'cleanup-trash': 'Önbellek / kutu', 'cleanup-permanent': 'Önbellek / kalıcı' })[x.method] || x.method || '—')}</td><td><span class="history-result ${/success|completed|başarılı/i.test(x.result || '') ? 'success' : /error|fail|hata|başarısız/i.test(x.result || '') ? 'error' : ''}">${esc(({ success: 'Başarılı', failed: 'Başarısız', error: 'Hata', pending: 'Başlatıldı', skipped: 'Atlandı', completed: 'Tamamlandı', unknown: 'Sonuç doğrulanamadı', 'success-with-audit-error': 'Tamamlandı · kayıt eksik' })[x.result] || x.result || '—')}</span>${x.error ? `<div class="history-path">${esc(x.error)}</div>` : ''}</td></tr>`).join('') || empty('Henüz işlem kaydı yok', state.history.search ? 'Aramayla eşleşen kayıt bulunamadı.' : 'Silme ve taşıma işlemleri burada kalıcı olarak listelenir.', '◷', 6);
    $('historyCountLabel').textContent = `${number(data.total)} kayıt`; $('historyPageLabel').textContent = `${Math.floor(state.history.offset / state.history.limit) + 1} / ${Math.max(1, Math.ceil(data.total / state.history.limit))}`; $('btnHistoryPrev').disabled = state.history.offset === 0; $('btnHistoryNext').disabled = !data.hasMore;
  } catch (e) { $('historyTableBody').innerHTML = empty('Geçmiş okunamadı', errorMessage(e), '◷', 6); }
}
async function loadLogs() {
  $('logsViewer').textContent = 'Günlükler okunuyor…';
  try { const data = await call('getLogs', { level: $('logsLevelSelect').value, limit: 500, offset: 0 }); $('logsViewer').textContent = data.text || (data.items || []).map(x => `${x.timestamp || ''} [${String(x.level || 'info').toUpperCase()}] ${x.message || ''}`).join('\n') || 'Bu seviyede günlük kaydı bulunamadı.'; }
  catch (e) { $('logsViewer').textContent = errorMessage(e); }
}

function bindEvents() {
  for (const [tab, glyph] of Object.entries({ tree: 'folder', large: 'file', programs: 'apps', drives: 'drive' })) { const element = document.querySelector(`.nav-tab[data-tab="${tab}"] .nav-icon`); if (element) element.innerHTML = svgIcon(glyph); }
  document.querySelectorAll('.nav-tab[data-tab]').forEach(button => { button.title = button.textContent.trim(); });
  $('btnMinimize').onclick = () => call('windowAction', 'minimize'); $('btnMaximize').onclick = () => call('windowAction', 'maximize'); $('btnClose').onclick = () => call('windowAction', 'close');
  $('btnToggleSidebar').onclick = () => saveSettings({ sidebarCollapsed: !state.settings.sidebarCollapsed });
  $('btnRefreshDrives').onclick = loadDrives; $('btnSelectFolder').onclick = async () => { try { const p = await call('selectFolderDialog'); if (p) startScan(typeof p === 'string' ? p : p.path); } catch (e) { toast(errorMessage(e), 'error'); } };
  $('btnStartScan').onclick = () => startScan(); $('btnStopScan').onclick = async () => { $('btnStopScan').disabled = true; try { await call('stopScan'); $('scanStatusBadge').textContent = 'DURDURULUYOR'; } catch (e) { toast(errorMessage(e), 'error'); } finally { $('btnStopScan').disabled = false; } };
  $('btnPauseScan').onclick = async () => { try { await call(state.isPaused ? 'resumeScan' : 'pauseScan'); state.isPaused = !state.isPaused; scanControls(); } catch (e) { toast(errorMessage(e), 'error'); } };
  $('btnExport').onclick = async () => { try { await call('exportReport', { format: 'csv' }); } catch (e) { toast(errorMessage(e), 'error'); } };
  $('btnMapRoot').onclick = () => loadSpaceMap(state.currentTarget); $('btnRefreshMap').onclick = () => loadSpaceMap(state.analysis.mapPath || state.currentTarget); $('btnRefreshStatistics').onclick = loadStatistics;
  $('btnFindDuplicates').onclick = findDuplicates; $('btnCancelAnalysis').onclick = () => call('cancelAnalysis').catch(e => toast(errorMessage(e), 'error'));
  $('btnMoreDuplicates').onclick = () => { state.analysis.duplicateLimit += 20; renderDuplicates(); }; $('btnDeleteDuplicates').onclick = confirmDuplicateDelete;
  $('btnRefreshSnapshots').onclick = loadSnapshots; $('btnSaveSnapshot').onclick = async () => { $('btnSaveSnapshot').disabled = true; try { await call('saveScanSnapshot'); toast('Bu tarama kaydedildi.', 'success'); await loadSnapshots(); } catch (e) { toast(errorMessage(e), 'error'); } finally { $('btnSaveSnapshot').disabled = false; } };
  $('btnTreeRoot').onclick = () => focusFolder(state.currentTarget); $('treeSearchInput').addEventListener('input', debounce(() => searchTree()));
  $('treeTableBody').addEventListener('dblclick', e => { const row = e.target.closest('[data-folder]'); if (row && !e.target.closest('button')) focusFolder(row.dataset.folder); });
  $('largeSearchInput').addEventListener('input', debounce(() => { state.large.search = $('largeSearchInput').value; state.large.offset = 0; loadLarge(); }));
  $('largeCategorySelect').onchange = () => { state.large.category = $('largeCategorySelect').value; state.large.offset = 0; loadLarge(); };
  $('sizePillGroup').onclick = e => { const b = e.target.closest('[data-size]'); if (!b) return; state.large.minSize = Math.max(DEFAULT_MIN_SIZE, Number(b.dataset.size)); state.large.offset = 0; document.querySelectorAll('#sizePillGroup .pill').forEach(x => x.classList.toggle('active', x === b)); loadLarge(); };
  $('btnLargePrev').onclick = () => { state.large.offset = Math.max(0, state.large.offset - PAGE_SIZE); loadLarge(); }; $('btnLargeNext').onclick = () => { state.large.offset += PAGE_SIZE; loadLarge(); };
  $('checkAllLargeFiles').onchange = () => { for (const x of state.largePage.items) { if ($('checkAllLargeFiles').checked) state.selected.set(x.path, x); else state.selected.delete(x.path); } renderLarge(); };
  $('btnDeleteSelectedLarge').onclick = () => confirmDelete([...state.selected.values()]); $('btnMoveSelectedLarge').onclick = () => moveItems([...state.selected.values()]);
  $('btnRescanCleanups').onclick = loadCleanup; $('btnQuickClean').onclick = () => confirmCleanup(categories().filter(c => c.autoClean && c.totalBytes > 0));
  $('btnSelectSafeOnly').onclick = () => { state.selectedCleanup = new Set(categories().filter(c => c.autoClean && c.totalBytes > 0).map(c => c.id)); renderCleanup(); }; $('btnDeselectAllCleanups').onclick = () => { state.selectedCleanup.clear(); renderCleanup(); }; $('btnCleanSelected').onclick = () => confirmCleanup(categories().filter(c => state.selectedCleanup.has(c.id)));
  $('btnRefreshPrograms').onclick = loadPrograms; $('programSearchInput').addEventListener('input', debounce(renderPrograms)); $('btnWindowsApps').onclick = () => call('openSystemSettings', 'apps').catch(e => toast(errorMessage(e), 'error'));
  $('btnModalClose').onclick = closeModal; $('modalOverlay').onclick = e => { if (e.target === $('modalOverlay')) closeModal(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); if (e.key === 'Tab' && !$('modalOverlay').hidden) { const focusable = [...$('modalOverlay').querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')].filter(x => x.offsetParent !== null); if (!focusable.length) return; const first = focusable[0], last = focusable.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } } });
  const settingFields = { settingLaunchAtLogin: 'launchAtLogin', settingStartHidden: 'startHidden', settingDesktopShortcut: 'desktopShortcut', settingStartMenuShortcut: 'startMenuShortcut', settingAutoScan: 'autoScan', settingGroupFiles: 'groupFiles' };
  for (const [id, field] of Object.entries(settingFields)) $(id).onchange = () => saveSettings({ [field]: $(id).checked });
  $('settingViewMode').onchange = () => saveSettings({ viewMode: $('settingViewMode').value }); $('btnSaveRepository').onclick = () => saveSettings({ updateRepository: $('settingUpdateRepository').value.trim() });
  $('btnCheckUpdates').onclick = async () => { $('btnCheckUpdates').disabled = true; try { updateStatus(await call('checkForUpdates')); } catch (e) { updateStatus({ status: 'error', message: errorMessage(e) }); } finally { if (state.updateState) updateStatus(state.updateState); } };
  $('btnDownloadUpdate').onclick = async () => { $('btnDownloadUpdate').disabled = true; try { updateStatus(await call('downloadUpdate')); } catch (e) { updateStatus({ status: 'error', message: errorMessage(e) }); } finally { $('btnDownloadUpdate').disabled = false; if (state.updateState) updateStatus(state.updateState); } };
  $('btnInstallUpdate').onclick = () => call('installUpdate').catch(e => toast(errorMessage(e), 'error'));
  $('historySearchInput').addEventListener('input', debounce(() => { state.history.search = $('historySearchInput').value; state.history.offset = 0; loadHistory(); })); $('btnRefreshHistory').onclick = loadHistory;
  $('btnHistoryPrev').onclick = () => { state.history.offset = Math.max(0, state.history.offset - state.history.limit); loadHistory(); }; $('btnHistoryNext').onclick = () => { state.history.offset += state.history.limit; loadHistory(); }; $('logsLevelSelect').onchange = loadLogs; $('btnRefreshLogs').onclick = loadLogs; $('btnExportHistory').onclick = () => call('exportHistory').catch(e => toast(errorMessage(e), 'error')); $('btnExportLogs').onclick = () => call('exportLogs').catch(e => toast(errorMessage(e), 'error'));
  document.addEventListener('change', e => {
    const duplicate = e.target.closest('[data-duplicate-path]'); if (duplicate && !duplicate.disabled) { if (duplicate.checked) state.analysis.selected.add(duplicate.dataset.duplicatePath); else state.analysis.selected.delete(duplicate.dataset.duplicatePath); $('btnDeleteDuplicates').disabled = !state.analysis.selected.size || !window.api?.deleteDuplicateFiles; }
    const select = e.target.closest('[data-select-path]'); if (select) { const item = state.largePage.items.find(x => x.path === select.dataset.selectPath); if (item) { if (select.checked) state.selected.set(item.path, item); else state.selected.delete(item.path); renderSelection(); } }
    const cleanup = e.target.closest('[data-cleanup-id]'); if (cleanup) { if (cleanup.checked) state.selectedCleanup.add(cleanup.dataset.cleanupId); else state.selectedCleanup.delete(cleanup.dataset.cleanupId); renderCleanup(); }
  });
  document.addEventListener('click', async e => {
    const nav = e.target.closest('[data-tab]'); if (nav) { setTab(nav.dataset.tab); return; }
    const analysis = e.target.closest('[data-analysis-tab]'); if (analysis) { analysisTab(analysis.dataset.analysisTab); return; }
    const sub = e.target.closest('[data-settings-tab]'); if (sub) { settingsTab(sub.dataset.settingsTab); return; }
    const theme = e.target.closest('.theme-option[data-theme]'); if (theme) { saveSettings({ theme: theme.dataset.theme }); return; }
    const drive = e.target.closest('[data-drive]'); if (drive) { setTab('tree'); startScan(drive.dataset.drive); return; }
    const sort = e.target.closest('[data-sort]'); if (sort) { const scope = sort.dataset.scope === 'tree' ? state.treeSort : state.large; scope.sortOrder = scope.sortBy === sort.dataset.sort && scope.sortOrder === 'desc' ? 'asc' : 'desc'; scope.sortBy = sort.dataset.sort; if (sort.dataset.scope === 'tree') { if (state.treeSearch) await searchTree(); else { state.treeCache.clear(); state.expanded.clear(); await fetchChildren(state.treePath); renderTree(); } } else { state.large.offset = 0; loadLarge(); } return; }
    if (!e.target.closest('button,input,select,a')) { const row = e.target.closest('[data-tree-folder]'); if (row) { expandNode(row.dataset.treeFolder); return; } const file = e.target.closest('[data-tree-file]'); if (file) { document.querySelectorAll('.selected-file-row').forEach(x => x.classList.remove('selected-file-row')); file.classList.add('selected-file-row'); return; } const group = e.target.closest('[data-tree-group]'); if (group) { const k = key(group.dataset.treeGroup); if (state.fileGroups.has(k)) state.fileGroups.delete(k); else state.fileGroups.add(k); renderTree(); return; } }
    const b = e.target.closest('[data-action]'); if (!b || b.disabled) return; const p = b.dataset.path; const a = b.dataset.action;
    if (a === 'expand') expandNode(p); else if (a === 'focus') focusFolder(p); else if (a === 'group') { const k = key(p); if (state.fileGroups.has(k)) state.fileGroups.delete(k); else state.fileGroups.add(k); renderTree(); }
    else if (a === 'more-tree') { if ([...state.treeCache.values()].reduce((s, x) => s + x.items.length, 0) > MAX_TREE_ROWS) { toast('Daha fazla öğe için klasöre çift tıklayarak odaklan.'); return; } await fetchChildren(p, true); renderTree(); }
    else if (a === 'more-search') searchTree(true); else if (a === 'clear-search') { $('treeSearchInput').value = ''; searchTree(); }
    else if (a === 'open') call('openPath', p).catch(e => toast(errorMessage(e), 'error')); else if (a === 'details') showDetails(findItem(p)); else if (a === 'move') moveItems([findItem(p)]); else if (a === 'delete') confirmDelete([findItem(p)]); else if (a === 'cleanup-details') cleanupDetails(b.dataset.category); else if (a === 'program-advice') programAdvice(b.dataset.program);
    else if (a === 'map-drill') { const item = state.analysis.mapItems.find(x => key(x.path) === key(p)); if (item?.isDir) loadSpaceMap(p); else showDetails(item || findItem(p)); }
    else if (a === 'compare-snapshot') compareSnapshot(b.dataset.snapshotId);
  });
  window.api?.onScanProgress?.(progress);
  window.api?.onCleanProgress?.(data => { $('cleanProgress').textContent = `${data.title || 'İnceleniyor'}${data.total ? ` · ${data.current}/${data.total}` : ''}`; });
  window.api?.onUpdateStatus?.(updateStatus);
  window.api?.onAnalysisProgress?.(duplicateProgress);
  window.api?.onMoveProgress?.(data => { const bar = $('moveProgress'), text = $('moveProgressText'); if (bar) { if (data.percent != null) bar.value = data.percent; else if (data.totalBytes) bar.value = Math.min(100, 100 * (data.completedBytes || data.copiedBytes || data.bytesCopied || 0) / data.totalBytes); } if (text) text.textContent = data.message || `${data.phase === 'verifying' ? 'Kopya doğrulanıyor · ' : ''}${data.currentPath || data.name || 'Dosya işleniyor'}${data.percent != null ? ` · %${Math.round(data.percent)}` : ''}`; });
}

async function initialize() {
  bindEvents(); renderTree(); renderLarge();
  try { const result = await call('getSettings'); state.settings = { ...state.settings, ...(result.settings || result) }; state.currentTarget = result.systemDrive || state.currentTarget; state.treePath = state.currentTarget; $('appVersion').textContent = result.version ? `v${result.version}` : 'Voldena'; applySettings(); if (result.update) updateStatus(result.update); } catch (e) { toast(errorMessage(e), 'error'); }
  await loadDrives(); const system = state.drives.find(d => d.isSystem) || state.drives.find(d => key(d.path) === key(state.currentTarget)); if (system) state.currentTarget = system.path; state.treePath = state.currentTarget; renderDrives();
  const autoStart = () => { if (state.autoStarted || document.hidden) return; state.autoStarted = true; requestAnimationFrame(() => requestAnimationFrame(() => { if (state.settings.autoScan !== false) startScan(state.currentTarget); })); };
  document.addEventListener('visibilitychange', autoStart); autoStart();
}
initialize().catch(e => toast(errorMessage(e), 'error'));
