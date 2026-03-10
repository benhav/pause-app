"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const BASE_PULSE_SCALE = 0.8;

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function makeNucleusCapsuleGeometry(
  radius: number,
  height: number,
  capSegments: number,
  radialSegments: number,
  options?: {
    depthFlatten?: number;
    middleBulge?: number;
    bottomWeight?: number;
    backTuck?: number;
    organicWarp?: number;
    waistPinch?: number;
    topLean?: number;
    lobeOffset?: number;
    asymmetry?: number;
    twist?: number;
    crownLift?: number;
    bellySink?: number;
  }
) {
  const straightLength = Math.max(0.01, height - radius * 2);
  const geo = new THREE.CapsuleGeometry(
    radius,
    straightLength,
    capSegments,
    radialSegments
  );

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();

  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const halfY = Math.max(1e-6, (bb.max.y - bb.min.y) * 0.5);
  const halfZ = Math.max(1e-6, (bb.max.z - bb.min.z) * 0.5);

  const depthFlatten = options?.depthFlatten ?? 0.63;
  const middleBulge = options?.middleBulge ?? 0.08;
  const bottomWeight = options?.bottomWeight ?? 0.1;
  const backTuck = options?.backTuck ?? 0.055;
  const organicWarp = options?.organicWarp ?? 0;
  const waistPinch = options?.waistPinch ?? 0;
  const topLean = options?.topLean ?? 0;
  const lobeOffset = options?.lobeOffset ?? 0;
  const asymmetry = options?.asymmetry ?? 0;
  const twist = options?.twist ?? 0;
  const crownLift = options?.crownLift ?? 0;
  const bellySink = options?.bellySink ?? 0;

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);

    const ny = v.y / halfY;
    const nz = v.z / halfZ;
    const angle = Math.atan2(v.z, v.x);

    const midWeight = 1 - Math.pow(Math.min(1, Math.abs(ny)), 1.5);
    const bottomMask = clamp01((-ny + 0.14) / 1.14);
    const backMask = clamp01(-nz);
    const waistMask = clamp01(1 - Math.abs(ny) * 1.42);
    const crownMask = clamp01((ny + 0.08) / 0.92);
    const bellyMask = clamp01((0.28 - ny) / 1.28);

    const waveA = Math.sin(angle * 2.2 + ny * 2.8);
    const waveB = Math.cos(angle * 3.1 - ny * 1.7);

    v.z *= depthFlatten;
    v.x *= 1 + middleBulge * midWeight;
    v.x *= 1 + bottomWeight * bottomMask * 0.35;
    v.z *= 1 + bottomWeight * bottomMask * 0.12;
    v.z -= backTuck * backMask * (0.45 + midWeight * 0.55);
    v.y -= bottomWeight * bottomMask * 0.015;

    const crossInflate =
      1 +
      organicWarp *
        (Math.sin(angle * 1.45 + ny * 2.25) * 0.038 +
          Math.cos(angle * 2.8 - ny * 2.05) * 0.026);

    v.x *= crossInflate;
    v.z *= 1 + organicWarp * Math.cos(angle * 1.9 - ny * 1.2) * 0.031;

    v.x += organicWarp * waistMask * (waveA * 0.0068 + waveB * 0.0048);
    v.z += organicWarp * waistMask * (Math.cos(angle * 2.7 - ny * 2.1) * 0.0054);

    v.x *= 1 - waistPinch * waistMask * 0.14;
    v.z *= 1 - waistPinch * waistMask * 0.2;

    v.x += topLean * crownMask * 0.012;
    v.z +=
      lobeOffset *
      ((crownMask * 0.0074) - (bellyMask * 0.0052)) *
      Math.sin(angle * 1.7);

    const twistAmount = twist * ny;
    const cosT = Math.cos(twistAmount);
    const sinT = Math.sin(twistAmount);
    const x0 = v.x;
    const z0 = v.z;
    v.x = x0 * cosT - z0 * sinT;
    v.z = x0 * sinT + z0 * cosT;

    v.x += asymmetry * ((crownMask * 0.007) - (bellyMask * 0.0054));
    v.y += crownLift * crownMask * 0.0074;
    v.y -= bellySink * bellyMask * 0.0062;

    pos.setXYZ(i, v.x, v.y, v.z);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function makeParticleField(
  count: number,
  minRadius: number,
  maxRadius: number,
  yStretch = 1,
  radialBias = 0.75
) {
  const base = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const sway = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const cosPhi = Math.random() * 2 - 1;
    const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
    const r = THREE.MathUtils.lerp(
      minRadius,
      maxRadius,
      Math.pow(Math.random(), radialBias)
    );

    const x = r * sinPhi * Math.cos(theta);
    const y = r * cosPhi * yStretch;
    const z = r * sinPhi * Math.sin(theta);

    const o = i * 3;
    base[o] = x;
    base[o + 1] = y;
    base[o + 2] = z;
    phase[i] = Math.random() * Math.PI * 2;
    sway[i] = 0.45 + Math.random() * 0.55;
  }

  return { base, phase, sway };
}

function makeCoreParticleField(count: number, minRadius: number, maxRadius: number) {
  const base = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const sway = new Float32Array(count);
  const size = new Float32Array(count);
  const alpha = new Float32Array(count);
  const role = new Float32Array(count);
  const mode = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const cosPhi = Math.random() * 2 - 1;
    const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
    const choice = Math.random();

    let r = 0;
    if (choice < 0.09) {
      r = THREE.MathUtils.lerp(
        minRadius * 0.46,
        minRadius * 0.92,
        Math.pow(Math.random(), 1.55)
      );
      size[i] = 3.6 + Math.random() * 1.8;
      alpha[i] = 0.16 + Math.random() * 0.12;
      sway[i] = 0.42 + Math.random() * 0.28;
      role[i] = 0;
      mode[i] = Math.random() < 0.78 ? 0 : 1;
    } else if (choice < 0.62) {
      r = THREE.MathUtils.lerp(
        minRadius * 0.82,
        maxRadius * 0.78,
        Math.pow(Math.random(), 0.92)
      );
      size[i] = 3.0 + Math.random() * 2.4;
      alpha[i] = 0.1 + Math.random() * 0.12;
      sway[i] = 0.62 + Math.random() * 0.42;
      role[i] = 1;
      mode[i] = Math.floor(Math.random() * 3);
    } else {
      r = THREE.MathUtils.lerp(
        maxRadius * 0.78,
        maxRadius,
        Math.pow(Math.random(), 0.42)
      );
      size[i] = 2.8 + Math.random() * 2.2;
      alpha[i] = 0.08 + Math.random() * 0.1;
      sway[i] = 0.92 + Math.random() * 0.52;
      role[i] = 2;
      mode[i] = Math.random() < 0.42 ? 2 : 1;
    }

    const x = r * sinPhi * Math.cos(theta);
    const y = r * cosPhi * (0.96 + Math.random() * 0.18);
    const z = r * sinPhi * Math.sin(theta);

    const o = i * 3;
    base[o] = x;
    base[o + 1] = y;
    base[o + 2] = z;
    phase[i] = Math.random() * Math.PI * 2;
  }

  return { base, phase, sway, size, alpha, role, mode };
}

type BridgeNumRef = { current: number };
type BridgeToneRef = { current: THREE.ColorRepresentation };

type PulseBridge = {
  spinRadRef?: BridgeNumRef;
  tiltXRadRef?: BridgeNumRef;
  tiltYRadRef?: BridgeNumRef;
  beatRef?: BridgeNumRef;
  breathScaleRef?: BridgeNumRef;
  breatheScaleRef?: BridgeNumRef;
  roomToneRef?: BridgeToneRef;
  sceneToneRef?: BridgeToneRef;
  toneRef?: BridgeToneRef;
  lockVisualSpin?: boolean;
};

type Props = {
  bridge?: PulseBridge;
};

type ShellUniforms = {
  uSceneColor: { value: THREE.Texture | null };
  uCameraPos: { value: THREE.Vector3 };
  uEdgeTint: { value: THREE.Color };
  uDeepTint: { value: THREE.Color };
  uHotDir: { value: THREE.Vector3 };
  uLowDir: { value: THREE.Vector3 };
  uRefractionNear: { value: number };
  uRefractionFar: { value: number };
  uAlphaBase: { value: number };
  uAlphaEdge: { value: number };
};

