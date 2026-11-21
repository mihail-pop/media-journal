"""Private Windows installation controller for Media Journal.

No third-party imports at startup: shortcuts use the small bootstrap environment,
while each downloaded release has its own dependency environment. This file does
not manage Python installations, projects or servers outside its marked root.
"""

from __future__ import annotations

import argparse
from contextlib import closing
import ctypes
from ctypes import wintypes
import datetime as dt
import hashlib
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import shutil
import socket
import sqlite3
import stat
import subprocess
import sys
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import ProxyHandler, Request, build_opener, urlopen
import uuid
import webbrowser
import zipfile


PRODUCT = "media-journal-windows"
SCHEMA_VERSION = 1
REPOSITORY = "mihail-pop/media-journal"
LATEST_RELEASE_URL = f"https://api.github.com/repos/{REPOSITORY}/releases/latest"
HEALTH_PATH = "/__media_journal_installer__/health"
MAX_ARCHIVE_BYTES = 250 * 1024 * 1024
MAX_EXTRACTED_BYTES = 750 * 1024 * 1024
MAX_ARCHIVE_FILES = 30000
DOWNLOAD_TIMEOUT = 600
STOP_TIMEOUT = 120
CREATE_NO_WINDOW = 0x08000000
LOG = logging.getLogger("media_journal_installer")


class InstallError(Exception):
    """An actionable error suitable for the installer or shortcut dialog."""


