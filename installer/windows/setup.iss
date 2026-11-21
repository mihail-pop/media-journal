; Build with build.ps1. All downloaded application data stays separate from the
; private launcher/runtime, so replacing a release does not replace the library.
#if VER < EncodeVer(6, 7, 4)
  #error Use Inno Setup 6.7.4 or newer.
#endif
#ifndef InstallerVersion
  #define InstallerVersion "1.0.0"
#endif
#ifndef UvBinary
  #define UvBinary "..\..\build\windows-installer\uv\uv.exe"
#endif
#ifndef UvLicense
  #define UvLicense "..\..\build\windows-installer\uv-LICENSE-MIT.txt"
#endif

[Setup]
AppId={{34F1837F-4344-4EF6-91B7-A87F93C399DC}
AppName=Media Journal
AppVersion={#InstallerVersion}
AppPublisher=mihail-pop
AppPublisherURL=https://github.com/mihail-pop/media-journal
AppSupportURL=https://github.com/mihail-pop/media-journal/issues
AppUpdatesURL=https://github.com/mihail-pop/media-journal/releases
DefaultDirName={%USERPROFILE}\MediaJournal
DefaultGroupName=Media Journal
DisableProgramGroupPage=yes
DisableDirPage=no
PrivilegesRequired=lowest
; uv creates its own minor-version junction while installing Python. Inno's
; inherited RedirectionGuard blocks that operation (Windows error 448).
; The helpers still reject linked installation paths and validate uv's alias.
RedirectionGuard=no
ArchitecturesAllowed=x64os
ArchitecturesInstallIn64BitMode=x64os
MinVersion=10.0.22000
LicenseFile=..\..\LICENSE
SetupIconFile=..\..\core\static\core\icons\favicon.ico
UninstallDisplayIcon={app}\support\favicon.ico
OutputDir=..\..\dist\windows
OutputBaseFilename=MediaJournalSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=no
RestartApplications=no
SetupLogging=yes
ExtraDiskSpaceRequired=536870912
ChangesEnvironment=no
UsePreviousAppDir=yes
UsePreviousTasks=yes

[Messages]
WizardSelectTasks=Desktop Shortcut
SelectTasksDesc=Choose whether to add a desktop shortcut.
SelectTasksLabel2=The shortcut starts Media Journal and opens it in your browser.

[Tasks]
Name: "desktopicon"; Description: "Create a Media Journal desktop shortcut"; Flags: unchecked

[Files]
Source: "bootstrap.ps1"; Flags: dontcopy
Source: "bootstrap.ps1"; DestDir: "{app}\support"; Flags: ignoreversion
Source: "journal_launcher.py"; DestDir: "{app}\support"; Flags: ignoreversion
Source: "installed_settings.py"; DestDir: "{app}\support"; Flags: ignoreversion
Source: "service_host.py"; DestDir: "{app}\support"; Flags: ignoreversion
Source: "startup_service.ps1"; DestDir: "{app}\support"; Flags: ignoreversion
Source: "firewall_rules.ps1"; DestDir: "{app}\support"; Flags: ignoreversion
Source: "{#UvBinary}"; DestDir: "{app}\support"; DestName: "uv.exe"; Flags: ignoreversion
Source: "{#UvLicense}"; DestDir: "{app}\support\licenses"; DestName: "uv-LICENSE-MIT.txt"; Flags: ignoreversion
Source: "..\..\LICENSE"; DestDir: "{app}\support\licenses"; DestName: "Media-Journal-LICENSE.txt"; Flags: ignoreversion
Source: "..\..\core\static\core\icons\favicon.ico"; DestDir: "{app}\support"; Flags: ignoreversion
Source: "{srcexe}"; DestDir: "{app}\support"; DestName: "MediaJournalSetup.exe"; Flags: external ignoreversion; Check: CopySetupExecutable

[Icons]
Name: "{group}\Media Journal"; Filename: "{app}\runtime\env\Scripts\pythonw.exe"; Parameters: """{app}\support\journal_launcher.py"" open --root ""{app}"""; WorkingDir: "{app}"; IconFilename: "{app}\support\favicon.ico"
Name: "{group}\Stop Media Journal"; Filename: "{app}\runtime\env\Scripts\pythonw.exe"; Parameters: """{app}\support\journal_launcher.py"" stop --root ""{app}"""; WorkingDir: "{app}"; IconFilename: "{app}\support\favicon.ico"
Name: "{group}\Update Media Journal"; Filename: "{app}\support\MediaJournalSetup.exe"; Parameters: "/UPDATE /DIR=""{app}"""; WorkingDir: "{app}"; IconFilename: "{app}\support\favicon.ico"
Name: "{group}\Uninstall Media Journal"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Media Journal"; Filename: "{app}\runtime\env\Scripts\pythonw.exe"; Parameters: """{app}\support\journal_launcher.py"" open --root ""{app}"""; WorkingDir: "{app}"; IconFilename: "{app}\support\favicon.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\runtime\env\Scripts\pythonw.exe"; Parameters: """{app}\support\journal_launcher.py"" open --root ""{app}"""; WorkingDir: "{app}"; Description: "Open Media Journal"; Flags: nowait postinstall skipifsilent; Check: InstallationReady

[Code]
var
  ConnectionPage: TWizardPage;
  StartupPage: TWizardPage;
  PortEdit: TNewEdit;
  LanCheck: TNewCheckBox;
  BootCheck: TNewCheckBox;
  LoginCheck: TNewCheckBox;
  LastOutput: String;
  LastFailure: String;
  ReadSavedOptions: Boolean;
  DeleteLibrary: Boolean;
  BootstrapBusy: Boolean;
  InstallSucceeded: Boolean;
  OptionsRoot: String;

function Quote(const Value: String): String;
begin
  Result := '"' + Value + '"';
end;

function SelectedStartupMode: String;
begin
  if BootCheck.Checked then Result := 'before-login'
  else if LoginCheck.Checked then Result := 'after-login'
  else Result := 'manual';
end;

procedure StartupChoiceClick(Sender: TObject);
begin
  if (Sender = BootCheck) and BootCheck.Checked then LoginCheck.Checked := False;
  if (Sender = LoginCheck) and LoginCheck.Checked then BootCheck.Checked := False;
end;

procedure ShowValidationError(const Message: String);
begin
  Log(Message);
  if not WizardSilent then MsgBox(Message, mbError, MB_OK);
end;

function ApplyCommandLineOptions: Boolean;
var
  PortValue, Mode: String;
  Port: Integer;
begin
  Result := False;
  PortValue := ExpandConstant('{param:PORT|}');
  if PortValue <> '' then begin
    Port := StrToIntDef(PortValue, 0);
    if (Length(PortValue) > 5) or (Port < 1024) or (Port > 65535) then begin
      ShowValidationError('Enter a port between 1024 and 65535.');
      exit;
    end;
    PortEdit.Text := IntToStr(Port);
  end;
  Mode := Lowercase(ExpandConstant('{param:STARTUP|}'));
  if Mode <> '' then begin
    if (Mode <> 'manual') and (Mode <> 'after-login') and (Mode <> 'before-login') then begin
      ShowValidationError('Startup must be manual, after-login or before-login.');
      exit;
    end;
    BootCheck.Checked := Mode = 'before-login';
    LoginCheck.Checked := Mode = 'after-login';
  end;
  Result := True;
end;

function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo, MemoTypeInfo,
  MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
var
  Network, Startup: String;
begin
  if LanCheck.Checked then Network := 'Local network'
  else Network := 'This PC only';
  if BootCheck.Checked then Startup := 'When Windows starts (before sign-in)'
  else if LoginCheck.Checked then Startup := 'When I sign in'
  else Startup := 'Manual';
  Result := MemoDirInfo + NewLine + NewLine + 'Connection:' + NewLine +
    Space + 'Port: ' + PortEdit.Text + NewLine + Space + 'Access: ' + Network +
    NewLine + NewLine + 'Startup:' + NewLine + Space + Startup;
  if MemoTasksInfo <> '' then Result := Result + NewLine + NewLine + MemoTasksInfo;
end;

procedure OnBootstrapOutput(const S: String; const Error, FirstLine: Boolean);
begin
  Log(S);
  if Pos('ERROR|', S) = 1 then
    LastFailure := Copy(S, 7, Length(S));
  if Pos('CONFIG_PORT|', S) = 1 then begin
    if ReadSavedOptions then PortEdit.Text := Copy(S, 13, Length(S));
  end else if Pos('CONFIG_LAN|', S) = 1 then begin
    if ReadSavedOptions then LanCheck.Checked := Copy(S, 12, Length(S)) = '1';
  end else if Pos('CONFIG_STARTUP|', S) = 1 then begin
    if ReadSavedOptions then begin
      BootCheck.Checked := Copy(S, 16, Length(S)) = 'before-login';
      LoginCheck.Checked := Copy(S, 16, Length(S)) = 'after-login';
    end;
  end else if Pos('STATUS|', S) = 1 then begin
    if not IsUninstaller then begin
      WizardForm.StatusLabel.Caption := Copy(S, 8, Length(S));
      WizardForm.FilenameLabel.Caption := '';
    end;
  end else if (Trim(S) <> '') and not Error then begin
    LastOutput := S;
    if not IsUninstaller then
      WizardForm.FilenameLabel.Caption := Copy(S, 1, 110);
  end;
end;

function RunBootstrap(const Script, Action, Root, Extra: String): Boolean;
var
  Code: Integer;
  Params: String;
begin
  LastFailure := '';
  LastOutput := '';
  Params := '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ' +
    Quote(Script) + ' -Action ' + Action + ' -InstallRoot ' + Quote(Root) + Extra;
  BootstrapBusy := True;
  if not IsUninstaller then WizardForm.CancelButton.Enabled := False;
  try
    try
      Result := ExecAndLogOutput(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
        Params, '', SW_HIDE, ewWaitUntilTerminated, Code, @OnBootstrapOutput);
      Result := Result and (Code = 0);
    except
      LastFailure := GetExceptionMessage;
      Result := False;
    end;
  finally
    BootstrapBusy := False;
    if not IsUninstaller then WizardForm.CancelButton.Enabled := True;
  end;
  if not Result and (LastFailure = '') then begin
    LastFailure := LastOutput;
    if LastFailure = '' then LastFailure := 'The setup helper could not finish. Check the setup log for details.';
  end;
end;

procedure CancelButtonClick(CurPageID: Integer; var Cancel, Confirm: Boolean);
begin
  if BootstrapBusy then begin
    Cancel := False;
    Confirm := False;
  end;
end;

function CopySetupExecutable: Boolean;
begin
  Result := CompareText(ExpandConstant('{srcexe}'),
    ExpandConstant('{app}\support\MediaJournalSetup.exe')) <> 0;
end;

function InstallationReady: Boolean;
begin
  Result := InstallSucceeded;
end;

function GetCustomSetupExitCode: Integer;
begin
  if InstallSucceeded then Result := 0 else Result := 1;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if (CurPageID = wpFinished) and not InstallSucceeded then begin
    WizardForm.FinishedHeadingLabel.Caption := 'Setup could not finish';
    WizardForm.FinishedLabel.Caption := LastFailure + #13#10#13#10 +
      'Run Setup again to retry.' + #13#10#13#10 +
      'Log: ' + ExpandConstant('{app}\logs\setup.log');
  end;
end;

procedure InitializeWizard;
var
  LabelControl: TNewStaticText;
begin
  ConnectionPage := CreateCustomPage(wpSelectDir, 'Connection',
    'Choose the port and network access.');
  LabelControl := TNewStaticText.Create(ConnectionPage);
  LabelControl.Parent := ConnectionPage.Surface;
  LabelControl.Caption := 'Port';
  LabelControl.Top := ScaleY(4);
  PortEdit := TNewEdit.Create(ConnectionPage);
  PortEdit.Parent := ConnectionPage.Surface;
  PortEdit.Top := ScaleY(23);
  PortEdit.Width := ScaleX(110);
  PortEdit.Text := '8084';
  PortEdit.MaxLength := 5;
  LabelControl := TNewStaticText.Create(ConnectionPage);
  LabelControl.Parent := ConnectionPage.Surface;
  LabelControl.Top := PortEdit.Top + PortEdit.Height + ScaleY(6);
  LabelControl.Width := ConnectionPage.SurfaceWidth;
  LabelControl.Height := ScaleY(28);
  LabelControl.AutoSize := False;
  LabelControl.WordWrap := True;
  LabelControl.Caption := 'A free port is selected automatically. Change it if needed.';
  LanCheck := TNewCheckBox.Create(ConnectionPage);
  LanCheck.Parent := ConnectionPage.Surface;
  LanCheck.Top := LabelControl.Top + LabelControl.Height + ScaleY(12);
  LanCheck.Width := ConnectionPage.SurfaceWidth;
  LanCheck.Caption := 'Allow access from other devices on this network';
  LabelControl := TNewStaticText.Create(ConnectionPage);
  LabelControl.Parent := ConnectionPage.Surface;
  LabelControl.Top := LanCheck.Top + LanCheck.Height + ScaleY(6);
  LabelControl.Width := ConnectionPage.SurfaceWidth;
  LabelControl.Height := ScaleY(32);
  LabelControl.AutoSize := False;
  LabelControl.WordWrap := True;
  LabelControl.Caption := 'Private networks only. Administrator approval required.';

  StartupPage := CreateCustomPage(ConnectionPage.ID, 'Startup',
    'Choose when Media Journal starts automatically.');
  BootCheck := TNewCheckBox.Create(StartupPage);
  BootCheck.Parent := StartupPage.Surface;
  BootCheck.Top := ScaleY(8);
  BootCheck.Width := StartupPage.SurfaceWidth;
  BootCheck.Caption := 'Start when Windows starts';
  BootCheck.OnClick := @StartupChoiceClick;
  LabelControl := TNewStaticText.Create(StartupPage);
  LabelControl.Parent := StartupPage.Surface;
  LabelControl.Left := ScaleX(22);
  LabelControl.Top := BootCheck.Top + BootCheck.Height + ScaleY(4);
  LabelControl.Width := StartupPage.SurfaceWidth - LabelControl.Left;
  LabelControl.Caption := 'Runs before sign-in. Administrator approval required.';

  LoginCheck := TNewCheckBox.Create(StartupPage);
  LoginCheck.Parent := StartupPage.Surface;
  LoginCheck.Top := ScaleY(83);
  LoginCheck.Width := StartupPage.SurfaceWidth;
  LoginCheck.Caption := 'Start when I sign in to Windows';
  LoginCheck.OnClick := @StartupChoiceClick;
  LabelControl := TNewStaticText.Create(StartupPage);
  LabelControl.Parent := StartupPage.Surface;
  LabelControl.Left := ScaleX(22);
  LabelControl.Top := LoginCheck.Top + LoginCheck.Height + ScaleY(4);
  LabelControl.Width := StartupPage.SurfaceWidth - LabelControl.Left;
  LabelControl.Caption := 'Runs after you sign in.';

  LabelControl := TNewStaticText.Create(StartupPage);
  LabelControl.Parent := StartupPage.Surface;
  LabelControl.Top := ScaleY(166);
  LabelControl.Width := StartupPage.SurfaceWidth;
  LabelControl.Caption := 'Leave both unchecked to start it manually.';
  ReadSavedOptions := True;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Port: Integer;
begin
  Result := True;
  if CurPageID = wpSelectDir then begin
    if CompareText(OptionsRoot, WizardDirValue) <> 0 then begin
      ReadSavedOptions := True;
      BootCheck.Checked := False;
      LoginCheck.Checked := False;
      OptionsRoot := WizardDirValue;
    end;
    ExtractTemporaryFile('bootstrap.ps1');
    Result := RunBootstrap(ExpandConstant('{tmp}\bootstrap.ps1'), 'Validate', WizardDirValue, '');
    if Result then Result := ApplyCommandLineOptions
    else ShowValidationError(LastFailure);
  end;
  if CurPageID = ConnectionPage.ID then begin
    Port := StrToIntDef(PortEdit.Text, 0);
    Result := (Port >= 1024) and (Port <= 65535);
    if not Result then ShowValidationError('Enter a port between 1024 and 65535.')
    else begin
      Result := RunBootstrap(ExpandConstant('{tmp}\bootstrap.ps1'), 'ValidatePort',
        WizardDirValue, ' -Port ' + PortEdit.Text);
      if not Result then ShowValidationError(LastFailure);
    end;
    ReadSavedOptions := False;
  end;
  if (CurPageID = StartupPage.ID) and WizardSilent and BootCheck.Checked and not IsAdmin then begin
    ShowValidationError('Before-sign-in startup requires an elevated installer for silent installation.');
    Result := False;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  ExtractTemporaryFile('bootstrap.ps1');
  if CompareText(OptionsRoot, WizardDirValue) <> 0 then begin
    ReadSavedOptions := True;
    OptionsRoot := WizardDirValue;
    if not RunBootstrap(ExpandConstant('{tmp}\bootstrap.ps1'), 'Validate', WizardDirValue, '') then begin
      Result := LastFailure;
      exit;
    end;
    if not ApplyCommandLineOptions then begin
      Result := 'Check the port and startup options.';
      exit;
    end;
  end;
  if not RunBootstrap(ExpandConstant('{tmp}\bootstrap.ps1'), 'ValidatePort',
    WizardDirValue, ' -Port ' + PortEdit.Text) then begin
    Result := LastFailure;
    exit;
  end;
  if RunBootstrap(ExpandConstant('{tmp}\bootstrap.ps1'), 'Prepare', WizardDirValue, '') then
    Result := ''
  else Result := LastFailure;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Extra: String;
begin
  if CurStep = ssPostInstall then begin
    Extra := ' -Port ' + PortEdit.Text;
    if LanCheck.Checked then Extra := Extra + ' -AllowLAN';
    InstallSucceeded := RunBootstrap(ExpandConstant('{app}\support\bootstrap.ps1'), 'Install', ExpandConstant('{app}'), Extra);
    if InstallSucceeded then
      InstallSucceeded := RunBootstrap(ExpandConstant('{app}\support\bootstrap.ps1'), 'ConfigureStartup',
        ExpandConstant('{app}'), ' -StartupMode ' + SelectedStartupMode);
    if not InstallSucceeded then
      SuppressibleMsgBox(LastFailure + #13#10#13#10 + 'Details: ' + ExpandConstant('{app}\logs\setup.log'), mbError, MB_OK, IDOK);
  end;
end;

function InitializeUninstall: Boolean;
var
  Form: TSetupForm;
  LabelControl: TNewStaticText;
  DeleteCheck: TNewCheckBox;
  RemoveButton, CancelButton: TNewButton;
begin
  Result := False;
  Form := CreateCustomForm(ScaleX(430), ScaleY(180), False, False);
  try
    Form.Caption := 'Uninstall Media Journal';
    Form.ClientWidth := ScaleX(430);
    Form.ClientHeight := ScaleY(180);
    Form.Position := poScreenCenter;
    LabelControl := TNewStaticText.Create(Form);
    LabelControl.Parent := Form;
    LabelControl.Left := ScaleX(20);
    LabelControl.Top := ScaleY(20);
    LabelControl.Width := ScaleX(390);
    LabelControl.Height := ScaleY(55);
    LabelControl.AutoSize := False;
    LabelControl.WordWrap := True;
    LabelControl.Caption := 'Remove Media Journal and its private Python runtime? Your library is kept so you can reinstall later.';
    DeleteCheck := TNewCheckBox.Create(Form);
    DeleteCheck.Parent := Form;
    DeleteCheck.Left := ScaleX(20);
    DeleteCheck.Top := ScaleY(85);
    DeleteCheck.Width := ScaleX(390);
    DeleteCheck.Caption := 'Also permanently delete this installation''s library';
    RemoveButton := TNewButton.Create(Form);
    RemoveButton.Parent := Form;
    RemoveButton.Left := ScaleX(230);
    RemoveButton.Top := ScaleY(135);
    RemoveButton.Width := ScaleX(85);
    RemoveButton.Caption := 'Uninstall';
    RemoveButton.ModalResult := mrOk;
    CancelButton := TNewButton.Create(Form);
    CancelButton.Parent := Form;
    CancelButton.Left := ScaleX(325);
    CancelButton.Top := ScaleY(135);
    CancelButton.Width := ScaleX(85);
    CancelButton.Caption := 'Cancel';
    CancelButton.ModalResult := mrCancel;
    CancelButton.Cancel := True;
    CancelButton.Default := True;
    if Form.ShowModal <> mrOk then exit;
    DeleteLibrary := DeleteCheck.Checked;
  finally
    Form.Free;
  end;
  if DeleteLibrary then begin
    if MsgBox('Permanently delete the library, including saved items, images and backups inside this installation? This cannot be undone.', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) <> IDYES then exit;
  end;
  Result := True;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Extra: String;
begin
  if CurUninstallStep <> usUninstall then exit;
  Extra := '';
  if DeleteLibrary then Extra := ' -DeleteData';
  if not RunBootstrap(ExpandConstant('{app}\support\bootstrap.ps1'), 'Uninstall', ExpandConstant('{app}'), Extra) then begin
    MsgBox('Uninstall stopped to keep your files safe.' + #13#10#13#10 + LastFailure, mbError, MB_OK);
    { Inno documents Abort at usUninstall as stopping before any file deletion. }
    Abort;
  end;
end;
