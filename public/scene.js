/* AVERON 3D scene: extruded logo + particles, reacts to mouse, touch and scroll */
import * as THREE from "./vendor/three.module.js";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";

const canvas = document.getElementById("gl");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const small = () => innerWidth < 760;
let ok = true, renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
} catch (e) { ok = false; }
if (!ok || !renderer) { document.documentElement.classList.add("no-gl"); throw new Error("no webgl"); }

renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, .1, 100); camera.position.set(0, 0, 11);
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;

/* lights that follow the pointer */
const lv = new THREE.PointLight(0x9a6bff, 90, 30), lb = new THREE.PointLight(0x3d8bff, 90, 30);
lv.position.set(-4, 3, 6); lb.position.set(4, -3, 6); scene.add(lv, lb);
const key = new THREE.DirectionalLight(0xffffff, .55); key.position.set(2, 4, 6); scene.add(key);

/* the logo, traced from the AVERON mark and extruded */
const rig = new THREE.Group(); scene.add(rig);
const logo = new THREE.Group(); rig.add(logo);
const H = 4; // logo height in world units
fetch("/logo-poly.json").then(r => r.json()).then(d => {
  const shapes = d.c.filter(c => !c.hole).map(c => {
    const s = new THREE.Shape(); c.pts.forEach(([x, y], i) => { const X = (x - .5) * H * d.aspect, Y = (y - .5) * H; i ? s.lineTo(X, Y) : s.moveTo(X, Y); }); return s;
  });
  const geo = new THREE.ExtrudeGeometry(shapes, { depth: .55, bevelEnabled: true, bevelThickness: .07, bevelSize: .06, bevelSegments: 5, curveSegments: 1 });
  geo.translate(0, 0, -.27);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), a = new THREE.Color(0x8b45ff), b = new THREE.Color(0x1a78ff), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { const t = THREE.MathUtils.clamp((pos.getX(i) * .45 - pos.getY(i) * .55) / H + .5, 0, 1); c.copy(a).lerp(b, t); col.set([c.r, c.g, c.b], i * 3); }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: .2, roughness: .42, clearcoat: .5, clearcoatRoughness: .25, envMapIntensity: .3, emissive: 0x2a1470, emissiveIntensity: .55 }));
  logo.add(mesh);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 35), new THREE.LineBasicMaterial({ color: 0xcdb8ff, transparent: true, opacity: .35 }));
  logo.add(edge);
  document.documentElement.classList.add("gl-ready");
});

/* orbit rings + floating shards */
const ringMat = new THREE.MeshBasicMaterial({ color: 0x8b6bff, transparent: true, opacity: .35 });
const rings = [3.4, 4.3].map((r, i) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, .008, 8, 160), i ? new THREE.MeshBasicMaterial({ color: 0x3d8bff, transparent: true, opacity: .28 }) : ringMat); m.rotation.set(1.2 + i * .5, .2, i); rig.add(m); return m; });
const shardGeo = [new THREE.IcosahedronGeometry(.28, 0), new THREE.OctahedronGeometry(.3, 0), new THREE.TetrahedronGeometry(.34, 0)];
const shardMat = new THREE.MeshPhysicalMaterial({ color: 0x9a7bff, metalness: .7, roughness: .25, clearcoat: .6, envMapIntensity: .9, flatShading: true });
const shards = Array.from({ length: small() ? 7 : 12 }, (_, i) => {
  const m = new THREE.Mesh(shardGeo[i % 3], shardMat), r = 3 + Math.random() * 2.6, a = Math.random() * 6.28;
  m.userData = { r, a, y: (Math.random() - .5) * 4, sp: (.1 + Math.random() * .25) * (Math.random() < .5 ? -1 : 1), rot: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(.6) };
  m.scale.setScalar(.6 + Math.random() * .9); rig.add(m); return m;
});

/* particles */
const N = small() ? 700 : 1600, pp = new Float32Array(N * 3);
for (let i = 0; i < N; i++) { const r = 5 + Math.random() * 16, t = Math.random() * 6.283, p = Math.acos(2 * Math.random() - 1); pp.set([r * Math.sin(p) * Math.cos(t), r * Math.sin(p) * Math.sin(t) * .7, r * Math.cos(p) - 4], i * 3); }
const pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.BufferAttribute(pp, 3));
const sp = document.createElement("canvas"); sp.width = sp.height = 64; const sx = sp.getContext("2d"), gr = sx.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "#fff"); gr.addColorStop(.3, "rgba(190,170,255,.7)"); gr.addColorStop(1, "rgba(120,100,255,0)"); sx.fillStyle = gr; sx.fillRect(0, 0, 64, 64);
const stars = new THREE.Points(pg, new THREE.PointsMaterial({ size: .09, map: new THREE.CanvasTexture(sp), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .9 }));
scene.add(stars);

