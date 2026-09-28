// HOP: run across the rooftops, grab coins, don't fall.
// Controls: A (Z / Space / tap) to jump. Hold for a higher jump.

const G = 0.45;
const JUMP = -5;
let p, plats, coins, sparks, score, best = 0, speed, dist, state = "title";

function init() {
  const img = image(0);
  // two run frames for the hopper, 8x8 each, colour 0 is transparent
  img.load(0, 0, [
    "00777700",
    "07777770",
    "07170170",
    "07777770",
    "0077e700",
    "00777700",
    "00a00a00",
    "0aa00aa0",
  ]);
  img.load(8, 0, [
    "00777700",
    "07777770",
    "07170170",
    "07777770",
    "0077e700",
    "00777700",
    "000aa000",
    "00aa0aa0",
  ]);
  sound(0).set("c3 g3 c4", "p", "654", "n", 2); // jump
  sound(1).set("b3 e4", "s", "5", "n f", 4); // coin
  sound(2).set("g2 e2 c2 g1", "n", "7", "f", 8); // fall
  sound(10).set("c1 r c1 r g0 r g0 r a0 r a0 r f0 r g0 r", "t", "6", "n", 15);
  sound(11).set("e3 r g3 c4 r g3 e3 r d3 r f3 a3 r f3 d3 r", "p", "3", "n", 15);
  music(0).set([], [], [10], [11]);
  reset();
}

function reset() {
  p = { x: 24, y: 60, vy: 0, ground: false, coyote: 0, buffer: 0 };
  plats = [{ x: -8, w: 104, y: 92 }];
  coins = [];
  sparks = [];
  score = 0;
  dist = 0;
  speed = 1.6;
  while (plats[plats.length - 1].x < W + 64) addPlat();
}

function addPlat() {
  const last = plats[plats.length - 1];
  const gap = rndi(12, 20 + Math.floor(speed * 6));
  const w = rndi(24, 56);
  const y = clamp(last.y + rndi(-16, 16), 64, 112);
  const x = last.x + last.w + gap;
  plats.push({ x, w, y });
  if (rnd() < 0.7) {
    const n = Math.min(4, Math.floor(w / 10));
    for (let i = 0; i < n; i++) coins.push({ x: x + 6 + i * 10, y: y - 12 - (i % 2) * 4, taken: false });
  }
}

function jumpPressed() {
  return btnp(A) || btnp(UP);
}

function update() {
  if (state !== "play") {
    if (jumpPressed()) {
      if (state === "dead") reset();
      state = "play";
      playm(0, true);
      p.vy = JUMP;
      play(0, 0);
    }
    return;
  }

  speed = Math.min(3.2, speed + 0.0015);
  dist += speed;
  for (const pl of plats) pl.x -= speed;
  for (const c of coins) c.x -= speed;
  while (plats.length && plats[0].x + plats[0].w < 0) plats.shift();
  coins = coins.filter((c) => c.x > -8 && !c.taken);
  while (plats[plats.length - 1].x < W + 64) addPlat();

  // Jump buffering and coyote time: a press slightly early or late still counts.
  if (jumpPressed()) p.buffer = 5;
  else p.buffer = Math.max(0, p.buffer - 1);
  p.coyote = p.ground ? 5 : Math.max(0, p.coyote - 1);
  if (p.buffer > 0 && p.coyote > 0) {
    p.vy = JUMP;
    p.buffer = 0;
    p.coyote = 0;
    play(0, 0);
  }
  if (!btn(A) && !btn(UP) && p.vy < -2) p.vy = -2; // tap = short hop

  p.vy = Math.min(p.vy + G, 6);
  const prevBottom = p.y + 8;
  p.y += p.vy;
  p.ground = false;
  for (const pl of plats) {
    const overlaps = p.x + 6 > pl.x && p.x + 2 < pl.x + pl.w;
    if (overlaps && p.vy >= 0 && prevBottom <= pl.y + 1 && p.y + 8 >= pl.y) {
      p.y = pl.y - 8;
      p.vy = 0;
      p.ground = true;
    }
  }

  for (const c of coins) {
    if (Math.abs(c.x - (p.x + 4)) < 6 && Math.abs(c.y - (p.y + 4)) < 6) {
      c.taken = true;
      score += 10;
      play(1, 1);
      for (let i = 0; i < 6; i++) sparks.push({ x: c.x, y: c.y, vx: rnd(-1.5, 1.5), vy: rnd(-2, 0.5), life: 12 });
    }
  }
  sparks = sparks.filter((s) => {
    s.x += s.vx;
    s.y += s.vy;
    s.vy += 0.15;
    return --s.life > 0;
  });

  if (frame() % 6 === 0) score += 1;

  if (p.y > H) {
    state = "dead";
    best = Math.max(best, score);
    stop();
    play(0, 2);
    submit_score(score);
  }
}

function drawSkyline() {
  for (let i = 0; i < 28; i++) {
    const sx = (i * 53 + 7) % W;
    const sy = (i * 29 + 3) % 60;
    if ((frame() + i * 5) % 40 > 2) pset(sx, sy, i % 3 ? 13 : 7);
  }
  const base = Math.floor(dist / 4);
  for (let k = Math.floor(base / 24) - 1; k < Math.floor(base / 24) + 7; k++) {
    const x = k * 24 - base;
    const h = 18 + (((k * 37) % 7) + 7) % 7 * 5;
    rect(x, H - 20 - h, 20, h + 20, 5);
    for (let wy = H - 16 - h; wy < H - 4; wy += 6) {
      for (let wx = 3; wx < 18; wx += 5) {
        if (((k * 13 + wy * 7 + wx) & 5) === 0) rect(x + wx, wy, 2, 2, 10);
      }
    }
  }
}

function drawPlats() {
  for (const pl of plats) {
    rect(pl.x, pl.y, pl.w, H - pl.y, 4);
    rect(pl.x, pl.y, pl.w, 2, 15);
    for (let yy = pl.y + 6; yy < H; yy += 6) line(pl.x + 2, yy, pl.x + pl.w - 3, yy, 2);
  }
}

function centerText(y, s, c) {
  text(Math.floor((W - s.length * 4) / 2) + 1, y + 1, s, 0);
  text(Math.floor((W - s.length * 4) / 2), y, s, c);
}

function draw() {
  cls(1);
  drawSkyline();
  drawPlats();

  for (const c of coins) {
    const bob = Math.floor(Math.sin((frame() + c.x) / 5) * 1.5);
    circ(c.x, c.y + bob, 2, 10);
    pset(c.x - 1, c.y + bob - 1, 7);
  }
  for (const s of sparks) pset(s.x, s.y, s.life > 6 ? 10 : 9);

  const running = state === "play" && p.ground;
  const f = running ? Math.floor(frame() / 4) % 2 : 0;
  blt(p.x, p.y, 0, f * 8, 0, 8, 8, 0);

  const sc = "SCORE " + score;
  text(5, 5, sc, 0);
  text(4, 4, sc, 7);
  const bs = "BEST " + best;
  text(W - 4 - bs.length * 4, 4, bs, 13);

  if (state === "title") {
    centerText(36, "H O P", 10);
    centerText(48, "JUMP THE ROOFTOP GAPS", 7);
    if (frame() % 30 < 20) centerText(60, "PRESS A OR TAP", 15);
  } else if (state === "dead") {
    centerText(40, "YOU FELL", 8);
    centerText(52, "SCORE " + score, 7);
    if (frame() % 30 < 20) centerText(64, "PRESS A OR TAP", 15);
  }
}