const ORB_SHELL_VERTEX_SHADER = `
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec2 vScreenUv;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);

  vec4 clipPos = projectionMatrix * viewMatrix * worldPos;
  vScreenUv = clipPos.xy / clipPos.w * 0.5 + 0.5;
  gl_Position = clipPos;
}
`;

const ORB_SHELL_FRAGMENT_SHADER = `
uniform sampler2D uSceneColor;
uniform vec3 uCameraPos;
uniform vec3 uEdgeTint;
uniform vec3 uDeepTint;
uniform vec3 uHotDir;
uniform vec3 uLowDir;
uniform float uRefractionNear;
uniform float uRefractionFar;
uniform float uAlphaBase;
uniform float uAlphaEdge;

varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec2 vScreenUv;

void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 v = normalize(uCameraPos - vWorldPos);

  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float rim = 1.0 - ndv;

  float shellRim = smoothstep(0.83, 0.998, rim);
  float shellShoulder = smoothstep(0.5, 0.9, rim) * (1.0 - smoothstep(0.9, 0.985, rim));
  float midBody = smoothstep(0.22, 0.64, rim) * (1.0 - smoothstep(0.7, 0.92, rim));
  float rearWall = smoothstep(0.38, 0.92, ndv) * pow(1.0 - rim, 1.35) * (1.0 - shellRim * 0.95);

  vec3 hotDir = normalize(uHotDir);
  vec3 lowDir = normalize(uLowDir);
  float hotField = max(dot(n, hotDir), 0.0);
  float lowField = max(dot(n, lowDir), 0.0);
  float az = atan(n.z, n.x);
  float meridian = 0.5 + 0.5 * sin(az * 5.8 + n.y * 7.2);
  float latitude = 0.5 + 0.5 * sin(n.y * 13.4 - az * 2.6);
  float glossLane = smoothstep(0.74, 0.99, meridian) * smoothstep(0.46, 0.98, rim);
  float depthVein = smoothstep(0.64, 0.98, latitude) * (midBody * 0.3 + rearWall * 0.22);

  float lowerPool = smoothstep(-0.94, -0.18, n.y) * (0.32 + rim * 0.62) * (0.82 + lowField * 0.52);
  float shoulderRibbon = pow(max(dot(n, normalize(vec3(-0.22, 0.44, 0.87))), 0.0), 22.0) * smoothstep(0.62, 0.985, rim);
  float lowerRibbon = pow(max(dot(n, normalize(vec3(0.05, -0.95, 0.3))), 0.0), 24.0) * smoothstep(0.64, 0.99, rim);
  float hotCatch = pow(hotField, 165.0) * smoothstep(0.72, 0.998, rim);
  float hotGlide = pow(hotField, 26.0) * shellShoulder;
  float lowCompression = pow(lowField, 22.0) * smoothstep(0.56, 0.97, rim) * pow(rim, 1.5);
  float edgeRibbon = smoothstep(0.84, 0.998, rim) * (0.62 + glossLane * 0.38);

  float pathDepth = pow(clamp(rim, 0.0, 1.0), 0.58);
  float centerVoid = smoothstep(0.9, 0.998, ndv) * (1.0 - smoothstep(0.22, 0.58, rim));
  float thickness = clamp(0.08 + pathDepth * 0.74 + shellShoulder * 0.18 + lowerPool * 0.56 + rearWall * 0.18, 0.0, 1.6);

  vec3 deepBody = uDeepTint * (0.18 + thickness * 0.46 + rearWall * 0.14);
  vec3 edgeBody = uEdgeTint * (0.16 + shellRim * 1.18 + shellShoulder * 0.28 + edgeRibbon * 0.18);
  vec3 shellBase = mix(deepBody, edgeBody, clamp(shellRim * 0.82 + shellShoulder * 0.24 + edgeRibbon * 0.14, 0.0, 1.0));

  vec2 uv = clamp(vScreenUv, vec2(0.001), vec2(0.999));
  float offsetScale = 1.0 - shellRim * 0.85;
  vec2 uvNear = clamp(
    uv + n.xy * (uRefractionNear * (0.14 + offsetScale * 0.22)),
    vec2(0.001),
    vec2(0.999)
  );
  vec2 uvFar = clamp(
    uv - n.xy * (uRefractionFar * (0.12 + offsetScale * 0.18)),
    vec2(0.001),
    vec2(0.999)
  );
  vec3 refracted = mix(texture2D(uSceneColor, uvNear).rgb, texture2D(uSceneColor, uvFar).rgb, 0.68);

  vec3 bodyTrans = refracted * centerVoid * 0.06;
  bodyTrans += mix(uDeepTint * 0.34, uEdgeTint * 0.58, hotField) * (rearWall * 0.24 + lowerPool * 0.34 + midBody * 0.08);
  bodyTrans += uDeepTint * lowerPool * 0.18;

  vec3 shellSpec = vec3(1.0) * (hotCatch * 3.1 + shoulderRibbon * 0.34 + lowerRibbon * 0.28);
  shellSpec += uEdgeTint * (hotGlide * 1.06 + shoulderRibbon * 0.84 + lowerRibbon * 0.88);
  shellSpec += uDeepTint * (lowCompression * 0.42 + lowerPool * 0.14);

  vec3 color = shellBase + shellSpec + bodyTrans;
  color += uEdgeTint * (shellShoulder * 0.06 + edgeRibbon * 0.28);
  color += mix(uDeepTint * 0.48, uEdgeTint * 1.12, meridian) * glossLane * 0.18;
  color -= uDeepTint * depthVein * 0.08;

  float alpha = uAlphaBase;
  alpha += shellRim * uAlphaEdge;
  alpha += shellShoulder * 0.07;
  alpha += rearWall * 0.03;
  alpha += midBody * 0.02;
  alpha += hotCatch * 0.26;
  alpha += lowerPool * 0.12;
  alpha += shoulderRibbon * 0.1;
  alpha += lowerRibbon * 0.08;
  alpha += edgeRibbon * 0.08;
  alpha = clamp(alpha, 0.0, 0.96);

  gl_FragColor = vec4(color, alpha);
}
`;

const CONTRAST_PLATE_VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const CONTRAST_PLATE_FRAGMENT_SHADER = `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  p.x *= 0.92;
  float r = length(p);
  float plate = smoothstep(1.16, 0.16, r);
  float body = pow(plate, 2.2);
  float shoulder = smoothstep(1.06, 0.46, r) * (1.0 - smoothstep(0.68, 0.18, r));
  float alpha = uOpacity * (body * 1.08 + shoulder * 0.2);

  if (alpha < 0.002) discard;

  gl_FragColor = vec4(uColor, alpha);
}
`;

const CORE_PARTICLE_VERTEX_SHADER = `
attribute float aSize;
attribute float aAlpha;
attribute float aMode;
varying float vAlpha;
varying float vMode;

void main() {
  vAlpha = aAlpha;
  vMode = aMode;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float depthScale = clamp(2.5 / max(0.001, -mvPosition.z), 0.72, 3.2);
  gl_PointSize = aSize * depthScale * 1.26;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const CORE_PARTICLE_FRAGMENT_SHADER = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
varying float vMode;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  float roundBody = smoothstep(1.0, 0.12, r2);
  float diamondBody = smoothstep(1.08, 0.06, abs(p.x) * 1.06 + abs(p.y) * 1.06);
  float ribbonBody = smoothstep(0.24, 0.0, min(abs(p.x), abs(p.y)));
  ribbonBody *= smoothstep(1.02, 0.16, max(abs(p.x), abs(p.y)));
  float sparkCore = smoothstep(0.24, 0.0, r2) * 0.22;

  float roundMix = 1.0 - step(0.5, vMode);
  float diamondMix = step(0.5, vMode) * (1.0 - step(1.5, vMode));
  float ribbonMix = step(1.5, vMode);

  float body = roundBody * roundMix;
  body += diamondBody * diamondMix;
  body += (roundBody * 0.58 + ribbonBody * 0.66) * ribbonMix;

  float glow = sparkCore + ribbonBody * ribbonMix * 0.1 + diamondBody * diamondMix * 0.06;
  float alpha = (body * 0.86 + glow) * vAlpha * uOpacity;

  if (alpha < 0.018) discard;

  gl_FragColor = vec4(uColor, alpha);
}
`;

