# Funzioni aggiuntive rispetto al firmware NuPhy (v3–v4, 2026-11-19)

Legenda: **[V]** compilato e controllato, **[?]** non ancora provato sulla tastiera.

| Funzione | Come funziona | Stato |
|---|---|---|
| Gauge batteria | `Fn+Backspace`: `ceil(%/10)` tasti sui numeri `1…0` per 3 s, verde >20 %, rosso ≤20 %; con cavo 10 tasti ciano (carica) / verdi (carica finita). LED 1–10 della matrice (il codice NuPhy usava 20–29, tasti sbagliati sull'Air60) | v3 flashata; gauge **[?]** da guardare |
| LED destro | respiro in carica, verde a carica finita (per 5 s dopo l'inserimento del cavo), rosso lampeggiante <15 % | v3 **[?]** |
| Bit di carica | `RF_CHARGE_CABLE 0x01`, `RF_CHARGE_ACTIVE 0x02` in `ansi.h`: **dedotti**, non misurati | **[?]** |
| Avviso batteria scarica | a ≤20 % e senza cavo, il gauge compare subito e ogni 30 s per 3 s | v4 **[V]** compila |
| Caps sul LED sinistro | Caps Lock fisso (colore stock), **Caps Word lampeggiante** (500 ms) nello stesso colore; Caps Lock prevale. Caps Word si attiva da Vial (tasto `CW_TOGG`, scheda Quantum) | v4 **[V]** compila, **[?]** |
| Lettere accentate | `Fn+Spazio` = layer 7 one-shot; poi `A à`, `E è`, `R é`, `I ì`, `O ò`, `U ù`; maiuscole con Shift, Caps Lock o Caps Word. Sequenza dallo switch Win/Mac: Win = Alt + codice Latin‑1 sul tastierino (accende Num Lock se serve); Mac = Option+`` ` `` (grave) / Option+E (acuto) poi la vocale, **layout host US/ABC**; Linux = `Ctrl+Shift+U`, 2 cifre esadecimali, spazio (tasto `ACC_LNX` con switch su Win) | v4 **[V]** compila, **[?]** |
| Migrazione tastiera | al primo avvio v4 scrive in EEPROM solo `Fn+Spazio`→`OSL(7)` (layer 1 e 4) e il layer 7; non tocca altro. Generazione salvata nel byte `retain2` del datablock utente (bit 7 = flag Linux) | v4 **[?]** |
| Flasher web | `web/`: WebUSB/DFU, controlla layout flash 128 KB e RDP=0, backup doppio verificato, immagine ≤120 KB, CRC del suffix DFU; riscrive solo da `0x08000000` | test Node 9/9 **[V]**; parte USB **[?]** |
| CI | Actions `build` (compila, controlla dimensione e hash), `release` (tag `v*`), `pages` (sito + manifest) | scritto, **mai eseguito** |

Note: i 7 keycode custom nuovi (`ACC_A … ACC_LNX`) sono in `vial.json` (32 in tutto). Flash dopo la v4: 47 KB di margine.
