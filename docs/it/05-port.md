# Fase 5 — Port Vial per NuPhy Air60 V2 (2026-11-19)

**Stato: v2 flashata il 2026-11-19 (con conferma utente); l'utente riferisce che la tastiera funziona correttamente. v1 era difettoso (pin UART errati, vedi `docs/06-analisi-differenze.md`).** Test dettagliati della checklist (BT, 2.4 GHz, batteria, sleep, RGB, persistenza Vial) non ancora confermati voce per voce. Nota: il `.bin` ha un suffisso DFU di 16 B (firmware effettivo = dimensione − 16 B).

## Sorgenti
- Base: `vial-kb/vial-qmk` commit `dd43959ae5c08d8a28d38a1acf7b04e86b14a344` (2026-07-26), clone in `src/vial-qmk/`.
- Sorgente NuPhy: `nuphy-src/qmk_firmware` branch `nuphy-keyboards`, commit `f1856912d603800eaca227ae2e1c5c8548fdf261`, cartella `keyboards/nuphy/air60_v2` → `src/vial-qmk/keyboards/nuphy/air60_v2/` (cartella non tracciata nel clone).
- Toolchain: `arm-none-eabi-gcc` 15.3.1, `qmk` CLI 1.2.0 in un venv (`PATH=<venv>/bin QMK_HOME=src/vial-qmk`). Build: `make nuphy/air60_v2/ansi:vial`.
- `rf.c`, `rf_driver.c`, `sleep.c`, `side.c`, `ansi.c` (wireless, batteria, sleep, LED laterali, switch Win/Mac): **logica invariata**, toccate solo le chiamate di API elencate sotto.

## Modifiche rispetto al sorgente NuPhy
| File | Modifica | Motivo |
|---|---|---|
| `keyboard.json` | 15 coordinate LED `x` arrotondate (17.5→18, …); `{"x":0,"y":0,"flags":0}` sui 10 LED laterali | lo schema di vial-qmk richiede interi e `x`,`y` obbligatori. Effetto: LED spostati ≤0.5 unità su 224; i laterali hanno `flags:0` (esclusi dagli effetti) |
| `ansi.c`, `side.c` | `eeconfig_{read,update}_user_datablock(&user_config, 0, sizeof(user_config))` (8 chiamate) | nuova firma a 3 argomenti. `user_config_t` = 8 byte = `EECONFIG_USER_DATA_SIZE` |
| `rf.c`, `rf_driver.c` | `keyboard_protocol = 1;` → `usb_device_state_set_protocol(USB_PROTOCOL_REPORT);` | la variabile globale non esiste più; equivalente nella nuova API **[D: stessa semantica, da provare sul campo con NKRO wireless]** |
| `ansi.h` | include `usb_device_state.h` e `is31fl3733_legacy_names.h` | |
| `is31fl3733_legacy_names.h` (nuovo) | alias `A_1…L_16` = `SW1_CS1…SW12_CS16` | alias rimossi dal driver; stessa mappatura del driver QMK 0.25 |
| `led_table.c` (nuovo), `rules.mk` | tabella LED `g_is31fl3733_leds` spostata dalle keymap al livello tastiera (tipo/nome nuovi); contenuto identico (verificato uguale in `default` e `via`) | condivisa da tutte le keymap |
| `config.h` | `IS31FL3733_I2C_ADDRESS_1 0b1010000`, `_2 0b1010011` | il driver nuovo non usa più `DRIVER_ADDR_n` |
| `config.h` (v2) | `UART_TX_PIN B6`, `UART_RX_PIN B7`, `UART_*_PAL_MODE 0`, `UART_DRIVER SD1`, `IS31FL3733_I2C_TIMEOUT ISSI_TIMEOUT` | il QMK 2025 non traduce più i nomi legacy `SD1_*`/`ISSI_TIMEOUT` e usava `A9/A10` (colonne 13/14 della matrice) |
| `rules.mk` | `CFLAGS += -Wno-error=unused-but-set-variable` | GCC 15 rifiuta `drivers/led/issi/is31fl3733.c` di vial-qmk (`-Werror`) |

