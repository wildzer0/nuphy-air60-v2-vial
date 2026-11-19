# NuPhy Air60 V2: Vial firmware (unofficial)

A [Vial](https://get.vial.today) port of the **NuPhy Air60 V2 (ANSI)**, built on [vial-qmk](https://github.com/vial-kb/vial-qmk) from NuPhy's
published QMK source. It keeps NuPhy's wireless code (Bluetooth, 2.4 GHz, battery, sleep, side lights) and adds live keymap editing, macros, tap
dance, combos and key overrides from the Vial desktop app.

> **Unofficial. Flash at your own risk.** Not affiliated with NuPhy. Only the keyboard's main MCU (STM32F072) is reflashed.
> The radio module (nRF52810) and the 2.4 GHz dongle are **not touched** and keep NuPhy's firmware. Going back to stock is always possible
> through the STM32's built-in ROM bootloader (see *Recovery*).

## Status

Tested by the author on one Air60 V2 (stock firmware v2.1.5, RF and dongle left as shipped):

| | |
|---|---|
| Keys, Fn layers, Win/Mac switch, USB | works |
| Vial detection, unlock (Esc + Backspace), edits kept after a reboot | works |
| Bluetooth pairing and switching between the 3 channels | works |
| 2.4 GHz with the dongle, sleep/wake, charging, RGB, tap dance / combos / macros | **not tested yet** |
| Battery gauge on the number keys (below) | flashed; the look and the charge colours are **not verified yet** |
| Caps Lock / Caps Word LED, low-battery warning, accented letters, browser flasher | built, **not tested on hardware yet** |

Everything marked "not tested" is exactly that: unverified. Please report what you find.

## Battery gauge

`Fn + Backspace` shows the level for 3 seconds on the number keys `1 2 … 9 0`: `ceil(percent / 10)` keys are lit (at least one), so
`1` is up to 10 % and `0` (the tenth key) means above 90 %. Green above 20 %, red at 20 % or below. With the cable in, the level cannot be read
(the radio reports 100 %), so all ten keys light **cyan while charging** and **green when the charge is done**.
The right-hand side LED no longer shows a percentage: it breathes while charging, turns solid green when charged, and blinks red below 15 %.

The meaning of the radio's charge byte (bit 0 = cable, bit 1 = charging) is **inferred** from NuPhy's code, not measured. If cyan/green or
breathing/solid look swapped on your board, change `RF_CHARGE_ACTIVE` in `side.c`.

## Extra features

- **Caps indicator**: the left LED is solid for Caps Lock and **blinks** for Caps Word (assign `CW_TOGG` in Vial, Quantum tab).
- **Low-battery warning**: at 20 % or less, on battery, the gauge shows itself at once and then every 30 s for 3 s.
- **Accented letters** (à è é ì ò ù, upper case with Shift, Caps Lock or Caps Word), without installing a layout: `Fn + Space` opens a one-shot
  layer, then `A à`, `E è`, `R é`, `I ì`, `O ò`, `U ù`. The sequence follows the Win/Mac switch: Windows types `Alt` + the Latin-1 code on the
  keypad (Num Lock is switched on if needed), macOS types `Option` + dead key + vowel (**needs a US/ABC host layout**), and with the switch on
  Win the `ACC_LNX` key toggles the Linux way (`Ctrl+Shift+U`, hex code, space). On the first boot the firmware writes only these new key
  assignments into the EEPROM keymap; everything else you edited is left alone.

## Browser flasher

`web/` is a small WebUSB page (Chrome, Edge, Opera) that backs up the flash twice and checks the copies match, refuses anything but the
STM32F072's 128 KB with read protection at level 0, validates the image (DFU-suffix CRC, vector table, size below the settings area) and writes it at
`0x08000000` only. It is **untested on a real keyboard**: the image checks have unit tests (`node --test "web/test/*.test.mjs"`), the USB part has not been tried.
With GitHub Pages enabled it is served from `web/`.

## Build

```
git clone https://github.com/vial-kb/vial-qmk && cd vial-qmk
git checkout dd43959ae5c08d8a28d38a1acf7b04e86b14a344
git submodule update --init --recursive
cp -R /path/to/this/repo/keyboards/nuphy keyboards/
make nuphy/air60_v2/ansi:vial          # needs the qmk CLI (1.2.0) and arm-none-eabi-gcc (built with 15.3.1)
```

The result is `nuphy_air60_v2_ansi_vial.bin` (about 75 KB; the stock firmware is 69 KB; there are ~47 KB left before the emulated EEPROM).
GitHub Actions builds it on every push (`.github/workflows/build.yml`, never run yet) and publishes a release when you push a `v*` tag.

## Flash

1. **Back up first**, with the keyboard in DFU mode: unplug the USB cable, hold **Esc**, plug it back in (`dfu-util -l` must list `0483:df11`).
   `dfu-util -a 0 -s 0x08000000:131072 -U backup.bin`
2. Flash: `dfu-util -a 0 -s 0x08000000:leave -D nuphy_air60_v2_ansi_vial.bin`
3. The keymap, side-light and sleep settings are reset on the first boot (the EEPROM layout changes).

### Recovery

Enter DFU the same way (hold Esc while plugging in; the bootloader is in ROM and cannot be overwritten) and flash NuPhy's official firmware
from <https://nuphy.com/pages/firmwares>, or your `backup.bin` with `-s 0x08000000`. The stock `.bin` carries a DFU suffix that `dfu-util` reads
by itself.

## What differs from NuPhy's source

The code is NuPhy's `air60_v2/ansi` (`nuphy-src/qmk_firmware`, branch `nuphy-keyboards`, commit `f1856912d603800eaca227ae2e1c5c8548fdf261`)
with these changes, needed because vial-qmk is based on a newer QMK (May 2025) than NuPhy's (June 2024):

- `keyboard.json`: integer LED coordinates; `x`/`y` on the ten side LEDs (`flags: 0`).
- `eeconfig_*_user_datablock` calls take `(data, offset, length)`.
- `keyboard_protocol = 1` becomes `usb_device_state_set_protocol(USB_PROTOCOL_REPORT)`.
- The LED register aliases `A_1 … L_16` are provided by `is31fl3733_legacy_names.h`; the LED map moved to `led_table.c`.
- **The UART to the radio is set with `UART_TX_PIN B6 / UART_RX_PIN B7`.** Newer QMK no longer maps NuPhy's `SD1_TX_PIN`/`SD1_RX_PIN` and falls back to
  `A9`/`A10`, which are matrix columns 13/14 here: a build without this setting types a stuck Backspace and has no wireless. Details in
  [`docs/it/06-analisi-differenze.md`](docs/it/06-analisi-differenze.md) (Italian).
- `IS31FL3733_I2C_TIMEOUT` follows NuPhy's `ISSI_TIMEOUT` (1 ms; the new driver defaults to 100 ms).
- Vial profile: `VIAL_ENABLE`, `VIALRGB_ENABLE`, `LTO_ENABLE`; 8 tap dance / combo / key override entries (RAM is tight: 16 KB); the 25 custom
  keycodes (Bluetooth/2.4 GHz links, side lights, battery, …) are in `vial.json`.
- The Vial profile also turns on QMK features the stock firmware does not have (Auto Shift, Caps Word, Chordal Hold, Flow Tap, …): tune them in
  Vial → QMK Settings.

## Notes

`docs/it/` holds the working notes in Italian (research, firmware analysis, recovery, decisions, the UART bug). `tools/` has two small read-only
HID probes used for diagnosis (`pip install hidapi`; on macOS the keyboard-report probe needs the Input Monitoring permission).

## Credits and licence

- NuPhy's QMK source: <https://github.com/nuphy-src/qmk_firmware> (GPL-2.0-or-later).
- [vial-qmk](https://github.com/vial-kb/vial-qmk) and [QMK](https://qmk.fm).
- The battery gauge follows the one in [Oblio](https://github.com/wildzer0/oblio_kbfw).

GPL-2.0-or-later, as the upstream sources. See `LICENSE`.
