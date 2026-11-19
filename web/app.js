// SPDX-License-Identifier: GPL-2.0-or-later
// Web flasher for the NuPhy Air60 V2 (STM32F072 ROM DFU). Not tested on hardware yet: see the banner in index.html.
(function () {
  'use strict';

  const VID = 0x0483;
  const PID = 0xdf11;
  const { FLASH_BASE, FLASH_SIZE, OPTION_BYTES_ADDR, validateImage, parseOptionBytes, sha256Hex } = window.fwcheck;
  const $ = (id) => document.getElementById(id);

  const st = { usb: null, flashSettings: null, dev: null, xfer: 2048, manifestationTolerant: false, rdpOk: false, backupDone: false, image: null, busy: false };

  // ---- log and UI helpers ----
  const logEl = $('log');
  function log(msg, cls) {
    const line = document.createElement('div');
    if (cls) line.className = cls;
    line.textContent = `${new Date().toLocaleTimeString()}  ${msg}`;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }
  const hex = (n, w = 8) => '0x' + n.toString(16).toUpperCase().padStart(w, '0');
  function setSection(id, enabled) {
    $(id).setAttribute('aria-disabled', enabled ? 'false' : 'true');
  }
  function refresh() {
    const connected = !!st.dev && st.rdpOk;
    setSection('s2', connected);
    setSection('s3', connected && st.backupDone);
    setSection('s4', connected && st.backupDone && !!st.image);
    $('backup').disabled = !connected || st.busy;
    $('file').disabled = !(connected && st.backupDone) || st.busy;
    $('confirm').disabled = !(connected && st.backupDone && st.image) || st.busy;
    $('flash').disabled = !(connected && st.backupDone && st.image && $('confirm').checked) || st.busy;
    $('connect').disabled = !!st.usb || st.busy;
    $('disconnect').disabled = !st.usb || st.busy;
  }
  function hookLog(dev) {
    dev.logDebug = () => {};
    dev.logInfo = (m) => log(m);
    dev.logWarning = (m) => log(m, 'warn');
    dev.logError = (m) => log(String(m), 'bad');
    dev.logProgress = (done, total) => {
      const p = $('progress');
      p.hidden = false;
      p.max = total || 1;
      p.value = done;
    };
  }

  // ---- WebUSB DFU plumbing (adapted from webdfu's example) ----
  async function fixInterfaceNames(usb, interfaces) {
    if (interfaces.some((i) => i.name == null)) {
      const tmp = new dfu.Device(usb, interfaces[0]);
      await tmp.device_.open();
      await tmp.device_.selectConfiguration(1);
      const mapping = await tmp.readInterfaceNames();
      await tmp.close();
      for (const i of interfaces) {
        if (i.name === null) i.name = mapping[i.configuration.configurationValue][i['interface'].interfaceNumber][i.alternate.alternateSetting];
      }
    }
  }

  async function dfuProperties(dev) {
    try {
      const data = await dev.readConfigurationDescriptor(0);
      const cfg = dfu.parseConfigurationDescriptor(data);
      if (cfg.bConfigurationValue == dev.settings.configuration.configurationValue) {
        for (const d of cfg.descriptors) {
          if (d.bDescriptorType == 0x21 && Object.prototype.hasOwnProperty.call(d, 'bcdDFUVersion')) {
            return { ManifestationTolerant: (d.bmAttributes & 0x04) != 0, CanUpload: (d.bmAttributes & 0x02) != 0, CanDnload: (d.bmAttributes & 0x01) != 0, TransferSize: d.wTransferSize, DFUVersion: d.bcdDFUVersion };
          }
        }
      }
    } catch (e) { /* no functional descriptor */ }
    return {};
  }

  async function openInterface(usb, settings) {
    let dev = new dfu.Device(usb, settings);
    await dev.open();
    const props = await dfuProperties(dev);
    if (props.DFUVersion == 0x011a && settings.alternate.interfaceProtocol == 0x02) dev = new dfuse.Device(dev.device_, dev.settings);
    hookLog(dev);
    return { dev, props };
  }

  async function clearError(dev) {
    try {
      const s = await dev.getStatus();
      if (s.state == dfu.dfuERROR) await dev.clearStatus();
    } catch (e) { log('Could not clear the DFU status: ' + e, 'warn'); }
  }

  // ---- steps ----
  async function connect() {
    st.busy = true; refresh();
    try {
      const usb = await navigator.usb.requestDevice({ filters: [{ vendorId: VID, productId: PID }] });
      const interfaces = dfu.findDeviceDfuInterfaces(usb);
      await fixInterfaceNames(usb, interfaces);
      const flashIf = interfaces.find((i) => /internal flash/i.test(i.name || ''));
      const optIf = interfaces.find((i) => /option bytes/i.test(i.name || ''));
      if (!flashIf || !optIf) throw new Error('This is not the STM32 ROM bootloader layout (no "Internal Flash" / "Option Bytes" interfaces).');
      st.usb = usb;
      log(`Connected: ${usb.productName || 'STM32 bootloader'} (serial ${usb.serialNumber || 'n/a'})`);

      // 1. the flash must be exactly the 128 KB of the F072 at 0x08000000
      let { dev, props } = await openInterface(usb, flashIf);
      const seg = dev.memoryInfo && dev.memoryInfo.segments;
      const okLayout = seg && seg.length === 1 && seg[0].start === FLASH_BASE && seg[0].end === FLASH_BASE + FLASH_SIZE && seg[0].readable && seg[0].erasable && seg[0].writable;
      if (!okLayout) throw new Error('Unexpected flash layout: ' + (dev.memoryInfo ? dev.memoryInfo.name : 'none') + '. Refusing: this tool is for the STM32F072 (128 KB) only.');
      st.xfer = props.TransferSize || 2048;
      st.manifestationTolerant = !!props.ManifestationTolerant;
      await dev.close();

      // 2. read protection: only level 0 is touched, never forced
      const opt = await openInterface(usb, optIf);
      opt.dev.startAddress = OPTION_BYTES_ADDR;
      await clearError(opt.dev);
      const blob = await opt.dev.do_upload(st.xfer, 16);
      const ob = parseOptionBytes(new Uint8Array(await blob.arrayBuffer()));
      await opt.dev.close();
      $('devinfo').textContent = `Connected. Flash 128 KB at ${hex(FLASH_BASE)}. Read protection (RDP): ${ob.readable ? 'level 0 (readable)' : 'NOT level 0, byte ' + (ob.rdp === 'unknown' ? '?' : hex(ob.rdp, 2))}.`;
      $('devinfo').className = ob.readable ? 'ok' : 'bad';
      if (!ob.readable) { log('Read protection is not level 0: nothing will be read or written.', 'bad'); st.rdpOk = false; }
      else { st.rdpOk = true; log('Read protection: level 0.', 'ok'); }

      // 3. keep the flash interface open for the next steps
      const flash = await openInterface(usb, flashIf);
      st.dev = flash.dev;
      st.flashSettings = flashIf;
    } catch (e) {
      log(String(e && e.message ? e.message : e), 'bad');
      if (st.dev) { try { await st.dev.close(); } catch (x) { /* ignore */ } }
      st.usb = null; st.dev = null; st.rdpOk = false;
      $('devinfo').textContent = 'Not connected.'; $('devinfo').className = 'muted';
    } finally { st.busy = false; refresh(); }
  }

  async function disconnect() {
    st.busy = true; refresh();
    try { if (st.dev) await st.dev.close(); } catch (e) { /* ignore */ }
    st.usb = null; st.dev = null; st.rdpOk = false; st.backupDone = false; st.image = null;
    $('devinfo').textContent = 'Not connected.'; $('devinfo').className = 'muted';
    st.busy = false; refresh();
  }

  async function readFlash() {
    st.dev.startAddress = FLASH_BASE;
    await clearError(st.dev);
    const blob = await st.dev.do_upload(st.xfer, FLASH_SIZE);
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function backup() {
    st.busy = true; st.backupDone = false; refresh();
    try {
      log('Backup: first read…');
      const a = await readFlash();
      log('Backup: second read…');
      const b = await readFlash();
      const ha = await sha256Hex(a);
      const hb = await sha256Hex(b);
      if (a.length !== FLASH_SIZE || ha !== hb) throw new Error('The two reads differ or are incomplete: the backup is not trustworthy. Do not flash.');
      const name = `nuphy-air60-v2-backup-${new Date().toISOString().slice(0, 10)}.bin`;
      const link = $('savebackup');
      link.href = URL.createObjectURL(new Blob([a], { type: 'application/octet-stream' }));
      link.download = name;
      link.textContent = `Save ${name}`;
      link.hidden = false;
      $('backupinfo').textContent = `Both reads identical, ${a.length} bytes, sha256 ${ha}. Save the file before going on.`;
      $('backupinfo').className = 'ok';
      st.backupDone = true;
      log('Backup verified.', 'ok');
    } catch (e) {
      log(String(e && e.message ? e.message : e), 'bad');
      $('backupinfo').textContent = 'Backup failed.'; $('backupinfo').className = 'bad';
    } finally { st.busy = false; $('progress').hidden = true; refresh(); }
  }

  async function loadImage(u8, label, expectedSha) {
    st.image = null; $('confirm').checked = false;
    const v = validateImage(u8);
    const sha = await sha256Hex(v.data || u8);
    const box = $('imginfo');
    box.textContent = '';
    const head = document.createElement('p');
    head.textContent = `${label}: ${v.info.size} bytes, sha256 ${sha}`;
    box.appendChild(head);
    const ul = document.createElement('ul');
    for (const m of v.errors) { const li = document.createElement('li'); li.className = 'bad'; li.textContent = m; ul.appendChild(li); }
    for (const m of v.warnings) { const li = document.createElement('li'); li.className = 'warn'; li.textContent = m; ul.appendChild(li); }
    if (expectedSha && expectedSha !== sha) { v.ok = false; const li = document.createElement('li'); li.className = 'bad'; li.textContent = 'The sha256 does not match the release manifest.'; ul.appendChild(li); }
    if (v.ok) { const li = document.createElement('li'); li.className = 'ok'; li.textContent = `Looks like an STM32F072 image (stack ${hex(v.info.sp)}, reset ${hex(v.info.reset)}), fits below the settings area.`; ul.appendChild(li); }
    box.appendChild(ul);
    if (v.ok) st.image = { data: v.data, sha };
    refresh();
  }

  async function flash() {
    if (!st.image || !st.backupDone || !st.rdpOk) return;
    if (!window.confirm(`Write ${st.image.data.length} bytes to the keyboard's flash at ${hex(FLASH_BASE)}?`)) return;
    st.busy = true; refresh();
    $('flashinfo').textContent = '';
    try {
      st.dev.startAddress = FLASH_BASE; // never anything else: the library only logs an out-of-range address
      await clearError(st.dev);
      const buf = st.image.data.slice().buffer;
      log(`Flashing ${buf.byteLength} bytes…`);
      await st.dev.do_download(st.xfer, buf, st.manifestationTolerant);
      log('Done: the keyboard restarts on the new firmware.', 'ok');
      $('flashinfo').textContent = 'Done. The keyboard restarts; reconnect it normally.'; $('flashinfo').className = 'ok';
      if (!st.manifestationTolerant) { try { await st.dev.waitDisconnected(5000); } catch (e) { /* it may stay */ } }
      st.usb = null; st.dev = null; st.rdpOk = false; st.backupDone = false; st.image = null;
      $('devinfo').textContent = 'Not connected.'; $('devinfo').className = 'muted';
    } catch (e) {
      log(String(e && e.message ? e.message : e), 'bad');
      $('flashinfo').textContent = 'Flashing failed. The ROM bootloader is untouched: unplug, hold Esc, plug in and flash again (or flash your backup).'; $('flashinfo').className = 'bad';
    } finally { st.busy = false; $('progress').hidden = true; refresh(); }
  }

  async function loadManifest() {
    const box = $('releases');
    try {
      const r = await fetch('firmware/manifest.json', { cache: 'no-store' });
      const m = await r.json();
      if (!m.releases || !m.releases.length) { box.textContent = 'No release is published here yet.'; return; }
      box.textContent = 'Releases: ';
      for (const rel of m.releases) {
        const b = document.createElement('button');
        b.className = 'secondary'; b.textContent = rel.name; b.disabled = false;
        b.addEventListener('click', async () => {
          if (!st.backupDone) { log('Make the backup first.', 'warn'); return; }
          const data = new Uint8Array(await (await fetch('firmware/' + rel.file)).arrayBuffer());
          await loadImage(data, rel.name, rel.sha256);
        });
        box.appendChild(b); box.appendChild(document.createTextNode(' '));
      }
    } catch (e) { box.textContent = 'No release list available.'; }
  }

  // ---- wiring ----
  if (!navigator.usb) { $('support').hidden = false; $('connect').disabled = true; log('WebUSB is not available in this browser.', 'bad'); }
  $('connect').addEventListener('click', connect);
  $('disconnect').addEventListener('click', disconnect);
  $('backup').addEventListener('click', backup);
  $('flash').addEventListener('click', flash);
  $('confirm').addEventListener('change', refresh);
  $('file').addEventListener('change', async () => {
    const f = $('file').files[0];
    if (f) await loadImage(new Uint8Array(await f.arrayBuffer()), f.name);
  });
  if (navigator.usb) navigator.usb.addEventListener('disconnect', (ev) => {
    if (st.usb && ev.device === st.usb && !st.busy) { log('The keyboard was unplugged.', 'warn'); st.usb = null; st.dev = null; st.rdpOk = false; st.backupDone = false; st.image = null; $('devinfo').textContent = 'Not connected.'; $('devinfo').className = 'muted'; refresh(); }
  });
  loadManifest();
  refresh();
  log('Ready. Put the keyboard in DFU mode, then connect.');
})();
