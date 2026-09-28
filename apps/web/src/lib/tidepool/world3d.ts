import * as THREE from "three";
import { PALETTE, SPRITES } from "./sprites";

/**
 * The round, in 3D. Game logic stays in game.ts (screen pixels, 160x144); this maps that state
 * into a lit underwater scene. 1 world unit = 10 screen pixels, so positions line up with the HUD.
 */

export type RenderState = {
  round: boolean;
  t: number;
  creature: number;
  creatureX: number;
  creatureY: number;
  netY: number;
  netHalf: number;
  inside: boolean;
  whale: boolean;
  shake: number;
  trail: number[];
  things: { x: number; y: number; kind: "pearl" | "gold" | "jelly" }[];
  sparks: { x: number; y: number; col: number; life: number }[];
};

const W = 16; // 160 px
const H = 14.4; // 144 px
const wx = (x: number) => x / 10 - W / 2;
const wy = (y: number) => H / 2 - y / 10;
const col = (i: number) => new THREE.Color(PALETTE[i] ?? 0xffffff);

/** A pixel sprite extruded into a voxel model, one merged mesh per colour. */
function voxel(rows: string[], depth = 3): THREE.Group {
  const g = new THREE.Group();
  const byCol = new Map<number, THREE.Matrix4[]>();
  const w = rows[0]!.length;
  const h = rows.length;
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const c = parseInt(ch, 16);
      if (!c) return;
      for (let z = 0; z < depth; z++) {
        const m = new THREE.Matrix4().makeTranslation(x - w / 2 + 0.5, h / 2 - y - 0.5, z - depth / 2 + 0.5);
        (byCol.get(c) ?? byCol.set(c, []).get(c)!).push(m);
      }
    }),
  );
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (const [c, mats] of byCol) {
    const mesh = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ color: col(c), roughness: 0.45, metalness: 0.05 }), mats.length);
    mats.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = true;
    g.add(mesh);
  }
  return g;
}

const SX = [0, 24, 48];

