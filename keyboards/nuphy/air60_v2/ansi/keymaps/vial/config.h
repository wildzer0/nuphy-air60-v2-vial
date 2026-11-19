// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once

#define VIAL_KEYBOARD_UID {0x6E, 0x8E, 0x43, 0xF3, 0x23, 0xDD, 0xDF, 0xE1}

/* Unlock combo: Esc (row 0, col 0) + Backspace (row 1, col 13) */
#define VIAL_UNLOCK_COMBO_ROWS {0, 1}
#define VIAL_UNLOCK_COMBO_COLS {0, 13}

/* Keep RAM (16 KB) and the 4 KB emulated EEPROM in check: fewer dynamic entries than the Vial default of 32 */
#define VIAL_TAP_DANCE_ENTRIES 8
#define VIAL_COMBO_ENTRIES 8
#define VIAL_KEY_OVERRIDE_ENTRIES 8
