import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { BTN_A, BTN_B, BTN_DOWN, BTN_LEFT, BTN_RIGHT, BTN_UP, type Console } from "@/lib/console";
import { type RenderState, World3D } from "./world3d";

/**
 * The handheld as a real 3D object: an extruded plastic shell with the classic big bottom-right
 * curve, a raised bezel, a glass lens, and physical buttons you press with a pointer.
 * The screen shows the console (menus + HUD, pixel-crisp) with the 3D world composited behind it.
 */

const KEY = new THREE.Color(0x2b335f); // console NAVY: where the HUD lets the 3D world show through

function roundedShape(w: number, h: number, r: { tl: number; tr: number; br: number; bl: number }): THREE.Shape {
  const x = -w / 2;
  const y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r.bl, y);
  s.lineTo(x + w - r.br, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r.br);
  s.lineTo(x + w, y + h - r.tr);
  s.quadraticCurveTo(x + w, y + h, x + w - r.tr, y + h);
  s.lineTo(x + r.tl, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r.tl);
  s.lineTo(x, y + r.bl);
  s.quadraticCurveTo(x, y, x + r.bl, y);
  return s;
}

/** Text or stripes printed on the plastic, as a transparent texture. */
function printed(w: number, h: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void): THREE.Mesh {
  const c = document.createElement("canvas");
  c.width = Math.round(w * 256);
  c.height = Math.round(h * 256);
  const g = c.getContext("2d")!;
  draw(g, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, depthWrite: false }));
}