def atomic_json(path: Path, value: dict) -> None:
    temporary = path.with_name(path.name + ".tmp")
    ensure_no_links(path)
    ensure_no_links(temporary)
    with temporary.open("w", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def read_json(path: Path) -> dict:
    ensure_no_links(path)
    if path.stat().st_size > 1024 * 1024:
        raise InstallError(f"The installation file is unexpectedly large: {path.name}")
    with path.open(encoding="utf-8-sig") as stream:
        value = json.load(stream)
    if not isinstance(value, dict):
        raise InstallError(f"The installation file is invalid: {path.name}")
    return value


def is_reparse(path: Path) -> bool:
    details = path.lstat()
    return path.is_symlink() or bool(getattr(details, "st_file_attributes", 0) & 0x400)


def ensure_no_links(path: Path) -> None:
    """Check every existing component, including junctions on Windows."""
    for component in (path, *path.parents):
        if component.exists() or component.is_symlink():
            if is_reparse(component):
                raise InstallError(f"Linked folders are not supported in the installation path: {component}")


def owned_path(root: Path, path: Path) -> Path:
    root = root.resolve(strict=True)
    candidate = Path(os.path.abspath(path))
    ensure_no_links(candidate)
    resolved = candidate.resolve()
    if resolved == root or root not in resolved.parents:
        raise InstallError("Refusing to operate outside the Media Journal installation folder.")
    return resolved


def remove_owned(root: Path, path: Path) -> None:
    target = owned_path(root, path)
    if not target.exists():
        return
    if target.is_dir():
        ensure_tree_no_links(target)
        shutil.rmtree(target)
    else:
        target.unlink()


def ensure_tree_no_links(folder: Path) -> None:
    """A recursive deletion must not follow a junction nested in the tree."""
    ensure_no_links(folder)
    if folder.exists():
        for current, directories, files in os.walk(folder, followlinks=False):
            for name in (*directories, *files):
                if is_reparse(Path(current) / name):
                    raise InstallError(f"Refusing to remove a linked entry: {name}")


def load_root(value: str, *, require_release: bool = False) -> tuple[Path, dict]:
    path = Path(os.path.abspath(value))
    ensure_no_links(path)
    root = path.resolve(strict=True)
    forbidden = {Path.home().resolve(), Path(root.anchor)}
    for name in ("USERPROFILE", "LOCALAPPDATA", "APPDATA", "PROGRAMFILES", "WINDIR"):
        if os.environ.get(name):
            forbidden.add(Path(os.environ[name]).resolve())
    if root in forbidden or len(root.parts) < 3:
        raise InstallError("Choose a dedicated Media Journal installation folder.")
    if any((root / name).exists() for name in ("manage.py", ".git", "core", "media_journal")):
        raise InstallError("This is an existing source checkout. Choose a separate installation folder.")
    marker = owned_path(root, root / "install-state.json")
    state = read_json(marker)
    if state.get("product") != PRODUCT or state.get("schema_version") != SCHEMA_VERSION:
        raise InstallError("This folder does not belong to a supported Media Journal installer.")
    try:
        uuid.UUID(state["installation_id"])
    except (KeyError, ValueError, TypeError) as error:
        raise InstallError("The installation identity is invalid.") from error
    # Prevent accidentally invoking this controller against an unrelated folder.
    if Path(__file__).resolve().parent != root / "support":
        raise InstallError("The launcher must run from this installation's support folder.")
    if require_release:
        release_paths(root, state)
    return root, state


def release_paths(root: Path, state: dict) -> tuple[Path, Path]:
    token = state.get("active_release")
    if not isinstance(token, str) or not re.fullmatch(r"[0-9]{14}-[a-f0-9]{8}", token):
        raise InstallError("Installation is not complete. Run Media Journal Setup again.")
    release = owned_path(root, root / "releases" / token)
    source = owned_path(root, release / "application")
    python = owned_path(root, release / "env" / "Scripts" / "python.exe")
    if not (source / "manage.py").is_file() or not python.is_file():
        raise InstallError("The installed release is incomplete. Run Media Journal Setup again.")
    return source, python


def recover_update(root: Path, state: dict) -> None:
    """Recover a power loss between database migration and pointer commit.

    Caller holds the action mutex. A committed active pointer wins; otherwise the
    old code's database/configuration are restored before any server can start.
    """
    journal = owned_path(root, root / "update-transaction.json")
    if not journal.exists():
        return
    transaction = read_json(journal)
    token = transaction.get("candidate")
    if not isinstance(token, str) or not re.fullmatch(r"[0-9]{14}-[a-f0-9]{8}", token):
        raise InstallError("The interrupted update journal is invalid. Setup has stopped to protect your library.")
    if state.get("active_release") == token:
        journal.unlink()
        return
    if transaction.get("previous_release") != state.get("active_release"):
        raise InstallError("The interrupted update does not match this installation. Setup has stopped to protect your library.")
    if WindowsObjects(root, state).running():
        stop_server(root, state)
    snapshot = owned_path(root, root / "releases" / token / "before-update.sqlite3")
    database = owned_path(root, root / "library" / "data" / "db.sqlite3")
    LOG.info("Restoring an interrupted update before starting Media Journal...")
    restore_database(root, database, snapshot, transaction["had_database"])
    config_path = owned_path(root, root / "config.json")
    if transaction.get("previous_config") is not None:
        atomic_json(config_path, transaction["previous_config"])
    else:
        remove_owned(root, config_path)
    journal.unlink()
    LOG.info("The previous library and release have been restored.")


def load_config(root: Path) -> dict:
    config = read_json(owned_path(root, root / "config.json"))
    port = config.get("port")
    if not isinstance(port, int) or isinstance(port, bool) or not 1024 <= port <= 65535:
        raise InstallError("The configured port must be a number from 1024 to 65535.")
    if not isinstance(config.get("secret_key"), str) or len(config["secret_key"]) < 32:
        raise InstallError("The installation's secret key is missing or invalid.")
    if not isinstance(config.get("lan", False), bool):
        raise InstallError("The lan setting must be true or false.")
    return config


def configure_logging(root: Path, command: str) -> None:
    folder = owned_path(root, root / "logs")
    folder.mkdir(exist_ok=True)
    LOG.setLevel(logging.INFO)
    log = owned_path(root, folder / f"{command}.log")
    for suffix in (".1", ".2"):
        owned_path(root, log.with_name(log.name + suffix))
    handler = RotatingFileHandler(log, maxBytes=5 * 1024 * 1024, backupCount=2, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    LOG.addHandler(handler)
    if sys.stdout is not None:
        console = logging.StreamHandler(sys.stdout)
        console.setFormatter(logging.Formatter("%(message)s"))
        LOG.addHandler(console)


class WindowsObjects:
    """Per-installation Windows objects; a second installation has different names."""

    WAIT_OBJECT_0 = 0
    WAIT_ABANDONED = 0x80
    WAIT_TIMEOUT = 0x102

    def __init__(self, root: Path, state: dict):
        if os.name != "nt":
            raise InstallError("This installer is supported on Windows only.")
        self.api = ctypes.WinDLL("kernel32", use_last_error=True)
        self.api.CreateMutexW.argtypes = (ctypes.c_void_p, wintypes.BOOL, wintypes.LPCWSTR)
        self.api.CreateMutexW.restype = wintypes.HANDLE
        self.api.CreateEventW.argtypes = (ctypes.c_void_p, wintypes.BOOL, wintypes.BOOL, wintypes.LPCWSTR)
        self.api.CreateEventW.restype = wintypes.HANDLE
        self.api.OpenEventW.argtypes = (wintypes.DWORD, wintypes.BOOL, wintypes.LPCWSTR)
        self.api.OpenEventW.restype = wintypes.HANDLE
        self.api.OpenMutexW.argtypes = (wintypes.DWORD, wintypes.BOOL, wintypes.LPCWSTR)
        self.api.OpenMutexW.restype = wintypes.HANDLE
        self.api.WaitForSingleObject.argtypes = (wintypes.HANDLE, wintypes.DWORD)
        self.api.WaitForSingleObject.restype = wintypes.DWORD
        for function in ("CloseHandle", "ReleaseMutex", "SetEvent"):
            getattr(self.api, function).argtypes = (wintypes.HANDLE,)
            getattr(self.api, function).restype = wintypes.BOOL
        digest = hashlib.sha256((str(root).casefold() + state["installation_id"]).encode()).hexdigest()[:32]
        # A boot service runs in session 0; browser shortcuts run in the signed-in
        # user's session. Share only this installation's objects across sessions.
        self.prefix = f"Global\\MediaJournal-{digest}"
        owner = state.get("owner_sid")
        if owner is not None and (not isinstance(owner, str) or not re.fullmatch(r"S-1-\d+(?:-\d+){1,15}", owner)):
            raise InstallError("The installation owner is invalid. Run Setup to repair it.")
        self.owner_sid = owner
        self.security_api = ctypes.WinDLL("advapi32", use_last_error=True)
        self.security_api.ConvertStringSecurityDescriptorToSecurityDescriptorW.argtypes = (
            wintypes.LPCWSTR, wintypes.DWORD, ctypes.POINTER(ctypes.c_void_p), ctypes.c_void_p,
        )
        self.security_api.ConvertStringSecurityDescriptorToSecurityDescriptorW.restype = wintypes.BOOL
        self.api.LocalFree.argtypes = (ctypes.c_void_p,)
        self.api.LocalFree.restype = ctypes.c_void_p

    def create_object(self, function, *arguments):
        if not self.owner_sid:
            return function(None, *arguments)

        class SecurityAttributes(ctypes.Structure):
            _fields_ = [("nLength", wintypes.DWORD), ("lpSecurityDescriptor", ctypes.c_void_p), ("bInheritHandle", wintypes.BOOL)]

        descriptor = ctypes.c_void_p()
        # No Everyone/Users grant: only this owner, LocalService and administrators.
        # A service/elevated process must not stamp a high integrity label onto
        # an event that the ordinary desktop owner needs to signal later.
        sddl = f"D:(A;;GA;;;SY)(A;;GA;;;BA)(A;;GA;;;LS)(A;;GA;;;{self.owner_sid})S:(ML;;NW;;;ME)"
        if not self.security_api.ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl, 1, ctypes.byref(descriptor), None):
            raise ctypes.WinError(ctypes.get_last_error())
        attributes = SecurityAttributes(ctypes.sizeof(SecurityAttributes), descriptor, False)
        try:
            return function(ctypes.byref(attributes), *arguments)
        finally:
            self.api.LocalFree(descriptor)

    def mutex(self, name: str) -> int:
        handle = self.create_object(self.api.CreateMutexW, False, self.prefix + "-" + name)
        if not handle:
            raise ctypes.WinError(ctypes.get_last_error())
        result = self.api.WaitForSingleObject(handle, 0)
        if result not in (self.WAIT_OBJECT_0, self.WAIT_ABANDONED):
            self.api.CloseHandle(handle)
            if result == self.WAIT_TIMEOUT:
                raise InstallError("Another Media Journal action is already running. Try again when it finishes.")
            raise ctypes.WinError(ctypes.get_last_error())
        return handle

    def unlock(self, handle: int) -> None:
        self.api.ReleaseMutex(handle)
        self.api.CloseHandle(handle)

    def running(self, name: str = "server") -> bool:
        handle = self.api.OpenMutexW(0x00100000 | 0x0001, False, self.prefix + "-" + name)
        if not handle:
            code = ctypes.get_last_error()
            if code == 2:  # No named server mutex exists.
                return False
            raise ctypes.WinError(code)
        try:
            status = self.api.WaitForSingleObject(handle, 0)
            if status in (self.WAIT_OBJECT_0, self.WAIT_ABANDONED):
                self.api.ReleaseMutex(handle)
                return False
            if status != self.WAIT_TIMEOUT:
                raise ctypes.WinError(ctypes.get_last_error())
            return True
        finally:
            self.api.CloseHandle(handle)

    def create_stop_event(self) -> int:
        handle = self.create_object(self.api.CreateEventW, True, False, self.prefix + "-stop")
        if not handle:
            raise ctypes.WinError(ctypes.get_last_error())
        return handle

    def signal_stop(self) -> bool:
        handle = self.api.OpenEventW(0x0002, False, self.prefix + "-stop")
        if not handle:
            if ctypes.get_last_error() == 2:
                return False
            raise ctypes.WinError(ctypes.get_last_error())
        try:
            if not self.api.SetEvent(handle):
                raise ctypes.WinError(ctypes.get_last_error())
        finally:
            self.api.CloseHandle(handle)
        return True


def service_name(state: dict) -> str:
    return "MediaJournal-" + uuid.UUID(state["installation_id"]).hex


def service_command(root: Path) -> str:
    return (f'"{root / "runtime" / "env" / "Scripts" / "python.exe"}" -B '
            f'"{root / "support" / "service_host.py"}" --root "{root}"')


class WindowsService:
    """Control only the service whose binary path belongs to this installation."""

    class Status(ctypes.Structure):
        _fields_ = [(name, wintypes.DWORD) for name in (
            "service_type", "state", "accepted", "error", "specific_error", "checkpoint", "wait_hint",
        )]

    def __init__(self, root: Path, state: dict):
        self.root, self.state = root, state
        self.name = service_name(state)
        self.api = ctypes.WinDLL("advapi32", use_last_error=True)
        self.api.OpenSCManagerW.argtypes = (wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD)
        self.api.OpenSCManagerW.restype = wintypes.HANDLE
        self.api.OpenServiceW.argtypes = (wintypes.HANDLE, wintypes.LPCWSTR, wintypes.DWORD)
        self.api.OpenServiceW.restype = wintypes.HANDLE
        self.api.CloseServiceHandle.argtypes = (wintypes.HANDLE,)
        self.api.CloseServiceHandle.restype = wintypes.BOOL
        self.api.QueryServiceStatus.argtypes = (wintypes.HANDLE, ctypes.POINTER(self.Status))
        self.api.QueryServiceStatus.restype = wintypes.BOOL
        self.api.StartServiceW.argtypes = (wintypes.HANDLE, wintypes.DWORD, ctypes.c_void_p)
        self.api.StartServiceW.restype = wintypes.BOOL
        self.api.ControlService.argtypes = (wintypes.HANDLE, wintypes.DWORD, ctypes.POINTER(self.Status))
        self.api.ControlService.restype = wintypes.BOOL

    def exists(self) -> bool:
        import winreg
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, rf"SYSTEM\CurrentControlSet\Services\{self.name}") as key:
                image = winreg.QueryValueEx(key, "ImagePath")[0]
                account = winreg.QueryValueEx(key, "ObjectName")[0]
        except FileNotFoundError:
            return False
        if image.strip().casefold() != service_command(self.root).casefold() or account.casefold() != r"nt authority\localservice":
            raise InstallError("The Windows service does not match this installation. Run Setup to repair startup.")
        return True

    def connect(self, rights: int):
        manager = self.api.OpenSCManagerW(None, None, 1)
        if not manager:
            raise ctypes.WinError(ctypes.get_last_error())
        try:
            handle = self.api.OpenServiceW(manager, self.name, rights)
            if not handle:
                raise ctypes.WinError(ctypes.get_last_error())
            return handle
        finally:
            self.api.CloseServiceHandle(manager)

    def status(self, handle) -> Status:
        result = self.Status()
        if not self.api.QueryServiceStatus(handle, ctypes.byref(result)):
            raise ctypes.WinError(ctypes.get_last_error())
        return result

    def start(self) -> None:
        if not self.exists():
            raise InstallError("Startup service is missing. Run Setup to repair startup.")
        handle = self.connect(0x0004 | 0x0010)
        try:
            status = self.status(handle)
            if status.state == 1 and not self.api.StartServiceW(handle, 0, None):
                code = ctypes.get_last_error()
                if code != 1056:  # Already started by another shortcut.
                    raise ctypes.WinError(code)
            deadline = time.monotonic() + 60
            while True:
                status = self.status(handle)
                if status.state == 4:
                    return
                if status.state == 1:
                    raise InstallError(f"Media Journal could not start. See {self.root / 'logs' / 'service.log'}.")
                if time.monotonic() >= deadline:
                    raise InstallError("Media Journal is still starting. Try opening it again shortly.")
                time.sleep(0.2)
        finally:
            self.api.CloseServiceHandle(handle)

    def stop(self) -> bool:
        if not self.exists():
            return False
        handle = self.connect(0x0004 | 0x0020)
        try:
            status = self.status(handle)
            deadline = time.monotonic() + STOP_TIMEOUT + 15
            objects = WindowsObjects(self.root, self.state)
            if status.state == 1:
                was_running = objects.running("service-host")
                while objects.running("service-host"):
                    if time.monotonic() >= deadline:
                        raise InstallError("Media Journal is still stopping. Try again shortly.")
                    time.sleep(0.1)
                return was_running
            # START_PENDING services cannot accept stop controls yet.
            while status.state == 2:
                if time.monotonic() >= deadline:
                    raise InstallError("Media Journal is still starting. Try stopping it again shortly.")
                time.sleep(0.2)
                status = self.status(handle)
            if status.state not in (1, 3) and not self.api.ControlService(handle, 1, ctypes.byref(status)):
                code = ctypes.get_last_error()
                if code != 1062:  # A concurrent stop already finished.
                    raise ctypes.WinError(code)
            while self.status(handle).state != 1:
                if time.monotonic() >= deadline:
                    raise InstallError("Media Journal is finishing a request. Try again when it finishes.")
                time.sleep(0.2)
            # SCM's STOPPED status arrives just before the native host process
            # exits. Its private interpreter must not still be in use on uninstall.
            while objects.running("service-host"):
                if time.monotonic() >= deadline:
                    raise InstallError("Media Journal is still stopping. Try again shortly.")
                time.sleep(0.1)
            return True
        finally:
            self.api.CloseServiceHandle(handle)


