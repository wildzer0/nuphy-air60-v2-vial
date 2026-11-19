# Fase 1 — Ricerca (2026-11-19)

Metodo: `gh search repos` / `gh api` (verifica diretta su GitHub) + WebSearch. I risultati WebSearch erano vaghi e non sono usati come fonte per affermazioni tecniche.

## Binari originali forniti
| File | sha1 | Note |
|---|---|---|
| QMK_firmware_nuphy_air60_v2_ansi_v2.1.5.bin | `41d14b41…0ed056` | **coincide** con lo sha1 pubblicato da NuPhy (CLAUDE.md). 69 KB |
| NUPHY_RF_OTA_V2.1.5/app.bin (+app.dat, manifest.json) | `ce8e3526…` | pacchetto in stile Nordic DFU (app.bin + app.dat), 49 KB |
| dongle_52820_upgrade_v2.1.5.exe | `cf6f9a95…` | updater Windows 20 MB; nel nome "52820" → dongle probabilmente nRF52820 (da verificare) |

Hash completi in `firmware/originali.sha.txt`.

## Soluzioni trovate
| Progetto | Modelli | Ultimo push | Vial? | Wireless | Note |
|---|---|---|---|---|---|
| [ablasik/nuphy-qmk](https://github.com/ablasik/nuphy-qmk) (branch `nuphy-keyboards`) | Air96 V2, Air75 V2, **Air60 V2** | 2026-11-17 | **No** (VIA) | Sì, stabilità migliorata | QMK upstream recente, GPLv2, mantenuto. Air60 V2 "fully tested" da un utente; issue #1 chiede tester. Ha `keyboard.json`, `matrix.c`, `rf_driver.c`, `rf_queue.c`, `sleep.c`, `mcu_pwr.c`. Dichiara che il bootloader DFU STM32 non è sovrascrivibile. |
| [adi4086/qmk_firmware](https://github.com/adi4086/qmk_firmware) | V2 vari | 2025-04-04 | No | Sì | Base di ablasik; non più mantenuto. |
| [ryodeushii/qmk-firmware](https://github.com/ryodeushii/qmk-firmware) (branch `nuphy-keyboards`) | Gem80, Halo75 V2, Halo96 V2, Air75 V2 | 2026-10-16 | Nessuna traccia | — | **Esiste**, ma **non include Air60 V2** (cartelle `air75v2, gem80, halo75v2, halo96v2`). Il ricordo "fork Vial" non è confermato: nessun `VIAL_ENABLE`. |
| [kbsteven/Nuphy-Vial](https://github.com/kbsteven/Nuphy-Vial) | **Air75 V2** | 2024-11-13 | **Sì** (`keymaps/vial` con vial.json, rules.mk, config.h) | non verificato | Unico tentativo Vial trovato. Descrizione: "Macros not working". Abbandonato, nessuna licenza dichiarata, un solo push. Contiene .bin/.elf precompilati. |
| [nuphy-src PR qmk#22751](https://github.com/qmk/qmk_firmware/pull/22751) | Air75 V2 | — | — | media non funzionano in wireless (da review) | Sorgente ufficiale in upstream: non merged. |
| `vial-kb/vial-qmk` | — | — | — | — | `keyboards/nuphy` **non esiste**; nessuna PR con "nuphy". |
| [HikaruEgashira/nuphy-air60-v2-tools](https://github.com/HikaruEgashira/nuphy-air60-v2-tools) | Air60 V2 | 2026-11-18 | No | — | "macOS tools to recover Bluetooth (RF DFU)": da esaminare in Fase 2/3. |

## Completamento punti aperti (2026-11-19)
- **Sorgente ufficiale NuPhy**: [nuphy-src/qmk_firmware](https://github.com/nuphy-src/qmk_firmware), branch `nuphy-keyboards` (anche `nuphy-air75`, `master`). Contiene `keyboards/nuphy/air60_v2/ansi/` con `rf.c`, `rf_driver.c`, `side.c`, `sleep.c`, `keyboard.json`, `keymaps/via` (+ JSON VIA "NuPhy Air60 V2 via3.json"). Ultimo push repo: 2025-10-13. Vial assente. Questo è il punto di partenza per il porting (Fase 5).
- **vial-qmk** (`vial-kb/vial-qmk`, branch `vial`, push 2026-07-26): base QMK ~maggio 2025 (ChangeLog fino a 20250525), supporta `keyboard.json` (es. `ymdk/ymd62`). Compatibilità con il sorgente NuPhy da verificare in Fase 5.
- **ZMK**: nessun repo trovato (`gh search "nuphy zmk"` vuoto); la pagina prodotto NuPhy dice che non è disponibile. Coerente con CLAUDE.md: ZMK non praticabile (verrà confermato in Fase 4).
- **Reddit/Discord**: la ricerca web non restituisce thread utili (accesso non affidabile da qui). Non verificato; se hai link, passameli.
- **Recovery community**:
  - STM32: entrare in bootloader con tasto reset sul PCB + ricollegare USB-C, poi QMK Toolbox ([DEV.to Air75 V2](https://dev.to/kkoziarski/nuphy-air75-v2-firmware-upgrade-troubleshooting-4fdi); [NuPhy FAQ](https://www.nuphy.io/en-US/commonProblem)). Tool HikaruEgashira: Caps+Esc entra in flash mode (con il suo firmware). Bootloader ROM → non sovrascrivibile.
  - RF nRF: **Nordic Secure DFU via BLE** (servizio `FE59`, advertising `DfuTarg`, caratteristiche `8EC90001/2-F315-4F60-9FB8-838830DAEA50`, pacchetto `app.dat` init + `app.bin`), implementato in [`Sources/nrf-dfu.swift`](https://github.com/HikaruEgashira/nuphy-air60-v2-tools). Quindi il flash RF non richiede SWD. Come si entra in modalità DfuTarg: da capire (Fase 2/3).
  - Importante: QMK, RF e dongle vanno tenuti alla stessa versione, altrimenti non si connettono.
  - Tool ufficiale NuPhy Console: solo Windows.
Pagina firmware NuPhy: https://nuphy.com/pages/firmwares (v2.1.5, 4 mar 2025; dongle e firmware vanno aggiornati insieme).

## Raccomandazione (provvisoria)
**"Faccio il port da zero su vial-qmk"** (scelta dell'utente, 2026-11-19): partire dal repo vial-qmk originale e portarci il sorgente ufficiale NuPhy (`nuphy-src/qmk_firmware`, branch `nuphy-keyboards`, Air60 V2) mantenendo intatto il codice wireless. `ablasik/nuphy-qmk` (fix wireless/sleep) e `kbsteven/Nuphy-Vial` (esempio `vial.json`/`rules.mk` per Air75 V2) restano solo riferimenti.
Rischi da valutare in Fase 4: vial-qmk è basato su una versione QMK più vecchia di quella usata da ablasik (API `keyboard.json`, driver), flash 128 KB (il binario ufficiale è già 69 KB), RAM 16 KB.

## Procedure di recupero (community)
- ablasik/nuphy-qmk README: il DFU STM32 (ROM) non è sovrascrivibile → ritorno al firmware stock sempre possibile (da verificare con la procedura esatta per Air60 V2).
- HikaruEgashira/nuphy-air60-v2-tools: recupero RF via DFU su macOS (da leggere).
- Tool ufficiali NuPhy: pagina firmware sopra.

## Decisione richiesta
Nessun port Vial affidabile → non scatta lo stop "usa quello esistente". Scelta dell'utente: vial-qmk originale + sorgente ufficiale NuPhy. Passo alla Fase 2 (analisi dei 3 binari). Nessun flash eseguito.
