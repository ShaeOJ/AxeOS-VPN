!macro customInstall
  ; Kill any running instances before install
  nsExec::ExecToLog 'taskkill /F /IM "AxeOS VPN Monitor.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "electron.exe"'
  Sleep 1000
!macroend

!macro customUnInstall
  ; Kill any running instances before uninstall
  nsExec::ExecToLog 'taskkill /F /IM "AxeOS VPN Monitor.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "electron.exe"'
  Sleep 1000
!macroend