def local_health(config: dict, installation_id: str) -> bool:
    opener = build_opener(ProxyHandler({}))
    request = Request(f"http://127.0.0.1:{config['port']}{HEALTH_PATH}", headers={"Connection": "close"})
    try:
        with opener.open(request, timeout=0.75) as response:
            result = json.loads(response.read(4096))
            return isinstance(result, dict) and result.get("installation_id") == installation_id and result.get("ready") is True
    except (OSError, ValueError, HTTPError, URLError):
        return False


def port_is_free(port: int, *, lan: bool) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        if os.name == "nt":
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        try:
            probe.bind(("0.0.0.0" if lan else "127.0.0.1", port))
        except OSError:
            return False
    # localhost can resolve to IPv6 first. Do not open another app's ::1 server
    # while our server listens on 127.0.0.1 with the same numeric port.
    if socket.has_ipv6:
        try:
            with socket.socket(socket.AF_INET6, socket.SOCK_STREAM) as probe:
                if os.name == "nt":
                    probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
                probe.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
                probe.bind(("::1", port))
        except OSError as error:
            if getattr(error, "winerror", None) not in (10047, 10049) and error.errno not in (97, 99):
                return False
    return True


def app_environment(root: Path, source: Path, static_root: Path | None = None) -> dict:
    environment = dict(os.environ)
    environment.update({
        "DJANGO_SETTINGS_MODULE": "installed_settings",
        "MEDIA_JOURNAL_INSTALL_ROOT": str(root),
        "PYTHONPATH": os.pathsep.join((str(root / "support"), str(source))),
        "PYTHONNOUSERSITE": "1",
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONUNBUFFERED": "1",
        "MJ_DEV": "False",
    })
    environment["MEDIA_JOURNAL_STATIC_ROOT"] = str(static_root or source.parent / "staticfiles")
    # A parent shell's virtualenv must not influence the installed application.
    environment.pop("VIRTUAL_ENV", None)
    environment.pop("PYTHONHOME", None)
    return environment


