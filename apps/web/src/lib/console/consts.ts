// Hardware spec. Values match kitao/pyxel (MIT) so Pyxel users feel at home.

export const NUM_COLORS = 16;
export const DEFAULT_PALETTE: readonly number[] = [
  0x000000, 0x2b335f, 0x7e2072, 0x19959c, 0x8b4852, 0x395c98, 0xa9c1ff, 0xeeeeee,
  0xd4186c, 0xd38441, 0xe9c35b, 0x70c6a9, 0x7696de, 0xa3a3a3, 0xff9798, 0xedc7b0,
];

export const NUM_IMAGES = 3;
export const IMAGE_SIZE = 256;
export const NUM_TILEMAPS = 8;
export const TILEMAP_SIZE = 256;
export const TILE_SIZE = 8;
export const NUM_SOUNDS = 64;
export const NUM_MUSICS = 8;
export const NUM_CHANNELS = 4;
export const DEFAULT_FPS = 30;
export const MAX_SCREEN_SIZE = 256;

// Sound ticks per second. A sound's `speed` is ticks per note, so speed 30 = 4 notes/sec.
export const SOUND_TICKS_PER_SEC = 120;
export const NUM_NOTES = 60; // c0..b4

export const TONE_TRIANGLE = 0;
export const TONE_SQUARE = 1;
export const TONE_PULSE = 2;
export const TONE_NOISE = 3;

export const EFFECT_NONE = 0;
export const EFFECT_SLIDE = 1;
export const EFFECT_VIBRATO = 2;
export const EFFECT_FADEOUT = 3;
export const EFFECT_HALF_FADEOUT = 4;
export const EFFECT_QUARTER_FADEOUT = 5;

// 4x6 bitmap font for ASCII 32..127. Each glyph is 6 rows of 4 bits, top row in the high nibble.
export const FONT_WIDTH = 4;
export const FONT_HEIGHT = 6;
export const FONT_MIN_CODE = 32;
export const FONT_DATA: readonly number[] = [
  0x000000, 0x444040, 0xaa0000, 0xaeaea0, 0x6c6c40, 0x824820, 0x4a4ac0, 0x440000, 0x244420,
  0x844480, 0xa4e4a0, 0x04e400, 0x000480, 0x00e000, 0x000040, 0x224880, 0x6aaac0, 0x4c4440,
  0xc248e0, 0xc242c0, 0xaae220, 0xe8c2c0, 0x68eae0, 0xe24880, 0xeaeae0, 0xeae2c0, 0x040400,
  0x040480, 0x248420, 0x0e0e00, 0x842480, 0xe24040, 0x4aa860, 0x4aeaa0, 0xcacac0, 0x688860,
  0xcaaac0, 0xe8e8e0, 0xe8e880, 0x68ea60, 0xaaeaa0, 0xe444e0, 0x222a40, 0xaacaa0, 0x8888e0,
  0xaeeaa0, 0xcaaaa0, 0x4aaa40, 0xcac880, 0x4aae60, 0xcaeca0, 0x6842c0, 0xe44440, 0xaaaa60,
  0xaaaa40, 0xaaeea0, 0xaa4aa0, 0xaa4440, 0xe248e0, 0x644460, 0x884220, 0xc444c0, 0x4a0000,
  0x0000e0, 0x840000, 0x06aa60, 0x8caac0, 0x068860, 0x26aa60, 0x06ac60, 0x24e440, 0x06ae24,
  0x8caaa0, 0x404440, 0x2022a4, 0x8acca0, 0xc444e0, 0x0eeea0, 0x0caaa0, 0x04aa40, 0x0caac8,
  0x06aa62, 0x068880, 0x06c6c0, 0x4e4460, 0x0aaa60, 0x0aaa40, 0x0aaee0, 0x0a44a0, 0x0aa624,
  0x0e24e0, 0x64c460, 0x444440, 0xc464c0, 0x6c0000, 0xeeeee0,
];

// Buttons. Keyboard, gamepad and the touch pad all map onto these eight.
export const BTN_LEFT = 0;
export const BTN_RIGHT = 1;
export const BTN_UP = 2;
export const BTN_DOWN = 3;
export const BTN_A = 4;
export const BTN_B = 5;
export const BTN_X = 6;
export const BTN_Y = 7;
export const NUM_BUTTONS = 8;
