#!/usr/bin/env python3
"""Passive watcher: logs USB (dis)appearance of the keyboard and, if macOS allows it,
the raw input reports of its keyboard interface. Sends nothing to the device."""
import subprocess, sys, time, hid

VID, PID = 0x19F5, 0x3255
DUR = float(sys.argv[2]) if len(sys.argv) > 2 else 20
out = open(sys.argv[1], "w")

def log(*a):
    s = "%7.2f " % (time.time() - T0) + " ".join(str(x) for x in a)
    print(s, flush=True); out.write(s + "\n"); out.flush()

def present():
    return [d for d in hid.enumerate(VID, PID)]

T0 = time.time()
while not present():
    time.sleep(0.1)
T0 = time.time()
log("appeared:", sorted({(d["usage_page"], d["usage"]) for d in present()}))
subprocess.Popen(["say", "Non toccare nessun tasto per venti secondi"])
handles, last, seen = {}, set(), True
while time.time() - T0 < DUR:
    cur = present()
    paths = {d["path"] for d in cur}
    if bool(cur) != seen:
        seen = bool(cur); log("DEVICE", "REAPPEARED" if seen else "DISAPPEARED")
        handles.clear()
    for d in cur:
        key = d["path"]
        if key in handles or (d["usage_page"], d["usage"]) != (1, 6):
            continue
        h = hid.device()
        try:
            h.open_path(key); h.set_nonblocking(1); handles[key] = h
            log("opened keyboard interface")
        except OSError as e:
            handles[key] = None; log("cannot open keyboard interface:", e)
    for h in handles.values():
        if not h: continue
        try:
            r = h.read(64)
        except OSError:
            continue
        if r and bytes(r) != last:
            last = bytes(r); log("report", bytes(r).hex())
    time.sleep(0.02)
log("end")
subprocess.Popen(["say", "Fatto, puoi scollegare"])
