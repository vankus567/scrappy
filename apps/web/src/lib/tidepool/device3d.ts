import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { BTN_A, BTN_B, BTN_DOWN, BTN_LEFT, BTN_RIGHT, BTN_UP, type Console } from "@/lib/console";
import { type RenderState, World3D } from "./world3d";

/**
 * The handheld as a real 3D clamshell: a screen lid on top, a hinge, and a control base below
 * (d-pad well, speaker grid, START/SELECT, A/B in a tilted well, volume slider, LED, screws).
 * On phones the base stretches to the screen's aspect so the device fills the whole viewport.
 * The screen shows the console (menus + HUD, pixel-crisp), the 3D world, or MEME DASH.
 */

const KEY = new THREE.Color(0x2b335f); // console NAVY: where the HUD lets the 3D world show through
const W = 3.6; // device width in world units

// palette: deep-sea shell, pearl controls, coral action buttons
const SHELL = 0x1f5e66;
const SHELL_DARK = 0x16474e;
const WELL = 0x123a40;
const PEARL = 0xe9f1ef;
const CORAL = 0xe0685a;
const INK = "#d8f3ee";

/** Text printed on the plastic, as a transparent texture. */
function printed(w: number, h: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void): THREE.Mesh {
  const c = document.createElement("canvas");
  c.width = Math.round(w * 320);
  c.height = Math.round(h * 320);
  const g = c.getContext("2d")!;
  draw(g, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
}

function label(text: string, w: number, h: number, color = INK, weight = 700, spacing = 0.12): THREE.Mesh {
  return printed(w, h, (g, CW, CH) => {
    g.fillStyle = color;
    g.font = `${weight} ${CH * 0.62}px system-ui, -apple-system, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${CH * spacing}px`;
    g.fillText(text, CW / 2, CH / 2);
  });
}

export class Device3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  private readonly device = new THREE.Group();
  private readonly world = new World3D();
  private readonly hudTex: THREE.CanvasTexture;
  private readonly memeTex: THREE.CanvasTexture;
  private readonly screenMat: THREE.ShaderMaterial;
  private buttons: THREE.Object3D[] = [];
  private dpad = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private held = new Map<number, { btn: number[]; obj: THREE.Object3D }>();
  private raf = 0;
  private tilt = { x: 0, y: 0 };
  private base = { x: 0.05, y: -0.12 };
  private builtH = 0;
  private readonly ro: ResizeObserver;

  constructor(
    private readonly host: HTMLElement,
    private readonly con: Console,
    private readonly state: () => RenderState,
    memeCanvas?: HTMLCanvasElement,
  ) {
    this.memeTex = new THREE.CanvasTexture(memeCanvas ?? document.createElement("canvas"));
    this.memeTex.colorSpace = THREE.SRGBColorSpace;
    this.memeTex.anisotropy = 8;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";
    host.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(-4, 7, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.radius = 6;
    this.scene.add(key, new THREE.AmbientLight(0xffffff, 0.3));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.35 }));
    floor.position.z = -0.8;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.hudTex = new THREE.CanvasTexture(con.canvas);
    this.hudTex.colorSpace = THREE.SRGBColorSpace;
    this.hudTex.magFilter = THREE.NearestFilter;
    this.hudTex.minFilter = THREE.LinearFilter;
    this.hudTex.generateMipmaps = false;
    this.screenMat = new THREE.ShaderMaterial({
      uniforms: { hud: { value: this.hudTex }, world: { value: this.world.target.texture }, meme: { value: this.memeTex }, use3d: { value: 0 }, useMeme: { value: 0 }, key: { value: KEY } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `
        uniform sampler2D hud; uniform sampler2D world; uniform sampler2D meme; uniform float use3d; uniform float useMeme; uniform vec3 key; varying vec2 vUv;
        void main(){
          vec4 h = texture2D(hud, vUv);
          vec3 c = h.rgb;
          if (use3d > 0.5 && distance(h.rgb, key) < 0.015) c = texture2D(world, vUv).rgb;
          if (useMeme > 0.5) c = texture2D(meme, vUv).rgb;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });

    this.scene.add(this.device);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();

    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointercancel", this.onUp);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerleave", this.onLeave);
    el.addEventListener("contextmenu", (e) => e.preventDefault());

    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Build the clamshell for a total height (world units). Called again when a phone's aspect changes. */
  private build(totalH: number): void {
    const d = this.device;
    d.clear();
    this.buttons = [];
    this.dpad = new THREE.Group();

    const plastic = (color: number, rough = 0.42) => new THREE.MeshPhysicalMaterial({ color, roughness: rough, clearcoat: 0.45, clearcoatRoughness: 0.35 });
    const screw = (x: number, y: number, z: number) => {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 20), new THREE.MeshStandardMaterial({ color: 0x9fb4b1, metalness: 0.8, roughness: 0.35 }));
      s.rotation.x = Math.PI / 2;
      s.position.set(x, y, z);
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.012, 0.01), new THREE.MeshBasicMaterial({ color: 0x40504e }));
      slot.position.set(x, y, z + 0.018);
      slot.rotation.z = 0.7;
      d.add(s, slot);
    };

    // ---- lid (screen) ----
    const lidH = W * 0.9;
    const hingeH = 0.3;
    const baseH = Math.max(2.6, totalH - lidH - hingeH);
    const lidY = totalH / 2 - lidH / 2;
    const lidPivot = new THREE.Group(); // tilts back around the hinge for a real clamshell feel
    lidPivot.position.set(0, lidY - lidH / 2, 0);
    lidPivot.rotation.x = -0.1;
    d.add(lidPivot);
    const lid = new THREE.Mesh(new RoundedBoxGeometry(W, lidH, 0.26, 6, 0.2), plastic(SHELL));
    lid.position.y = lidH / 2;
    lid.castShadow = true;
    lidPivot.add(lid);
    const lidFront = 0.13;
    const bezel = new THREE.Mesh(new RoundedBoxGeometry(W - 0.26, lidH - 0.26, 0.04, 4, 0.14), new THREE.MeshStandardMaterial({ color: 0x0e1719, roughness: 0.5 }));
    bezel.position.set(0, lidH / 2, lidFront);
    lidPivot.add(bezel);
    // screen at 160:144, as large as the bezel allows
    const sh = lidH - 0.56;
    const sw = Math.min(W - 0.56, sh * (160 / 144));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw * (144 / 160)), this.screenMat);
    screen.position.set(0, lidH / 2, lidFront + 0.024);
    lidPivot.add(screen);
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(W - 0.3, lidH - 0.3),
      new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, clearcoat: 1, transparent: true, opacity: 0.06, envMapIntensity: 1.5 }),
    );
    glass.position.set(0, lidH / 2, lidFront + 0.04);
    lidPivot.add(glass);
    for (const [x, y] of [[-1, 1], [1, 1], [-1, 0], [1, 0]] as const) {
      const sx = x * (W / 2 - 0.1);
      const sy = y ? lidH - 0.1 : 0.1;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16), new THREE.MeshStandardMaterial({ color: 0x9fb4b1, metalness: 0.8, roughness: 0.35 }));
      s.rotation.x = Math.PI / 2;
      s.position.set(sx, sy, lidFront + 0.01);
      lidPivot.add(s);
    }

    // ---- hinge ----
    const hingeY = lidY - lidH / 2 - hingeH / 2;
    const knuckleMat = plastic(SHELL_DARK, 0.35);
    for (const x of [-(W / 2 - 0.3), W / 2 - 0.3]) {
      const k = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.36, 8, 16), knuckleMat);
      k.rotation.z = Math.PI / 2;
      k.position.set(x, hingeY, 0);
      d.add(k);
    }
    const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, W - 1.3, 8, 16), new THREE.MeshStandardMaterial({ color: WELL, roughness: 0.6 }));
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, hingeY, 0.04);
    d.add(bar);

    // ---- base (controls) ----
    const baseTop = hingeY - hingeH / 2;
    const baseY = baseTop - baseH / 2;
    const base = new THREE.Mesh(new RoundedBoxGeometry(W, baseH, 0.36, 6, 0.22), plastic(SHELL));
    base.position.y = baseY;
    base.castShadow = true;
    d.add(base);
    const F = 0.18; // base front face z

    // top strip: volume slider, brand, LED
    const stripY = baseTop - 0.34;
    const groove = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.16, 0.04, 3, 0.07), new THREE.MeshStandardMaterial({ color: WELL, roughness: 0.7 }));
    groove.position.set(-1.1, stripY, F);
    const knob = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.22, 0.1, 3, 0.05), plastic(PEARL, 0.3));
    knob.position.set(-1.25, stripY, F + 0.05);
    const vol = label("VOL", 0.4, 0.12, "#9cc9c2", 700, 0.1);
    vol.position.set(-0.45, stripY, F + 0.005);
    d.add(groove, knob, vol);
    const brand = label("T I D E P O O L", 1.5, 0.16, "#bfe6df", 800, 0.02);
    brand.position.set(0.55, stripY, F + 0.005);
    d.add(brand);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshStandardMaterial({ color: 0x7ff0ff, emissive: 0x3fd6f0, emissiveIntensity: 1.5 }));
    led.position.set(W / 2 - 0.28, stripY, F + 0.02);
    d.add(led);

    // main control row, centred in the remaining base
    const rowY = baseY + 0.12; // controls sit in the middle of the base, whatever its height

    // d-pad in a square well
    const well = new THREE.Mesh(new RoundedBoxGeometry(1.08, 1.08, 0.05, 4, 0.18), new THREE.MeshStandardMaterial({ color: WELL, roughness: 0.65 }));
    well.position.set(-1.05, rowY, F - 0.005);
    d.add(well);
    const dmat = plastic(PEARL, 0.3);
    const armH = new THREE.Mesh(new RoundedBoxGeometry(0.86, 0.28, 0.14, 3, 0.06), dmat);
    const armV = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.86, 0.14, 3, 0.06), dmat);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 24), new THREE.MeshStandardMaterial({ color: 0xb9ccc8, roughness: 0.5 }));
    hub.rotation.x = Math.PI / 2;
    hub.position.z = 0.075;
    armH.castShadow = armV.castShadow = true;
    armH.userData.dpad = armV.userData.dpad = true;
    this.dpad.add(armH, armV, hub);
    this.dpad.position.set(-1.05, rowY, F + 0.08);
    d.add(this.dpad);
    this.buttons.push(armH, armV);

    // speaker grid and START/SELECT in the middle
    const dotMat = new THREE.MeshStandardMaterial({ color: WELL, roughness: 0.8 });
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 5; c++) {
        const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12), dotMat);
        dot.rotation.x = Math.PI / 2;
        dot.position.set(-0.24 + c * 0.12, rowY + 0.3 - r * 0.12, F + 0.001);
        d.add(dot);
      }
    const pill = (btn: number, x: number, text: string) => {
      const p = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.28, 6, 16), plastic(PEARL, 0.4));
      p.rotation.z = Math.PI / 2 + 0.3;
      p.position.set(x, rowY - 0.22, F + 0.05);
      p.userData.btn = [btn];
      p.userData.rest = p.position.z;
      d.add(p);
      this.buttons.push(p);
      const l = label(text, 0.5, 0.1, "#9cc9c2", 700, 0.08);
      l.position.set(x, rowY - 0.42, F + 0.003);
      d.add(l);
    };
    pill(BTN_B, -0.17, "SELECT");
    pill(BTN_A, 0.35, "START");

    // A/B in a tilted pill-shaped well
    const abWell = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.62, 8, 24), new THREE.MeshStandardMaterial({ color: WELL, roughness: 0.65 }));
    abWell.rotation.z = Math.PI / 2 + 0.38;
    abWell.scale.z = 0.12;
    abWell.position.set(1.08, rowY + 0.02, F - 0.02);
    d.add(abWell);
    const coral = new THREE.MeshPhysicalMaterial({ color: CORAL, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.2 });
    const face = (btn: number, x: number, y: number, text: string) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.16, 40), coral);
      b.rotation.x = Math.PI / 2;
      b.position.set(x, y, F + 0.09);
      b.castShadow = true;
      b.userData.btn = [btn];
      b.userData.rest = b.position.z;
      d.add(b);
      this.buttons.push(b);
      const l = label(text, 0.24, 0.18, "#3a1410", 800, 0);
      l.position.set(x, y, F + 0.172);
      d.add(l);
    };
    face(BTN_B, 0.8, rowY - 0.12, "B");
    face(BTN_A, 1.37, rowY + 0.16, "A");

    // key hints along the bottom edge
    const hints = label("Z  A     X  B     ENTER  START     ARROWS  D-PAD", W - 0.5, 0.14, "#8fbdb6", 700, 0.06);
    hints.position.set(0, baseY - baseH / 2 + 0.24, F + 0.003);
    d.add(hints);
    for (const [x, y] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) screw(x * (W / 2 - 0.12), baseY + y * (baseH / 2 - 0.12), F + 0.005);

    this.builtH = totalH;
  }

  private resize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    const narrow = w < 640;
    const tan = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    // phones: the device takes the screen's exact shape and fills it edge to edge
    const totalH = narrow ? Math.min(8.2, Math.max(5.6, W * (h / w))) : 6.2;
    if (Math.abs(totalH - this.builtH) > 0.02) this.build(totalH);
    this.base = narrow ? { x: 0, y: 0 } : { x: 0.05, y: -0.12 };
    const dist = narrow ? Math.max((totalH * 1.0) / tan, (W * 1.0) / tan / this.camera.aspect) : Math.max((totalH + 0.9) / tan, (W + 1.0) / tan / this.camera.aspect);
    this.camera.position.set(0, 0, dist + 0.2);
    this.camera.updateProjectionMatrix();
  }

  private pick(e: PointerEvent): THREE.Intersection | undefined {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(v, this.camera);
    return this.raycaster.intersectObjects(this.buttons, false)[0];
  }

  private readonly onDown = (e: PointerEvent) => {
    const hit = this.pick(e);
    if (!hit) return;
    e.preventDefault();
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.con.audio.unlock();
    let btn: number[];
    let obj = hit.object;
    if (hit.object.userData.dpad) {
      const local = this.dpad.worldToLocal(hit.point.clone());
      btn = Math.abs(local.x) > Math.abs(local.y) ? [local.x > 0 ? BTN_RIGHT : BTN_LEFT] : [local.y > 0 ? BTN_UP : BTN_DOWN];
      obj = this.dpad;
      this.dpad.rotation.set(btn[0] === BTN_UP ? -0.14 : btn[0] === BTN_DOWN ? 0.14 : 0, btn[0] === BTN_LEFT ? -0.14 : btn[0] === BTN_RIGHT ? 0.14 : 0, 0);
    } else {
      btn = hit.object.userData.btn as number[];
      hit.object.position.z = (hit.object.userData.rest as number) - 0.05;
    }
    for (const b of btn) this.con.input.setTouch(b, true);
    this.held.set(e.pointerId, { btn, obj });
    if (navigator.vibrate) navigator.vibrate(8);
  };

  private readonly onUp = (e: PointerEvent) => {
    const h = this.held.get(e.pointerId);
    if (!h) return;
    for (const b of h.btn) this.con.input.setTouch(b, false);
    if (h.obj === this.dpad) this.dpad.rotation.set(0, 0, 0);
    else h.obj.position.z = h.obj.userData.rest as number;
    this.held.delete(e.pointerId);
  };

  private readonly onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.tilt.y = ((e.clientX - r.left) / r.width - 0.5) * 0.28;
    this.tilt.x = ((e.clientY - r.top) / r.height - 0.5) * 0.18;
    this.renderer.domElement.style.cursor = this.pick(e) ? "pointer" : "default";
  };

  private readonly onLeave = () => {
    this.tilt.x = 0;
    this.tilt.y = 0;
  };

  private frame(): void {
    const s = this.state();
    this.hudTex.needsUpdate = true;
    if (s.round) this.world.render(this.renderer, s);
    this.screenMat.uniforms.use3d!.value = s.round ? 1 : 0;
    this.screenMat.uniforms.useMeme!.value = s.meme ? 1 : 0;
    if (s.meme) this.memeTex.needsUpdate = true;
    const t = performance.now() / 1000;
    const d = this.device;
    d.rotation.y += (this.base.y + this.tilt.y + Math.sin(t * 0.5) * 0.012 - d.rotation.y) * 0.08;
    d.rotation.x += (this.base.x + this.tilt.x - d.rotation.x) * 0.08;
    this.renderer.render(this.scene, this.camera);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
