SRC += side.c rf.c sleep.c rf_driver.c led_table.c accent.c
UART_DRIVER_REQUIRED = yes

CFLAGS += -Wno-error=unused-but-set-variable