def stop_server(root: Path, state: dict, *, service_internal: bool = False) -> bool:
    if not service_internal and WindowsService(root, state).stop():
        LOG.info("Media Journal service stopped.")
        return True
    objects = WindowsObjects(root, state)
    was_running = objects.running()
    if not was_running:
        return False
    LOG.info("Waiting for this installation's server to stop safely...")
    end = time.monotonic() + STOP_TIMEOUT
    # It may still be starting and not have created the stop event yet.
    while objects.running():
        objects.signal_stop()
        if time.monotonic() >= end:
            raise InstallError("Media Journal is still finishing a request. Wait a moment and try again; no files have been replaced.")
        time.sleep(0.2)
    LOG.info("Media Journal stopped.")
    return True


def stop_for_update(root: Path, state: dict) -> None:
    """Setup replaces support files only after the existing server has exited."""
    objects = WindowsObjects(root, state)
    action = objects.mutex("action")
    try:
        if objects.running():
            atomic_json(root / "update-request.json", {"installation_id": state["installation_id"], "restart_on_failure": True})
        stop_server(root, state)
    finally:
        objects.unlock(action)


def start_server(root: Path, state: dict, *, browser: bool = False, service_internal: bool = False) -> None:
    config = load_config(root)
    if config.get("startup_mode") == "before-login" and not service_internal:
        WindowsService(root, state).start()
        if not local_health(config, state["installation_id"]):
            raise InstallError("Media Journal is still starting. Try opening it again shortly.")
        if browser:
            webbrowser.open(f"http://localhost:{config['port']}/")
        return
    objects = WindowsObjects(root, state)
    action = objects.mutex("action")
    try:
        # Another completed update may have switched releases after the shortcut
        # read its marker but before it acquired this lock.
        state = read_json(root / "install-state.json")
        if service_internal and (root / "update-transaction.json").exists():
            raise InstallError("An update was interrupted. Run Setup again to repair the installation.")
        recover_update(root, state)
        source, python = release_paths(root, state)
        config = load_config(root)
        if objects.running():
            if not local_health(config, state["installation_id"]):
                raise InstallError("Media Journal is starting or stopping. Try again in a moment.")
        else:
            if not port_is_free(config["port"], lan=config.get("lan", False)):
                raise InstallError(f"Port {config['port']} is already in use. Choose another port in Setup.")
            pythonw = python.with_name("pythonw.exe")
            command = [str(pythonw), str(root / "support" / "journal_launcher.py"), "serve", "--root", str(root)]
            subprocess.Popen(command, cwd=source, env=app_environment(root, source), creationflags=CREATE_NO_WINDOW, close_fds=True)
            deadline = time.monotonic() + 45
            while not local_health(config, state["installation_id"]):
                if time.monotonic() >= deadline:
                    raise InstallError(f"Media Journal did not start. See {root / 'logs' / 'server.log'} for details.")
                time.sleep(0.25)
        if browser:
            webbrowser.open(f"http://localhost:{config['port']}/")
    finally:
        objects.unlock(action)


