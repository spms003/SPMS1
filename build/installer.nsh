!macro customHeader
  !define MUI_WELCOMEPAGE_TITLE "School Portal 설치"
  !define MUI_WELCOMEPAGE_TEXT "학교 서비스, 시간표, 급식, 학사일정과 교내 알림을 한곳에서 이용할 수 있는 School Portal을 설치합니다."
  !define MUI_FINISHPAGE_TITLE "설치가 완료되었습니다"
  !define MUI_FINISHPAGE_TEXT "School Portal은 Windows 시작 시 자동 실행되며 새 버전도 자동으로 내려받아 설치합니다."
!macroend

!macro customInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="School Portal 교내 알림"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="School Portal 교내 업데이트"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="School Portal 교내 알림" dir=in action=allow program="$INSTDIR\School Portal.exe" enable=yes profile=domain,private protocol=UDP localport=41234'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="School Portal 교내 업데이트" dir=in action=allow program="$INSTDIR\School Portal.exe" enable=yes profile=domain,private protocol=TCP'
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="School Portal 교내 알림"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="School Portal 교내 업데이트"'
!macroend
