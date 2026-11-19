// SPDX-License-Identifier: GPL-2.0-or-later
//
// Accented letters (a e e i o u, lower and upper case) typed with a plain US/HID keyboard, whatever the host layout.
// The key does not carry the letter: it types the sequence that makes the host write it, which depends on the system:
//   Windows  Alt + 0 and the 3 decimal digits of the Latin-1 code on the numeric keypad (Num Lock must be ON: it is
//            turned on before and off after if it is off).
//   macOS    Option+` (grave) or Option+E (acute) then the vowel, Shift on the vowel for the capital. Assumes a US/ABC host layout.
//   Linux    Ctrl+Shift+U, the two hex digits of the code, space (GTK / IBus / Qt).
// The system is the one of the Win/Mac switch; Windows position + ACC_LNX = Linux.
// The sequence is played synchronously, one key event every ACCENT_STEP_MS (about 60 ms in all), with the modifiers that are
// down put aside and restored at the end. Reports go through the normal host driver, so it works over USB, Bluetooth and 2.4 GHz.
// Capitals: Shift held, Caps Lock on, or Caps Word on.

#include "ansi.h"

extern DEV_INFO_STRUCT dev_info;
extern user_config_t   user_config;

#define ACCENT_STEP_MS 4

typedef struct {
    uint8_t lower;
    uint8_t upper;
    uint8_t dead;  // Mac: the key pressed with Option
    uint8_t vowel; // Mac: the vowel typed after it
} accent_t;

// Same order as ACC_A ... ACC_U in ansi.h
static const accent_t accents[] = {
    {0xE0, 0xC0, KC_GRV, KC_A}, // a grave
    {0xE8, 0xC8, KC_GRV, KC_E}, // e grave
    {0xE9, 0xC9, KC_E, KC_E},   // e acute
    {0xEC, 0xCC, KC_GRV, KC_I}, // i grave
    {0xF2, 0xD2, KC_GRV, KC_O}, // o grave
    {0xF9, 0xD9, KC_GRV, KC_U}, // u grave
};

static void key_down(uint8_t kc) {
    register_code(kc);
    wait_ms(ACCENT_STEP_MS);
}

static void key_up(uint8_t kc) {
    unregister_code(kc);
    wait_ms(ACCENT_STEP_MS);
}

static void key_tap(uint8_t kc) {
    key_down(kc);
    key_up(kc);
}

static uint8_t keypad_digit(uint8_t digit) {
    return (digit == 0) ? KC_KP_0 : (uint8_t)(KC_KP_1 + digit - 1);
}

static uint8_t hex_digit(uint8_t nibble) {
    if (nibble < 10) {
        return (nibble == 0) ? KC_0 : (uint8_t)(KC_1 + nibble - 1);
    }
    return (uint8_t)(KC_A + nibble - 10);
}

static bool host_caps_lock(void) {
    return (dev_info.link_mode == LINK_USB) ? host_keyboard_led_state().caps_lock : ((dev_info.rf_led & 0x02) != 0);
}

static bool host_num_lock(void) {
    return (dev_info.link_mode == LINK_USB) ? host_keyboard_led_state().num_lock : ((dev_info.rf_led & 0x01) != 0);
}

void accent_type(uint8_t index) {
    if (index >= sizeof(accents) / sizeof(accents[0])) {
        return;
    }

    const uint8_t saved_mods = get_mods();
    bool          upper      = (saved_mods & MOD_MASK_SHIFT) || host_caps_lock();
#ifdef CAPS_WORD_ENABLE
    upper = upper || is_caps_word_on();
#endif

    const uint8_t code = upper ? accents[index].upper : accents[index].lower;

    clear_mods();
    send_keyboard_report();

    if (dev_info.sys_sw_state == SYS_SW_MAC) {
        key_down(KC_LALT);
        key_tap(accents[index].dead);
        key_up(KC_LALT);
        if (upper) key_down(KC_LSFT);
        key_tap(accents[index].vowel);
        if (upper) key_up(KC_LSFT);
    } else if (user_config.retain2 & ACCENT_LINUX_BIT) {
        key_down(KC_LCTL);
        key_down(KC_LSFT);
        key_tap(KC_U);
        key_up(KC_LSFT);
        key_up(KC_LCTL);
        key_tap(hex_digit(code >> 4));
        key_tap(hex_digit(code & 0x0F));
        key_tap(KC_SPC);
    } else {
        const bool num_lock = host_num_lock();

        if (!num_lock) key_tap(KC_NUM_LOCK);
        key_down(KC_LALT);
        key_tap(KC_KP_0);
        key_tap(keypad_digit(code / 100));
        key_tap(keypad_digit((code / 10) % 10));
        key_tap(keypad_digit(code % 10));
        key_up(KC_LALT);
        if (!num_lock) key_tap(KC_NUM_LOCK);
    }

    set_mods(saved_mods);
    send_keyboard_report();
}
