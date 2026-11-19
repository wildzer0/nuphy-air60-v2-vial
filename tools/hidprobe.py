#!/usr/bin/env python3
"""Read-only probe of a Vial keyboard over raw HID (usage page 0xFF60).

Waits for the device, reads layer count, layer 0 keymap, Vial lock state, then
asks Vial to unlock (user must hold the unlock keys) and samples the matrix.
Writes nothing to the keyboard besides the standard Vial unlock handshake.
"""
import subprocess, sys, time, hid

VID, PID = 0x19F5, 0x3255
ROWS, COLS = 6, 17
BPR = (COLS + 7) // 8
out = open(sys.argv[1], "w")

def log(*a):
    s = " ".join(str(x) for x in a)
    print(s, flush=True); out.write(s + "\n"); out.flush()

def find(timeout):
    t0 = time.time()
    while time.time() - t0 < timeout:
        for d in hid.enumerate(VID, PID):
            if d["usage_page"] == 0xFF60:
                return d
        time.sleep(0.1)

d = find(float(sys.argv[2]) if len(sys.argv) > 2 else 180)
if not d:
    log("device not found"); sys.exit(1)
log("found", d["product_string"])
h = hid.device(); h.open_path(d["path"])

def say(msg):
    subprocess.Popen(["say", msg])

def reopen():
    """The keyboard may reset or be replugged: wait for it and reopen the raw HID interface."""
    global h
    log("!! device lost, waiting for it to come back")
    try: h.close()
    except Exception: pass
    d = find(60)
    if not d:
        log("device did not come back"); sys.exit(2)
    time.sleep(2)
    h = hid.device(); h.open_path(d["path"])
    log("!! reopened")

def drain():
    while h.read(32, 1):
        pass

def tx(*b, tries=5):
    """Send one 32-byte report and return its reply; resync if the reply is stale.

    VIA/Vial echo the command byte in reply[0] except for the 0xFE (Vial) commands,
    whose replies are payload only, so those are only drained before sending.
    """
    for _ in range(tries):
        try:
            drain()
            h.write([0] + list(b) + [0] * (32 - len(b)))
            r = h.read(32, 1000)
        except (OSError, ValueError):
            reopen()
            continue
        if r and (b[0] == 0xFE or r[0] == b[0]):
            return r
    raise RuntimeError("no valid reply to %r" % (list(b),))

def matrix():
    r = tx(0x02, 0x03)
    rows = []
    for i in range(ROWS):
        chunk = r[2 + i * BPR: 2 + (i + 1) * BPR]
        rows.append(int.from_bytes(bytes(chunk), "big"))
    return rows

t0 = time.time()
while True:
    try:
        r = tx(0x01, tries=1); break
    except RuntimeError:
        if time.time() - t0 > 20: raise
log("via protocol", list(r[:3]))
log("layer count", tx(0x11)[1])
raw = bytearray()
for off in range(0, ROWS * COLS * 2, 28):
    n = min(28, ROWS * COLS * 2 - off)
    raw += bytes(tx(0x12, off >> 8, off & 255, n)[4:4 + n])
kc = [int.from_bytes(raw[i:i + 2], "big") for i in range(0, len(raw), 2)]
for r in range(ROWS):
    log("L0 row", r, [hex(k) for k in kc[r * COLS:(r + 1) * COLS]])
st = tx(0xFE, 0x05)
log("vial unlock status (unlocked, in_progress, keys...)", list(st[:8]))
if not st[0]:
    log(">>> HOLD Esc NOW until the script ends (Backspace is already counted)")
    say("Tieni premuto escape adesso")
    tx(0xFE, 0x06)
    t0 = time.time()
    while time.time() - t0 < 25:
        p = tx(0xFE, 0x07)
        if p[0]:
            break
        time.sleep(0.2)
    log("unlock poll:", list(p[:3]))
log("matrix samples (row: pressed columns)")
for s in range(5):
    m = matrix()
    log(" sample", s, {r: [c for c in range(COLS) if v >> c & 1] for r, v in enumerate(m) if v})
    time.sleep(0.3)
log("done")
say("Fatto, puoi scollegare la tastiera")