class LogStream:
    def write(self, value: str) -> int:
        text = value.strip()
        if text:
            LOG.info("%s", text)
        return len(value)

    def flush(self) -> None:
        pass


def serve(root: Path, state: dict) -> None:
    objects = WindowsObjects(root, state)
    _mutex = objects.mutex("server")
    event = objects.create_stop_event()
    try:
        source, python = release_paths(root, state)
        if Path(sys.executable).resolve() not in (python.resolve(), python.with_name("pythonw.exe").resolve()):
            raise InstallError("The server must use its active release's private Python environment.")
        config = load_config(root)
        os.environ.update(app_environment(root, source))
        sys.path[:0] = [str(root / "support"), str(source)]
        sys.stdout = sys.stderr = LogStream()
        from django.core.wsgi import get_wsgi_application
        from waitress import create_server

        application = get_wsgi_application()
        shutting_down = threading.Event()

        def wrapped(environ, start_response):
            if environ.get("PATH_INFO") == HEALTH_PATH:
                body = json.dumps({"installation_id": state["installation_id"], "ready": not shutting_down.is_set()}).encode()
                start_response("200 OK" if not shutting_down.is_set() else "503 Service Unavailable", [
                    ("Content-Type", "application/json"), ("Content-Length", str(len(body))), ("Cache-Control", "no-store"),
                ])
                return [body]
            if shutting_down.is_set():
                start_response("503 Service Unavailable", [("Content-Type", "text/plain"), ("Retry-After", "5")])
                return [b"Media Journal is stopping."]
            return application(environ, start_response)

        server = create_server(wrapped, host="0.0.0.0" if config.get("lan") else "127.0.0.1", port=config["port"], threads=8)
        network_thread = threading.Thread(target=server.run, name="waitress-network", daemon=True)
        network_thread.start()
        LOG.info("Media Journal %s is listening on port %s.", state.get("tag", ""), config["port"])
        while objects.api.WaitForSingleObject(event, 500) == objects.WAIT_TIMEOUT:
            if not network_thread.is_alive():
                raise InstallError("The HTTP server stopped unexpectedly.")
        shutting_down.set()
        # Never release the ownership mutex while a request may still write to DB.
        # Long API calls may delay shutdown; Setup will abort rather than kill them.
        server.task_dispatcher.shutdown(cancel_pending=True, timeout=5)
        while server.task_dispatcher.threads:
            time.sleep(0.1)
        server.close()
        LOG.info("Server requests finished; shutdown complete.")
    finally:
        objects.api.CloseHandle(event)
        # Deliberately keep the server mutex owned until Windows destroys this
        # process. Releasing it here would let Setup migrate while Python's
        # background threads/finalizers were still winding down.


def fetch_bytes(url: str, *, limit: int, timeout: int = 60) -> bytes:
    request = Request(url, headers={"User-Agent": "Media-Journal-Windows-Installer", "Accept": "application/vnd.github+json"})
    with urlopen(request, timeout=timeout) as response:
        value = response.read(limit + 1)
    if len(value) > limit:
        raise InstallError("The download exceeded the installer's size limit.")
    return value


