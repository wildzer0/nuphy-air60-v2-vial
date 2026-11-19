# Fase 4 — Fattibilità e decisione: Vial vs ZMK (2026-11-19)

Legenda: **[V]** verificato, **[D]** dedotto/stimato.

## Raccomandazione
**Vial su `vial-qmk`, cambiando solo il firmware dell'STM32F072. ZMK non praticabile.**

## Perché ZMK no
1. La matrice (6×17) è collegata allo STM32 (`config.h`, pin C14 C15 A0–A3 / A4–A7, B0–B1, B3, B10–B15, A8–A10, A15) **[V]**. L'nRF52810 non vede i tasti: riceve i report HID via UART (460800 baud, frame `0x5A…`) **[V]**.
2. ZMK dovrebbe girare sull'nRF, ma il firmware RF è un pacchetto Nordic DFU **firmato ECDSA P-256**: senza la chiave NuPhy un firmware diverso verrebbe rifiutato dal bootloader **[V: `app.dat` contiene una firma da 64 byte]**. Non c'è backup/recupero SWD (nessun pad individuato) → chip intoccabile secondo CLAUDE.md.
3. Il dongle 2.4 GHz (`NRF_QMK_Dongle`, anch'esso firmato) parla un protocollo proprietario col modulo RF **[D]**: sostituire l'RF significherebbe perdere il dongle ufficiale.
4. Nessun port ZMK esiste per queste tastiere (ricerca GitHub) **[V]**.
→ ZMK richiederebbe riscrivere RF, dongle e matrice: fuori portata e rischioso.

## Perché Vial sull'STM32 sì
- Il firmware RF e il dongle restano originali: il port tocca solo l'MCU, che ha il bootloader ROM non sovrascrivibile e un recupero **già provato** (backup + riflash ufficiale, 2026-11-19) **[V]**.
- Il codice NuPhy per la Air60 V2 è puro "keyboard folder": rispetto a QMK upstream (giugno 2024) il fork cambia nel core solo `builddefs/common_features.mk` (+10 righe), `data/schemas/keyboard.jsonschema` (+2) e un nuovo driver IS31FL3763 usato dalle Halo, **non** dall'Air60 (che usa IS31FL3733) **[V: `git diff` sul clone, `quantum/ platforms/ tmk_core/ drivers/` invariati]**. Quindi non serve portare patch al core.
- Base: `vial-kb/vial-qmk` (commit `dd43959`, 2026-07-26, QMK ≈ maggio 2025); sorgente NuPhy basato su QMK giugno 2024 + 24 commit propri (ultimo commit tip `f185691`, 2025-10-13).

## Prova di compilazione (solo esplorativa, non è il port)
Copiata `keyboards/nuphy/air60_v2` in `src/vial-qmk/` e lanciato `make nuphy/air60_v2/ansi:default` con `qmk 1.2.0` in un venv. Errori trovati, tutti **meccanici** **[V]**:
| # | Problema | Correzione prevista |
|---|---|---|
| 1 | `keyboard.json`: lo schema vial-qmk vuole coordinate LED intere (17.5, 27.5…) e `x`/`y` su ogni LED | arrotondare (15 LED) e aggiungere `x:0,y:0` ai 10 LED laterali con `flags:0`. **Già applicato** nella copia di lavoro |
| 2 | `eeconfig_read/update_user_datablock` ora vogliono 3 argomenti (data, offset, length) — 7 chiamate in `ansi.c`/`side.c` | passare `(&user_config, 0, sizeof(user_config))` |
| 3 | `keyboard_protocol` non più dichiarata (usata in `rf.c`, `rf_driver.c`) | adeguare alla nuova API host (da studiare) |
| 4 | Driver IS31FL3733 nuovo: servono `IS31FL3733_DRIVER_COUNT`/`IS31FL3733_I2C_ADDRESS_n` invece di `DRIVER_COUNT`/`DRIVER_ADDR_n` in `config.h`; i nomi dei registri LED `A_1…F_16` nella tabella LED della keymap non coincidono | riscrivere config e tabella LED |
| 5 | `-Werror` su `is31fl3733.c` con GCC 15.3 (variabili "set but not used") | `EXTRAFLAGS=-Wno-error=unused-but-set-variable` o toolchain più vecchia |
La compilazione non è arrivata al link: **dimensione del binario non misurata**.

## Rischi aperti (da chiudere in Fase 5)
| Rischio | Stima |
|---|---|
| **Flash**: ufficiale 68 988 B su 131 072; Vial + dynamic keymap + QMK settings aggiungono tipicamente 10–25 KB **[D, non misurato]** → ~80–95 KB; resta da sottrarre l'area EEPROM emulata | probabilmente ok, da misurare. Leve: `LTO_ENABLE`, meno effetti RGB, `QMK_SETTINGS` off |
| **RAM** 16 KB | buffer Vial piccoli; da misurare dal `.map` |
| **EEPROM / datablock utente**: il firmware usa `EECONFIG_USER_DATA_SIZE 8` per le sue impostazioni (side LED, sleep). Vial/VIA mettono lì i loro dati: il layout EEPROM cambierà → le impostazioni NuPhy si resettano al primo avvio col port. Nel dump, la flash dopo il firmware è vuota (a parte 2 byte): non so ancora dove viva l'EEPROM emulata **[aperto]** | da verificare con la configurazione `eeprom` di `mcuconf.h`/`halconf.h` e il dump |
| **Compatibilità wireless**: il driver RF dipende da `host_driver_t`, `keyboard_protocol` e dal timing di `sleep.c` | tenere il codice intatto, adattare solo le API |
| **Keycode custom** (`RF_DFU = QK_KB_0`, BT/2.4G, batteria, side LED) in Vial vanno dichiarati come keycode custom in `vial.json` | lavoro di porting |
| **Unlock combo** Vial | proporre 2 tasti, es. Esc + Backspace (ipotesi) |
| Differenze tra sorgente tip e binario 2.1.5 | non verificato (non ho confrontato un build upstream col binario) |

## Piano per Fase 5 (se confermi)
1. Su una copia di `vial-qmk`: portare `keyboards/nuphy/air60_v2/ansi` con le 5 correzioni sopra, mantenendo intatti `rf.c`, `rf_driver.c`, `sleep.c`, `side.c`.
2. `keymaps/vial/` con `rules.mk` (`VIA_ENABLE`, `VIAL_ENABLE`, `LTO_ENABLE`), `config.h` (UID generato con lo script, unlock combo), `vial.json` dal JSON VIA NuPhy, `keymap.c` identico alla fabbrica.
3. Compilare, riportare flash/RAM, **non flashare**: presento binario, checklist e procedura di rientro (`dfu-util … -D QMK_firmware_nuphy_air60_v2_ansi_v2.1.5.bin`).
