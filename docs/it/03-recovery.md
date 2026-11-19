# Fase 3 — Backup e recupero (in corso, 2026-11-19)

## STM32F072 (MCU principale)

### Entrare in bootloader (senza aprire la tastiera)
Scollegare USB-C, **tenere premuto Esc**, ricollegare, rilasciare dopo ~2 s (bootmagic, `keyboard.json` ufficiale `bootmagic: true`). **[V sul campo]**: l'utente l'ha eseguita e `dfu-util -l` ha visto il dispositivo.
Uscire senza flashare: scollegare e ricollegare l'USB senza Esc; la flash non è toccata.

### Stato rilevato (solo letture)
- Dispositivo: `0483:df11`, DFU ver 2200, serial `FFFFFFFEFFFF`.
- Alt 0 = `@Internal Flash /0x08000000/064*0002Kg` (64 pagine × 2 KB = 128 KB, leggibile/scrivibile/cancellabile); alt 1 = `@Option Bytes /0x1FFFF800`.
- Option bytes (`firmware/backup/option_bytes.bin`): `aa 55 ff 00 …` → **RDP = 0xAA = livello 0** (nessuna protezione di lettura), WRP tutto `ff` (nessuna protezione in scrittura). Non modificate.

### Backup
```
dfu-util -a 1 -s 0x1FFFF800:16 -U firmware/backup/option_bytes.bin
dfu-util -a 0 -s 0x08000000:131072 -U firmware/backup/mcu_dump.bin     # NO ":leave"
```
- `mcu_dump.bin`: 131 072 B, sha256 `8f3e62a49a30de3eada15649f6072963e3cfe14873accf9d4ce49f8edbb77b3e`. **Riletto una seconda volta: hash identico.** File resi non scrivibili (`chmod a-w`).
- Verifica contro l'ufficiale: i primi 68 988 byte (0x10D7C) coincidono con `QMK_firmware_nuphy_air60_v2_ansi_v2.1.5.bin`. Gli ultimi 16 byte del `.bin` NuPhy sono un **suffisso DFU** (`ff ff 11 df 83 04 00 01 'UFD' 10 + CRC32`), che nel dump non c'è. → La tastiera ha il firmware ufficiale v2.1.5 non modificato.
- Resto della flash: tutto `0xFF` tranne 2 byte `00 00` a `0x1E000`. Quindi **la flash non contiene impostazioni utente significative** (keymap VIA/EEPROM emulata non visibile o non salvata in flash): **[D]** va chiarito dove vive l'EEPROM prima del port.

### Ripristino (da provare, serve conferma)
```
dfu-util -a 0 -s 0x08000000:leave -D firmware/originali/QMK_firmware_nuphy_air60_v2_ansi_v2.1.5.bin
```
`dfu-util` riconosce e usa il suffisso DFU. Fallback: `-D firmware/backup/mcu_dump.bin` (raw 128 KB, richiede `-s 0x08000000`). Il bootloader è in ROM → non sovrascrivibile **[V: documentazione ST e README ablasik]**, quindi il ritorno è sempre possibile finché l'USB funziona.
Piano B: SWD con ST-Link (pad non individuati).

## nRF52810 (RF) — non testato
Backup: nessun accesso SWD → **nessun backup possibile**. Ripristino: pacchetto ufficiale `NUPHY_RF_OTA_V2.1.5` via Nordic DFU BLE (`DfuTarg`, servizio `FE59`) dopo `CMD_RF_DFU` dalla tastiera in USB, o NuPhy Console (Windows). **Chip intoccabile** nel piano: non si flasha l'RF.

## Dongle — non testato
Ripristino: `dongle_52820_upgrade_v2.1.5.exe` (Windows). **Intoccabile.**

## Ciclo di prova eseguito (2026-11-19, con conferma utente)
Flash del `.bin` ufficiale v2.1.5 (68 988 B, erase+download OK, `leave`). Dopo il riavvio la tastiera enumera come `NuPhy Air60 V2` VID 0x19F5. **Ripristino STM32 verificato a livello USB**; restano da confermare dall'utente tasti, BT e 2.4 GHz.

## (storico) Piano del ciclo di prova
Ciclo di prova: flash del firmware ufficiale v2.1.5 sullo STM32 e verifica che la tastiera funzioni (USB, BT, 2.4 GHz). Dato che il dump coincide con l'ufficiale, il ciclo scrive gli stessi byte.
