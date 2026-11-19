# Fase 2 — Analisi dei firmware originali (2026-11-19)

Legenda: **[V]** verificato (comando/file citato), **[D]** dedotto, non verificato.
Non è stato usato Ghidra: per il protocollo basta il sorgente ufficiale. Il confronto sorgente ↔ binario compilato è **ancora da fare** (serve `arm-none-eabi-gcc`, non installato).

## 1. MCU STM32F072 — `QMK_firmware_nuphy_air60_v2_ansi_v2.1.5.bin`
- Formato: binario raw, 69 004 byte (0x10D8C). sha1 = quello pubblicato da NuPhy **[V]**. `file` lo scambia per "TTComp": falso positivo.
- Vector table (`xxd`): SP iniziale `0x20000400`, Reset `0x08000191` → **base `0x08000000`, nessun offset per bootloader** **[V]**. Il bootloader è il DFU in ROM (`"bootloader": "stm32-dfu"` in `keyboard.json`).
- USB: descriptor a offset `0x10601`: **VID `0x19F5`, PID `0x3255`, bcdDevice `0x0117`** (1.1.7) **[V]**, uguale a `keyboard.json`. Stringhe UTF-16 "NuPhy", "NuPhy Air60 V2" **[V]**. (La versione 2.1.5 NON è nel descriptor.)
- Spazio: 69 KB usati su 128 KB → ~59 KB liberi, **meno** l'area EEPROM emulata (da verificare in Fase 5) **[D]**.
- Sorgente ufficiale: `nuphy-src/qmk_firmware`, branch `nuphy-keyboards`, commit `f1856912d603800eaca227ae2e1c5c8548fdf261` (2025-10-13, "Add Nuphy Halo65 V2"), copia dei file in `re/nuphy-src/`. Il tip è successivo a v2.1.5 e **non è provato che compili nello stesso binario**.

## 2. Hardware e pin (da `config.h` ufficiale) **[V sul sorgente]**
| Funzione | Pin STM32 |
|---|---|
| Matrice 6 righe × 17 colonne, COL2ROW | righe C14 C15 A0 A1 A2 A3; colonne A4 A5 A6 A7 B0 B1 B10–B15 A8 A9 A10 A15 B3 |
| UART verso nRF (USART1, **460800 baud**) | TX B6, RX B7 |
| nRF reset / boot / wakeup | B4 / B5 / C4 |
| Switch Win/Mac, Dev mode, DC boost | C1 / C0 / C2 |
| LED RGB: 2× IS31FL3733 su I2C1 (B8/B9) | indirizzi 0b1010000, 0b1010011; SDB: C6, C7 |
Risposta alla domanda aperta: **la matrice è sullo STM32; l'nRF è solo radio** (HID report entrano via UART).

## 3. Protocollo STM32 ↔ nRF (UART) **[V sul sorgente `rf.c`/`ansi.h`]**
Frame: `0x5A | CMD | ACK(0x01) | LEN | DATA[LEN] | CHK`; `CHK = (somma byte DATA) XOR 0x5A`; lunghezza massima 64.
Comandi principali: report `E0` mouse, `E1` tastiera 8 byte, `E2` tastiera bitmap (NKRO), `E3` consumer, `E4` system; `C0` set link (canale BT1-3/2.4G), `C1/C2` set/get config, `C3/C4` nome BT, `C5` clear device, `C7` new adv (pairing), `C9` sync stato RF, `CA` nome 2.4G, `F0` power up, `F1` sleep, `F2` handshake, `F3` sniff, `F4` 24G suspend, `FE` idle exit, **`B1` RF DFU**, `80/81` write/read data.
Il firmware RF invia lo stato (connessione, LED host, batteria…) con lo stesso frame. Il dettaglio dei payload va ricavato da `rf.c` (720 righe) in Fase 5; **non va modificato**.
Il disassemblato dell'RF non è stato analizzato: non necessario finché il port riusa il driver ufficiale **[D]**.

