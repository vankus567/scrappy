/**
 * TIDEPOOL pixel art, shared by the game (drawn into the console) and the landing page (drawn as SVG).
 * Each row is hex palette indices; 0 is transparent. Keyed by x offset in image bank 0.
 */
export const SPRITES: Record<number, string[][]> = {
  0: [
    ["000003333000", "0000333bb300", "00033bb33b30", "0ff3b33bb3b3", "f1f33bb33b33", "0ff333333330", "000f0000f000", "00ff000ff000"],
    ["000003333000", "0000333bb300", "00033bb33b30", "0ff3b33bb3b3", "f1f33bb33b33", "0ff333333330", "0000f0000f00", "000ff000ff00"],
  ],
  24: [
    ["000000000000", "000aaaa00000", "00aaaaaa00a0", "0a71aaaaa9a0", "0aaaaaaaa9a0", "00aaaaaa0099", "000aaaa00000", "000000000000"],
    ["000000000000", "000aaaa00000", "00aaaaaa0a00", "0a71aaaaa9a0", "0aaaaaaaa9a0", "00aaaaaa09a0", "000aaaa00000", "000000000000"],
  ],
  48: [
    ["000000000000", "088000000000", "871880008880", "888888088088", "022228882002", "000022200000", "000000000000", "000000000000"],
    ["000000000000", "088000008880", "871880088088", "888888880002", "022222200000", "000000000000", "000000000000", "000000000000"],
  ],
  // jellyfish, two frames, 8x8 at x=72
  72: [
    ["00eeee00", "0eeeeee0", "ee7ee7ee", "eeeeeeee", "0e0e0e00", "0e0e0e00", "e00e00e0", "0000e000"],
    ["00eeee00", "0eeeeee0", "ee7ee7ee", "eeeeeeee", "00e0e0e0", "0e0e0e00", "0e00e00e", "000e0000"],
  ],
};

/** The console palette, so SVG renders match the game exactly. */
export { DEFAULT_PALETTE as PALETTE } from "@/lib/console/consts";
