// Run with: node --test web/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fw = require('../fwcheck.js');
const bin = (p) => new Uint8Array(readFileSync(new URL(p, import.meta.url)));

// Test images are looked up in a few places; the stock firmware is NuPhy's and is not part of this repository.
const candidates = {
  stock: [process.env.FW_STOCK && 'file://' + process.env.FW_STOCK, '../../../../firmware/originali/QMK_firmware_nuphy_air60_v2_ansi_v2.1.5.bin'],
  vial: [process.env.FW_VIAL && 'file://' + process.env.FW_VIAL, '../../../../firmware/build/nuphy_air60_v2_ansi_vial_v4_accents.bin'],
};
const find = (list) => list.find((p) => p && existsSync(new URL(p, import.meta.url)));

test('crc of the DFU suffix matches the stock firmware', { skip: !find(candidates.stock) }, () => {
  const r = fw.splitDfuSuffix(bin(find(candidates.stock)));
  assert.ok(r.suffix, 'suffix found');
  assert.equal(r.suffix.vid, 0x0483);
  assert.equal(r.suffix.pid, 0xdf11);
  assert.equal(r.suffix.crcOk, true);
  assert.equal(r.data.length, 68988);
});

test('stock firmware validates', { skip: !find(candidates.stock) }, () => {
  const v = fw.validateImage(bin(find(candidates.stock)));
  assert.deepEqual(v.errors, []);
  assert.equal(v.info.sp, 0x20000400);
});

test('vial build validates and stays under the EEPROM area', { skip: !find(candidates.vial) }, () => {
  const v = fw.validateImage(bin(find(candidates.vial)));
  assert.deepEqual(v.errors, []);
  assert.ok(v.info.size < fw.APP_LIMIT);
});

test('a corrupted suffix is refused', { skip: !find(candidates.stock) }, () => {
  const u = bin(find(candidates.stock)).slice();
  u[u.length - 1] ^= 0xff;
  assert.equal(fw.validateImage(u).ok, false);
});

test('a flipped byte in the data breaks the suffix CRC', { skip: !find(candidates.stock) }, () => {
  const u = bin(find(candidates.stock)).slice();
  u[1000] ^= 0x01;
  assert.equal(fw.validateImage(u).ok, false);
});

test('an image over the EEPROM limit is refused', () => {
  const u = new Uint8Array(fw.APP_LIMIT + 4);
  new DataView(u.buffer).setUint32(0, 0x20000400, true);
  new DataView(u.buffer).setUint32(4, 0x08000191, true);
  const v = fw.validateImage(u);
  assert.equal(v.ok, false);
  assert.match(v.errors.join(' '), /limit/);
});

test('garbage and tiny files are refused', () => {
  assert.equal(fw.validateImage(new Uint8Array(10)).ok, false);
  assert.equal(fw.validateImage(new Uint8Array(4096).fill(0xff)).ok, false);
});

test('option bytes: RDP level 0 is readable, others are not', () => {
  assert.equal(fw.parseOptionBytes(Uint8Array.of(0xaa, 0x55)).readable, true);
  assert.equal(fw.parseOptionBytes(Uint8Array.of(0xbb, 0x44)).readable, false);
  assert.equal(fw.parseOptionBytes(Uint8Array.of(0xcc, 0x33)).level, 2);
  assert.equal(fw.parseOptionBytes(Uint8Array.of(0xaa, 0x00)).readable, false); // complement does not match
});

test('sha256', async () => {
  assert.equal(await fw.sha256Hex(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
