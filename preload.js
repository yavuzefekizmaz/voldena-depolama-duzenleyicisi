'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const invoke=channel=>(...args)=>ipcRenderer.invoke(channel,...args);
const listen=channel=>callback=>{const handler=(_event,value)=>callback(value);ipcRenderer.on(channel,handler);return()=>ipcRenderer.removeListener(channel,handler);};
contextBridge.exposeInMainWorld('api',{
  selectScan:invoke('select-scan'),getDrives:invoke('get-drives'),selectFolderDialog:invoke('select-folder-dialog'),startScan:invoke('start-scan'),stopScan:invoke('stop-scan'),pauseScan:invoke('pause-scan'),resumeScan:invoke('resume-scan'),
  getChildren:invoke('get-children'),getLargeFiles:invoke('get-large-files'),searchTree:invoke('search-tree'),
  getScanDiagnostics:invoke('get-scan-diagnostics'),getThumbnail:invoke('get-thumbnail'),getFileIcon:invoke('get-file-icon'),
  deletePath:invoke('delete-path'),deleteMultiple:invoke('delete-multiple'),showInFolder:invoke('show-in-folder'),openPath:invoke('open-path'),copyToClipboard:invoke('copy-to-clipboard'),getFileDetails:invoke('get-file-details'),
  scanCleanups:invoke('scan-cleanups'),cleanCategories:invoke('clean-categories'),planMove:invoke('plan-move'),executeMove:invoke('execute-move'),cancelMove:invoke('cancel-move'),
  getSettings:invoke('get-settings'),saveSettings:invoke('save-settings'),checkForUpdates:invoke('check-for-updates'),downloadUpdate:invoke('download-update'),installUpdate:invoke('install-update'),
  cancelDesktopMove:invoke('cancel-desktop-move'),planDesktopMove:invoke('plan-desktop-move'),executeDesktopMove:invoke('execute-desktop-move'),getPrograms:invoke('get-programs'),getProgramMoveTargets:invoke('get-program-move-targets'),planProgramMove:invoke('plan-program-move'),executeProgramMove:invoke('execute-program-move'),onProgramMoveProgress:listen('program-move-progress'),openSystemSettings:invoke('open-system-settings'),getRecommendations:invoke('get-recommendations'),exportReport:invoke('export-report'),
  getHistory:invoke('get-history'),getLogs:invoke('get-logs'),exportHistory:invoke('export-history'),exportLogs:invoke('export-logs'),
  createRestorePoint:invoke('create-restore-point'),getRestorePointStatus:invoke('get-restore-point-status'),
  getSpaceMap:invoke('get-space-map'),getFileStatistics:invoke('get-file-statistics'),findDuplicates:invoke('find-duplicates'),cancelAnalysis:invoke('cancel-analysis'),getDuplicateGroups:invoke('get-duplicate-groups'),deleteDuplicateFiles:invoke('delete-duplicate-files'),saveScanSnapshot:invoke('save-scan-snapshot'),getScanSnapshots:invoke('get-scan-snapshots'),compareScanSnapshot:invoke('compare-scan-snapshot'),onAnalysisProgress:listen('analysis-progress'),
  onScanProgress:listen('scan-progress'),onScanComplete:listen('scan-complete'),onCleanProgress:listen('cleanups-progress'),onMoveProgress:listen('move-progress'),onUpdateStatus:listen('update-status'),windowAction:invoke('window-action')
});
