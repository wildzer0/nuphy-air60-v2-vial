#!/usr/bin/env python3
"""Sanity checks on a built image: it must fit below the emulated-EEPROM area and look like an STM32F072 image."""
import struct
import sys

APP_LIMIT = 0x1E000
RAM_BASE, RAM_END = 0x20000000, 0x20004000
FLASH_BASE = 0x08000000


def strip_dfu_suffix(b: bytes) -> bytes:
    if len(b) >= 16 and b[-8:-5] == b"UFD" and b[-5] == 16:
        return b[:-16]
    return b


def main(path: str) -> int:
    data = strip_dfu_suffix(open(path, "rb").read())
    sp, reset = struct.unpack_from("<II", data, 0)
    errors = []
    if len(data) > APP_LIMIT:
        errors.append(f"image is {len(data)} bytes, limit {APP_LIMIT}")
    if not RAM_BASE <= sp <= RAM_END:
        errors.append(f"initial SP {sp:#x} is not in RAM")
    if not (reset & 1) or not FLASH_BASE <= reset < FLASH_BASE + len(data):
        errors.append(f"reset vector {reset:#x} is not inside the image")
    print(f"{path}: {len(data)} bytes, {APP_LIMIT - len(data)} left before the settings area, SP {sp:#x}, reset {reset:#x}")
    for e in errors:
        print("ERROR:", e)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
