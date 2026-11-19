// SPDX-License-Identifier: GPL-2.0-or-later
// Pure checks on a firmware image and on the option bytes, used by the web flasher and tested under Node (web/test).
(function (root) {
  'use strict';

  const FLASH_BASE = 0x08000000;
  const FLASH_SIZE = 0x20000; // STM32F072, 128 KB
  const APP_LIMIT = 0x1e000; // above this the keyboard keeps its emulated EEPROM (4 pages of 2 KB): never written
  const RAM_BASE = 0x20000000;
  const RAM_END = 0x20004000;
  const OPTION_BYTES_ADDR = 0x1ffff800;

  // CRC of the DFU suffix: the plain CRC-32 register (init 0xffffffff, no final inversion), as dfu-suffix computes it
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function dfuCrc(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return crc >>> 0;
  }

  // A .bin from NuPhy or from `make` may end with a 16-byte DFU suffix: split it off, check its CRC
  function splitDfuSuffix(u8) {
    const n = u8.length;
    if (n >= 16 && u8[n - 8] === 0x55 && u8[n - 7] === 0x46 && u8[n - 6] === 0x44 && u8[n - 5] === 16) {
      const dv = new DataView(u8.buffer, u8.byteOffset, n);
      const suffix = {
        bcdDevice: dv.getUint16(n - 16, true),
        pid: dv.getUint16(n - 14, true),
        vid: dv.getUint16(n - 12, true),
        bcdDFU: dv.getUint16(n - 10, true),
        crc: dv.getUint32(n - 4, true),
      };
      suffix.crcOk = dfuCrc(u8.subarray(0, n - 4)) === suffix.crc;
      return { data: u8.subarray(0, n - 16), suffix };
    }
    return { data: u8, suffix: null };
  }

  // Is this image something that may be written at FLASH_BASE of this keyboard? Returns errors (block) and warnings.
  function validateImage(u8) {
    const { data, suffix } = splitDfuSuffix(u8);
    const errors = [];
    const warnings = [];
    const info = { size: data.length, suffix };

    if (suffix && !suffix.crcOk) errors.push('The DFU suffix CRC does not match: the file is damaged.');
    if (suffix && suffix.vid !== 0x0483 && suffix.vid !== 0xffff) warnings.push('The DFU suffix names another USB vendor.');
    if (data.length < 64) {
      errors.push('The file is too small to be a firmware.');
      return { ok: false, errors, warnings, info };
    }
    if (data.length > APP_LIMIT) errors.push(`The image is ${data.length} bytes; the limit is ${APP_LIMIT} (the last 8 KB of flash hold the keyboard's settings).`);

    const dv = new DataView(data.buffer, data.byteOffset, data.length);
    const sp = dv.getUint32(0, true);
    const reset = dv.getUint32(4, true);
    info.sp = sp;
    info.reset = reset;
    if (sp < RAM_BASE || sp > RAM_END) errors.push('The initial stack pointer is not in the STM32F072 RAM: this is not an image for this chip.');
    if (!(reset & 1)) errors.push('The reset vector is not a Thumb address.');
    if (reset < FLASH_BASE || reset >= FLASH_BASE + Math.min(data.length, APP_LIMIT)) errors.push('The reset vector points outside the image.');

    return { ok: errors.length === 0, errors, warnings, info, data };
  }

  // Option bytes (16 bytes read at 0x1FFFF800): byte 0 is RDP, with its complement in byte 1
  function parseOptionBytes(u8) {
    if (u8.length < 2) return { rdp: 'unknown', level: null, readable: false };
    const rdp = u8[0];
    const complementOk = (rdp ^ u8[1]) === 0xff;
    let level = 1;
    if (rdp === 0xaa) level = 0;
    else if (rdp === 0xcc) level = 2;
    return { rdp, level, complementOk, readable: level === 0 && complementOk };
  }

  async function sha256Hex(u8) {
    const digest = await (root.crypto || globalThis.crypto).subtle.digest('SHA-256', u8);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  const api = { FLASH_BASE, FLASH_SIZE, APP_LIMIT, OPTION_BYTES_ADDR, dfuCrc, splitDfuSuffix, validateImage, parseOptionBytes, sha256Hex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.fwcheck = api;
})(typeof window !== 'undefined' ? window : globalThis);