## 4. Modulo RF — `NUPHY_RF_OTA_V2.1.5/` (nRF52810)
- Formato: pacchetto **Nordic DFU legacy/secure** (`app.bin` 49 152 B = 0xC000, `app.dat` init packet protobuf, `manifest.json` con solo `application`) **[V]**.
- `app.bin` non è a base 0: SP `0x200058B8`, Reset `0x000193C1` → l'app è linkata attorno a `0x19000`, sopra un SoftDevice **[D]**.
- `app.dat` (protobuf): fw_version=2, hw_version=52 (nRF52), sd_req=`0x0103` (259, probabilmente S112 7.x **[D]**), sd_size=0, bl_size=0, app_size=49152 (coincide **[V]**), hash SHA-256 di `app.bin` byte-invertito (coincide **[V]**), **firma ECDSA P-256 (64 byte)** **[V]**.
- Stringhe: `QMK_BLE_KB`, `BLE KB` (nome advertising).
- **Conseguenza:** il bootloader accetta pacchetti firmati; senza chiave NuPhy non si può caricare un firmware RF modificato. Si può solo reinstallare quello ufficiale → **RF intoccabile** salvo reflash ufficiale.
- Aggiornamento: l'STM32 manda `CMD_RF_DFU (0xB1)` (keycode `RF_DFU`, solo in modalità USB) → l'nRF entra in DFU e compare come `DfuTarg` (servizio BLE `FE59`); tool terzo: [`nrf-dfu.swift`](https://github.com/HikaruEgashira/nuphy-air60-v2-tools) **[V sul sorgente; non provato sul dispositivo]**.

## 5. Dongle — `dongle_52820_upgrade_v2.1.5.exe`
- PE32 MFC (`FirmwareUpdateTool-20241113`), 20 MB; in coda all'exe (overlay a `0x1317600`) c'è uno zip con `dfu.zip` → `app.bin`, `app.dat`, `manifest.json`. Estratti in `re/dongle_extracted/` con script Python **[V]**.
- Aggiornamento: lancia `prf-tool.exe dfu usb-serial -pkg dfu.zip -p <COM> -fc 0 -b 115200` (nrfutil/Nordic serial DFU) **[V da stringhe]**.
- `app.bin`: 46 360 B, SP `0x20004AD0`, Reset `0x000194DD` (base ~`0x19000`), stringa **`NRF_QMK_Dongle`**, build "Nov 24 2024" **[V]**. Chip: nome file "52820" → nRF52820 **[D]**.
- `app.dat`: stessa struttura (fw_version=2, hw=52, sd_req 0x103, app_size 46360 coincide, hash coincide **[V]**, firma ECDSA 64 B) → dongle **intoccabile** salvo reflash ufficiale.
- Il file è uno solo (nome "52820", versione "win"/"mac" sul sito): la differenza win/mac **non è verificata**; il pacchetto in mano è un solo exe.
- Il dongle ha un'app "QMK_Dongle" e nessun sorgente pubblico: parla col modulo RF col proprio protocollo 2.4 GHz; l'STM32 non lo vede, quindi cambiare il firmware MCU non lo tocca **[D]**.

## 6. Domande di CLAUDE.md
| Domanda | Risposta |
|---|---|
| Collegamento STM32↔nRF | UART 460800, frame `0x5A…` **[V]** |
| Chi gestisce la matrice | STM32 **[V]** |
| Dongle dipende dal firmware tastiera? | Probabilmente no: riceve HID dall'RF; è accoppiato al modulo RF **[D]** |
| Pad SWD / RDP STM32 | **Non verificati** (servono foto PCB / lettura DFU) |
| Aggiornamento RF/dongle | RF: DFU BLE dopo `0xB1`; dongle: DFU seriale USB **[V parziale]** |

## 7. Rischi per il port Vial
- Il layout flash/EEPROM e lo spazio (59 KB liberi) vanno verificati compilando.
- Differenze tra v2.1.5 e il tip del repo non verificate.
- Il comando `RF_DFU` è un keycode custom (`QK_KB_0`): in Vial va mappato come keycode custom.
