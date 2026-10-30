!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "MUI2.nsh"
!include "FileFunc.nsh"
!ifndef BUILD_UNINSTALLER
Var VoldeOptionsDialog
Var VoldeDesktopControl
Var VoldeStartMenuControl
Var VoldeStartupControl
Var VoldeHiddenControl
Var VoldeDesktop
Var VoldeStartMenu
Var VoldeStartup
Var VoldeHidden
Var VoldenaUpdateMode
!endif

!macro customHeader
  !ifndef BUILD_UNINSTALLER
    RequestExecutionLevel admin
  !endif
!macroend

!macro customInit
  StrCpy $VoldenaUpdateMode 0
  StrCpy $VoldeDesktop 1
  StrCpy $VoldeStartMenu 1
  StrCpy $VoldeStartup 0
  StrCpy $VoldeHidden 0
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "--updated" $R1
  ${IfNot} ${Errors}
    StrCpy $VoldenaUpdateMode 1
  ${EndIf}
  ClearErrors
  ${GetOptions} $R0 "/NODESKTOP" $R1
  ${IfNot} ${Errors}
    StrCpy $VoldeDesktop 0
  ${EndIf}
  ClearErrors
  ${GetOptions} $R0 "/NOSTARTMENU" $R1
  ${IfNot} ${Errors}
    StrCpy $VoldeStartMenu 0
  ${EndIf}
  ClearErrors
!macroend

!macro customPageAfterChangeDir
  Page custom VoldeOptionsPage VoldeOptionsLeave
  !define MUI_PAGE_HEADER_TEXT "Voldena yükleniyor"
  !define MUI_PAGE_HEADER_SUBTEXT "Yeni sürüm hazırlanıyor. Kurulum tamamlandığında Voldena açılacak."
!macroend

!macro customInstallMode
  !ifndef BUILD_UNINSTALLER
  ${If} $VoldenaUpdateMode == 1
    ${If} $hasPerMachineInstallation == 1
      StrCpy $isForceMachineInstall 1
    ${Else}
      StrCpy $isForceCurrentInstall 1
    ${EndIf}
  ${EndIf}
  !endif
!macroend

!macro customFinishPage
  Function VoldenaStartApp
    ${StdUtils.ExecShellAsUser} $0 "$INSTDIR\VoldenaStorage.exe" "open" ""
  FunctionEnd
  Function VoldenaFinishPre
    ${If} $VoldenaUpdateMode == 1
      HideWindow
      ${StdUtils.ExecShellAsUser} $0 "$INSTDIR\VoldenaStorage.exe" "open" "--updated"
      Abort
    ${EndIf}
  FunctionEnd
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION VoldenaStartApp
  !define MUI_PAGE_CUSTOMFUNCTION_PRE VoldenaFinishPre
  !insertmacro MUI_PAGE_FINISH
!macroend

!ifndef BUILD_UNINSTALLER
Function VoldeOptionsPage
  ${If} $VoldenaUpdateMode == 1
    Abort
  ${EndIf}
  IfSilent 0 +2
    Abort
  !insertmacro MUI_HEADER_TEXT "Voldena başlangıç seçenekleri" "Kısayolları ve Windows açılışındaki davranışı seçin."
  nsDialogs::Create 1018
  Pop $VoldeOptionsDialog
  ${If} $VoldeOptionsDialog == error
    Abort
  ${EndIf}
  ${NSD_CreateCheckbox} 0 8u 100% 14u "Masaüstünde kısayol oluştur"
  Pop $VoldeDesktopControl
  ${NSD_SetState} $VoldeDesktopControl $VoldeDesktop
  ${NSD_CreateCheckbox} 0 32u 100% 14u "Başlat menüsüne kısayol ekle"
  Pop $VoldeStartMenuControl
  ${NSD_SetState} $VoldeStartMenuControl $VoldeStartMenu
  ${NSD_CreateCheckbox} 0 56u 100% 14u "Windows oturum açılışında Voldena’yı başlat"
  Pop $VoldeStartupControl
  ${NSD_SetState} $VoldeStartupControl $VoldeStartup
  ${NSD_CreateCheckbox} 0 80u 100% 14u "Küçültülmüş olarak bildirim alanında aç"
  Pop $VoldeHiddenControl
  ${NSD_SetState} $VoldeHiddenControl $VoldeHidden
  ${NSD_CreateLabel} 0 110u 100% 38u "Bu seçenekleri uygulamanın Ayarlar bölümünden değiştirebilirsiniz. Görev çubuğuna sabitlemek için uygulama simgesine sağ tıklayın."
  Pop $0
  nsDialogs::Show
FunctionEnd