export default function PulseScene({ bridge }: Props) {
  const { gl, scene, camera, size } = useThree();

  const pulseUnitRef = useRef<THREE.Group>(null!);
  const contrastPlateRef = useRef<THREE.Mesh>(null!);
  const contrastPlateMaterialRef = useRef<THREE.ShaderMaterial>(null!);

  const orbShellRef = useRef<THREE.Mesh>(null!);
  const orbShellMaterialRef = useRef<THREE.ShaderMaterial>(null!);
  const orbInnerFogRef = useRef<THREE.Mesh>(null!);
  const orbFlowParticlesRef = useRef<THREE.Points>(null!);

  const backHaloLargeRef = useRef<THREE.Mesh>(null!);
  const backHaloMediumRef = useRef<THREE.Mesh>(null!);
  const backHaloCoreRef = useRef<THREE.Mesh>(null!);

  const coreGroupRef = useRef<THREE.Group>(null!);
  const coreMembraneRef = useRef<THREE.Mesh>(null!);
  const coreInnerMassRef = useRef<THREE.Mesh>(null!);
  const coreLifeParticlesRef = useRef<THREE.Points>(null!);
  const coreLifeParticlesMaterialRef = useRef<THREE.ShaderMaterial>(null!);
  const coreHeartPointRef = useRef<THREE.Mesh>(null!);
  const coreBottomShadowRef = useRef<THREE.Mesh>(null!);
  const coreFrontLightRef = useRef<THREE.PointLight>(null!);
  const coreBackLightRef = useRef<THREE.PointLight>(null!);

  const captureLockRef = useRef(false);
  const breathSampleRef = useRef(1);
  const breathVelocityRef = useRef(0);
  const breathLowRef = useRef(0.84);
  const breathHighRef = useRef(1.12);

  const clearColorScratch = useMemo(() => new THREE.Color(), []);
  const tintScratch = useMemo(() => new THREE.Color(), []);
  const shellEdgeScratch = useMemo(() => new THREE.Color("#f4f9ff"), []);
  const shellDeepScratch = useMemo(() => new THREE.Color("#7d97b5"), []);
  const contrastScratch = useMemo(() => new THREE.Color(), []);
  const contrastPlateScratch = useMemo(() => new THREE.Color(), []);
  const cameraPosScratch = useMemo(() => new THREE.Vector3(), []);

  const orbShellGeometry = useMemo(
    () => new THREE.SphereGeometry(1.0, 128, 128),
    []
  );

  const orbInnerFogGeometry = useMemo(
    () => new THREE.SphereGeometry(0.956, 96, 96),
    []
  );

  const haloGeometry = useMemo(
    () => new THREE.SphereGeometry(1.0, 72, 72),
    []
  );

  const contrastPlateGeometry = useMemo(
    () => new THREE.PlaneGeometry(3.6, 3.6, 1, 1),
    []
  );

  const coreMembraneGeometry = useMemo(
    () =>
      makeNucleusCapsuleGeometry(0.288, 0.92, 12, 56, {
        depthFlatten: 0.64,
        middleBulge: 0.032,
        bottomWeight: 0.024,
        backTuck: 0.014,
        organicWarp: 0.13,
        waistPinch: 0.016,
        topLean: -0.01,
        lobeOffset: 0.022,
        asymmetry: 0.034,
        twist: 0.046,
        crownLift: 0.028,
        bellySink: 0.02,
      }),
    []
  );

  const coreInnerMassGeometry = useMemo(
    () =>
      makeNucleusCapsuleGeometry(0.154, 0.44, 10, 44, {
        depthFlatten: 0.54,
        middleBulge: 0.02,
        bottomWeight: 0.01,
        backTuck: 0.008,
        organicWarp: 0.084,
        waistPinch: 0.006,
        topLean: -0.006,
        lobeOffset: 0.012,
        asymmetry: 0.024,
        twist: 0.028,
        crownLift: 0.01,
        bellySink: 0.008,
      }),
    []
  );

  const coreHeartPointGeometry = useMemo(
    () => new THREE.SphereGeometry(0.008, 16, 16),
    []
  );

  const coreBottomShadowGeometry = useMemo(
    () => new THREE.SphereGeometry(0.34, 36, 36),
    []
  );

  const orbFlowField = useMemo(
    () => makeParticleField(116, 0.68, 0.94, 1.06, 0.14),
    []
  );
  const orbFlowPositions = useMemo(
    () => new Float32Array(orbFlowField.base),
    [orbFlowField]
  );
  const orbFlowVelocities = useMemo(
    () => new Float32Array(orbFlowField.base.length),
    [orbFlowField]
  );
  const orbFlowGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(orbFlowPositions, 3));
    g.computeBoundingSphere();
    return g;
  }, [orbFlowPositions]);

  const coreLifeField = useMemo(
    () => makeCoreParticleField(84, 0.09, 0.24),
    []
  );
  const coreLifePositions = useMemo(
    () => new Float32Array(coreLifeField.base),
    [coreLifeField]
  );
  const coreLifeVelocities = useMemo(
    () => new Float32Array(coreLifeField.base.length),
    [coreLifeField]
  );
  const coreLifeGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(coreLifePositions, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(coreLifeField.size, 1));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(coreLifeField.alpha, 1));
    g.setAttribute("aMode", new THREE.BufferAttribute(coreLifeField.mode, 1));
    g.computeBoundingSphere();
    return g;
  }, [coreLifeField.alpha, coreLifeField.mode, coreLifeField.size, coreLifePositions]);

  const coreLifeParticleUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color("#e6fbff") },
      uOpacity: { value: 0.16 },
    }),
    []
  );

  const contrastPlateUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color("#63748f") },
      uOpacity: { value: 0 },
    }),
    []
  );

  const shellUniforms = useMemo<ShellUniforms>(
    () => ({
      uSceneColor: { value: null },
      uCameraPos: { value: new THREE.Vector3() },
      uEdgeTint: { value: new THREE.Color("#f4f9ff") },
      uDeepTint: { value: new THREE.Color("#7d97b5") },
      uHotDir: { value: new THREE.Vector3(0.79, 0.53, 0.31).normalize() },
      uLowDir: { value: new THREE.Vector3(-0.84, -0.43, 0.33).normalize() },
      uRefractionNear: { value: 0.0058 },
      uRefractionFar: { value: 0.0018 },
      uAlphaBase: { value: 0.024 },
      uAlphaEdge: { value: 0.7 },
    }),
    []
  );

  const renderTargetType = gl.capabilities.isWebGL2
    ? THREE.HalfFloatType
    : THREE.UnsignedByteType;

  const shellCaptureTarget = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(16, 16, {
      type: renderTargetType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });

    target.texture.name = "pulse-shell-capture";
    target.texture.generateMipmaps = false;

    return target;
  }, [renderTargetType]);

  useEffect(() => {
    const dpr = Math.min(2, gl.getPixelRatio());
    const rtWidth = Math.max(320, Math.floor(size.width * dpr));
    const rtHeight = Math.max(320, Math.floor(size.height * dpr));

    shellCaptureTarget.setSize(rtWidth, rtHeight);
  }, [gl, size.width, size.height, shellCaptureTarget]);

  useEffect(() => {
    return () => {
      shellCaptureTarget.dispose();
    };
  }, [shellCaptureTarget]);

  useEffect(() => {
    return () => {
      orbFlowGeometry.dispose();
      coreLifeGeometry.dispose();
    };
  }, [coreLifeGeometry, orbFlowGeometry]);

  const baseColors = useMemo(
    () => ({
      orbInnerFog: new THREE.Color("#89cce5"),
      haloLarge: new THREE.Color("#d3edff"),
      haloMedium: new THREE.Color("#effcff"),
      haloCore: new THREE.Color("#ffffff"),
      coreMembrane: new THREE.Color("#ebfbff"),
      coreInnerMass: new THREE.Color("#82cfde"),
      coreHeartPoint: new THREE.Color("#fbffff"),
      coreBottomShadow: new THREE.Color("#203c57"),
      coreMembraneEmissive: new THREE.Color("#7fdff5"),
      coreInnerMassEmissive: new THREE.Color("#8fdceb"),
      coreHeartPointEmissive: new THREE.Color("#ffffff"),
      orbFlowParticles: new THREE.Color("#f3fcff"),
      coreLifeParticles: new THREE.Color("#eefcff"),
    }),
    []
  );

  useFrame((state, delta) => {
    if (
      !pulseUnitRef.current ||
      !contrastPlateRef.current ||
      !contrastPlateMaterialRef.current ||
      !orbShellRef.current ||
      !orbShellMaterialRef.current ||
      !orbInnerFogRef.current ||
      !orbFlowParticlesRef.current ||
      !backHaloLargeRef.current ||
      !backHaloMediumRef.current ||
      !backHaloCoreRef.current ||
      !coreGroupRef.current ||
      !coreMembraneRef.current ||
      !coreInnerMassRef.current ||
      !coreLifeParticlesRef.current ||
      !coreLifeParticlesMaterialRef.current ||
      !coreHeartPointRef.current ||
      !coreBottomShadowRef.current ||
      !coreFrontLightRef.current ||
      !coreBackLightRef.current
    ) {
      return;
    }

    const spin = bridge?.spinRadRef?.current ?? 0;
    const tiltX = bridge?.tiltXRadRef?.current ?? 0;
    const tiltY = bridge?.tiltYRadRef?.current ?? 0;
    const beat = THREE.MathUtils.clamp(bridge?.beatRef?.current ?? 0, 0, 1.2);
    const visualSpin = bridge?.lockVisualSpin ? 0 : spin;

    const t = state.clock.getElapsedTime();
    const dt = Math.min(0.05, Math.max(delta, 1 / 240));
    const beatNorm = THREE.MathUtils.clamp(beat / 1.2, 0, 1);

    const sourcePhase = Math.pow(clamp01((beatNorm + 0.04) / 1.04), 0.34);
    const sourceSpark = Math.pow(clamp01((beatNorm - 0.02) / 0.64), 0.33);
    const bodyPhase = Math.pow(clamp01((beatNorm - 0.1) / 0.9), 0.76);
    const pushPhase = Math.pow(clamp01((beatNorm - 0.2) / 0.8), 1.04);
    const membranePhase = Math.pow(clamp01((beatNorm - 0.34) / 0.66), 1.2);

    const pressureWave = THREE.MathUtils.clamp(
      sourceSpark * 0.35 + bodyPhase * 0.86 + pushPhase * 1.28,
      0,
      1.95
    );

    const livingWave = 0.5 + Math.sin(t * 1.84) * 0.5;
    const livingFlicker =
      0.5 +
      (Math.sin(t * 8.9 + beatNorm * 2.4) * 0.38 +
        Math.sin(t * 5.4 + 1.1) * 0.18);
    const suspendedDriftA = Math.sin(t * 0.74 + beatNorm * 1.18);
    const suspendedDriftB = Math.cos(t * 0.61 - 0.7);

    const breathScale =
      typeof bridge?.breathScaleRef?.current === "number"
        ? bridge.breathScaleRef.current
        : typeof bridge?.breatheScaleRef?.current === "number"
          ? bridge.breatheScaleRef.current
          : null;

    const breathTarget = typeof breathScale === "number" ? breathScale : 1;
    const rawBreathVelocity =
      (breathTarget - breathSampleRef.current) / Math.max(dt, 1e-3);

    breathSampleRef.current = breathTarget;
    breathVelocityRef.current = THREE.MathUtils.lerp(
      breathVelocityRef.current,
      rawBreathVelocity,
      0.16
    );

    const breathNorm = THREE.MathUtils.clamp(
      breathVelocityRef.current * 9,
      -1,
      1
    );
    const inhale = Math.max(0, breathNorm);
    const exhale = Math.max(0, -breathNorm);

    if (typeof breathScale === "number") {
      breathLowRef.current = Math.min(breathLowRef.current, breathTarget);
      breathHighRef.current = Math.max(breathHighRef.current, breathTarget);
    } else {
      breathLowRef.current = 0.84;
      breathHighRef.current = 1.12;
    }

    const breathRange = Math.max(0.12, breathHighRef.current - breathLowRef.current);
    const breathFill = clamp01(
      (breathTarget - breathLowRef.current) / breathRange
    );

    if (typeof breathScale === "number") {
      pulseUnitRef.current.scale.setScalar(BASE_PULSE_SCALE * breathScale);
    } else {
      pulseUnitRef.current.scale.setScalar(BASE_PULSE_SCALE);
    }

    pulseUnitRef.current.rotation.x = tiltX * 0.016;
    pulseUnitRef.current.rotation.z = tiltY * 0.014;

    orbShellRef.current.rotation.y = visualSpin * 0.96;
    orbShellRef.current.rotation.x = tiltX * 0.085;
    orbShellRef.current.rotation.z = tiltY * 0.072;

    orbInnerFogRef.current.rotation.y = orbShellRef.current.rotation.y;
    orbInnerFogRef.current.rotation.x = orbShellRef.current.rotation.x;
    orbInnerFogRef.current.rotation.z = orbShellRef.current.rotation.z;

    orbFlowParticlesRef.current.rotation.y =
      visualSpin * 0.82 + Math.sin(t * 0.18) * 0.04;
    orbFlowParticlesRef.current.rotation.x = tiltX * 0.06;
    orbFlowParticlesRef.current.rotation.z = tiltY * 0.05;
    orbFlowParticlesRef.current.position.set(
      0,
      -0.006 + (livingWave - 0.5) * 0.0042,
      -0.034 - bodyPhase * 0.008 - exhale * 0.002 + breathFill * 0.01
    );

    coreGroupRef.current.position.set(
      tiltY * 0.0072 + (livingWave - 0.5) * 0.0022,
      -tiltX * 0.006 + (0.5 - livingWave) * 0.0013,
      0.022 + pushPhase * 0.0044
    );
    coreGroupRef.current.rotation.x =
      tiltX * 0.18 + (sourcePhase - membranePhase) * 0.01;
    coreGroupRef.current.rotation.z =
      tiltY * 0.15 - (sourcePhase - membranePhase) * 0.008;
    coreGroupRef.current.rotation.y =
      tiltY * 0.045 + Math.sin(t * 0.78) * 0.008;
    coreGroupRef.current.scale.setScalar(
      1.29 + membranePhase * 0.04 + pushPhase * 0.02
    );

    coreMembraneRef.current.scale.set(
      1.018 - bodyPhase * 0.006 + membranePhase * 0.104 + pushPhase * 0.022,
      1.028 - bodyPhase * 0.012 + membranePhase * 0.132 + pushPhase * 0.03,
      1.008 - bodyPhase * 0.004 + membranePhase * 0.094 + pushPhase * 0.024
    );

    coreInnerMassRef.current.scale.set(
      0.38 - bodyPhase * 0.004 + pushPhase * 0.008 + sourceSpark * 0.006,
      0.46 - bodyPhase * 0.006 + pushPhase * 0.01 + sourceSpark * 0.008,
      0.34 - bodyPhase * 0.004 + pushPhase * 0.008 + sourceSpark * 0.006
    );
    coreInnerMassRef.current.rotation.x =
      0.016 + suspendedDriftA * 0.01 + tiltX * 0.006 + bodyPhase * 0.004;
    coreInnerMassRef.current.rotation.y =
      visualSpin * 0.018 + suspendedDriftB * 0.012 + pushPhase * 0.004;
    coreInnerMassRef.current.rotation.z =
      -0.01 + Math.cos(t * 0.58 + 0.4) * 0.008 - tiltY * 0.006;

    coreLifeParticlesRef.current.rotation.y =
      -visualSpin * 0.05 + Math.sin(t * 0.22) * 0.03;
    coreLifeParticlesRef.current.rotation.x = 0.08 + tiltX * 0.04;
    coreLifeParticlesRef.current.rotation.z = -0.02 - tiltY * 0.036;
    coreLifeParticlesRef.current.position.set(
      0,
      -0.001 + (livingWave - 0.5) * 0.0008,
      0.013 + membranePhase * 0.0026
    );
    coreLifeParticlesRef.current.scale.set(
      0.9 + membranePhase * 0.05 + inhale * 0.026,
      1.0 + membranePhase * 0.07 + exhale * 0.04,
      0.58 + membranePhase * 0.05 + inhale * 0.026
    );

    coreHeartPointRef.current.scale.set(
      0.012 + sourceSpark * 0.001 + pushPhase * 0.00035,
      0.0135 + sourceSpark * 0.0011 + pushPhase * 0.00038,
      0.011 + sourceSpark * 0.0009 + pushPhase * 0.0003
    );

    coreHeartPointRef.current.position.set(
      0.00001 + suspendedDriftA * 0.00003,
      -0.0048 + suspendedDriftB * 0.00003,
      -0.0116 + sourceSpark * 0.00002 + pushPhase * 0.00001
    );

    const buriedSourceX = coreHeartPointRef.current.position.x;
    const buriedSourceY = coreHeartPointRef.current.position.y;
    const buriedSourceZ = coreHeartPointRef.current.position.z;

    coreInnerMassRef.current.position.set(
      suspendedDriftA * 0.00022,
      -0.0134 + suspendedDriftB * 0.0002,
      -0.0072 + pushPhase * 0.00008
    );

    coreMembraneRef.current.position.set(
      (0.5 - livingWave) * 0.0011,
      (livingWave - 0.5) * 0.0012,
      0.018 + membranePhase * 0.0022
    );

    orbInnerFogRef.current.position.set(
      0,
      -0.008 + (livingWave - 0.5) * 0.004,
      -0.04 - bodyPhase * 0.006 - pushPhase * 0.003
    );
    orbInnerFogRef.current.scale.set(
      0.982 + bodyPhase * 0.022 + pushPhase * 0.01,
      1.01 + bodyPhase * 0.018 + pushPhase * 0.008,
      0.944 + bodyPhase * 0.028 + pushPhase * 0.014
    );

    backHaloLargeRef.current.scale.set(
      0.68 + membranePhase * 0.024 + pushPhase * 0.01,
      0.86 + membranePhase * 0.03 + pushPhase * 0.012,
      0.11 + membranePhase * 0.008 + pushPhase * 0.004
    );
    backHaloMediumRef.current.scale.set(
      0.44 + pushPhase * 0.042 + sourceSpark * 0.012,
      0.54 + pushPhase * 0.05 + sourceSpark * 0.014,
      0.074 + pushPhase * 0.01 + sourceSpark * 0.004
    );
    backHaloCoreRef.current.scale.set(
      0.094 + pressureWave * 0.026,
      0.102 + pressureWave * 0.028,
      0.04 + pressureWave * 0.011
    );

    backHaloLargeRef.current.position.set(
      -0.014 + tiltY * 0.004,
      0.02,
      -0.286 + membranePhase * 0.01
    );
    backHaloMediumRef.current.position.set(
      -0.01 + tiltY * 0.003,
      0.02,
      -0.162 + pushPhase * 0.014
    );
    backHaloCoreRef.current.position.set(
      -0.006 + tiltY * 0.003,
      0.02,
      -0.072 + pressureWave * 0.018
    );

    const orbFlowAttr =
      orbFlowGeometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < orbFlowField.phase.length; i++) {
      const o = i * 3;
      const bx = orbFlowField.base[o];
      const by = orbFlowField.base[o + 1];
      const bz = orbFlowField.base[o + 2];
      const phase = orbFlowField.phase[i];
      const sway = orbFlowField.sway[i];
      const len = Math.max(1e-4, Math.sqrt(bx * bx + by * by + bz * bz));
      const rx = bx / len;
      const ry = by / len;
      const rz = bz / len;
      const outerBias = clamp01((len - 0.68) / 0.26);
      const tx = -rz;
      const tz = rx;
      const sinkRadius = 0.2 + outerBias * 0.06 + (1 - Math.abs(ry)) * 0.018;
      const targetRadius = THREE.MathUtils.lerp(len, sinkRadius, breathFill);
      const radialDelta = targetRadius - len;
      const pulseCarry = pushPhase * 0.014 + sourceSpark * 0.01;
      const spinCarry =
        visualSpin * (0.018 + outerBias * 0.03) * (0.44 + (1 - breathFill) * 0.56);
      const stochasticX =
        Math.sin(t * (1.2 + sway * 0.9) + phase * 1.4) * (0.0008 + outerBias * 0.0009) +
        Math.cos(t * (2.3 + sway * 0.5) - phase) * 0.0004;
      const stochasticY =
        Math.cos(t * (1.5 + sway * 0.72) - phase * 1.2) * (0.0007 + outerBias * 0.0008) +
        Math.sin(t * (2.8 + sway * 0.34) + phase * 0.6) * 0.0003;
      const stochasticZ =
        Math.sin(t * (1.34 + sway * 0.84) + phase * 1.1) * (0.0008 + outerBias * 0.0009) +
        Math.cos(t * (2.1 + sway * 0.44) - phase * 0.8) * 0.0004;
      const targetX = bx + rx * (radialDelta + pulseCarry * 0.12) + tx * spinCarry + stochasticX;
      const targetY = by + ry * (radialDelta * 0.42 + pulseCarry * 0.03) + stochasticY;
      const targetZ = bz + rz * (radialDelta + pulseCarry * 0.14) + tz * spinCarry + stochasticZ;

      let px = orbFlowPositions[o];
      let py = orbFlowPositions[o + 1];
      let pz = orbFlowPositions[o + 2];
      let vx = orbFlowVelocities[o];
      let vy = orbFlowVelocities[o + 1];
      let vz = orbFlowVelocities[o + 2];

      const pull = 0.12 + outerBias * 0.08 + inhale * 0.06 + exhale * 0.02;
      const shear = 0.003 + outerBias * 0.004 + exhale * 0.0024 + sourceSpark * 0.0012;
      const ax = (targetX - px) * pull + tx * shear + stochasticX * 1.8;
      const ay = (targetY - py) * (pull * 0.72) + stochasticY * 1.7;
      const az = (targetZ - pz) * pull + tz * shear + stochasticZ * 1.8;

      vx = vx * 0.9 + ax * dt * 60;
      vy = vy * 0.9 + ay * dt * 60;
      vz = vz * 0.9 + az * dt * 60;

      px += vx * dt * 60;
      py += vy * dt * 60;
      pz += vz * dt * 60;

      const boundX = 0.94;
      const boundY = 0.99;
      const boundZ = 0.94;
      const ellipsoid =
        (px * px) / (boundX * boundX) +
        (py * py) / (boundY * boundY) +
        (pz * pz) / (boundZ * boundZ);

      if (ellipsoid > 1) {
        const scale = 0.998 / Math.sqrt(ellipsoid);
        px *= scale;
        py *= scale;
        pz *= scale;

        let nx = px / (boundX * boundX);
        let ny = py / (boundY * boundY);
        let nz = pz / (boundZ * boundZ);
        const inv = 1 / Math.max(1e-4, Math.sqrt(nx * nx + ny * ny + nz * nz));
        nx *= inv;
        ny *= inv;
        nz *= inv;

        const dot = vx * nx + vy * ny + vz * nz;
        const restitution = 0.58 + outerBias * 0.08 + sourceSpark * 0.04;
        const slide = 0.006 + outerBias * 0.006 + sourceSpark * 0.002;
        vx = (vx - 2 * dot * nx) * restitution + tx * slide - nx * 0.0018;
        vy = (vy - 2 * dot * ny) * restitution + ny * 0.0024 * exhale - ny * 0.0014;
        vz = (vz - 2 * dot * nz) * restitution + tz * slide - nz * 0.0018;
      }

      orbFlowPositions[o] = px;
      orbFlowPositions[o + 1] = py;
      orbFlowPositions[o + 2] = pz;
      orbFlowVelocities[o] = vx;
      orbFlowVelocities[o + 1] = vy;
      orbFlowVelocities[o + 2] = vz;
    }
    orbFlowAttr.needsUpdate = true;

    const coreLifeAttr =
      coreLifeGeometry.attributes.position as THREE.BufferAttribute;
    const coreRadialShift =
      exhale * 0.009 - inhale * 0.006 + membranePhase * 0.01;
    for (let i = 0; i < coreLifeField.phase.length; i++) {
      const o = i * 3;
      const bx = coreLifeField.base[o];
      const by = coreLifeField.base[o + 1];
      const bz = coreLifeField.base[o + 2];
      const phase = coreLifeField.phase[i];
      const sway = coreLifeField.sway[i];
      const role = coreLifeField.role[i];
      const len = Math.max(1e-4, Math.sqrt(bx * bx + by * by + bz * bz));
      const rx = bx / len;
      const ry = by / len;
      const rz = bz / len;
      const resident = role === 0 ? 1 : 0;
      const drifter = role === 1 ? 1 : 0;
      const shellRider = role === 2 ? 1 : 0;
      const tx = -rz;
      const tz = rx;
      const speed = 1.1 + sway * 1.9 + shellRider * 1.0 + drifter * 0.4;

      let px = coreLifePositions[o];
      let py = coreLifePositions[o + 1];
      let pz = coreLifePositions[o + 2];
      let vx = coreLifeVelocities[o];
      let vy = coreLifeVelocities[o + 1];
      let vz = coreLifeVelocities[o + 2];

      const sourceDx = px - buriedSourceX;
      const sourceDy = py - buriedSourceY;
      const sourceDz = pz - buriedSourceZ;
      const sourceDist = Math.max(0.0001, Math.sqrt(sourceDx * sourceDx + sourceDy * sourceDy + sourceDz * sourceDz));
      const sourceDirX = sourceDx / sourceDist;
      const sourceDirY = sourceDy / sourceDist;
      const sourceDirZ = sourceDz / sourceDist;
      const sourceFalloff = Math.exp(-sourceDist * (resident ? 28 : drifter ? 18 : 12));

      const residentRadius = 0.034 + sourceSpark * 0.012;
      const drifterRadius = 0.09 + coreRadialShift * 0.3 + sourceSpark * 0.018;
      const shellRadius = 0.16 + membranePhase * 0.04 + exhale * 0.018;
      const targetRadius = resident * residentRadius + drifter * drifterRadius + shellRider * shellRadius;
      const targetX = bx * 0.22 + rx * targetRadius + tx * (drifter * 0.01 + shellRider * 0.02) * Math.sin(t * (0.9 + speed * 0.2) + phase);
      const targetY = by * 0.18 + ry * (targetRadius * 1.02) + Math.sin(t * (0.8 + speed * 0.26) - phase) * (0.002 + shellRider * 0.0036);
      const targetZ = bz * 0.2 + rz * targetRadius + tz * (drifter * 0.01 + shellRider * 0.02) * Math.cos(t * (0.96 + speed * 0.24) + phase);

      const jitterX =
        Math.sin(t * (1.34 + speed * 0.52) + phase * 1.3) * (0.0006 + drifter * 0.001 + shellRider * 0.0014) +
        Math.cos(t * (2.7 + speed * 0.28) - phase) * 0.00036;
      const jitterY =
        Math.cos(t * (1.08 + speed * 0.44) - phase * 1.4) * (0.00054 + drifter * 0.0008 + shellRider * 0.0012) +
        Math.sin(t * (2.2 + speed * 0.24) + phase * 0.8) * 0.0003;
      const jitterZ =
        Math.sin(t * (1.22 + speed * 0.48) + phase * 1.1) * (0.0006 + drifter * 0.001 + shellRider * 0.0014) +
        Math.cos(t * (2.44 + speed * 0.22) - phase * 0.7) * 0.00036;

      const sourceImpulse = sourceSpark * sourceFalloff * (0.008 + drifter * 0.009 + shellRider * 0.01);
      const membraneDrift = shellRider * (0.006 + membranePhase * 0.012 + exhale * 0.005);
      const inhalePull = inhale * (resident * 0.006 + drifter * 0.003);
      const bodyPull = 0.094 + resident * 0.09 + drifter * 0.056 + shellRider * 0.038;

      const ax =
        (targetX - px) * bodyPull +
        sourceDirX * sourceImpulse +
        tx * membraneDrift +
        jitterX * 1.66 -
        sourceDirX * inhalePull;
      const ay =
        (targetY - py) * (bodyPull * 0.74) +
        sourceDirY * sourceImpulse * 0.8 +
        jitterY * 1.54 -
        sourceDirY * inhalePull * 0.6;
      const az =
        (targetZ - pz) * bodyPull +
        sourceDirZ * sourceImpulse +
        tz * membraneDrift +
        jitterZ * 1.66 -
        sourceDirZ * inhalePull;

      vx = vx * 0.85 + ax * dt * 60;
      vy = vy * 0.85 + ay * dt * 60;
      vz = vz * 0.85 + az * dt * 60;

      px += vx * dt * 60;
      py += vy * dt * 60;
      pz += vz * dt * 60;

      const boundX = 0.26;
      const boundY = 0.34;
      const boundZ = 0.2;
      const ellipsoid =
        (px * px) / (boundX * boundX) +
        (py * py) / (boundY * boundY) +
        (pz * pz) / (boundZ * boundZ);

      if (ellipsoid > 1) {
        const scale = 0.992 / Math.sqrt(ellipsoid);
        px *= scale;
        py *= scale;
        pz *= scale;

        let nx = px / (boundX * boundX);
        let ny = py / (boundY * boundY);
        let nz = pz / (boundZ * boundZ);
        const inv = 1 / Math.max(1e-4, Math.sqrt(nx * nx + ny * ny + nz * nz));
        nx *= inv;
        ny *= inv;
        nz *= inv;

        const dot = vx * nx + vy * ny + vz * nz;
        const restitution = 0.52 + shellRider * 0.1 + drifter * 0.06;
        const driftCarry = membraneDrift * 0.42 + 0.0018;
        vx = (vx - 2 * dot * nx) * restitution + tx * driftCarry - nx * 0.0018;
        vy = (vy - 2 * dot * ny) * restitution + Math.abs(ny) * 0.012 * (0.18 + exhale * 0.8) - ny * 0.0016;
        vz = (vz - 2 * dot * nz) * restitution + tz * driftCarry - nz * 0.0018;
      }

      coreLifePositions[o] = px;
      coreLifePositions[o + 1] = py;
      coreLifePositions[o + 2] = pz;
      coreLifeVelocities[o] = vx;
      coreLifeVelocities[o + 1] = vy;
      coreLifeVelocities[o + 2] = vz;
    }
    coreLifeAttr.needsUpdate = true;

    const orbInnerFogMat =
      orbInnerFogRef.current.material as THREE.MeshBasicMaterial;
    const orbFlowParticlesMat =
      orbFlowParticlesRef.current.material as THREE.PointsMaterial;
    const haloLargeMat =
      backHaloLargeRef.current.material as THREE.MeshBasicMaterial;
    const haloMediumMat =
      backHaloMediumRef.current.material as THREE.MeshBasicMaterial;
    const haloCoreMat =
      backHaloCoreRef.current.material as THREE.MeshBasicMaterial;
    const coreMembraneMat =
      coreMembraneRef.current.material as THREE.MeshPhysicalMaterial;
    const coreInnerMassMat =
      coreInnerMassRef.current.material as THREE.MeshPhysicalMaterial;
    const coreLifeParticlesMat = coreLifeParticlesMaterialRef.current;
    const coreHeartPointMat =
      coreHeartPointRef.current.material as THREE.MeshStandardMaterial;
    const coreBottomShadowMat =
      coreBottomShadowRef.current.material as THREE.MeshBasicMaterial;

    orbInnerFogMat.color
      .copy(baseColors.orbInnerFog)
      .lerp(
        baseColors.coreHeartPoint,
        0.16 + pushPhase * 0.08 + sourceSpark * 0.1
      );
    orbFlowParticlesMat.color
      .copy(baseColors.orbFlowParticles)
      .lerp(
        baseColors.coreHeartPoint,
        0.16 + inhale * 0.12 + sourceSpark * 0.04
      );
    haloLargeMat.color.copy(baseColors.haloLarge);
    haloMediumMat.color.copy(baseColors.haloMedium);
    haloCoreMat.color.copy(baseColors.haloCore);

    coreMembraneMat.color
      .copy(baseColors.coreMembrane)
      .lerp(baseColors.coreInnerMass, 0.032 + bodyPhase * 0.03);
    coreInnerMassMat.color
      .copy(baseColors.coreInnerMass)
      .lerp(
        baseColors.coreMembrane,
        0.99 + pushPhase * 0.01 + sourceSpark * 0.008
      );
    coreLifeParticlesMat.uniforms.uColor.value
      .copy(baseColors.coreLifeParticles)
      .lerp(
        baseColors.coreHeartPoint,
        0.04 + sourceSpark * 0.04 + pushPhase * 0.02
      );
    coreHeartPointMat.color
      .copy(baseColors.coreHeartPoint)
      .lerp(baseColors.coreMembrane, 0.58);
    coreBottomShadowMat.color.copy(baseColors.coreBottomShadow);

    coreMembraneMat.emissive
      .copy(baseColors.coreMembraneEmissive)
      .lerp(baseColors.coreInnerMassEmissive, 0.08 + pushPhase * 0.04)
      .lerp(
        baseColors.coreHeartPointEmissive,
        0.02 + membranePhase * 0.03 + sourceSpark * 0.008
      );
    coreInnerMassMat.emissive
      .copy(baseColors.coreInnerMassEmissive)
      .lerp(baseColors.coreHeartPointEmissive, 0.08 + sourceSpark * 0.08)
      .lerp(baseColors.coreMembraneEmissive, 0.04 + pushPhase * 0.018);
    coreHeartPointMat.emissive
      .copy(baseColors.coreHeartPointEmissive)
      .lerp(baseColors.coreInnerMassEmissive, 0.58);

    orbInnerFogMat.opacity = THREE.MathUtils.clamp(
      0.056 + bodyPhase * 0.02 + pushPhase * 0.016 + sourceSpark * 0.01 + membranePhase * 0.008,
      0.055,
      0.13
    );
    orbFlowParticlesMat.opacity = THREE.MathUtils.clamp(
      0.058 + (1 - breathFill) * 0.034 + inhale * 0.024 + exhale * 0.02 + pushPhase * 0.032 + sourceSpark * 0.018,
      0.055,
      0.22
    );

    haloLargeMat.opacity = 0.04 + membranePhase * 0.036 + pushPhase * 0.024;
    haloMediumMat.opacity = 0.07 + pushPhase * 0.082 + sourceSpark * 0.04;
    haloCoreMat.opacity = 0.11 + pressureWave * 0.16 + sourceSpark * 0.06;

    coreMembraneMat.roughness = 0.06 + bodyPhase * 0.016 - membranePhase * 0.01;
    coreMembraneMat.transmission =
      1 + membranePhase * 0.02 + pushPhase * 0.02;
    coreMembraneMat.thickness =
      1.44 + membranePhase * 0.24 + pushPhase * 0.16 + sourceSpark * 0.08;
    coreMembraneMat.opacity = THREE.MathUtils.clamp(
      0.56 + membranePhase * 0.05 + pushPhase * 0.03 - bodyPhase * 0.008,
      0.54,
      0.68
    );
    coreMembraneMat.clearcoatRoughness = 0.04 - membranePhase * 0.005;

    coreInnerMassMat.roughness = 0.22 + bodyPhase * 0.028;
    coreInnerMassMat.transmission = 0.68 + sourceSpark * 0.1;
    coreInnerMassMat.thickness = 1 + bodyPhase * 0.12 + pushPhase * 0.12;
    coreInnerMassMat.opacity = THREE.MathUtils.clamp(
      0.008 + pushPhase * 0.008 + sourceSpark * 0.008 + membranePhase * 0.005,
      0.008,
      0.03
    );

    coreLifeParticlesMat.uniforms.uOpacity.value = THREE.MathUtils.clamp(
      0.24 + membranePhase * 0.12 + sourceSpark * 0.16 + exhale * 0.04,
      0.22,
      0.5
    );

    orbFlowParticlesMat.size = 0.032 + (1 - breathFill) * 0.018 + inhale * 0.007 + exhale * 0.009;

    coreHeartPointMat.roughness = 0.78 - sourceSpark * 0.06;
    coreHeartPointMat.opacity = THREE.MathUtils.clamp(
      0.00004 + sourceSpark * 0.00022 + pushPhase * 0.00008,
      0.00003,
      0.0005
    );

    coreMembraneMat.emissiveIntensity =
      0.07 +
      membranePhase * 0.16 +
      pushPhase * 0.09 +
      sourceSpark * 0.08 +
      livingWave * 0.02;
    coreInnerMassMat.emissiveIntensity =
      0.62 + bodyPhase * 0.22 + pushPhase * 0.36 + sourceSpark * 0.82;
    coreHeartPointMat.emissiveIntensity =
      0.004 +
      sourceSpark * 0.016 +
      pushPhase * 0.003 +
      THREE.MathUtils.clamp(livingFlicker, 0, 1) * 0.002;
    coreBottomShadowMat.opacity =
      0.026 - bodyPhase * 0.004 + membranePhase * 0.008 + livingWave * 0.003;

    const roomTone =
      bridge?.roomToneRef?.current ??
      bridge?.sceneToneRef?.current ??
      bridge?.toneRef?.current ??
      null;

    shellEdgeScratch.set("#fcffff");
    shellDeepScratch.set("#7bc3db");

    let lightThemeLift = 0;

    if (roomTone) {
      try {
        tintScratch.set(roomTone);
        const roomLuma =
          tintScratch.r * 0.2126 +
          tintScratch.g * 0.7152 +
          tintScratch.b * 0.0722;
        lightThemeLift = THREE.MathUtils.clamp((roomLuma - 0.63) / 0.16, 0, 1);

        orbInnerFogMat.color.lerp(tintScratch, 0.003 + lightThemeLift * 0.0014);
        orbFlowParticlesMat.color.lerp(tintScratch, 0.01);
        haloLargeMat.color.lerp(tintScratch, 0.0028);
        haloMediumMat.color.lerp(tintScratch, 0.0044);
        haloCoreMat.color.lerp(tintScratch, 0.007);

        coreMembraneMat.color.lerp(tintScratch, 0.0036);
        coreInnerMassMat.color.lerp(tintScratch, 0.0052);
        coreLifeParticlesMat.uniforms.uColor.value.lerp(tintScratch, 0.0076);

        shellEdgeScratch.lerp(tintScratch, 0.012);
        shellDeepScratch.lerp(tintScratch, 0.08);
      } catch {
        // Ignore invalid tone values.
      }
    }

    if (lightThemeLift > 0) {
      contrastScratch.set("#3f87a8");
      shellDeepScratch.lerp(contrastScratch, 0.54 * lightThemeLift);
      contrastScratch.set("#eefcff");
      shellEdgeScratch.lerp(contrastScratch, 0.14 * lightThemeLift);
      orbInnerFogMat.color.lerp(shellDeepScratch, 0.22 * lightThemeLift);
      haloLargeMat.opacity += lightThemeLift * 0.02;
      coreBottomShadowMat.opacity += lightThemeLift * 0.02;
    }

    contrastPlateRef.current.position.set(0, -0.03, -1.52);
    contrastPlateRef.current.scale.set(
      1.2 + lightThemeLift * 0.08,
      1.2 + lightThemeLift * 0.08,
      1
    );
    contrastPlateScratch
      .set("#314157")
      .lerp(shellDeepScratch, 0.72)
      .lerp(shellEdgeScratch, 0.04);
    contrastPlateMaterialRef.current.uniforms.uColor.value.copy(contrastPlateScratch);
    contrastPlateMaterialRef.current.uniforms.uOpacity.value = lightThemeLift * 0.58;

    shellEdgeScratch.lerp(
      baseColors.coreHeartPointEmissive,
      0.042 + sourceSpark * 0.05 + membranePhase * 0.015
    );
    shellDeepScratch.lerp(
      baseColors.coreInnerMassEmissive,
      0.075 + pushPhase * 0.09 + membranePhase * 0.02
    );

    coreFrontLightRef.current.position.set(
      tiltY * 0.01 + 0.018,
      -tiltX * 0.008 + 0.008,
      0.024
    );
    coreBackLightRef.current.position.set(
      -tiltY * 0.01 + buriedSourceX * 0.6,
      tiltX * 0.008 + buriedSourceY * 0.4,
      buriedSourceZ - 0.052 + pushPhase * 0.016
    );

    coreFrontLightRef.current.intensity =
      0.0012 +
      sourceSpark * 0.004 +
      pushPhase * 0.0012 +
      THREE.MathUtils.clamp(livingFlicker, 0, 1) * 0.001;
    coreBackLightRef.current.intensity =
      2.72 +
      pressureWave * 2.1 +
      membranePhase * 0.56 +
      livingWave * 0.18 +
      sourceSpark * 0.74;

    coreFrontLightRef.current.distance = 0.11 + sourceSpark * 0.01;
    coreBackLightRef.current.distance =
      2.44 + pressureWave * 0.72 + membranePhase * 0.22;

    coreFrontLightRef.current.color
      .copy(shellEdgeScratch)
      .lerp(baseColors.coreHeartPointEmissive, 0.74);
    coreBackLightRef.current.color
      .copy(shellDeepScratch)
      .lerp(baseColors.coreInnerMassEmissive, 0.88)
      .lerp(baseColors.coreHeartPointEmissive, 0.08 + pushPhase * 0.08);

    camera.getWorldPosition(cameraPosScratch);

    shellUniforms.uCameraPos.value.copy(cameraPosScratch);
    shellUniforms.uEdgeTint.value.copy(shellEdgeScratch);
    shellUniforms.uDeepTint.value.copy(shellDeepScratch);
    shellUniforms.uRefractionNear.value =
      0.0126 + pushPhase * 0.0034 + membranePhase * 0.0018 + lightThemeLift * 0.0009;
    shellUniforms.uRefractionFar.value =
      0.0046 + pushPhase * 0.0015 + membranePhase * 0.0007;
    shellUniforms.uAlphaBase.value =
      0.03 + bodyPhase * 0.014 + pushPhase * 0.012 + lightThemeLift * 0.026;
    shellUniforms.uAlphaEdge.value =
      1.78 + membranePhase * 0.56 + sourceSpark * 0.28 + lightThemeLift * 0.2;

    if (!captureLockRef.current) {
      captureLockRef.current = true;

      const shell = orbShellRef.current;
      const haloLarge = backHaloLargeRef.current;
      const haloMedium = backHaloMediumRef.current;
      const haloCore = backHaloCoreRef.current;

      const shellWasVisible = shell.visible;
      const haloLargeWasVisible = haloLarge.visible;
      const haloMediumWasVisible = haloMedium.visible;
      const haloCoreWasVisible = haloCore.visible;

      const previousTarget = gl.getRenderTarget();
      const previousAutoClear = gl.autoClear;
      const previousXrEnabled = gl.xr.enabled;

      gl.getClearColor(clearColorScratch);
      const previousClearAlpha = gl.getClearAlpha();

      try {
        shell.visible = false;
        haloLarge.visible = false;
        haloMedium.visible = false;
        haloCore.visible = false;

        gl.xr.enabled = false;
        gl.autoClear = true;
        gl.setRenderTarget(shellCaptureTarget);
        gl.setClearColor(0x000000, 0);
        gl.clear(true, true, true);
        gl.render(scene, camera);
      } finally {
        shell.visible = shellWasVisible;
        haloLarge.visible = haloLargeWasVisible;
        haloMedium.visible = haloMediumWasVisible;
        haloCore.visible = haloCoreWasVisible;

        gl.setRenderTarget(previousTarget);
        gl.setClearColor(clearColorScratch, previousClearAlpha);
        gl.autoClear = previousAutoClear;
        gl.xr.enabled = previousXrEnabled;
        captureLockRef.current = false;
      }

      shellUniforms.uSceneColor.value = shellCaptureTarget.texture;
    }
  });

  return (
    <>
      <mesh
        ref={contrastPlateRef}
        geometry={contrastPlateGeometry}
        position={[0, -0.03, -1.52]}
        renderOrder={-20}
      >
        <shaderMaterial
          ref={contrastPlateMaterialRef}
          uniforms={contrastPlateUniforms}
          vertexShader={CONTRAST_PLATE_VERTEX_SHADER}
          fragmentShader={CONTRAST_PLATE_FRAGMENT_SHADER}
          transparent
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>

      <ambientLight intensity={0.16} />
      <directionalLight
        position={[3.0, 3.2, 4.0]}
        intensity={1.08}
        color="#f6fbff"
      />
      <directionalLight
        position={[-2.6, -2.0, 2.2]}
        intensity={0.28}
        color="#dce9ff"
      />
      <pointLight position={[0, -0.15, -0.8]} intensity={0.17} color="#c9dcff" />
      <pointLight
        ref={coreFrontLightRef}
        position={[0.032, 0.014, 0.052]}
        intensity={0.08}
        distance={0.24}
        decay={2}
        color="#f2fcff"
      />
      <pointLight
        ref={coreBackLightRef}
        position={[-0.062, -0.028, -0.248]}
        intensity={2.48}
        distance={2.22}
        decay={2}
        color="#61b7dd"
      />

      <group ref={pulseUnitRef} scale={BASE_PULSE_SCALE}>
        <mesh ref={orbShellRef} geometry={orbShellGeometry}>
          <shaderMaterial
            ref={orbShellMaterialRef}
            uniforms={shellUniforms}
            vertexShader={ORB_SHELL_VERTEX_SHADER}
            fragmentShader={ORB_SHELL_FRAGMENT_SHADER}
            transparent
            depthWrite={false}
            side={THREE.FrontSide}
            toneMapped
          />
        </mesh>

        <mesh
          ref={orbInnerFogRef}
          geometry={orbInnerFogGeometry}
          position={[0, -0.008, -0.04]}
          scale={[0.99, 1.018, 0.954]}
        >
          <meshBasicMaterial
            color="#9fd6ea"
            transparent
            opacity={0.1}
            depthWrite={false}
            side={THREE.BackSide}
          />
        </mesh>

        <points
          ref={orbFlowParticlesRef}
          geometry={orbFlowGeometry}
          position={[0, -0.004, -0.01]}
          renderOrder={1}
        >
          <pointsMaterial
            color="#def4ff"
            size={0.036}
            transparent
            opacity={0.1}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            sizeAttenuation
          />
        </points>

        <mesh
          ref={backHaloLargeRef}
          geometry={haloGeometry}
          position={[-0.014, 0.01, -0.286]}
          scale={[0.62, 0.78, 0.09]}
        >
          <meshBasicMaterial
            color="#d9efff"
            transparent
            opacity={0.03}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        <mesh
          ref={backHaloMediumRef}
          geometry={haloGeometry}
          position={[-0.01, 0.01, -0.162]}
          scale={[0.36, 0.44, 0.06]}
        >
          <meshBasicMaterial
            color="#f0fdff"
            transparent
            opacity={0.05}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        <mesh
          ref={backHaloCoreRef}
          geometry={haloGeometry}
          position={[-0.006, 0.01, -0.072]}
          scale={[0.08, 0.086, 0.032]}
        >
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={0.08}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        <group ref={coreGroupRef}>
          <mesh
            ref={coreMembraneRef}
            geometry={coreMembraneGeometry}
            position={[0, 0, 0.018]}
          >
            <meshPhysicalMaterial
              color="#ebfbff"
              emissive="#9fe8ff"
              emissiveIntensity={0.12}
              transmission={0.99}
              roughness={0.05}
              thickness={1.32}
              ior={1.19}
              transparent
              opacity={0.54}
              clearcoat={1}
              clearcoatRoughness={0.02}
              depthWrite={false}
            />
          </mesh>

          <mesh
            ref={coreInnerMassRef}
            geometry={coreInnerMassGeometry}
            position={[0, -0.0138, -0.009]}
          >
            <meshPhysicalMaterial
              color="#8ad3e1"
              emissive="#d7f8ff"
              emissiveIntensity={0.22}
              transmission={0.7}
              roughness={0.22}
              thickness={1.0}
              transparent
              opacity={0.012}
              side={THREE.BackSide}
              depthWrite={false}
            />
          </mesh>

          <points
            ref={coreLifeParticlesRef}
            geometry={coreLifeGeometry}
            position={[0, -0.001, 0.014]}
            scale={[0.88, 0.98, 0.56]}
            renderOrder={7}
          >
            <shaderMaterial
              ref={coreLifeParticlesMaterialRef}
              uniforms={coreLifeParticleUniforms}
              vertexShader={CORE_PARTICLE_VERTEX_SHADER}
              fragmentShader={CORE_PARTICLE_FRAGMENT_SHADER}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </points>

          <mesh
            ref={coreHeartPointRef}
            geometry={coreHeartPointGeometry}
            position={[0.00003, -0.0049, -0.0108]}
          >
            <meshStandardMaterial
              color="#ffffff"
              emissive="#ffffff"
              emissiveIntensity={0.008}
              roughness={0.78}
              metalness={0}
              transparent
              opacity={0.0002}
              depthWrite={false}
            />
          </mesh>

          <mesh
            ref={coreBottomShadowRef}
            geometry={coreBottomShadowGeometry}
            position={[0, -0.215, -0.19]}
            scale={[1.0, 0.25, 0.29]}
          >
            <meshBasicMaterial
              color="#203c57"
              transparent
              opacity={0.02}
              depthWrite={false}
            />
          </mesh>
        </group>
      </group>
    </>
  );
}
