# Windows installer

This is the source for the Windows 11 x64 installer. It installs the latest
published stable GitHub release, rather than `main` or the working directory.
Users do not need to install Python, pip or Git first. An internet connection is
needed during installation and updates.

## Using the installer

Run the setup EXE and choose the installation folder, port and startup options.
The default folder is `%USERPROFILE%\MediaJournal`. Setup runs for the current
Windows user without changing their system Python or `PATH`.

The **Media Journal** shortcut starts the app if necessary and opens it in the
browser. **Stop Media Journal** stops this installation's server. Closing a
browser tab does not stop the server. **Update Media Journal** opens Setup again
to install the latest stable release; starting the app does not check for updates.
Startup can be manual, after signing in, or when Windows starts before anyone
signs in. The two automatic choices are mutually exclusive. Before-sign-in
startup registers a Windows service running as LocalService and asks for
administrator approval. Changing or removing that service also requires approval.

Local access is the default. The optional local-network setting allows other
devices to connect using this PC's address and the chosen port. It requests
administrator approval to allow this installation's Python program and TCP port
through Windows Firewall on Private networks, restricted to the local subnet.
Setup updates its rule when the port or Python changes and removes it when
network access is disabled or the app is uninstalled. Router settings and HTTPS
configuration are unchanged.

Setup suggests an available port starting with `80` for a new installation and keeps the
saved port on updates. The port remains editable. Use a separate installation
folder when testing alongside an existing app. Setup does not import its library.

The optional desktop shortcut creates one **Media Journal** icon. It starts the
server if needed and opens the app in the browser. Stop, Update and Uninstall
are separate entries in the Start menu.

Uninstall through Windows **Installed apps** or the Start menu shortcut. The
default keeps the library so it can be used after reinstalling into the same
folder. Removing the library requires a separate explicit choice.

## Files in an installation

| Folder | Contents |
| --- | --- |
| `support` | Launcher, installer settings, update wizard and installation tools. |
| `runtime` | Private Python and the launcher environment. |
| `releases` | Downloaded application versions, their dependencies and generated static assets. |
| `library` | Persistent database, media and other library files. |
| `logs` | Installation and server logs. |

The installation marker and state files identify the managed installation.
Do not move its Python environments or manually remove these files. Setup rejects
an unrelated existing project folder instead of treating it as an installation.
Keep using the app's normal backup feature for portable library backups.

## Building and publishing

The GitHub Actions workflow **Windows installer** builds the EXE from the public
installer source. It can be run manually, and also runs when a release is
published. The build produces an installer and its SHA-256 checksum. Generated
EXEs, downloaded build tools and temporary files are ignored by Git and Docker.

To build locally, install the [official Inno Setup compiler](https://jrsoftware.org/inno-setup/downloads)
(6.7.4 or newer), then run this from the repository folder:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\installer\windows\build.ps1
```

If the compiler is in a different folder, pass `-CompilerPath` with its full
`ISCC.exe` path. The optional `-Version 1.0.0` argument changes the installer's
version metadata; the downloaded app version comes from the latest stable release.
The output is `dist/windows/MediaJournalSetup.exe` and its `.sha256` file.

The build uses the official Inno Setup compiler and a pinned, checksum-verified `uv`
binary. Those are installer/build tools; they do not belong in the app's
`requirements.txt`. Third-party licenses are included with the installed tools.

The EXE is unsigned unless a separate signing process is added. Windows can show
an unfamiliar-app warning; publishing a GitHub artifact does not sign it.

## Maintenance

- Normal app releases use the same installer flow: download the stable release,
  install its `requirements.txt`, migrate its own database and collect its static
  files. Existing native and Docker installations are unaffected.
- Python stays on the supported series selected in the bootstrap. Review that
  setting when the app changes its required Python version. The pinned `uv`
  release also determines which managed Python builds are available.
- Update the compiler/tool versions and their checksums together when needed.
- The Python series is in `bootstrap.ps1`, the `uv` version and checksum are in
  `build.ps1`, and the compiler download and release upload are in
  `.github/workflows/windows-installer.yml`.
- Keep the installer settings wrapper aligned if the app adds new storage paths
  or changes its startup requirements.
- Keep `RedirectionGuard=no` in `setup.iss`: Inno's inherited process protection
  otherwise blocks uv's own Python version junction with Windows error 448.
  The helpers separately validate installation paths and remove the expected
  uv alias after choosing the real Python directory.
- Updates keep the previous application environment and take a SQLite snapshot
  before migrations. This helps recover a failed update; it does not replace a
  normal backup of the library and media files.

Before publishing installer changes, check a fresh install, an update, both
startup modes, a port conflict, and both uninstall choices on a spare Windows
installation. Include service control from an ordinary signed-in account;
same-account checks cannot verify LocalService access. Building successfully
does not replace those installation checks.
