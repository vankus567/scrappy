import type { Cart } from "../src/cart";
import hopCode from "./hop.js" with { type: "text" };

export const hop: Cart = {
  v: 1,
  title: "HOP",
  author: "scrappy",
  width: 128,
  height: 128,
  fps: 30,
  code: hopCode,
};

export const carts: Cart[] = [hop];
