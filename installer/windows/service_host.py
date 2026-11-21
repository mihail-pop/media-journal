"""Native Windows service host using only Python's standard library.

The Service Control Manager starts this stable helper as LocalService. The actual
application runs with its release's private interpreter; desktop shortcuts use
the same installation-specific global mutex and stop event to control it.
"""

from __future__ import annotations

import argparse
import ctypes
from ctypes import wintypes
import os
import sys
import threading
import time

sys.dont_write_bytecode = True

import journal_launcher as journal


class ServiceHost:
    STOPPED, START_PENDING, STOP_PENDING, RUNNING = 1, 2, 3, 4

    def __init__(self, root, state):
        self.root, self.state = root, state
        self.api = ctypes.WinDLL("advapi32", use_last_error=True)
        self.handle = None
        self.current = self.START_PENDING
        self.checkpoint = 0
        self.stop_requested = threading.Event()
        self.status_lock = threading.Lock()
        self.service_main_type = ctypes.WINFUNCTYPE(None, wintypes.DWORD, ctypes.POINTER(wintypes.LPWSTR))
        self.handler_type = ctypes.WINFUNCTYPE(wintypes.DWORD, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p, ctypes.c_void_p)
        self.main_callback = self.service_main_type(self.service_main)
        self.handler_callback = self.handler_type(self.control)
        self.api.RegisterServiceCtrlHandlerExW.argtypes = (wintypes.LPCWSTR, self.handler_type, ctypes.c_void_p)
        self.api.RegisterServiceCtrlHandlerExW.restype = wintypes.HANDLE
        self.api.SetServiceStatus.argtypes = (wintypes.HANDLE, ctypes.POINTER(journal.WindowsService.Status))
        self.api.SetServiceStatus.restype = wintypes.BOOL

    def report(self, state, error=0):
        with self.status_lock:
            self.current = state
            if state in (self.START_PENDING, self.STOP_PENDING):
                self.checkpoint += 1
            else:
                self.checkpoint = 0
            status = journal.WindowsService.Status(
                0x10, state, (0x01 | 0x04) if state == self.RUNNING else 0,
                1066 if error else 0, error, self.checkpoint,
                15000 if self.checkpoint else 0,
            )
            if not self.api.SetServiceStatus(self.handle, ctypes.byref(status)):
                raise ctypes.WinError(ctypes.get_last_error())

    def control(self, control, _event_type, _event_data, _context):
        if control in (1, 5):  # STOP or system SHUTDOWN.
            self.stop_requested.set()
            try:
                self.report(self.STOP_PENDING)
            except OSError:
                journal.LOG.exception("Could not report service shutdown status.")
        elif control == 4:  # INTERROGATE.
            try:
                self.report(self.current)
            except OSError:
                journal.LOG.exception("Could not report service status.")
        return 0

    def service_main(self, _argc, _argv):
        self.handle = self.api.RegisterServiceCtrlHandlerExW(journal.service_name(self.state), self.handler_callback, None)
        if not self.handle:
            journal.LOG.error("Could not register the service control handler: %s", ctypes.get_last_error())
            return
        objects = None
        failures = []
        error = 0

        def start_application():
            try:
                journal.start_server(self.root, self.state, service_internal=True)
            except BaseException as failure:
                failures.append(failure)
                journal.LOG.exception("The application could not start.")

        try:
            self.report(self.START_PENDING)
            objects = journal.WindowsObjects(self.root, self.state)
            worker = threading.Thread(target=start_application, name="service-start")
            worker.start()
            while worker.is_alive():
                worker.join(1)
                if worker.is_alive():
                    self.report(self.START_PENDING)
            if failures:
                raise failures[0]
            self.report(self.RUNNING)
            journal.LOG.info("Media Journal service is running.")
            while not self.stop_requested.wait(0.5):
                if not objects.running():
                    raise journal.InstallError("The application server stopped unexpectedly.")
        except BaseException:
            journal.LOG.exception("Media Journal service stopped with an error.")
            error = 1
        finally:
            if objects is None:
                self.report(self.STOPPED, error or 1)
                return
            self.report(self.STOP_PENDING)

            def stop_application():
                try:
                    journal.stop_server(self.root, self.state, service_internal=True)
                except BaseException:
                    journal.LOG.exception("Waiting for an active request to finish before stopping.")

            worker = threading.Thread(target=stop_application, name="service-stop")
            worker.start()
            # Do not report STOPPED while an app process may still write to DB.
            # Setup waits for the actual service stop before replacing any files.
            while worker.is_alive() or objects.running():
                worker.join(1)
                if not worker.is_alive():
                    objects.signal_stop()
                    time.sleep(0.5)
                self.report(self.STOP_PENDING)
            journal.LOG.info("Media Journal service stopped.")
            self.report(self.STOPPED, error)

    def run(self):
        callback_type = self.service_main_type

        class ServiceEntry(ctypes.Structure):
            _fields_ = [("name", wintypes.LPWSTR), ("main", callback_type)]

        table = (ServiceEntry * 2)()
        table[0].name = journal.service_name(self.state)
        table[0].main = self.main_callback
        self.api.StartServiceCtrlDispatcherW.argtypes = (ctypes.POINTER(ServiceEntry),)
        self.api.StartServiceCtrlDispatcherW.restype = wintypes.BOOL
        if not self.api.StartServiceCtrlDispatcherW(table):
            raise ctypes.WinError(ctypes.get_last_error())


def main():
    parser = argparse.ArgumentParser(description="Media Journal Windows service")
    parser.add_argument("--root", required=True)
    arguments = parser.parse_args()
    if os.name != "nt":
        raise SystemExit("This service is supported on Windows only.")
    root, state = journal.load_root(arguments.root, require_release=True)
    # Services have no console. File logging must never depend on stdio handles.
    sys.stdout = sys.stderr = None
    journal.configure_logging(root, "service")
    try:
        # Hold until process exit, including Python finalizers after STOPPED.
        # The uninstaller may remove this host's private Python only afterwards.
        _host_mutex = journal.WindowsObjects(root, state).mutex("service-host")
        ServiceHost(root, state).run()
        return 0
    except Exception:
        journal.LOG.exception("Could not connect to Windows Service Control Manager.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