export class World3D {
  readonly target: THREE.WebGLRenderTarget;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 200);
  private readonly creatures: THREE.Group[][] = [];
  private readonly jellies: THREE.Group[] = [];
  private readonly pearls: THREE.Mesh[] = [];
  private readonly golds: THREE.Mesh[] = [];
  private readonly ribbon: THREE.Mesh;
  private readonly ribbonGeo = new THREE.BufferGeometry();
  private readonly netBand: THREE.Mesh;
  private readonly netTop: THREE.Mesh;
  private readonly netBot: THREE.Mesh;
  private readonly sparks: THREE.Points;
  private readonly sparkGeo = new THREE.BufferGeometry();
  private readonly motes: THREE.Points;
  private readonly seabed: THREE.Mesh;
  private readonly pearlMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ff, roughness: 0.15, metalness: 0.3, emissive: 0x334466 });
  private readonly goldMat = new THREE.MeshStandardMaterial({ color: 0xe9c35b, roughness: 0.2, metalness: 0.9, emissive: 0x553300 });

  constructor(width = 640, height = 576) {
    this.target = new THREE.WebGLRenderTarget(width, height, { samples: 4 });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;

    this.scene.background = new THREE.Color(0x10345a);
    this.scene.fog = new THREE.Fog(0x10345a, 20, 55);
    this.camera.position.set(0.6, -0.4, 21.5);
    this.camera.lookAt(0, 0, 0);

    // light from the surface, a cool fill from below
    const sun = new THREE.DirectionalLight(0xfff2d6, 2.4);
    sun.position.set(-6, 14, 12);
    this.scene.add(sun, new THREE.HemisphereLight(0x9fd8ff, 0x0b1830, 1.2));

    // background: tall kelp and far rocks give depth behind the play plane
    const kelpMat = new THREE.MeshStandardMaterial({ color: 0x1f6b5a, roughness: 0.9 });
    for (let i = 0; i < 14; i++) {
      const hgt = 4 + ((i * 37) % 7);
      const k = new THREE.Mesh(new THREE.BoxGeometry(0.35, hgt, 0.35), kelpMat);
      k.position.set(-14 + i * 2.2, -H / 2 + hgt / 2 - 1, -8 - (i % 3) * 5);
      k.rotation.z = ((i % 5) - 2) * 0.06;
      this.scene.add(k);
    }
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x2a3f63, roughness: 1, flatShading: true });
    for (let i = 0; i < 7; i++) {
      const r = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4 + (i % 3), 0), rockMat);
      r.position.set(-12 + i * 4, -H / 2 - 0.4, -10 - (i % 2) * 6);
      this.scene.add(r);
    }
    this.seabed = new THREE.Mesh(new THREE.PlaneGeometry(80, 40, 40, 20), new THREE.MeshStandardMaterial({ color: 0xd9b98f, roughness: 1, flatShading: true }));
    const pos = this.seabed.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 0.7) * 0.25 + Math.cos(pos.getY(i) * 0.9) * 0.2);
    this.seabed.geometry.computeVertexNormals();
    this.seabed.rotation.x = -Math.PI / 2;
    this.seabed.position.set(0, -H / 2 - 0.2, -8);
    this.scene.add(this.seabed);

    // drifting motes for water depth
    const mg = new THREE.BufferGeometry();
    const mp = new Float32Array(240 * 3);
    for (let i = 0; i < 240; i++) {
      mp[i * 3] = (Math.random() - 0.5) * 40;
      mp[i * 3 + 1] = (Math.random() - 0.5) * 24;
      mp[i * 3 + 2] = -Math.random() * 25 + 4;
    }
    mg.setAttribute("position", new THREE.BufferAttribute(mp, 3));
    this.motes = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0xbfe6ff, size: 0.08, transparent: true, opacity: 0.55 }));
    this.scene.add(this.motes);

    // creatures: two animation frames each, as voxel models
    for (const sx of SX) {
      const frames = SPRITES[sx]!.map((rows) => voxel(rows));
      frames.forEach((f) => {
        f.scale.setScalar(0.1 * 1.25);
        f.visible = false;
        this.scene.add(f);
      });
      this.creatures.push(frames);
    }

    // the net: a translucent band with two glowing rails
    this.netBand = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.6, 1), new THREE.MeshBasicMaterial({ color: 0x3dd6b5, transparent: true, opacity: 0.16, depthWrite: false }));
    this.netBand.position.z = -0.6;
    const rail = () => new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, W * 1.6, 8), new THREE.MeshBasicMaterial({ color: 0x70f0c8 }));
    this.netTop = rail();
    this.netBot = rail();
    this.netTop.rotation.z = this.netBot.rotation.z = Math.PI / 2;
    this.scene.add(this.netBand, this.netTop, this.netBot);

    // the live price as a glowing ribbon
    this.ribbon = new THREE.Mesh(this.ribbonGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }));
    this.scene.add(this.ribbon);

    this.sparks = new THREE.Points(this.sparkGeo, new THREE.PointsMaterial({ size: 0.22, vertexColors: true, transparent: true }));
    this.scene.add(this.sparks);
  }

  private pool<T extends THREE.Object3D>(list: T[], make: () => T, n: number): T[] {
    while (list.length < n) {
      const o = make();
      this.scene.add(o);
      list.push(o);
    }
    list.forEach((o, i) => (o.visible = i < n));
    return list;
  }

  render(renderer: THREE.WebGLRenderer, s: RenderState): void {
    const t = s.t / 30;

    // camera sways gently and shakes on hits
    const shake = s.shake * 0.03;
    this.camera.position.x = 0.6 + Math.sin(t * 0.4) * 0.5 + (Math.random() - 0.5) * shake;
    this.camera.position.y = -0.4 + Math.cos(t * 0.3) * 0.3 + (Math.random() - 0.5) * shake;
    this.camera.lookAt(0, 0, 0);
    (this.scene.background as THREE.Color).setHex(s.whale ? 0x173d66 : 0x10345a);

    const mp = this.motes.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < mp.count; i++) {
      let x = mp.getX(i) - 0.02;
      if (x < -20) x += 40;
      mp.setX(i, x);
      mp.setY(i, mp.getY(i) + Math.sin(t + i) * 0.003);
    }
    mp.needsUpdate = true;

    // net
    const ny = wy(s.netY);
    const nh = s.netHalf / 10;
    const good = s.inside;
    this.netBand.position.y = ny;
    this.netBand.scale.y = nh * 2;
    (this.netBand.material as THREE.MeshBasicMaterial).color.setHex(good ? (s.whale ? 0xe9c35b : 0x3dd6b5) : 0xd4186c);
    this.netTop.position.set(0, ny + nh, 0);
    this.netBot.position.set(0, ny - nh, 0);
    for (const r of [this.netTop, this.netBot]) (r.material as THREE.MeshBasicMaterial).color.setHex(good ? (s.whale ? 0xffe28a : 0x70f0c8) : 0xff5f9e);

    // price ribbon: a flat strip that leans toward the camera
    const pts = s.trail;
    const n = pts.length;
    const verts = new Float32Array(Math.max(0, n - 1) * 6 * 3);
    let k = 0;
    const th = 0.09;
    for (let i = 1; i < n; i++) {
      const x0 = wx(s.creatureX + 5 - (n - i + 1));
      const x1 = wx(s.creatureX + 5 - (n - i));
      const y0 = wy(pts[i - 1]!);
      const y1 = wy(pts[i]!);
      const quad = [x0, y0 - th, 0, x1, y1 - th, 0, x1, y1 + th, 0, x0, y0 - th, 0, x1, y1 + th, 0, x0, y0 + th, 0];
      verts.set(quad, k);
      k += 18;
    }
    this.ribbonGeo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    this.ribbonGeo.computeBoundingSphere();

    // creature: voxel model riding the price, tilting with the slope
    this.creatures.forEach((frames, i) => frames.forEach((f) => (f.visible = false)));
    const frames = this.creatures[s.creature] ?? this.creatures[0]!;
    const f = frames[Math.floor(s.t / 8) % 2]!;
    f.visible = !(s.shake > 0 && s.t % 2 === 0);
    const slope = n > 6 ? wy(pts[n - 1]!) - wy(pts[n - 6]!) : 0;
    f.position.set(wx(s.creatureX), wy(s.creatureY) + 0.25, 0.4);
    f.rotation.set(0, Math.sin(t * 2) * 0.25, Math.max(-0.5, Math.min(0.5, slope * 0.6)));

    // pearls, gold pearls, jellyfish
    const pearlsIn = s.things.filter((x) => x.kind === "pearl");
    const goldsIn = s.things.filter((x) => x.kind === "gold");
    const jelliesIn = s.things.filter((x) => x.kind === "jelly");
    const pearlMat = this.pearlMat;
    const goldMat = this.goldMat;
    this.pool(this.pearls, () => new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), pearlMat), pearlsIn.length).forEach((m, i) => {
      const p = pearlsIn[i];
      if (p) m.position.set(wx(p.x), wy(p.y), 0.3);
    });
    this.pool(this.golds, () => new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 14), goldMat), goldsIn.length).forEach((m, i) => {
      const p = goldsIn[i];
      if (p) {
        m.position.set(wx(p.x), wy(p.y), 0.3);
        m.rotation.y = t * 3;
      }
    });
    const jellyRows = SPRITES[72]!;
    this.pool(this.jellies, () => {
      const g = voxel(jellyRows[0]!, 2);
      g.scale.setScalar(0.11);
      return g;
    }, jelliesIn.length).forEach((g, i) => {
      const p = jelliesIn[i];
      if (!p) return;
      g.position.set(wx(p.x), wy(p.y), 0.2);
      const pulse = 1 + Math.sin(t * 5 + i) * 0.12;
      g.scale.set(0.11 * pulse, 0.11 / pulse, 0.11);
    });

    // sparks
    const sp = s.sparks;
    const sPos = new Float32Array(sp.length * 3);
    const sCol = new Float32Array(sp.length * 3);
    sp.forEach((p, i) => {
      sPos.set([wx(p.x), wy(p.y), 0.8], i * 3);
      const c = col(p.col);
      sCol.set([c.r, c.g, c.b], i * 3);
    });
    this.sparkGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
    this.sparkGeo.setAttribute("color", new THREE.BufferAttribute(sCol, 3));

    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
  }
}