def latest_release() -> dict:
    try:
        release = json.loads(fetch_bytes(LATEST_RELEASE_URL, limit=1024 * 1024))
    except HTTPError as error:
        if error.code in (403, 429):
            raise InstallError("GitHub is limiting download requests. Please try again later.") from error
        if error.code == 404:
            raise InstallError("No published stable GitHub release is available yet.") from error
        raise
    tag = release.get("tag_name")
    archive = release.get("zipball_url", "")
    parsed = urlparse(archive)
    if release.get("draft") or release.get("prerelease") or not isinstance(tag, str) or not tag.strip():
        raise InstallError("GitHub did not return a published stable release.")
    if parsed.scheme != "https" or parsed.netloc != "api.github.com" or not parsed.path.startswith(f"/repos/{REPOSITORY}/zipball/"):
        raise InstallError("GitHub returned an unexpected source download address.")
    return {"tag": tag, "archive": archive, "url": release.get("html_url", "")}


def download_archive(url: str, path: Path) -> None:
    deadline = time.monotonic() + DOWNLOAD_TIMEOUT
    total = 0
    request = Request(url, headers={"User-Agent": "Media-Journal-Windows-Installer"})
    with urlopen(request, timeout=60) as response, path.open("wb") as target:
        final = urlparse(response.url)
        if final.scheme != "https" or final.hostname not in ("api.github.com", "codeload.github.com", "github.com"):
            raise InstallError("The source archive redirected outside GitHub.")
        size = response.headers.get("Content-Length")
        if size and int(size) > MAX_ARCHIVE_BYTES:
            raise InstallError("The release archive exceeds the installer's download limit.")
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_ARCHIVE_BYTES or time.monotonic() > deadline:
                raise InstallError("The release download exceeded its size or time limit. Please try again.")
            target.write(chunk)
    if total == 0:
        raise InstallError("GitHub returned an empty source archive.")


def archive_path(name: str) -> PurePosixPath:
    if "\\" in name or ":" in name or "\x00" in name:
        raise InstallError("The release archive contains an unsafe filename.")
    if any(part in (".", "..") for part in name.split("/")):
        raise InstallError("The release archive contains an unsafe path.")
    path = PurePosixPath(name)
    if path.is_absolute() or not path.parts or any(part in (".", "..") for part in path.parts):
        raise InstallError("The release archive contains an unsafe path.")
    for part in path.parts:
        if part.endswith((" ", ".")) or re.match(r"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)", part, re.I):
            raise InstallError("The release archive contains a reserved Windows filename.")
    return path


def extract_source(archive: Path, destination: Path) -> None:
    allowed_files = {"manage.py", "requirements.txt", "LICENSE", "LICENSE.md", "LICENSE.txt", "README.md"}
    allowed_folders = {"core", "media_journal"}
    extracted_size = 0
    seen = set()
    prefix = None
    destination.mkdir()
    with zipfile.ZipFile(archive) as source:
        members = source.infolist()
        if len(members) > MAX_ARCHIVE_FILES:
            raise InstallError("The release archive contains too many files.")
        for member in members:
            path = archive_path(member.filename)
            mode = member.external_attr >> 16
            if stat.S_ISLNK(mode) or (stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR)):
                raise InstallError("The release archive contains a linked or special file.")
            if prefix is None:
                prefix = path.parts[0]
                if not prefix.casefold().startswith("mihail-pop-media-journal-"):
                    raise InstallError("The archive does not identify the expected Media Journal repository.")
            if path.parts[0] != prefix:
                raise InstallError("The archive has an unexpected folder layout.")
            if len(path.parts) < 2 or member.is_dir():
                continue
            relative = PurePosixPath(*path.parts[1:])
            if relative.parts[0] not in allowed_folders and str(relative) not in allowed_files:
                continue
            if any(part in ("__pycache__", ".git", ".venv", "venv") for part in relative.parts) or relative.suffix in (".pyc", ".pyo"):
                continue
            normalized = str(relative).casefold()
            if normalized in seen:
                raise InstallError("The release archive has duplicate Windows filenames.")
            seen.add(normalized)
            extracted_size += member.file_size
            if extracted_size > MAX_EXTRACTED_BYTES:
                raise InstallError("The extracted application exceeds the installer's size limit.")
            target = destination.joinpath(*relative.parts)
            if destination.resolve() not in target.resolve().parents:
                raise InstallError("The archive points outside the staging folder.")
            target.parent.mkdir(parents=True, exist_ok=True)
            with source.open(member) as incoming, target.open("xb") as outgoing:
                shutil.copyfileobj(incoming, outgoing, length=1024 * 1024)
    for required in ("manage.py", "requirements.txt", "media_journal/settings.py", "core/models.py"):
        if not destination.joinpath(required).is_file():
            raise InstallError(f"The release is missing {required}. Your installed app has not been replaced.")


def run_logged(command: list[str], *, cwd: Path, environment: dict, log: Path) -> None:
    LOG.info("%s", "Installing application dependencies..." if "pip" in command else "Running " + Path(command[0]).name + " " + " ".join(command[1:3]))
    ensure_no_links(log)
    for suffix in (".1", ".2"):
        ensure_no_links(log.with_name(log.name + suffix))
    if log.exists() and log.stat().st_size > 5 * 1024 * 1024:
        older = log.with_name(log.name + ".2")
        previous = log.with_name(log.name + ".1")
        if previous.exists():
            os.replace(previous, older)
        os.replace(log, previous)
    # A schema migration must never be killed halfway through just because a
    # large library takes longer than expected. uv has its own network timeouts.
    with log.open("ab") as output:
        result = subprocess.run(command, cwd=cwd, env=environment, stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT, creationflags=CREATE_NO_WINDOW, check=False)
    if result.returncode:
        raise InstallError(f"A setup step failed (exit code {result.returncode}). See {log} for details.")


