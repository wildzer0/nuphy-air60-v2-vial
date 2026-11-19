#!/usr/bin/env python3
"""Writes web/firmware/manifest.json from the .bin files next to it.

The sha256 is the one the web flasher computes: over the image without its DFU suffix.
Usage: make_manifest.py web/firmware
"""
import hashlib
import json
import pathlib
import sys


def image(b: bytes) -> bytes:
    return b[:-16] if len(b) >= 16 and b[-8:-5] == b"UFD" and b[-5] == 16 else b


def main(folder: str) -> None:
    d = pathlib.Path(folder)
    releases = []
    for f in sorted(d.glob("*.bin"), reverse=True):
        data = image(f.read_bytes())
        releases.append({"name": f.stem.replace("nuphy_air60_v2_ansi_vial-", ""), "file": f.name, "sha256": hashlib.sha256(data).hexdigest(), "size": len(data)})
    (d / "manifest.json").write_text(json.dumps({"releases": releases}, indent=2) + "\n")
    print(f"{len(releases)} release(s) in the manifest")


if __name__ == "__main__":
    main(sys.argv[1])