export class Device3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  private readonly device = new THREE.Group();
  private readonly world = new World3D();
  private readonly hudTex: THREE.CanvasTexture;
  private readonly screenMat: THREE.ShaderMaterial;
  private readonly buttons: THREE.Object3D[] = [];
  private readonly dpad = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private held = new Map<number, { btn: number[]; obj: THREE.Object3D }>();
  private raf = 0;
  private tilt = { x: 0, y: 0 };
  private readonly ro: ResizeObserver;

  constructor(
    private readonly host: HTMLElement,
    private readonly con: Console,
    private readonly state: () => RenderState,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";
    host.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-4, 6, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.radius = 6;
    this.scene.add(key, new THREE.AmbientLight(0xffffff, 0.25));

    // soft contact shadow on the "table" behind the device
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.35 }));
    floor.position.z = -0.9;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.hudTex = new THREE.CanvasTexture(con.canvas);
    this.hudTex.colorSpace = THREE.SRGBColorSpace;
    this.hudTex.magFilter = THREE.NearestFilter;
    this.hudTex.minFilter = THREE.LinearFilter;
    this.hudTex.generateMipmaps = false;
    this.screenMat = new THREE.ShaderMaterial({
      uniforms: { hud: { value: this.hudTex }, world: { value: this.world.target.texture }, use3d: { value: 0 }, key: { value: KEY } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `
        uniform sampler2D hud; uniform sampler2D world; uniform float use3d; uniform vec3 key; varying vec2 vUv;
        void main(){
          vec4 h = texture2D(hud, vUv);
          vec3 c = h.rgb;
          if (use3d > 0.5 && distance(h.rgb, key) < 0.015) c = texture2D(world, vUv).rgb;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });

    this.build();
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

  private build(): void {
    const d = this.device;
    const DEPTH = 0.62;
    const FRONT = DEPTH / 2 + 0.07;

    // shell
    const shell = new THREE.Mesh(
      new THREE.ExtrudeGeometry(roundedShape(3.6, 6.0, { tl: 0.2, tr: 0.2, br: 1.05, bl: 0.2 }), { depth: DEPTH, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 6, curveSegments: 32 }),
      new THREE.MeshPhysicalMaterial({ color: 0xcfcbc2, roughness: 0.48, clearcoat: 0.35, clearcoatRoughness: 0.45, sheen: 0.2 }),
    );
    shell.geometry.translate(0, 0, -DEPTH / 2);
    shell.castShadow = true;
    d.add(shell);

    // moulding line near the top
    const seam = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.02, 0.01), new THREE.MeshStandardMaterial({ color: 0x9e9a92 }));
    seam.position.set(0, 2.72, FRONT + 0.002);
    d.add(seam);
    const sw = printed(1.1, 0.16, (g, W, H) => {
      g.fillStyle = "#8f8b83";
      g.font = `600 ${H * 0.62}px system-ui, sans-serif`;
      g.textBaseline = "middle";
      g.fillText("◁ OFF · ON ▷", 6, H / 2);
    });
    sw.position.set(-0.95, 2.86, FRONT + 0.003);
    d.add(sw);

    // bezel
    const bezel = new THREE.Mesh(
      new THREE.ExtrudeGeometry(roundedShape(3.12, 2.62, { tl: 0.12, tr: 0.12, br: 0.5, bl: 0.12 }), { depth: 0.03, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 3 }),
      new THREE.MeshPhysicalMaterial({ color: 0x4f5367, roughness: 0.55, clearcoat: 0.2 }),
    );
    bezel.position.set(0, 1.25, FRONT);
    d.add(bezel);
    const bezelZ = FRONT + 0.05;
    const label = printed(3.0, 0.2, (g, W, H) => {
      g.fillStyle = "#7c2b4d";
      g.fillRect(0, H * 0.3, W * 0.2, H * 0.14);
      g.fillStyle = "#2d3f8c";
      g.fillRect(0, H * 0.56, W * 0.2, H * 0.14);
      g.fillStyle = "#7c2b4d";
      g.fillRect(W * 0.8, H * 0.3, W * 0.2, H * 0.14);
      g.fillStyle = "#2d3f8c";
      g.fillRect(W * 0.8, H * 0.56, W * 0.2, H * 0.14);
      g.fillStyle = "#c3c5d2";
      g.font = `600 ${H * 0.5}px system-ui, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("REFLECTIVE LCD · 4 CHANNEL SOUND", W / 2, H / 2);
    });
    label.position.set(0, 2.38, bezelZ);
    d.add(label);

    // power LED
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshStandardMaterial({ color: 0xff3b2f, emissive: 0xe0332a, emissiveIntensity: 1.2 }));
    led.position.set(-1.36, 1.45, bezelZ);
    d.add(led);
    const pw = printed(0.4, 0.1, (g, W, H) => {
      g.fillStyle = "#a9abb9";
      g.font = `600 ${H * 0.7}px system-ui, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("POWER", W / 2, H / 2);
    });
    pw.position.set(-1.36, 1.3, bezelZ);
    d.add(pw);

    // the screen (160:144) and the glass over it
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.98), this.screenMat);
    screen.position.set(0.08, 1.2, bezelZ + 0.002);
    d.add(screen);
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 2.08),
      new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.03, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.07, envMapIntensity: 1.4 }),
    );
    glass.position.set(0.08, 1.2, bezelZ + 0.02);
    d.add(glass);

    // brand
    const brand = printed(2.4, 0.34, (g, W, H) => {
      g.fillStyle = "#2a2f6e";
      g.font = `italic 800 ${H * 0.72}px system-ui, sans-serif`;
      g.textBaseline = "middle";
      g.fillText("TIDEPOOL", 4, H / 2);
      const w = g.measureText("TIDEPOOL").width;
      g.font = `700 ${H * 0.42}px system-ui, sans-serif`;
      g.fillText("POCKET", w + 20, H / 2 + H * 0.06);
    });
    brand.position.set(-0.35, -0.3, FRONT + 0.003);
    d.add(brand);

    // d-pad
    const dmat = new THREE.MeshPhysicalMaterial({ color: 0x26262a, roughness: 0.42, clearcoat: 0.3 });
    const armH = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.32, 0.16), dmat);
    const armV = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.98, 0.16), dmat);
    const dimple = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 24), new THREE.MeshStandardMaterial({ color: 0x1a1a1d, roughness: 0.6 }));
    dimple.rotation.x = Math.PI / 2;
    dimple.position.z = 0.08;
    armH.castShadow = armV.castShadow = true;
    this.dpad.add(armH, armV, dimple);
    this.dpad.position.set(-0.98, -1.12, FRONT + 0.1);
    this.dpad.userData.dpad = true;
    d.add(this.dpad);
    this.buttons.push(armH, armV);
    armH.userData.dpad = armV.userData.dpad = true;

    // A and B
    const plum = new THREE.MeshPhysicalMaterial({ color: 0x8a1f4c, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    const face = (btn: number, x: number, y: number, text: string) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.16, 40), plum);
      b.rotation.x = Math.PI / 2;
      b.position.set(x, y, FRONT + 0.09);
      b.castShadow = true;
      b.userData.btn = [btn];
      b.userData.rest = b.position.z;
      d.add(b);
      this.buttons.push(b);
      const l = printed(0.3, 0.2, (g, W, H) => {
        g.fillStyle = "#2a2f6e";
        g.font = `700 ${H * 0.7}px system-ui, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(text, W / 2, H / 2);
      });
      l.position.set(x + 0.06, y - 0.4, FRONT + 0.003);
      d.add(l);
    };
    face(BTN_A, 1.2, -0.86, "A");
    face(BTN_B, 0.52, -1.2, "B");

    // START / SELECT
    const rubber = new THREE.MeshStandardMaterial({ color: 0x7d7a74, roughness: 0.8 });
    const pill = (btn: number, x: number, text: string) => {
      const p = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.32, 6, 16), rubber);
      p.rotation.z = Math.PI / 2 - 0.45;
      p.position.set(x, -2.0, FRONT + 0.05);
      p.userData.btn = [btn];
      p.userData.rest = p.position.z;
      d.add(p);
      this.buttons.push(p);
      const l = printed(0.6, 0.14, (g, W, H) => {
        g.fillStyle = "#2a2f6e";
        g.font = `700 ${H * 0.6}px system-ui, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(text, W / 2, H / 2);
      });
      l.rotation.z = 0.45;
      l.position.set(x + 0.04, -2.24, FRONT + 0.003);
      d.add(l);
    };
    pill(BTN_B, -0.42, "SELECT");
    pill(BTN_A, 0.25, "START");

    // speaker grille
    const slotMat = new THREE.MeshStandardMaterial({ color: 0x77736b, roughness: 0.9 });
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.02), slotMat);
      s.rotation.z = -0.5;
      s.position.set(0.95 + i * 0.13, -2.25 + i * 0.07, FRONT + 0.001);
      d.add(s);
    }

    d.rotation.set(0.06, -0.14, 0);
  }

  private resize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    // fit the 3.6 x 6.0 device with a margin
    const fitH = 7.0 / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    const fitW = 4.4 / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / this.camera.aspect;
    this.camera.position.set(0, 0, Math.max(fitH, fitW));
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
      this.dpad.rotation.set(btn[0] === BTN_UP ? -0.12 : btn[0] === BTN_DOWN ? 0.12 : 0, btn[0] === BTN_LEFT ? -0.12 : btn[0] === BTN_RIGHT ? 0.12 : 0, 0);
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
    this.tilt.y = (((e.clientX - r.left) / r.width) - 0.5) * 0.3;
    this.tilt.x = (((e.clientY - r.top) / r.height) - 0.5) * 0.2;
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
    const t = performance.now() / 1000;
    const d = this.device;
    d.rotation.y += (-0.14 + this.tilt.y + Math.sin(t * 0.5) * 0.02 - d.rotation.y) * 0.08;
    d.rotation.x += (0.06 + this.tilt.x - d.rotation.x) * 0.08;
    this.renderer.render(this.scene, this.camera);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