def backup_database(database: Path, snapshot: Path) -> bool:
    if not database.exists():
        return False
    with closing(sqlite3.connect(database.as_uri() + "?mode=ro", uri=True, timeout=60)) as original:
        with closing(sqlite3.connect(snapshot)) as backup:
            original.backup(backup)
            if backup.execute("PRAGMA quick_check").fetchone() != ("ok",):
                raise InstallError("The library database did not pass its safety check. Setup has stopped.")
    return True


def restore_database(root: Path, database: Path, snapshot: Path, had_database: bool) -> None:
    if had_database:
        ensure_no_links(snapshot)
        with closing(sqlite3.connect(snapshot.as_uri() + "?mode=ro", uri=True)) as check:
            if check.execute("PRAGMA quick_check").fetchone() != ("ok",):
                raise InstallError("The pre-update database safety copy is invalid; it has been kept for recovery.")
    for suffix in ("-wal", "-shm", "-journal"):
        remove_owned(root, database.with_name(database.name + suffix))
    if had_database:
        temporary = owned_path(root, database.with_name("db.sqlite3.restore"))
        shutil.copy2(snapshot, temporary)
        os.replace(temporary, database)
    else:
        remove_owned(root, database)


def install(root: Path, state: dict, arguments: argparse.Namespace) -> None:
    objects = WindowsObjects(root, state)
    action = objects.mutex("action")
    new_release = None
    committed = False
    preserve_staging = False
    config_changed = False
    was_running = False
    restart_previous = False
    config_path = owned_path(root, root / "config.json")
    original_config = None
    restart_hint = owned_path(root, root / "update-request.json")
    try:
        state = read_json(root / "install-state.json")
        recover_update(root, state)
        original_config = read_json(config_path) if config_path.exists() else None
        if restart_hint.exists():
            hint = read_json(restart_hint)
            was_running = hint.get("installation_id") == state["installation_id"] and hint.get("restart_on_failure") is True
        LOG.info("Checking for the latest stable Media Journal release...")
        release = latest_release()
        config = dict(original_config or {
            "port": 8084, "lan": False, "secret_key": secrets.token_urlsafe(50),
            "timezone": "UTC", "csrf_trusted_origins": "", "require_login": False,
        })
        config["port"] = arguments.port if arguments.port is not None else config.get("port", 8084)
        if arguments.lan is not None:
            config["lan"] = arguments.lan
        atomic_json(config_path, config)
        config_changed = True
        load_config(root)
        # Downloads and dependencies are prepared while the existing server runs.
        token = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d%H%M%S") + "-" + uuid.uuid4().hex[:8]
        releases = owned_path(root, root / "releases")
        releases.mkdir(exist_ok=True)
        new_release = owned_path(root, releases / token)
        new_release.mkdir()
        archive = new_release / "source.zip"
        LOG.info("Downloading Media Journal %s...", release["tag"])
        download_archive(release["archive"], archive)
        source = new_release / "application"
        extract_source(archive, source)
        archive.unlink()
        uv = owned_path(root, root / "support" / "uv.exe")
        if not uv.is_file():
            raise InstallError("The private dependency installer is missing. Run Setup again.")
        app_env = new_release / "env"
        python = app_env / "Scripts" / "python.exe"
        environment = app_environment(root, source)
        environment.update({
            "UV_CACHE_DIR": str(root / "runtime" / "cache"),
            "UV_PYTHON_INSTALL_DIR": str(root / "runtime" / "python"),
            "UV_NO_CONFIG": "1", "UV_NO_PROGRESS": "1",
            "UV_PYTHON_INSTALL_BIN": "0", "UV_PYTHON_INSTALL_REGISTRY": "0",
            "UV_PYTHON_NO_REGISTRY": "1",
        })
        for option in ("UV_PYTHON_PREFERENCE", "UV_MANAGED_PYTHON", "UV_NO_MANAGED_PYTHON"):
            environment.pop(option, None)
        setup_log = root / "logs" / "setup-steps.log"
        run_logged([str(uv), "venv", "--python", sys.executable, str(app_env)], cwd=new_release, environment=environment, log=setup_log)
        run_logged([str(uv), "pip", "install", "--python", str(python), "--requirement", str(source / "requirements.txt")], cwd=source, environment=environment, log=setup_log)

        was_running = objects.running() or was_running
        stop_server(root, state)
        # Config may select another port on an update. Probe after our old server stops.
        if not port_is_free(config["port"], lan=config["lan"]):
            raise InstallError(f"Port {config['port']} is already in use. Choose another port in Setup.")
        library = owned_path(root, root / "library")
        data = owned_path(root, library / "data")
        media = owned_path(root, library / "media")
        data.mkdir(parents=True, exist_ok=True)
        media.mkdir(exist_ok=True)
        database = owned_path(root, data / "db.sqlite3")
        snapshot = new_release / "before-update.sqlite3"
        had_database = backup_database(database, snapshot)
        journal = owned_path(root, root / "update-transaction.json")
        atomic_json(journal, {
            "candidate": token, "previous_release": state.get("active_release"),
            "previous_config": original_config, "had_database": had_database,
        })
        static_new = new_release / "staticfiles"
        environment = app_environment(root, source, static_new)
        try:
            LOG.info("Updating the library database and preparing static files...")
            run_logged([str(python), str(source / "manage.py"), "migrate", "--noinput"], cwd=source, environment=environment, log=setup_log)
            run_logged([str(python), str(source / "manage.py"), "collectstatic", "--noinput"], cwd=source, environment=environment, log=setup_log)
            # Static files live with their release too; the wrapper follows this
            # pointer, so no half-switched source/dependency/static combination.
            updated = dict(state, active_release=token, previous_release=state.get("active_release"), tag=release["tag"], release_url=release["url"], updated_at=dt.datetime.now(dt.timezone.utc).isoformat())
            atomic_json(root / "install-state.json", updated)
            committed = True
        except BaseException:
            LOG.exception("Setup failed. Restoring the library database and previous release.")
            try:
                restore_database(root, database, snapshot, had_database)
            except BaseException as restore_error:
                preserve_staging = True
                raise InstallError(f"The database could not be restored automatically. Its safety copy was kept at {snapshot}. Do not start Media Journal until it is restored.") from restore_error
            journal.unlink()
            raise
        # The active pointer now names the new schema/code/env/static set. If
        # deleting the journal fails, the next run recognizes this as committed.
        try:
            journal.unlink()
        except OSError:
            LOG.warning("The completed update journal will be cleared next time.")
        # Keep one previous release. Never copy or prune user media.
        retained = {token, state.get("active_release")}
        for child in releases.iterdir():
            if child.name not in retained:
                try:
                    remove_owned(root, child)
                except (OSError, InstallError):
                    LOG.warning("Could not remove an old release: %s", child.name)
        cache = owned_path(root, root / "runtime" / "cache")
        if cache.exists():
            try:
                remove_owned(root, cache)
            except (OSError, InstallError):
                LOG.warning("The download cache will be removed on a later update.")
        LOG.info("Media Journal %s installed successfully.%s", release["tag"], " Open the app to restart it." if was_running else "")
        if restart_hint.exists():
            try:
                restart_hint.unlink()
            except OSError:
                LOG.warning("The setup restart hint could not be cleared.")
        new_release = None
    except BaseException:
        if config_changed and not committed:
            if original_config is not None:
                atomic_json(config_path, original_config)
            else:
                remove_owned(root, config_path)
        restart_previous = was_running and not committed and not preserve_staging and original_config is not None
        if restart_hint.exists() and not preserve_staging:
            restart_hint.unlink()
        if new_release is not None and new_release.exists() and not committed and not preserve_staging:
            try:
                remove_owned(root, new_release)
            except OSError:
                LOG.warning("Temporary files remain in %s", new_release)
        raise
    finally:
        objects.unlock(action)
        if restart_previous:
            try:
                start_server(root, state)
            except Exception:
                LOG.exception("The previous release is intact but could not be restarted automatically.")