## Keymap `vial`
- `keymap.c`: copia della keymap `via` ufficiale (7 layer: Mac, Win, Fn…), stessi keycode.
- `rules.mk`: `VIA_ENABLE`, `VIAL_ENABLE`, `VIALRGB_ENABLE`, `LTO_ENABLE = yes`.
- `config.h`: `VIAL_KEYBOARD_UID {0x6E,0x8E,0x43,0xF3,0x23,0xDD,0xDF,0xE1}` (generato con `util/vial_generate_keyboard_uid.py`, unico nel repo); unlock combo **Esc (0,0) + Backspace (1,13)**; `VIAL_TAP_DANCE/COMBO/KEY_OVERRIDE_ENTRIES = 8` (default 32) per risparmiare RAM.
- `vial.json`: dal JSON VIA ufficiale (`NuPhy Air60 V2 via3.json`): layout KLE, matrice 6×17, VID/PID `0x19F5/0x3255`, `lighting: vialrgb`, **25 keycode custom** (24 del JSON VIA + `BAT_NUM`, presente nell'enum ma assente dal JSON ufficiale). Il menu di illuminazione VIA non è usato: Vial ha la propria scheda VialRGB.
- VID/PID invariati (`19F5:3255`, bcdDevice `0x0117`), come il firmware stock. Con Vial l'app VIA ufficiale non è più il tool da usare.

## Risultati di build
| | Stock v2.1.5 | Port Vial |
|---|---|---|
| Binario | 68 988 B | **74 680 B** (`firmware/build/nuphy_air60_v2_ansi_vial.bin`, sha256 `1c4234f6fb5395190d66d9f2db4b0122056f3a1cbb0d16cfc1675a537ba26fe9`) |
| Margine fino all'EEPROM emulata (`0x08000000`+`0x1E000`) | ~52 KB | **48 200 B** |
| RAM usata (stack inclusi) di 16 384 | non misurata | **13 680 B**, heap libera 2 704 B |
| Vector table | SP `0x20000400`, Reset `0x08000191` | **identica** |
- EEPROM: emulata in flash, 4 pagine × 2 KB (`0x1E000–0x20000`), 4096 B logici con cache RAM da 4 KB. Layout Vial: keymap 8 layer = 1632 B + settings/tap dance/combo/override; resta per le macro **~2 KB [D: calcolato a mano, non letto dal dispositivo]**.
- `malloc` è referenziato solo da newlib (`rand`, stdio): nessun uso in QMK/Vial.
- Warning: 1 nell'intera build (non in file NuPhy).

## Cosa NON è verificato
- Nessun test sul dispositivo: tasti, Vial, unlock, BT, 2.4 GHz, batteria, sleep.
- Il sorgente (tip `f185691`) non è provato identico al binario v2.1.5 (compilatore e base QMK diversi): possibili differenze di comportamento non pubblicate.
- Le impostazioni NuPhy (LED laterali, sleep) vivono nel datablock utente: al primo avvio con il port l'EEPROM verrà reinizializzata ai valori di default.
- NKRO/consumer in wireless dopo la sostituzione di `keyboard_protocol`.

## Procedura di flash (solo con conferma esplicita)
1. Backup già presente: `firmware/backup/mcu_dump.bin` (sha256 `8f3e62a4…`) + `option_bytes.bin`; la tastiera si recupera dal DFU in ROM.
2. Esporta la keymap da VIA se serve (l'EEPROM verrà azzerata).
3. DFU: scollega USB, tieni Esc, ricollega. `dfu-util -l` deve mostrare `0483:df11`.
4. **Chip**: STM32F072. **File**: `firmware/build/nuphy_air60_v2_ansi_vial.bin`.
   **Comando**: `dfu-util -a 0 -s 0x08000000:leave -D firmware/build/nuphy_air60_v2_ansi_vial.bin`
5. **Rientro se va male**: tastiera in DFU (Esc+USB) e `dfu-util -a 0 -s 0x08000000:leave -D firmware/originali/QMK_firmware_nuphy_air60_v2_ansi_v2.1.5.bin` (provato il 2026-11-19).
