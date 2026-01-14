#define AppName "The Storehouse"
#define AppPublisher "The Storehouse"
#define AppVersion "0.0.0"

[Setup]
AppId={{0D808AA6-A082-4465-9FDE-DB3BF68623D8}}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\The Storehouse
DefaultGroupName=The Storehouse
DisableProgramGroupPage=yes
DisableDirPage=no
UsePreviousAppDir=yes
PrivilegesRequired=admin
OutputDir=dist
OutputBaseFilename=TheStorehouse-Setup
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Files]
Source: "dist\\TheStorehouse\\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "deploy\\windows\\installer\\config.json"; DestDir: "{commonappdata}\\The Storehouse\\config"; Flags: onlyifdoesntexist uninsneveruninstall

[Dirs]
Name: "{commonappdata}\\The Storehouse\\data"; Flags: uninsneveruninstall
Name: "{commonappdata}\\The Storehouse\\config"; Flags: uninsneveruninstall
Name: "{commonappdata}\\The Storehouse\\logs"; Flags: uninsneveruninstall

[Tasks]
Name: "firewall"; Description: "Add Windows Firewall rule for port 3040 (recommended)"; Flags: checkedonce

[Icons]
Name: "{group}\\Open The Storehouse"; Filename: "http://localhost:3040"

[Run]
Filename: "http://localhost:3040"; Description: "Open The Storehouse"; Flags: postinstall nowait shellexec

[Code]
const
  FirewallRuleName = 'The Storehouse (TCP 3040)';
  FirewallRegKey = 'Software\\The Storehouse';

var
  InstallChoicePage: TInputOptionWizardPage;
  RemoveDataCheckBox: TNewCheckBox;

function GetUninstallKey(): string;
begin
  Result := 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{{0D808AA6-A082-4465-9FDE-DB3BF68623D8}}_is1';
end;

function IsAppInstalled(): Boolean;
begin
  Result := RegKeyExists(HKLM, GetUninstallKey());
end;

function GetUninstallString(): string;
begin
  if not RegQueryStringValue(HKLM, GetUninstallKey(), 'UninstallString', Result) then begin
    Result := '';
  end;
end;

procedure RunExistingUninstaller();
var
  UninstallString: string;
  ResultCode: Integer;
begin
  UninstallString := GetUninstallString();
  if UninstallString = '' then begin
    MsgBox('No existing uninstall entry was found.', mbInformation, MB_OK);
    Exit;
  end;

  Exec(RemoveQuotes(UninstallString), '', '', SW_SHOW, ewWaitUntilTerminated, ResultCode);
end;

procedure InitializeWizard();
begin
  if IsAppInstalled() then begin
    InstallChoicePage := CreateInputOptionPage(
      wpWelcome,
      'The Storehouse is already installed',
      'Choose what you want to do',
      'Select Install/Update to keep your data, or Uninstall to remove the app.',
      True,
      False
    );
    InstallChoicePage.Add('Install/Update');
    InstallChoicePage.Add('Uninstall');
    InstallChoicePage.SelectedValueIndex := 0;
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if Assigned(InstallChoicePage) and (CurPageID = InstallChoicePage.ID) then begin
    if InstallChoicePage.SelectedValueIndex = 1 then begin
      WizardForm.Hide;
      RunExistingUninstaller();
      WizardForm.Close;
      Result := False;
    end;
  end;
end;

function ServiceExePath(AppDir: string): string;
begin
  Result := AddBackslash(AppDir) + 'service\\TheStorehouseService.exe';
end;

procedure StopAndUninstallService(AppDir: string);
var
  ResultCode: Integer;
  ServiceExe: string;
begin
  ServiceExe := ServiceExePath(AppDir);
  if FileExists(ServiceExe) then begin
    Exec(ServiceExe, 'stop', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec(ServiceExe, 'uninstall', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;

procedure InstallAndStartService(AppDir: string);
var
  ResultCode: Integer;
  ServiceExe: string;
begin
  ServiceExe := ServiceExePath(AppDir);
  if FileExists(ServiceExe) then begin
    Exec(ServiceExe, 'install', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec(ServiceExe, 'start', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;

procedure AddFirewallRuleIfSelected();
var
  ResultCode: Integer;
begin
  if WizardIsTaskSelected('firewall') then begin
    Exec('netsh',
      'advfirewall firewall show rule name="' + FirewallRuleName + '"',
      '',
      SW_HIDE,
      ewWaitUntilTerminated,
      ResultCode
    );
    if ResultCode <> 0 then begin
      Exec('netsh',
        'advfirewall firewall add rule name="' + FirewallRuleName +
        '" dir=in action=allow protocol=TCP localport=3040',
        '',
        SW_HIDE,
        ewWaitUntilTerminated,
        ResultCode
      );
      if ResultCode = 0 then begin
        RegWriteDWordValue(HKLM, FirewallRegKey, 'FirewallRuleAdded', 1);
      end;
    end;
  end;
end;

procedure RemoveFirewallRuleIfNeeded();
var
  ResultCode: Integer;
  Added: Cardinal;
begin
  if RegQueryDWordValue(HKLM, FirewallRegKey, 'FirewallRuleAdded', Added) and (Added = 1) then begin
    Exec('netsh',
      'advfirewall firewall delete rule name="' + FirewallRuleName + '"',
      '',
      SW_HIDE,
      ewWaitUntilTerminated,
      ResultCode
    );
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then begin
    StopAndUninstallService(ExpandConstant('{app}'));
  end;

  if CurStep = ssPostInstall then begin
    InstallAndStartService(ExpandConstant('{app}'));
    AddFirewallRuleIfSelected();
  end;
end;

procedure InitializeUninstallProgressForm();
begin
  RemoveDataCheckBox := TNewCheckBox.Create(UninstallProgressForm);
  RemoveDataCheckBox.Parent := UninstallProgressForm;
  RemoveDataCheckBox.Caption := 'Remove data stored in C:\\ProgramData\\The Storehouse';
  RemoveDataCheckBox.Checked := False;
  RemoveDataCheckBox.Left := UninstallProgressForm.StatusLabel.Left;
  RemoveDataCheckBox.Top := UninstallProgressForm.StatusLabel.Top + UninstallProgressForm.StatusLabel.Height + ScaleY(8);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then begin
    StopAndUninstallService(ExpandConstant('{app}'));
    RemoveFirewallRuleIfNeeded();
  end;

  if CurUninstallStep = usPostUninstall then begin
    if Assigned(RemoveDataCheckBox) and RemoveDataCheckBox.Checked then begin
      DelTree(ExpandConstant('{commonappdata}\\The Storehouse'), True, True, True);
    end;
    RegDeleteValue(HKLM, FirewallRegKey, 'FirewallRuleAdded');
  end;
end;