def uninstall(root: Path, state: dict, *, delete_data: bool) -> None:
    objects = WindowsObjects(root, state)
    action = objects.mutex("action")
    try:
        state = read_json(root / "install-state.json")
        recover_update(root, state)
        stop_server(root, state)
        # Inno removes these folders after our interpreter exits. Refuse the
        # entire uninstall beforehand if any of them contains a junction.
        for name in ("releases", "runtime", "staticfiles", "logs", "support"):
            ensure_tree_no_links(owned_path(root, root / name))
        if delete_data:
            remove_owned(root, root / "library")
        # Inno removes runtime/releases/support AFTER this interpreter exits.
        # Kept data must remain recognizable for a subsequent reinstall.
        atomic_json(root / "install-state.json", {"schema_version": SCHEMA_VERSION, "product": PRODUCT, "installation_id": state["installation_id"], "active_release": None, "data_retained": not delete_data})
        remove_owned(root, root / "update-request.json")
        LOG.info("The server is stopped. %s", "The library was deleted." if delete_data else "The library will be kept for a later reinstall.")
    finally:
        objects.unlock(action)


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="Media Journal's private Windows installation controller")
    commands = result.add_subparsers(dest="command", required=True)
    for name in ("install", "open", "start", "stop", "serve", "uninstall"):
        command = commands.add_parser(name)
        command.add_argument("--root", required=True)
        if name == "install":
            command.add_argument("--port", type=int)
            binding = command.add_mutually_exclusive_group()
            binding.add_argument("--lan", action="store_true", default=None)
            binding.add_argument("--local-only", dest="lan", action="store_false")
        if name == "uninstall":
            command.add_argument("--delete-data", action="store_true")
        if name == "stop":
            command.add_argument("--for-update", action="store_true")
    return result


def main() -> int:
    arguments = parser().parse_args()
    try:
        root, state = load_root(arguments.root, require_release=arguments.command in ("open", "start", "serve"))
        configure_logging(root, "server" if arguments.command == "serve" else "installer")
        if arguments.command == "install":
            install(root, state, arguments)
        elif arguments.command in ("open", "start"):
            start_server(root, state, browser=arguments.command == "open")
        elif arguments.command == "serve":
            serve(root, state)
        elif arguments.command == "stop":
            if arguments.for_update:
                stop_for_update(root, state)
            else:
                stop_server(root, state)
        elif arguments.command == "uninstall":
            uninstall(root, state, delete_data=arguments.delete_data)
        return 0
    except Exception as error:
        LOG.exception("%s", error)
        message = str(error) if isinstance(error, InstallError) else f"{type(error).__name__}: {error}"
        if sys.stderr is not None:
            print(message, file=sys.stderr)
        if os.name == "nt" and arguments.command in ("open", "start", "stop"):
            ctypes.windll.user32.MessageBoxW(None, message, "Media Journal", 0x10)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