Function VoldeOptionsLeave
  ${NSD_GetState} $VoldeDesktopControl $VoldeDesktop
  ${NSD_GetState} $VoldeStartMenuControl $VoldeStartMenu
  ${NSD_GetState} $VoldeStartupControl $VoldeStartup
  ${NSD_GetState} $VoldeHiddenControl $VoldeHidden
FunctionEnd

; XML text nodes need ampersands escaped, including custom installation paths.
Function VoldeXmlText
  Exch $R0
  Push $R1
  Push $R2
  Push $R3
  StrCpy $R1 ""
  StrCpy $R2 0
  volde_xml_loop:
    StrCpy $R3 $R0 1 $R2
    StrCmp $R3 "" volde_xml_done
    StrCmp $R3 "&" 0 volde_xml_ordinary
    StrCpy $R1 "$R1&amp;"
    Goto volde_xml_next
  volde_xml_ordinary:
    StrCpy $R1 "$R1$R3"
  volde_xml_next:
    IntOp $R2 $R2 + 1
    Goto volde_xml_loop
  volde_xml_done:
    StrCpy $R0 $R1
    Pop $R3
    Pop $R2
    Pop $R1
    Exch $R0
FunctionEnd
!endif

!macro customInstall
  ${IfNot} ${isUpdated}
    SetShellVarContext current
    ${If} $VoldeDesktop == 1
      CreateShortCut "$DESKTOP\Voldena Depolama Düzenleyicisi.lnk" "$INSTDIR\VoldenaStorage.exe" "" "$INSTDIR\VoldenaStorage.exe" 0
    ${EndIf}
    ${If} $VoldeStartMenu == 1
      CreateShortCut "$SMPROGRAMS\Voldena Depolama Düzenleyicisi.lnk" "$INSTDIR\VoldenaStorage.exe" "" "$INSTDIR\VoldenaStorage.exe" 0
    ${EndIf}
    ${If} $VoldeStartup == 1
      ReadEnvStr $1 USERDOMAIN
      ReadEnvStr $2 USERNAME
      Push $INSTDIR
      Call VoldeXmlText
      Pop $5
      Push "$1\$2"
      Call VoldeXmlText
      Pop $6
      FileOpen $0 "$PLUGINSDIR\volde-startup.xml" w
      FileWriteUTF16LE $0 '<?xml version="1.0" encoding="UTF-16"?><Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><Triggers><LogonTrigger><Enabled>true</Enabled><UserId>$6</UserId></LogonTrigger></Triggers><Principals><Principal id="Author"><UserId>$6</UserId><LogonType>InteractiveToken</LogonType><RunLevel>HighestAvailable</RunLevel></Principal></Principals><Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><ExecutionTimeLimit>PT0S</ExecutionTimeLimit></Settings><Actions Context="Author"><Exec><Command>$5\VoldenaStorage.exe</Command><Arguments>--startup</Arguments><WorkingDirectory>$5</WorkingDirectory></Exec></Actions></Task>'
      FileClose $0
      nsExec::ExecToStack '"$SYSDIR\schtasks.exe" /Create /TN "VoldenaStorageStartup" /XML "$PLUGINSDIR\volde-startup.xml" /F'
      Pop $0
      Pop $1
      ${If} $0 != 0
        StrCpy $VoldeStartup 0
        MessageBox MB_ICONEXCLAMATION "Windows başlangıç görevi oluşturulamadı. Uygulama ayarlarından yeniden deneyebilirsiniz."
      ${EndIf}
    ${EndIf}
    StrCpy $1 false
    StrCpy $2 false
    StrCpy $3 false
    StrCpy $4 false
    ${If} $VoldeDesktop == 1
      StrCpy $1 true
    ${EndIf}
    ${If} $VoldeStartMenu == 1
      StrCpy $2 true
    ${EndIf}
    ${If} $VoldeStartup == 1
      StrCpy $3 true
    ${EndIf}
    ${If} $VoldeHidden == 1
      StrCpy $4 true
    ${EndIf}
    FileOpen $0 "$INSTDIR\resources\installer-options.json" w
    FileWrite $0 '{"desktopShortcut":$1,"startMenuShortcut":$2,"launchAtLogin":$3,"startHidden":$4}'
    FileClose $0
  ${EndIf}
!macroend

!macro customUnInstall
  ${IfNot} ${isUpdated}
    SetShellVarContext current
    Delete "$DESKTOP\Voldena Depolama Düzenleyicisi.lnk"
    Delete "$SMPROGRAMS\Voldena Depolama Düzenleyicisi.lnk"
    nsExec::ExecToStack '"$SYSDIR\schtasks.exe" /Delete /TN "VoldenaStorageStartup" /F'
    Pop $0
    Pop $1
  ${EndIf}
!macroend
