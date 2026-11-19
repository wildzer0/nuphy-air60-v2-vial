# Analisi delle differenze originale ↔ port Vial (2026-11-19)

Motivo: dopo il flash del port v1 la tastiera si comportava male (Backspace "sempre premuto", disconnessioni USB quando si premeva Esc).
Legenda: **[V]** verificato sul codice/binario, **[D]** dedotto, **[?]** non verificato.

## Metodo
1. Compilato il sorgente NuPhy **nel suo ambiente nativo** (clone `re/nuphy-native/`, commit `f185691`, QMK giugno 2024). `keymaps/via` → 67 520 B contro 68 988 B del binario ufficiale (+2 %); stessa vector table (SP `0x20000400`, Reset `0x08000191`) **[V]**. Il sorgente è quindi una buona approssimazione dell'originale (non identica: ~1,4 KB di differenza, compilatore/fix non pubblicati **[?]**).
2. Confronto delle **macro risolte** (`gcc -E -dM`, stessi flag di build) tra build nativo e build Vial (`re/diag/cfg/`).
3. Diff dei file di codice che cambiano tra QMK 2024 e 2025.
4. **Audit delle macro di NuPhy ignorate** dal QMK 2025 e dei callback `*_kb`.

## Risultati
| Area | Esito |
|---|---|
| Matrice (`matrix.c`), debounce, `board.h`, `mcuconf.h`, clock/RTC/LSE di ChibiOS (`hal_lld.c`) | **identici** (solo rinomine di funzioni) **[V]** |
| Macro `MATRIX_*`, `DEBOUNCE`, `USB_*`, `STM32_*`, `HAL_*` | **identiche** **[V]** |
| Feature aggiunte dal profilo Vial (Auto Shift, Caps Word, Chordal Hold, Flow Tap, Combo, Key Override, Tap Dance, Layer Lock, `QMK_SETTINGS`, `*_PER_KEY`) | presenti solo nel build Vial; non sono la causa trovata, ma cambiano il comportamento rispetto all'originale **[V]** |
| Callback NuPhy (`keyboard_post_init_kb`, `process_record_kb`, `housekeeping_task_kb`, `rgb_matrix_indicators_kb`, `suspend_power_down_kb`, `suspend_wakeup_init_kb`) | tutti con dichiarazione `weak` e punto di chiamata in vial-qmk **[V]** |
| **UART verso l'nRF** | **BUG TROVATO** (vedi sotto) |
| Timeout I2C del driver LED | `ISSI_TIMEOUT 1` ignorato: il nuovo driver usava il default 100 ms **[V]** |

## Bug: pin UART sbagliati (port v1)
- Il QMK 2024 aveva in `platforms/chibios/drivers/uart.h` (righe 18–21) un adattatore: `SERIAL_DRIVER`→`UART_DRIVER`, `SD1_TX_PIN`→`UART_TX_PIN`, ecc. NuPhy usa proprio quei nomi (`SD1_TX_PIN B6`, `SD1_RX_PIN B7`, `*_PAL_MODE 0`) **[V]**.
- vial-qmk 2025 non ha l'adattatore: `uart_serial.c` usa i default **`UART_TX_PIN A9`, `UART_RX_PIN A10`, modalità `7`** **[V: macro risolte identiche nei due `diag/cfg/*.txt` per `SD1_*`, ma il driver legge `UART_*`]**.
- Conseguenze nel v1 **[V sul codice, D sugli effetti]**:
  1. `A9`/`A10` = **colonne 13 e 14 della matrice**; Backspace è `(1,13)`. L'UART le configura come funzione alternata `AF7` (inesistente sull'F0).
  2. `B6`/`B7` (il vero collegamento all'nRF) non venivano mai configurati: **nessun dialogo STM32↔nRF** (Bluetooth e 2.4 GHz inutilizzabili) e il firmware NuPhy attende ack che non arrivano (`uart_send_cmd` con retry/attese), probabile causa di ritardi e tasti "incastrati".
  3. Ipotesi sulle disconnessioni USB premendo Esc: non spiegate; Esc è a `(0,0)`, colonna `A4`. **[?]**
- Il 3° test passivo (nessun tasto) non mostrava report diversi da zero: coerente con un effetto che dipende dalla scansione/UART più che da un report fisso **[D]**.

## Correzione (port v2)
`keyboards/nuphy/air60_v2/ansi/config.h`:
```
#define UART_DRIVER SD1
#define UART_TX_PIN B6   #define UART_TX_PAL_MODE 0
#define UART_RX_PIN B7   #define UART_RX_PAL_MODE 0
#define IS31FL3733_I2C_TIMEOUT ISSI_TIMEOUT
```
Verifica sul binario v2: `uart_init` chiama `_pal_lld_setgroupmode` con maschere `0x40` (pin 6) e `0x80` (pin 7) sul port `0x48000400` = **GPIOB** **[V]**; nel v1 sarebbero state `0x200`/`0x400` su GPIOA.
Dimensioni v2: 74 676 B, margine 48 204 B, RAM 13 680 B, vector table invariata. sha256 `e8c46e29…d87b`.
Il binario v1 è conservato in `firmware/build/..._v1_uart_pins_bug.bin` (sha256 `1c4234f6…`).

## Cosa resta non verificato
- La correzione **non è ancora stata provata sul dispositivo**: è l'unica spiegazione concreta trovata, ma non è provato che sia l'unica.
- Disconnessioni USB con Esc premuto: causa ignota.
- Differenze tra sorgente NuPhy e binario ufficiale (1,4 KB).
