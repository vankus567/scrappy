import { hop } from "../carts";
import { BTN_A, bootCart } from "../src";

const stage = document.getElementById("stage")!;
const bar = document.getElementById("bar")!;

bar.textContent = `${hop.title}: Z / Space to jump, or tap the screen`;

const con = bootCart(stage, hop, {
  onScore: (s) => {
    bar.innerHTML = `Last run <b>${s}</b>. Scores go onchain once the wallet bridge lands.`;
  },
  onError: (e) => console.error(e),
});

// On phones the whole stage is the A button: one-button games need no on-screen pad.
stage.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  con.input.setTouch(BTN_A, true);
});
for (const ev of ["pointerup", "pointercancel", "pointerleave"] as const) {
  stage.addEventListener(ev, () => con.input.setTouch(BTN_A, false));
}