/* sizing + input */
let W = 0, Hh = 0;
function resize() { W = innerWidth; Hh = innerHeight; renderer.setSize(W, Hh, false); camera.aspect = W / Hh; camera.updateProjectionMatrix(); }
resize(); addEventListener("resize", resize);
const m = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener("pointermove", e => { m.tx = e.clientX / W - .5; m.ty = e.clientY / Hh - .5; }, { passive: true });
addEventListener("deviceorientation", e => { if (e.gamma == null) return; m.tx = THREE.MathUtils.clamp(e.gamma / 45, -.5, .5); m.ty = THREE.MathUtils.clamp((e.beta - 50) / 90, -.5, .5); }, { passive: true });
let spin = 0, spinV = 0; // click / tap the logo area to spin it
addEventListener("pointerdown", e => { const d = Math.hypot((e.clientX - lastScreen.x), (e.clientY - lastScreen.y)); if (d < lastScreen.r) spinV += 14; });
const lastScreen = { x: -999, y: -999, r: 0 };

/* poses come from data-pose="x y z rotY scale" on sections (data-pose-m for phones) */
const poseEls = () => [...document.querySelectorAll("[data-pose]")];
function pose() {
  const els = poseEls(); if (!els.length) return [0, 0, 0, 0, .5];
  const arr = els.map(el => { const r = el.getBoundingClientRect(), s = (small() && el.dataset.poseM) || el.dataset.pose; return { d: r.top + r.height / 2 - Hh / 2, p: s.split(/\s+/).map(Number), top: r.top, bot: r.bottom }; });
  // use the section that contains the middle of the screen, blend near its edges
  let i = arr.findIndex(a => a.top <= Hh * .5 && a.bot > Hh * .5); if (i < 0) i = arr.reduce((b, a, k) => Math.abs(a.d) < Math.abs(arr[b].d) ? k : b, 0);
  const cur = arr[i], blendZone = Hh * .55; let out = cur.p.slice();
  const toNext = arr[i + 1] ? arr[i + 1].top - Hh * .5 : Infinity; // distance until next section reaches mid
  const fromPrev = arr[i - 1] ? Hh * .5 - arr[i - 1].bot : Infinity;
  if (toNext < blendZone) { const t = ease(1 - toNext / blendZone) * .5; out = out.map((v, k) => v + (arr[i + 1].p[k] - v) * t); }
  if (fromPrev < blendZone) { const t = ease(1 - fromPrev / blendZone) * .5; out = out.map((v, k) => v + (arr[i - 1].p[k] - v) * t); }
  return out;
}
const ease = t => t * t * (3 - 2 * t);
const cur = { x: 0, y: 0, z: 0, ry: 0, s: .5 };
const clock = new THREE.Clock();
let visible = true; document.addEventListener("visibilitychange", () => visible = !document.hidden);

function frame() {
  requestAnimationFrame(frame); if (!visible) return;
  const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
  m.x += (m.tx - m.x) * .06; m.y += (m.ty - m.y) * .06;
  const p = pose(), vh = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z, vw = vh * camera.aspect;
  const k = 1 - Math.pow(.0009, dt); // smoothing
  cur.x += (p[0] * vw / 2 - cur.x) * k; cur.y += (p[1] * vh / 2 - cur.y) * k; cur.z += (p[2] - cur.z) * k; cur.ry += (p[3] - cur.ry) * k; cur.s += (p[4] - cur.s) * k;
  const sc = cur.s * vh / H;
  rig.position.set(cur.x, cur.y, cur.z); rig.scale.setScalar(sc);
  spinV *= Math.pow(.04, dt); spin += spinV * dt;
  logo.rotation.y = cur.ry + m.x * .9 + (reduce ? 0 : Math.sin(t * .6) * .18) + spin;
  logo.rotation.x = m.y * .6 + (reduce ? 0 : Math.sin(t * .45) * .06);
  logo.position.y = reduce ? 0 : Math.sin(t * .8) * .12;
  rings.forEach((r, i) => { r.rotation.z += dt * (.15 + i * .1); r.rotation.x += dt * .04; });
  shards.forEach(s => { const u = s.userData; u.a += dt * u.sp * (reduce ? 0 : 1); s.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(t * .5 + u.r) * .2, Math.sin(u.a) * u.r * .6); s.rotation.x += u.rot.x * dt; s.rotation.y += u.rot.y * dt; });
  stars.rotation.y = t * .01 + m.x * .12; stars.rotation.x = m.y * .06; stars.position.y = scrollY * .0016;
  lv.position.set(-4 + m.x * 10, 3 - m.y * 8, 6); lb.position.set(4 + m.x * 10, -3 - m.y * 8, 6);
  // where the logo is on screen (for tap-to-spin)
  const v = rig.position.clone().project(camera); lastScreen.x = (v.x + 1) / 2 * W; lastScreen.y = (1 - v.y) / 2 * Hh; lastScreen.r = sc * H * .5 / vh * Hh;
  renderer.render(scene, camera);
}
frame();
