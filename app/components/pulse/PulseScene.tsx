"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

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

type ParticleFieldOptions = {
  minRadius: number;
  maxRadius: number;
  yStretch?: number;
  radialBias?: number;
  sizeMin: number;
  sizeMax: number;
  alphaMin: number;
  alphaMax: number;
  zFlatten?: number;
};

const BASE_PULSE_SCALE = 0.8;
const ORB_BUBBLE_TRAIL_STEPS = 3;
const ORB_BUBBLE_TRAIL_SIZE_FACTORS = [1, 0.62, 0.34] as const;
const ORB_BUBBLE_TRAIL_ALPHA_FACTORS = [1, 0.34, 0.14] as const;
const CORE_BREATH_BUBBLE_MAX = 12;
const CORE_BREATH_BUBBLE_TRAIL_STEPS = 3;
const CORE_BREATH_BUBBLE_TRAIL_SIZE_FACTORS = [1, 1.28, 0.66] as const;
const CORE_BREATH_BUBBLE_TRAIL_ALPHA_FACTORS = [1, 0.3, 0.16] as const;
const CORE_BREATH_BUBBLE_TRAIL_OFFSETS = [0, 0.08, -0.05] as const;

type CoreBreathBubbleStage = "hidden" | "inhale" | "held" | "exhale";

type CoreBreathBubbleState = {
  stage: CoreBreathBubbleStage;
  progress: number;
  duration: number;
  start: THREE.Vector3;
  control: THREE.Vector3;
  target: THREE.Vector3;
  end: THREE.Vector3;
  drift: THREE.Vector3;
  tangent: THREE.Vector3;
  orbitPhase: number;
  orbitSpeed: number;
  alpha: number;
  size: number;
};

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function clampPointToOrbInterior(
  point: THREE.Vector3,
  maxRadius = 0.86,
  yMin = -0.82,
  yMax = 0.82
) {
  point.y = THREE.MathUtils.clamp(point.y, yMin, yMax);
  const length = point.length();
  if (length > maxRadius) {
    point.multiplyScalar(maxRadius / length);
  }
  return point;
}

function makeOrganicBodyGeometry(
  radius: number,
  height: number,
  options?: {
    depthFlatten?: number;
    middleBulge?: number;
    bottomWeight?: number;
    backTuck?: number;
    organicWarp?: number;
    asymmetry?: number;
    bellySink?: number;
  }
) {
  const straightLength = Math.max(0.01, height - radius * 2);
  const geometry = new THREE.CapsuleGeometry(radius, straightLength, 14, 88);
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const point = new THREE.Vector3();

  const depthFlatten = options?.depthFlatten ?? 0.8;
  const middleBulge = options?.middleBulge ?? 0.08;
  const bottomWeight = options?.bottomWeight ?? 0.06;
  const backTuck = options?.backTuck ?? 0.04;
  const organicWarp = options?.organicWarp ?? 0.03;
  const asymmetry = options?.asymmetry ?? 0.02;
  const bellySink = options?.bellySink ?? 0.02;

  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const halfY = Math.max(1e-6, (box.max.y - box.min.y) * 0.5);
  const halfZ = Math.max(1e-6, (box.max.z - box.min.z) * 0.5);

  for (let i = 0; i < pos.count; i++) {
    point.fromBufferAttribute(pos, i);

    const ny = point.y / halfY;
    const nz = point.z / halfZ;
    const angle = Math.atan2(point.z, point.x);

    const midMask = 1 - Math.min(1, Math.abs(ny));
    const bottomMask = clamp01((-ny + 0.18) / 1.18);
    const backMask = clamp01(-nz);

    point.z *= depthFlatten;
    point.x *= 1 + middleBulge * midMask;
    point.y -= bellySink * bottomMask * 0.012;
    point.z -= backTuck * backMask * (0.3 + midMask * 0.7);
    point.x *= 1 + bottomWeight * bottomMask * 0.14;
    point.z *= 1 + bottomWeight * bottomMask * 0.06;

    const warpA = Math.sin(angle * 1.9 + ny * 2.3) * organicWarp * 0.01;
    const warpB = Math.cos(angle * 2.5 - ny * 1.4) * organicWarp * 0.007;

    point.x += warpA + asymmetry * ((ny > 0 ? 1 : -1) * 0.003);
    point.z += warpB;

    pos.setXYZ(i, point.x, point.y, point.z);
  }

  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function makeSuspendedParticleField(count: number, options: ParticleFieldOptions) {
  const base = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const alpha = new Float32Array(count);
  const phase = new Float32Array(count);
  const sway = new Float32Array(count);

  const yStretch = options.yStretch ?? 1;
  const radialBias = options.radialBias ?? 0.75;
  const zFlatten = options.zFlatten ?? 1;

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const u = Math.random() * 2 - 1;
    const sinPhi = Math.sqrt(1 - u * u);
    const radius = THREE.MathUtils.lerp(
      options.minRadius,
      options.maxRadius,
      Math.pow(Math.random(), radialBias)
    );

    const x = radius * sinPhi * Math.cos(theta);
    const y = radius * u * yStretch;
    const z = radius * sinPhi * Math.sin(theta) * zFlatten;

    const o = i * 3;
    base[o] = x;
    base[o + 1] = y;
    base[o + 2] = z;

    size[i] = THREE.MathUtils.lerp(options.sizeMin, options.sizeMax, Math.random());
    alpha[i] = THREE.MathUtils.lerp(
      options.alphaMin,
      options.alphaMax,
      Math.pow(Math.random(), 0.82)
    );
    phase[i] = Math.random() * Math.PI * 2;
    sway[i] = 0.4 + Math.random() * 0.8;
  }

  return { base, size, alpha, phase, sway };
}

function makeOrbBubbleField(count: number) {
  const base = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const alpha = new Float32Array(count);
  const phase = new Float32Array(count);
  const sway = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const u = Math.random() * 2 - 1;
    const sinPhi = Math.sqrt(1 - u * u);
    const radius = THREE.MathUtils.lerp(0.36, 0.88, Math.pow(Math.random(), 0.8));

    let x = radius * sinPhi * Math.cos(theta);
    const y = radius * u * 0.98;
    let z = radius * sinPhi * Math.sin(theta);

    // Keep the field outside the core while spreading seeds wider around the orb volume.
    if (Math.abs(x) < 0.24 && Math.abs(y) < 0.34 && z > -0.22) {
      const spread = 0.16 + Math.abs(y) * 0.14;
      x += Math.cos(theta) * spread;
      z += Math.sin(theta) * spread - 0.1;
    }

    const o = i * 3;
    base[o] = x;
    base[o + 1] = y;
    base[o + 2] = z;

    size[i] = THREE.MathUtils.lerp(0.82, 1.55, Math.random());
    alpha[i] = THREE.MathUtils.lerp(0.52, 0.92, Math.random());
    phase[i] = Math.random() * Math.PI * 2;
    sway[i] = 0.5 + Math.random() * 0.7;
  }

  return { base, size, alpha, phase, sway };
}

function makeCoreBreathBubbleField(count: number) {
  const size = new Float32Array(count);
  const alpha = new Float32Array(count);
  const phase = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    size[i] = THREE.MathUtils.lerp(0.18, 0.42, Math.random());
    alpha[i] = THREE.MathUtils.lerp(0.48, 0.84, Math.pow(Math.random(), 0.82));
    phase[i] = Math.random() * Math.PI * 2;
  }

  return { size, alpha, phase };
}

function makeLayeredCoreParticleField(count: number) {
  const base = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const alpha = new Float32Array(count);
  const phase = new Float32Array(count);
  const sway = new Float32Array(count);
  const layer = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const layerBucket = i < count * 0.22 ? 0 : i < count * 0.7 ? 1 : 2;
    const theta = Math.random() * Math.PI * 2;
    const radiusBias =
      layerBucket === 0
        ? Math.pow(Math.random(), 1.45)
        : layerBucket === 1
          ? Math.pow(Math.random(), 1.12)
          : Math.pow(Math.random(), 0.86);
    const radius = THREE.MathUtils.lerp(
      layerBucket === 0 ? 0.04 : layerBucket === 1 ? 0.08 : 0.12,
      layerBucket === 0 ? 0.24 : layerBucket === 1 ? 0.32 : 0.38,
      radiusBias
    );
    const u = THREE.MathUtils.lerp(
      layerBucket === 2 ? -0.88 : -0.72,
      layerBucket === 0 ? 0.74 : 0.82,
      Math.random()
    );
    const sinPhi = Math.sqrt(1 - u * u);

    const frontBackBias =
      layerBucket === 0
        ? THREE.MathUtils.lerp(0.04, 0.18, Math.random())
        : layerBucket === 1
          ? THREE.MathUtils.lerp(-0.06, 0.08, Math.random())
          : THREE.MathUtils.lerp(-0.3, -0.12, Math.random());

    const x = radius * sinPhi * Math.cos(theta);
    const y = radius * u * 1.12;
    const z = radius * sinPhi * Math.sin(theta) * 0.92 + frontBackBias;

    const o = i * 3;
    base[o] = x;
    base[o + 1] = y;
    base[o + 2] = z;

    size[i] = THREE.MathUtils.lerp(
      layerBucket === 0 ? 0.08 : layerBucket === 1 ? 0.1 : 0.12,
      layerBucket === 0 ? 0.22 : layerBucket === 1 ? 0.3 : 0.36,
      Math.random()
    );
    alpha[i] = THREE.MathUtils.lerp(
      layerBucket === 0 ? 0.022 : layerBucket === 1 ? 0.032 : 0.04,
      layerBucket === 0 ? 0.08 : layerBucket === 1 ? 0.132 : 0.17,
      Math.pow(Math.random(), 0.86)
    );
    phase[i] = Math.random() * Math.PI * 2;
    sway[i] = 0.42 + Math.random() * 0.88;
    layer[i] = layerBucket;
  }

  return { base, size, alpha, phase, sway, layer };
}

const ROUND_PARTICLE_VERTEX_SHADER = `
attribute float aSize;
attribute float aAlpha;
varying float vAlpha;

void main() {
  vAlpha = aAlpha;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (22.0 / max(1.0, -mvPosition.z));
  gl_Position = projectionMatrix * mvPosition;
}
`;

const ROUND_PARTICLE_FRAGMENT_SHADER = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  float core = smoothstep(0.18, 0.0, r2);
  float halo = smoothstep(1.0, 0.0, r2) * 0.12;
  float alpha = (core + halo) * vAlpha * uOpacity;

  if (alpha < 0.01) discard;

  gl_FragColor = vec4(uColor, alpha);
}
`;

const CORE_PARTICLE_VERTEX_SHADER = `
attribute float aSize;
attribute float aAlpha;
attribute float aPhase;
attribute float aLayer;
uniform float uTime;
uniform float uPulse;
uniform float uSource;
uniform float uCenter;
varying float vAlpha;
varying float vTwinkle;
varying float vPulseGlow;
varying float vDepthMask;
varying float vCoreMask;
varying float vDepthGlow;
varying float vLayer;
varying float vFrontFade;

void main() {
  vAlpha = aAlpha;
  vLayer = aLayer;
  vTwinkle =
    0.52 +
    0.48 *
      sin(
        aPhase * 3.6 +
        uTime * (0.74 + aPhase * 0.025) +
        position.x * 26.0 +
        position.y * 18.0 -
        position.z * 22.0
      );
  vPulseGlow = 1.02 + uCenter * 0.72 + uSource * 0.38 + uPulse * 0.28;
  float radius = length(position.xyz);
  vFrontFade = smoothstep(0.02, 0.2, position.z);
  float backPresence = 1.0 - smoothstep(-0.28, 0.08, position.z);
  float midPresence = 1.0 - abs(smoothstep(-0.22, 0.16, position.z) * 2.0 - 1.0);
  vDepthMask =
    aLayer < 0.5
      ? mix(0.34, 0.92, 1.0 - vFrontFade) * mix(0.78, 1.0, midPresence)
      : aLayer < 1.5
        ? mix(0.52, 1.0, midPresence)
        : mix(0.56, 0.98, backPresence);
  vCoreMask = (1.0 - smoothstep(0.08, 0.34, radius)) * 0.78 + 0.22;
  vDepthGlow = smoothstep(0.14, -0.3, position.z);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize =
    aSize *
    (40.0 / max(1.0, -mvPosition.z)) *
    (0.96 + vTwinkle * 0.48) *
    mix(0.88, 1.16, vDepthGlow) *
    mix(0.82, 1.1, aLayer * 0.5) *
    mix(0.9, 1.04, 1.0 - vFrontFade) *
    vPulseGlow;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const CORE_PARTICLE_FRAGMENT_SHADER = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
varying float vTwinkle;
varying float vPulseGlow;
varying float vDepthMask;
varying float vCoreMask;
varying float vDepthGlow;
varying float vLayer;
varying float vFrontFade;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  float core = smoothstep(0.18, 0.0, r2);
  float mist = smoothstep(0.82, 0.06, r2);
  float halo = smoothstep(1.06, 0.0, r2) * 0.2;
  float shimmer = core * (0.84 + vTwinkle * 0.72) + mist * 0.26 + halo;
  float depthBlend = mix(0.82, 1.18, vDepthGlow);
  float frontAttenuation = mix(0.62, 1.0, 1.0 - vFrontFade);
  float backlight = mix(0.92, 1.26, vDepthGlow);
  float alpha =
    shimmer *
    vAlpha *
    uOpacity *
    (0.82 + vPulseGlow * 0.36) *
    vDepthMask *
    vCoreMask *
    depthBlend *
    frontAttenuation *
    backlight *
    mix(0.92, 1.18, vLayer * 0.5);

  if (alpha < 0.004) discard;

  vec3 tint = mix(
    uColor * vec3(0.92, 0.98, 1.0),
    uColor * vec3(0.8, 0.92, 0.98),
    smoothstep(0.0, 2.0, vLayer)
  );
  vec3 color = mix(tint, vec3(1.0), core * 0.52 + vTwinkle * 0.16 + vDepthGlow * 0.18);
  gl_FragColor = vec4(color, alpha);
}
`;

const CORE_BREATH_BUBBLE_VERTEX_SHADER = `
attribute float aSize;
attribute float aAlpha;
attribute float aPhase;
uniform float uTime;
uniform float uPulse;
uniform float uSource;
uniform float uCenter;
varying float vAlpha;
varying float vGlow;
varying float vTwinkle;

void main() {
  vAlpha = aAlpha;
  vTwinkle = 0.5 + 0.5 * sin(aPhase * 4.2 + uTime * 0.72 + position.y * 14.0 - position.z * 12.0);
  vGlow = 0.84 + uPulse * 0.26 + uSource * 0.42 + uCenter * 0.34;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize =
    aSize *
    (34.0 / max(1.0, -mvPosition.z)) *
    (0.98 + vTwinkle * 0.16) *
    vGlow;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const CORE_BREATH_BUBBLE_FRAGMENT_SHADER = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
varying float vGlow;
varying float vTwinkle;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  float body = smoothstep(1.0, 0.0, r2);
  float inner = smoothstep(0.4, 0.0, r2);
  float rim = smoothstep(1.0, 0.42, r2) * (1.0 - smoothstep(0.42, 0.06, r2));
  float spec = smoothstep(0.12, 0.0, length(p - vec2(-0.3, 0.28)));
  float shadow = smoothstep(0.72, -0.2, p.y * 0.7 - p.x * 0.26);
  float shimmer = 0.84 + vTwinkle * 0.16;
  float alpha =
    (body * 0.18 + rim * 0.56 + spec * 0.24) *
    vAlpha *
    uOpacity *
    shimmer *
    vGlow;

  if (alpha < 0.006) discard;

  vec3 bubbleBase = mix(uColor * vec3(0.9, 0.97, 1.0), uColor * vec3(0.72, 0.86, 0.94), shadow * 0.32);
  vec3 color = bubbleBase;
  color = mix(color, vec3(1.0), rim * 0.22 + spec * 0.56 + inner * 0.08);
  gl_FragColor = vec4(color, alpha);
}
`;

const VOLUME_VERTEX_SHADER = `
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vLocalPos;

void main() {
  vLocalPos = position;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const VESSEL_SHELL_FRAGMENT_SHADER = `
uniform float uPulse;
uniform float uBreath;
uniform float uSource;
uniform float uCenter;
uniform float uRest;
uniform float uTime;
uniform float uMotion;
uniform vec2 uTilt;
uniform vec3 uEmitCenter;
uniform vec3 uEmitSideA;
uniform vec3 uEmitSideB;
uniform vec3 uEmitBack;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vLocalPos;

void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 v = normalize(cameraPosition - vWorldPos);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float rim = 1.0 - ndv;
  float fresnel = pow(rim, 1.85);
  vec3 reflectDir = reflect(-v, n);

  vec3 lightA = normalize(vec3(0.82, 0.56, 0.44));
  vec3 lightB = normalize(vec3(-0.72, -0.24, 0.58));
  float specA = pow(max(dot(n, normalize(lightA + v)), 0.0), 52.0);
  float specB = pow(max(dot(n, normalize(lightB + v)), 0.0), 24.0);

  float silhouette = smoothstep(0.76, 1.0, rim);
  float frontGlass = smoothstep(0.14, 0.86, ndv) * smoothstep(-0.12, 0.92, vLocalPos.z);
  float sideWall = smoothstep(0.4, 0.98, rim) * smoothstep(-0.96, 0.2, -vLocalPos.z);
  float backWall = smoothstep(-0.98, 0.08, -vLocalPos.z) * (0.12 + smoothstep(0.08, 0.74, ndv) * 0.72);
  float wallThickness = sideWall * (0.58 + uMotion * 0.18) + backWall * 0.72 + frontGlass * 0.34;
  float lowerLens = smoothstep(-0.94, -0.06, vLocalPos.y) * smoothstep(-0.86, 0.4, -vLocalPos.z);
  float breathingBand = smoothstep(-0.26, 0.78, vLocalPos.y + uBreath * 0.08) * smoothstep(0.26, 0.86, rim);
  float pulseEcho = smoothstep(-0.72, 0.32, -vLocalPos.z) * smoothstep(0.18, 0.74, rim) * uPulse;
  float skyMirror = smoothstep(0.02, 0.92, reflectDir.y) * smoothstep(0.26, 0.98, fresnel);
  float horizonMirror =
    exp(-pow(reflectDir.y * 3.8 - 0.18, 2.0)) * smoothstep(0.24, 0.98, fresnel);
  float sideWindow =
    pow(1.0 - min(1.0, abs(reflectDir.x)), 4.0) *
    smoothstep(-0.28, 0.84, reflectDir.y) *
    smoothstep(0.28, 0.96, fresnel);
  float crownSpark =
    pow(max(dot(reflectDir, normalize(vec3(0.0, 0.98, 0.2))), 0.0), 10.0) *
    smoothstep(0.22, 0.98, fresnel) *
    smoothstep(0.1, 0.96, vLocalPos.y);

  vec2 driftA = vec2(
    sin(uTime * 0.61 + vLocalPos.z * 5.0 + vLocalPos.y * 2.8),
    cos(uTime * 0.53 - vLocalPos.x * 4.6 + vLocalPos.y * 3.2)
  ) * 0.08;
  vec2 driftB = vec2(
    cos(uTime * 0.47 + vLocalPos.x * 5.8 - vLocalPos.y * 2.6),
    sin(uTime * 0.71 + vLocalPos.z * 4.2 + vLocalPos.x * 2.1)
  ) * 0.07;
  vec2 driftC = vec2(
    sin(uTime * 0.86 - vLocalPos.y * 4.8 + vLocalPos.x * 3.6),
    cos(uTime * 0.79 + vLocalPos.z * 5.2 - vLocalPos.x * 2.8)
  ) * 0.1;
  vec3 emitCenter = uEmitCenter;
  vec3 emitSideA = uEmitSideA;
  vec3 emitSideB = uEmitSideB;
  vec3 emitBack = uEmitBack;
  vec2 sourceCenter = emitCenter.xy + vec2(sin(uTime * 0.37), cos(uTime * 0.31)) * (0.003 + uCenter * 0.0015);
  vec2 sideOriginA = emitSideA.xy + driftA * 0.015;
  vec2 sideOriginB = emitSideB.xy + driftB * 0.015;
  vec2 backOrigin = emitBack.xy + driftC * 0.014;
  vec2 rayVec = vLocalPos.xy - sourceCenter;
  float rayRadius = length(rayVec);
  float rayAngle = atan(rayVec.y, rayVec.x);
  float rayMask = smoothstep(0.06, 0.92, rayRadius) * smoothstep(-0.9, 0.2, -vLocalPos.z);
  float rayFanA = pow(max(0.0, cos(rayAngle * 5.4 + rayRadius * 12.2 - uTime * 0.82 + emitCenter.z * 5.0)), 17.0);
  float rayFanB = pow(max(0.0, cos(rayAngle * 8.2 - rayRadius * 9.6 + uTime * 0.64 - vLocalPos.y * 7.2)), 15.0);
  float pulseRays = (rayFanA * 0.82 + rayFanB * 0.56) * rayMask * (uSource * 0.92 + uPulse * 0.38 + uCenter * 0.22);
  vec2 sideVecA = vLocalPos.xy - sideOriginA;
  vec2 sideVecB = vLocalPos.xy - sideOriginB;
  vec2 backVec = vLocalPos.xy - backOrigin;
  float sideRadiusA = length(sideVecA);
  float sideRadiusB = length(sideVecB);
  float backRadius = length(backVec);
  float sideAngleA = atan(sideVecA.y, sideVecA.x);
  float sideAngleB = atan(sideVecB.y, sideVecB.x);
  float backAngle = atan(backVec.y, backVec.x);
  float sourceLift = smoothstep(0.34, 0.02, length(vLocalPos - vec3(sourceCenter, emitCenter.z))) * (uSource * 0.26 + uCenter * 0.16 + uPulse * 0.08);
  float centerArcA = pow(max(0.0, cos(rayAngle * 5.4 + rayRadius * 12.2 - uTime * 0.82 + emitCenter.z * 5.0)), 17.0) * smoothstep(0.08, 0.96, rayRadius) * smoothstep(-0.92, 0.18, -vLocalPos.z) * (uSource * 0.9 + uCenter * 0.5 + uPulse * 0.24);
  float centerArcB = pow(max(0.0, cos(rayAngle * 8.2 - rayRadius * 9.6 + uTime * 0.64 - vLocalPos.y * 7.2)), 15.0) * smoothstep(0.1, 0.98, rayRadius) * smoothstep(-0.9, 0.24, -vLocalPos.z) * (uSource * 0.72 + uCenter * 0.42 + uPulse * 0.16);
  float sideArcA = pow(max(0.0, cos(sideAngleA * 4.4 - sideRadiusA * 9.0 + uTime * 0.58 + emitSideA.z * 4.0)), 16.0) * smoothstep(0.06, 0.96, sideRadiusA) * smoothstep(-0.92, 0.2, -vLocalPos.z) * (uSource * 0.88 + uCenter * 0.44 + uPulse * 0.18);
  float sideArcB = pow(max(0.0, cos(sideAngleB * 4.8 - sideRadiusB * 8.6 - uTime * 0.54 + emitSideB.z * 4.2)), 16.0) * smoothstep(0.06, 0.96, sideRadiusB) * smoothstep(-0.92, 0.2, -vLocalPos.z) * (uSource * 0.88 + uCenter * 0.44 + uPulse * 0.18);
  float backArc = pow(max(0.0, cos(backAngle * 6.0 + backRadius * 10.5 - uTime * 0.74)), 15.0) * smoothstep(0.08, 0.98, backRadius) * smoothstep(-0.98, 0.12, -vLocalPos.z) * (uSource * 0.94 + uCenter * 0.52 + uPulse * 0.2);
  float fluidTravelA = smoothstep(0.18, 0.98, rim) * pow(max(0.0, cos((rayAngle + sideAngleA + sideAngleB) * 1.6 + uTime * 0.3 - rayRadius * 6.0)), 12.0) * (uSource * 0.3 + uCenter * 0.18 + uPulse * 0.08);
  float fluidTravelB = smoothstep(0.16, 0.98, rim) * pow(max(0.0, cos((backAngle - rayAngle) * 2.2 - backRadius * 6.4 + uTime * 0.46)), 12.0) * (uSource * 0.28 + uCenter * 0.16 + uPulse * 0.06);
  float ceilingMask = smoothstep(0.2, 0.92, vLocalPos.y) * smoothstep(-0.88, 0.14, -vLocalPos.z);
  float ceilingArc = pow(max(0.0, 1.0 - length(vec2(vLocalPos.x * 0.92, (vLocalPos.y - 0.62) * 1.8))), 2.3);
  float ceilingGlow = ceilingMask * (0.24 + ceilingArc * 0.76) * (uSource * 0.18 + uPulse * 0.08 + uCenter * 0.08);
  float innerScatter = smoothstep(-0.58, 0.12, -vLocalPos.z) * smoothstep(0.1, 0.92, 1.0 - rayRadius) * (uSource * 0.18 + uPulse * 0.06 + uCenter * 0.1);
  float backRimPulse = smoothstep(0.5, 0.98, rim) * smoothstep(0.04, 0.92, vLocalPos.z + uTilt.y * 0.14) * (uSource * 0.28 + uPulse * 0.08 + uCenter * 0.12);
  float tiltSweep = smoothstep(0.46, 0.98, rim) * smoothstep(-0.18, 0.84, vLocalPos.y + uTilt.y * 0.24) * smoothstep(-0.92, 0.28, vLocalPos.x * sign(uTilt.x + 0.0001) + abs(uTilt.x) * 0.28) * (uSource * 0.12 + uPulse * 0.04 + uCenter * 0.06);
  float restSeed = smoothstep(-0.96, 0.18, -vLocalPos.z) * (uRest * (uSource * 0.44 + uCenter * 0.32 + uPulse * 0.12));
  float restHalo = smoothstep(0.18, 0.98, rim) * pow(max(0.0, cos(rayAngle * 3.2 - rayRadius * 5.2 + uTime * 0.22)), 9.0) * restSeed;
  float restArcA = pow(max(0.0, cos(sideAngleA * 3.6 - sideRadiusA * 6.2 + uTime * 0.18)), 10.0) * smoothstep(0.08, 0.98, sideRadiusA) * restSeed;
  float restArcB = pow(max(0.0, cos(sideAngleB * 3.9 - sideRadiusB * 6.0 - uTime * 0.16)), 10.0) * smoothstep(0.08, 0.98, sideRadiusB) * restSeed;
  float restBack = pow(max(0.0, cos(backAngle * 4.0 + backRadius * 6.8 - uTime * 0.2)), 10.0) * smoothstep(0.08, 0.98, backRadius) * smoothstep(-0.98, 0.18, -vLocalPos.z) * restSeed;
  float arcSparseA = 0.18 + 0.82 * pow(max(0.0, sin(uTime * 0.31 + rayRadius * 4.4 + vLocalPos.y * 3.0)), 3.0);
  float arcSparseB = 0.16 + 0.84 * pow(max(0.0, sin(uTime * 0.27 + sideRadiusA * 3.8 - vLocalPos.x * 2.6 + emitSideA.z * 1.8)), 3.0);
  float arcSparseC = 0.16 + 0.84 * pow(max(0.0, sin(uTime * 0.24 + sideRadiusB * 4.2 + vLocalPos.x * 2.4 - emitSideB.z * 1.6)), 3.0);
  float arcSparseBack = 0.14 + 0.86 * pow(max(0.0, sin(uTime * 0.22 + backRadius * 4.8 - vLocalPos.y * 2.8)), 3.0);
  centerArcA *= arcSparseA * 0.46;
  centerArcB *= arcSparseA * 0.38;
  sideArcA *= arcSparseB * 0.42;
  sideArcB *= arcSparseC * 0.42;
  backArc *= arcSparseBack * 0.46;
  fluidTravelA *= (0.22 + arcSparseB * 0.34) * 0.52;
  fluidTravelB *= (0.22 + arcSparseBack * 0.32) * 0.5;

  vec3 deep = vec3(0.02, 0.045, 0.08);
  vec3 glass = vec3(0.12, 0.21, 0.33);
  vec3 frontTint = vec3(0.72, 0.8, 0.9);
  vec3 backTint = vec3(0.08, 0.14, 0.22);
  vec3 edge = vec3(0.97, 0.99, 1.0);
  vec3 caustic = vec3(0.68, 0.86, 1.0);
  vec3 skyTint = vec3(0.86, 0.93, 1.0);
  vec3 horizonTint = vec3(1.0, 0.94, 0.9);

  vec3 color = mix(
    deep,
    glass,
    lowerLens * 0.05 + pulseEcho * 0.14 + breathingBand * 0.04 + innerScatter * 0.05 + sourceLift * 0.03 + backWall * 0.1
  );
  color += frontTint * frontGlass * 0.045;
  color += backTint * backWall * 0.14;
  color += edge * (silhouette * 0.82 + specA * 0.88 + specB * 0.22 + sideWall * 0.16 + frontGlass * 0.035);
  color += skyTint * skyMirror * 0.3;
  color += horizonTint * horizonMirror * 0.17;
  color += skyTint * sideWindow * 0.08;
  color += edge * crownSpark * 0.22;
  color += caustic * (pulseRays * 0.34 + centerArcA * 0.78 + centerArcB * 0.62 + sideArcA * 0.7 + sideArcB * 0.7 + backArc * 0.72 + fluidTravelA * 0.46 + fluidTravelB * 0.38 + ceilingGlow * 0.14 + innerScatter * 0.14 + backRimPulse * 0.28 + tiltSweep * 0.1 + restHalo * 0.18 + restArcA * 0.28 + restArcB * 0.28 + restBack * 0.24);
  color += glass * wallThickness * 0.05;

  float alpha = 0.004;
  alpha += silhouette * 0.28;
  alpha += frontGlass * 0.008;
  alpha += sideWall * 0.038;
  alpha += backWall * 0.022;
  alpha += specA * 0.12;
  alpha += specB * 0.035;
  alpha += lowerLens * 0.025;
  alpha += pulseEcho * 0.042;
  alpha += pulseRays * 0.032;
  alpha += centerArcA * 0.072;
  alpha += centerArcB * 0.058;
  alpha += sideArcA * 0.064;
  alpha += sideArcB * 0.064;
  alpha += backArc * 0.068;
  alpha += fluidTravelA * 0.04;
  alpha += fluidTravelB * 0.032;
  alpha += ceilingGlow * 0.014;
  alpha += innerScatter * 0.012;
  alpha += backRimPulse * 0.028;
  alpha += tiltSweep * 0.01;
  alpha += restHalo * 0.018;
  alpha += restArcA * 0.024;
  alpha += restArcB * 0.024;
  alpha += restBack * 0.02;
  alpha += skyMirror * 0.014;
  alpha += horizonMirror * 0.01;
  alpha += sideWindow * 0.005;
  alpha += crownSpark * 0.006;
  alpha = clamp(alpha, 0.0, 0.46);

  gl_FragColor = vec4(color, alpha);
}
`;

const BUBBLE_VERTEX_SHADER = `
attribute float aSize;
attribute float aAlpha;
attribute float aPhase;
varying float vAlpha;
varying float vPhase;

void main() {
  vAlpha = aAlpha;
  vPhase = aPhase;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (34.0 / max(1.0, -mvPosition.z));
  gl_Position = projectionMatrix * mvPosition;
}
`;

const BUBBLE_FRAGMENT_SHADER = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
varying float vPhase;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float c = cos(vPhase);
  float s = sin(vPhase);
  p = mat2(c, -s, s, c) * p;
  p.x *= 1.0 + sin(vPhase * 1.7) * 0.16;
  p.y *= 1.0 + cos(vPhase * 2.1) * 0.1;

  float r = length(p);
  float body = smoothstep(1.0, 0.74, r);
  float rim = smoothstep(0.94, 0.66, r) - smoothstep(0.66, 0.42, r);
  float darkRim = smoothstep(0.99, 0.79, r) - smoothstep(0.79, 0.56, r);
  float highlight = smoothstep(0.34, 0.0, length(p + vec2(0.2, -0.16)));
  float innerShadow = smoothstep(0.82, 0.28, r);
  float alpha = (body * 0.16 + rim * 1.02 + darkRim * 0.34 + innerShadow * 0.14 + highlight * 0.4) * vAlpha * uOpacity;

  if (alpha < 0.01) discard;

  vec3 color = mix(vec3(0.34, 0.42, 0.5), uColor * 1.04, body * 0.76 + rim * 0.38);
  color = mix(color, vec3(0.2, 0.28, 0.36), darkRim * 0.72 + innerShadow * 0.16);
  color = mix(color, vec3(1.0), highlight * 0.76 + rim * 0.22);
  gl_FragColor = vec4(color, alpha);
}
`;

const ORB_MEDIUM_FRAGMENT_SHADER = `
uniform float uPulse;
uniform float uPulseTravel;
uniform float uBreath;
uniform float uSource;
uniform float uCenter;
uniform float uTime;
uniform float uMotion;
uniform float uFlow;
uniform vec2 uTilt;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vLocalPos;

void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 v = normalize(cameraPosition - vWorldPos);
  float facing = dot(n, v);
  float ndv = abs(facing);
  float frontFace = gl_FrontFacing ? 1.0 : 0.0;
  float backFace = 1.0 - frontFace;
  float edgeFaceMask = max(frontFace, backFace * 0.84);

  vec3 warpedPos = vec3(vLocalPos.x * 0.98, vLocalPos.y * 1.01, vLocalPos.z * 0.98);
  float radial = length(warpedPos.xy);
  float sideDensity = smoothstep(0.08, 0.98, radial);
  float backDepth = smoothstep(-0.98, 0.1, -warpedPos.z);
  float frontDepth = smoothstep(-0.12, 0.94, warpedPos.z);
  float lowerBasin = smoothstep(-0.98, -0.12, warpedPos.y);
  float tiltBias = clamp(dot(normalize(vec3(uTilt.x * 0.26, -uTilt.y * 0.26, 1.0)), normalize(warpedPos + vec3(0.0001))), -1.0, 1.0) * 0.5 + 0.5;
  float motionSweep = smoothstep(0.34, 0.98, sideDensity) * smoothstep(0.26, 0.98, tiltBias) * uMotion;
  float carryBand = smoothstep(0.28, 0.96, sideDensity) * smoothstep(-0.92, 0.3, -warpedPos.z) * (uSource * 0.08 + uCenter * 0.06 + uPulse * 0.04);
  float domeAngle = atan(warpedPos.x, max(0.001, warpedPos.z + 1.1));
  float inhaleBias = max(uBreath, 0.0);
  float exhaleBias = max(-uBreath, 0.0);
  float centerProfile = 1.0 - smoothstep(0.0, 0.78, radial);
  float shoulderProfile = smoothstep(0.18, 0.72, radial) * (1.0 - smoothstep(0.72, 0.98, radial));
  float edgeProfile = smoothstep(0.56, 0.96, radial);
  vec2 surfaceVec = vec2(warpedPos.x * 0.96, (warpedPos.z + 0.04) * 2.65);
  float surfaceRadius = length(surfaceVec);
  float topSurfaceZone = smoothstep(0.54, 0.94, warpedPos.y);
  float pulseTravel = smoothstep(0.0, 1.0, uPulseTravel);
  float pulseCenterProfile = (1.0 - smoothstep(0.0, 0.16, surfaceRadius)) * topSurfaceZone;
  float slosh = warpedPos.x * uFlow * 0.009 + uTilt.x * warpedPos.x * 0.004;
  float calmWaveA = sin(domeAngle * 2.2 + uTime * 0.34 + uFlow * 1.6) * (0.0014 + abs(uFlow) * 0.0014);
  float calmWaveB = sin(domeAngle * 4.1 - uTime * 0.28 - uFlow * 1.2) * (0.0009 + abs(uFlow) * 0.001);
  float pulseRadial = smoothstep(0.03, 0.52, surfaceRadius) * (1.0 - smoothstep(0.52, 0.94, surfaceRadius));
  float pulseCoreMask = 1.0 - smoothstep(0.0, 0.16, surfaceRadius);
  float pulseField = max(pulseRadial, pulseCoreMask * 0.92);
  float pulseRingA = 0.5 + 0.5 * cos(surfaceRadius * 88.0 - uPulse * 16.0 - uTime * 0.8);
  float pulseRingB = 0.5 + 0.5 * cos(surfaceRadius * 56.0 - uPulse * 10.0 - uTime * 0.46);
  float pulseCoreKiss = pulseCoreMask * uPulse * 0.0021;
  float pulseRipple = (pulseRingA * 0.72 + pulseRingB * 0.28) * uPulse * 0.0042 * pulseField + pulseCoreKiss;
  float pulseCrest = pow(pulseRingA, 3.2) * uPulse * 0.11 * pulseField + pulseCoreMask * uPulse * 0.05;
  float pulseEdgeArrival = exp(-pow((pulseTravel - 0.94) / 0.08, 2.0));
  float pulseEdgeBand = smoothstep(0.8, 0.98, surfaceRadius) * (1.0 - smoothstep(0.99, 1.08, surfaceRadius)) * topSurfaceZone * edgeFaceMask;
  float pulseEdgeNoiseA = 0.5 + 0.5 * sin(domeAngle * 22.0 + uTime * 1.8 + surfaceRadius * 18.0);
  float pulseEdgeNoiseB = 0.5 + 0.5 * sin(domeAngle * 31.0 - uTime * 1.2 + surfaceRadius * 27.0);
  float pulseEdgeWhole = pulseEdgeBand * pulseEdgeArrival * uPulse;
  float pulseEdgeSkvulp = (pow(pulseEdgeNoiseA, 4.2) * 0.54 + pow(pulseEdgeNoiseB, 4.0) * 0.28) * pulseEdgeBand * pulseEdgeArrival * uPulse;
  float inhaleBulge = inhaleBias * (0.017 * centerProfile + 0.004 * shoulderProfile);
  float exhaleCenterDrop = exhaleBias * (0.014 * centerProfile + 0.005 * shoulderProfile);
  float exhaleEdgeLift = exhaleBias * edgeProfile * 0.0034;
  float pulseCenterDip = (1.0 - smoothstep(0.0, 0.16, pulseTravel)) * pulseCenterProfile * uPulse * 0.018;
  float meniscusCenter = 0.813 - radial * 0.009 + inhaleBulge - exhaleCenterDrop + exhaleEdgeLift + slosh + calmWaveA + calmWaveB + pulseRipple - pulseCenterDip + pulseEdgeWhole * 0.0026 + pulseEdgeSkvulp * 0.0018;
  float meniscusBand = smoothstep(meniscusCenter - 0.018, meniscusCenter + 0.042, warpedPos.y) * smoothstep(0.08, 0.92, radial) * edgeFaceMask;
  float meniscusRim = smoothstep(0.08, 0.58, meniscusBand) * smoothstep(0.12, 0.88, sideDensity);
  float waveCarry = meniscusRim * (0.18 + abs(uBreath) * 0.28 + uMotion * 0.08 + uPulse * 0.12);
  float liquidMask = 1.0 - smoothstep(meniscusCenter - 0.01, meniscusCenter + 0.028, warpedPos.y);
  float surfaceBand = 1.0 - smoothstep(0.002, 0.013, abs(warpedPos.y - meniscusCenter));
  float topSurfaceOpticsMask =
    surfaceBand *
    frontFace *
    smoothstep(0.1, 0.84, radial) *
    (1.0 - smoothstep(0.86, 1.0, surfaceRadius));
  float visibleTopFace = backFace * 0.82 + frontFace * 0.03;
  float pulseSurfaceMask =
    surfaceBand *
    visibleTopFace *
    topSurfaceZone *
    (1.0 - smoothstep(0.88, 1.04, surfaceRadius));
  float pulseSurfaceLineA = pow(pulseRingA, 5.6);
  float pulseSurfaceLineB = pow(pulseRingB, 4.8);
  float pulseEdgeTremor =
    (pulseSurfaceLineA * 0.5 + pulseSurfaceLineB * 0.26) *
    uPulse *
    pulseSurfaceMask *
    smoothstep(0.64, 0.96, surfaceRadius);
  float pulseCenterSurface = pulseCenterProfile * surfaceBand * visibleTopFace;
  float pulsePlop = pulseCenterSurface * (1.0 - smoothstep(0.0, 0.12, pulseTravel)) * uPulse * 0.92;
  float outwardHeadRadius = mix(0.05, 0.88, pulseTravel);
  float outwardHead =
    (1.0 - smoothstep(0.018, 0.06, abs(surfaceRadius - outwardHeadRadius))) *
    pulseSurfaceMask;
  float trailTravel = clamp((pulseTravel - 0.12) / 0.88, 0.0, 1.0);
  float outwardTrailRadius = mix(0.02, 0.68, trailTravel);
  float outwardTrail =
    (1.0 - smoothstep(0.024, 0.082, abs(surfaceRadius - outwardTrailRadius))) *
    pulseSurfaceMask *
    smoothstep(0.18, 1.0, pulseTravel);
  float pulseSurfaceLines =
    pulseEdgeTremor +
    pulsePlop +
    outwardHead * uPulse * 1.48 +
    outwardTrail * uPulse * 0.86;
  float topReflect = smoothstep(meniscusCenter - 0.018, meniscusCenter + 0.008, warpedPos.y) * topSurfaceOpticsMask;
  float topReflectHalo = smoothstep(meniscusCenter - 0.028, meniscusCenter + 0.016, warpedPos.y) * topSurfaceOpticsMask;
  float topReflectDrift = 0.5 + 0.5 * sin(domeAngle * 2.1 + uTime * 0.42 + uFlow * 2.2);
  float topMicroRippleA = 0.5 + 0.5 * sin(surfaceRadius * 28.0 - uTime * 0.42 + domeAngle * 3.6 + uFlow * 1.8);
  float topMicroRippleB = 0.5 + 0.5 * sin(surfaceRadius * 18.0 + uTime * 0.3 - domeAngle * 5.2 - uFlow * 1.2);
  float topReflectLight = topReflect * (0.54 + uCenter * 0.42 + uSource * 0.26 + uPulse * 0.18) * (0.84 + topReflectDrift * 0.18);
  float topReflectLift = topReflectHalo * (0.12 + uCenter * 0.14 + uSource * 0.06);
  float topRefract = topReflect * (0.42 + topMicroRippleA * 0.34 + topMicroRippleB * 0.24);
  float topRefractHalo = topReflectHalo * (0.34 + topMicroRippleA * 0.18 + topMicroRippleB * 0.16);
  vec3 reflectDir = reflect(-v, n);
  float waterFresnel = pow(1.0 - ndv, 1.7);
  float waterSkyMirror =
    smoothstep(-0.04, 0.92, reflectDir.y) *
    smoothstep(0.18, 0.98, waterFresnel) *
    topSurfaceOpticsMask;
  float waterHorizonMirror =
    exp(-pow(reflectDir.y * 4.0 - 0.16, 2.0)) *
    smoothstep(0.16, 0.98, waterFresnel) *
    topSurfaceOpticsMask;
  float depthAbsorption = clamp(backDepth * 0.72 + sideDensity * 0.18 + lowerBasin * 0.24, 0.0, 1.0);
  float suspendedDepth = smoothstep(-0.52, 0.54, warpedPos.y) * smoothstep(-0.96, 0.18, -warpedPos.z) * (1.0 - frontFace * 0.36);
  float underSurfaceBand =
    smoothstep(meniscusCenter - 0.11, meniscusCenter - 0.018, warpedPos.y) *
    (1.0 - smoothstep(meniscusCenter - 0.018, meniscusCenter + 0.01, warpedPos.y)) *
    smoothstep(0.1, 0.86, radial);
  float underSurfaceDriftA = 0.5 + 0.5 * sin(domeAngle * 4.2 + radial * 12.0 - uTime * 0.34 + uFlow * 1.8);
  float underSurfaceDriftB = 0.5 + 0.5 * sin(domeAngle * 7.6 - radial * 16.0 + uTime * 0.28 - uFlow * 1.2);
  float underSurfaceLife = underSurfaceBand * (0.34 + underSurfaceDriftA * 0.38 + underSurfaceDriftB * 0.28);
  float restingSurfaceBand =
    smoothstep(meniscusCenter - 0.082, meniscusCenter - 0.01, warpedPos.y) *
    (1.0 - smoothstep(meniscusCenter - 0.01, meniscusCenter + 0.012, warpedPos.y)) *
    smoothstep(0.12, 0.88, radial);
  float restingSurfaceDriftA = 0.5 + 0.5 * sin(domeAngle * 5.8 + radial * 10.2 - uTime * 0.24 + uFlow * 0.8);
  float restingSurfaceDriftB = 0.5 + 0.5 * sin(domeAngle * 9.4 - radial * 13.8 + uTime * 0.2 - uFlow * 0.6);
  float restingSurfaceLife =
    restingSurfaceBand *
    (0.22 + abs(uBreath) * 0.12 + restingSurfaceDriftA * 0.34 + restingSurfaceDriftB * 0.26);
  float restingSurfaceShadow =
    restingSurfaceBand *
    (0.18 + restingSurfaceDriftA * 0.22 + restingSurfaceDriftB * 0.18);
  float sideRefraction =
    smoothstep(0.62, 0.96, sideDensity) *
    smoothstep(-0.94, -0.18, warpedPos.y) *
    smoothstep(-0.96, 0.08, -warpedPos.z) *
    backFace *
    (1.0 - smoothstep(0.82, 0.98, radial)) *
    (0.5 + 0.5 * sin(domeAngle * 5.4 + radial * 14.0 - uTime * 0.32));
  float basinCausticA =
    pow(max(0.0, cos(domeAngle * 4.8 - radial * 13.4 + uTime * 0.36 + uFlow * 1.8)), 10.0) *
    lowerBasin *
    smoothstep(-0.9, 0.14, -warpedPos.z) *
    backFace *
    smoothstep(0.12, 0.8, radial) *
    (1.0 - smoothstep(0.82, 0.96, radial));
  float basinCausticB =
    pow(max(0.0, cos(domeAngle * 7.2 + radial * 10.2 - uTime * 0.28 - uFlow * 1.4)), 11.0) *
    lowerBasin *
    smoothstep(0.18, 0.84, radial) *
    (1.0 - smoothstep(0.86, 0.98, radial)) *
    backFace;

  vec3 deep = vec3(0.03, 0.08, 0.12);
  vec3 liquid = vec3(0.16, 0.28, 0.4);
  vec3 edge = vec3(0.78, 0.9, 0.97);
  vec3 carry = vec3(0.82, 0.94, 1.0);
  vec3 basinGlow = vec3(0.52, 0.72, 0.92);
  vec3 refract = vec3(0.9, 0.96, 1.0);
  vec3 depthTint = vec3(0.08, 0.16, 0.22);
  vec3 clarity = vec3(0.74, 0.86, 0.96);

  vec3 color = mix(deep, liquid, 0.08 + backFace * 0.48 + sideDensity * 0.12 + lowerBasin * 0.08);
  color = mix(color, depthTint, depthAbsorption * 0.34);
  color += clarity * frontFace * 0.045;
  color *= liquidMask;
  color += edge * meniscusRim * 0.24;
  color += vec3(0.92, 0.98, 1.0) * pulseEdgeWhole * 0.24;
  color += vec3(0.92, 0.98, 1.0) * pulseEdgeSkvulp * 0.28;
  color += carry * waveCarry * 0.28;
  color += vec3(0.94, 0.99, 1.0) * pulseSurfaceLines * 0.42;
  color += vec3(0.97, 1.0, 1.0) * pulsePlop * 0.22;
  color += vec3(0.92, 0.98, 1.0) * pulseCrest * 0.3;
  color += vec3(0.18, 0.28, 0.38) * suspendedDepth * 0.06 * liquidMask;
  color += vec3(0.1, 0.18, 0.26) * underSurfaceLife * 0.28 * liquidMask;
  color += vec3(0.68, 0.82, 0.94) * underSurfaceLife * 0.12 * liquidMask;
  color -= vec3(0.028, 0.05, 0.082) * restingSurfaceShadow * 0.24 * liquidMask;
  color += vec3(0.08, 0.16, 0.24) * restingSurfaceLife * 0.26 * liquidMask;
  color += vec3(0.58, 0.76, 0.9) * restingSurfaceLife * 0.12 * liquidMask;
  color += basinGlow * (basinCausticA * 0.26 + basinCausticB * 0.18 + lowerBasin * 0.035) * liquidMask;
  color += edge * sideRefraction * 0.056 * liquidMask;
  color += refract * topReflectLift * 0.7 * topSurfaceOpticsMask;
  color += refract * topRefractHalo * 0.42 * topSurfaceOpticsMask;
  color += vec3(0.98, 1.0, 1.0) * topReflectLight * 1.02 * topSurfaceOpticsMask;
  color += vec3(0.92, 0.98, 1.0) * topRefract * 0.32 * topSurfaceOpticsMask;
  color += vec3(0.88, 0.95, 1.0) * waterSkyMirror * 0.42;
  color += vec3(1.0, 0.96, 0.9) * waterHorizonMirror * 0.2;
  color += edge * (sideDensity * 0.06 + lowerBasin * 0.03 + waterFresnel * 0.08) * liquidMask;
  color += carry * (motionSweep * 0.06 + carryBand * 0.11) * liquidMask;

  float alpha = 0.006;
  alpha += (frontFace * (0.01 + frontDepth * 0.005));
  alpha += (backFace * (0.056 + backDepth * 0.032));
  alpha += sideDensity * 0.034;
  alpha += lowerBasin * 0.016;
  alpha += motionSweep * 0.01;
  alpha += carryBand * 0.014;
  alpha *= liquidMask;
  alpha += meniscusRim * 0.05;
  alpha += pulseEdgeWhole * 0.02;
  alpha += pulseEdgeSkvulp * 0.012;
  alpha += pulseSurfaceLines * 0.018;
  alpha += pulsePlop * 0.012;
  alpha += pulseCrest * 0.006;
  alpha += depthAbsorption * 0.022;
  alpha += suspendedDepth * 0.008;
  alpha += underSurfaceLife * 0.026;
  alpha += restingSurfaceLife * 0.024;
  alpha += basinCausticA * 0.014;
  alpha += basinCausticB * 0.009;
  alpha += sideRefraction * 0.01;
  alpha += topReflectLift * 0.016 * topSurfaceOpticsMask;
  alpha += topRefractHalo * 0.012 * topSurfaceOpticsMask;
  alpha += topReflectLight * 0.046 * topSurfaceOpticsMask;
  alpha += topRefract * 0.02 * topSurfaceOpticsMask;
  alpha += waterSkyMirror * 0.016;
  alpha += waterHorizonMirror * 0.012;
  alpha = clamp(alpha, 0.0, 0.22);

  gl_FragColor = vec4(color, alpha);
}
`;

const MENISCUS_TOP_RIPPLE_FRAGMENT_SHADER = `
uniform float uPulse;
uniform float uPulseTravel;
uniform float uImpact;
uniform float uPlopProgress;
uniform float uPlopImpact;
uniform float uBeatRippleProgress;
uniform float uBeatRippleImpact;
uniform float uCarryProgress;
uniform float uCarryImpact;
uniform float uEdgeMemoryProgress;
uniform float uEdgeMemory;
uniform float uSettleProgress;
uniform float uSettleImpact;
uniform float uBreath;
uniform float uFlow;
uniform float uTime;
uniform vec2 uTilt;
uniform vec2 uSourceUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vLocalPos;
varying vec2 vRippleUv;

void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 v = normalize(cameraPosition - vWorldPos);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float rim = 1.0 - ndv;
  float fresnel = pow(rim, 1.85);
  vec3 reflectDir = reflect(-v, n);
  float baseRadius = length(vRippleUv);
  vec2 sourceDelta = vRippleUv - uSourceUv;
  float topRadius = length(sourceDelta);
  float rippleAngle = atan(vRippleUv.y - uSourceUv.y, vRippleUv.x - uSourceUv.x);
  float topMask = 1.0 - smoothstep(0.962, 1.115, baseRadius);
  if (topMask < 0.002) discard;

  float beat = clamp(uImpact, 0.0, 1.0);
  float travel = clamp(uPulseTravel, 0.0, 1.0);
  float plopBeat = clamp(uPlopImpact, 0.0, 1.0);
  float plopTravel = clamp(uPlopProgress, 0.0, 1.0);
  float beatRippleTravel = clamp(uBeatRippleProgress, 0.0, 1.0);
  float beatRipple = clamp(uBeatRippleImpact, 0.0, 1.0);
  float carryTravel = clamp(uCarryProgress, 0.0, 1.0);
  float carryBeat = clamp(uCarryImpact, 0.0, 1.0);
  float edgeMemoryTravel = clamp(uEdgeMemoryProgress, 0.0, 1.0);
  float edgeMemory = clamp(uEdgeMemory, 0.0, 1.0);
  float settleTravel = clamp(uSettleProgress, 0.0, 1.0);
  float settleImpact = clamp(uSettleImpact, 0.0, 1.0);
  float edgeBand = smoothstep(0.9, 1.0, baseRadius) * (1.0 - smoothstep(1.03, 1.11, baseRadius));
  float centerMask = (1.0 - smoothstep(0.0, 0.2, topRadius)) * topMask;
  float centerTight = (1.0 - smoothstep(0.0, 0.065, topRadius)) * topMask;
  float centerLipRadius = mix(0.02, 0.062, smoothstep(0.06, 0.28, plopTravel));
  float centerLip = (1.0 - smoothstep(0.006, 0.026, abs(topRadius - centerLipRadius))) * centerMask;
  float centerOuterLipRadius = centerLipRadius * 1.6;
  float centerOuterLip = (1.0 - smoothstep(0.012, 0.036, abs(topRadius - centerOuterLipRadius))) * centerMask;
  float edgeArrival = exp(-pow((mix(0.06, 1.12, travel) - 1.02) / 0.14, 2.0));

  float edgeSeedA = 0.5 + 0.5 * cos(baseRadius * 42.0 - uTime * 0.4 + uFlow * 0.02);
  float edgeSeedB = 0.5 + 0.5 * cos(baseRadius * 64.0 + uTime * 0.34 - uFlow * 0.02);
  float edgePreludeBand = smoothstep(0.75, 0.985, baseRadius) * (1.0 - smoothstep(1.01, 1.1, baseRadius)) * topMask;
  float edgePrelude = (1.0 - smoothstep(0.02, 0.2, plopTravel)) * plopBeat * edgePreludeBand;
  float edgeTouch = pow(edgeArrival, 1.18);
  float edgeWake = smoothstep(0.58, 1.0, travel) * exp(-pow((mix(0.06, 1.12, travel) - 1.02) / 0.18, 2.0)) * beat * topMask;
  float edgeHit = smoothstep(0.84, 1.0, travel) * exp(-pow((mix(0.06, 1.12, travel) - 1.01) / 0.11, 2.0)) * beat * topMask;
  float edgeWakeLong = smoothstep(0.78, 1.0, travel) * exp(-pow((mix(0.06, 1.12, travel) - 1.015) / 0.2, 2.0)) * beat * topMask;
  float edgeReturnEnvelope = edgeMemory * exp(-pow((edgeMemoryTravel - 0.42) / 0.5, 2.0));
  float settleEnvelope = settleImpact * exp(-pow((settleTravel - 0.5) / 0.64, 2.0));
  float settlePulseA = 0.5 + 0.5 * sin(rippleAngle * 7.0 + uTime * 0.82 + settleTravel * 9.0);
  float settlePulseB = 0.5 + 0.5 * sin(rippleAngle * 12.0 - uTime * 0.54 + settleTravel * 13.0);
  float edgeReturnPulseA = 0.5 + 0.5 * sin(rippleAngle * 10.0 + uTime * 1.15 + edgeMemoryTravel * 10.0);
  float edgeReturnPulseB = 0.5 + 0.5 * sin(rippleAngle * 17.0 - uTime * 0.72 + edgeMemoryTravel * 16.0);
  float edgeReturn =
    edgeBand *
    topMask *
    edgeReturnEnvelope *
    (0.48 + edgeReturnPulseA * 0.38 + edgeReturnPulseB * 0.28);
  float edgeWholeRing =
    edgeBand *
    topMask *
    (edgeTouch * 0.18 + edgeWake * 0.2 + edgeHit * 0.42 + edgeWakeLong * 0.72 + edgeReturn * 1.08);
  float edgeSettleBand =
    edgeBand *
    topMask *
    (edgeWakeLong * 0.42 + edgeReturnEnvelope * 0.96 + settleEnvelope * 1.18);
  float returnRingRadius = mix(1.01, 0.72, edgeMemoryTravel);
  float returnRingCrest = exp(-pow((topRadius - returnRingRadius) / 0.08, 2.0)) * edgeReturnEnvelope * topMask;
  float returnRingTrough = exp(-pow((topRadius - (returnRingRadius + 0.056)) / 0.12, 2.0)) * edgeReturnEnvelope * topMask;
  float settleRingRadius = mix(1.03, 0.62, settleTravel);
  float settleRingCrest =
    exp(-pow((topRadius - settleRingRadius) / 0.1, 2.0)) *
    settleEnvelope *
    topMask *
    (0.72 + settlePulseA * 0.18 + settlePulseB * 0.1);
  float settleRingTrough =
    exp(-pow((topRadius - (settleRingRadius + 0.074)) / 0.15, 2.0)) *
    settleEnvelope *
    topMask;
  float settlePerimeter =
    smoothstep(0.9, 1.02, baseRadius) *
    (1.0 - smoothstep(1.04, 1.11, baseRadius)) *
    topMask *
    settleEnvelope *
    (0.54 + settlePulseA * 0.22 + settlePulseB * 0.16);
  float edgeMemoryTremor =
    (pow(edgeSeedA, 4.0) * 0.32 + pow(edgeSeedB, 4.0) * 0.14) *
    edgeBand *
    topMask *
    edgeReturn *
    0.94;
  float edgeTremor =
    (pow(edgeSeedA, 4.0) * 0.28 + pow(edgeSeedB, 4.0) * 0.11) *
    edgeBand *
    beat *
    topMask *
    (edgeTouch * 0.58 + edgeWake * 0.38 + edgeHit * 0.56 + edgeWakeLong * 0.68 + edgeReturn * 0.64);
  edgeTremor += edgeMemoryTremor;
  edgeTremor += settlePerimeter * 0.32;
  float edgeMemorySlosh =
    (0.5 + 0.5 * sin(rippleAngle * 10.0 + uTime * 0.9 + baseRadius * 24.0)) *
    edgeBand *
    topMask *
    edgeReturn *
    1.12;
  float edgeSlosh =
    (0.5 + 0.5 * sin(rippleAngle * 10.0 + uTime * 0.9 + baseRadius * 24.0)) *
    edgeBand *
    (edgeTouch * 0.16 + edgeWake * 0.48 + edgeHit * 0.92 + edgeWakeLong * 1.32 + edgeReturn * 1.56) *
    beat *
    topMask;
  edgeSlosh += edgeMemorySlosh;
  edgeSlosh += settlePerimeter * 0.58;
  float edgeWholeRingGlow = edgeWholeRing * (0.74 + 0.26 * sin(uTime * 0.62 + baseRadius * 20.0));
  float edgeWholeRingShade = edgeSettleBand * (0.62 + 0.38 * cos(uTime * 0.58 + baseRadius * 17.0));
  float edgePerimeterBand =
    smoothstep(0.88, 1.01, baseRadius) *
    (1.0 - smoothstep(1.03, 1.12, baseRadius)) *
    topMask;
  float edgePerimeterGlow =
    edgePerimeterBand *
    (edgeWholeRing * 0.46 + edgeReturn * 0.32 + settlePerimeter * 0.58);
  float surfaceBandMask =
    smoothstep(0.36, 0.68, baseRadius) *
    (1.0 - smoothstep(0.84, 0.99, baseRadius)) *
    topMask;
  float surfaceBandWholeGlow =
    surfaceBandMask *
    (edgeWholeRing * 0.34 + edgeReturn * 0.22 + settlePerimeter * 0.42);

  float dipPhase = 1.0 - smoothstep(0.0, 0.16, plopTravel);
  float reboundPhase = smoothstep(0.05, 0.18, plopTravel) * (1.0 - smoothstep(0.22, 0.42, plopTravel));
  float centerDip = centerMask * dipPhase * plopBeat;
  float centerPlop = (centerTight * reboundPhase * 0.66 + centerLip * reboundPhase * 1.05 + centerOuterLip * reboundPhase * 0.34) * plopBeat;

  float ringRadius = mix(0.04, 1.12, travel);
  float ringCrest = exp(-pow((topRadius - ringRadius) / 0.052, 2.0));
  float ringTrough = exp(-pow((topRadius - (ringRadius + 0.038)) / 0.078, 2.0));
  float trailRadius = max(0.02, ringRadius - 0.18);
  float trailCrest = exp(-pow((topRadius - trailRadius) / 0.062, 2.0));
  float trailTrough = exp(-pow((topRadius - (trailRadius + 0.05)) / 0.092, 2.0));
  float secondRadius = max(0.02, ringRadius - 0.3);
  float secondCrest = exp(-pow((topRadius - secondRadius) / 0.072, 2.0));
  float secondTrough = exp(-pow((topRadius - (secondRadius + 0.054)) / 0.104, 2.0));
  float thirdRadius = max(0.02, ringRadius - 0.44);
  float thirdCrest = exp(-pow((topRadius - thirdRadius) / 0.084, 2.0));
  float thirdTrough = exp(-pow((topRadius - (thirdRadius + 0.062)) / 0.116, 2.0));
  float beatRippleRadius = mix(0.05, 1.04, beatRippleTravel);
  float beatRippleCrest = exp(-pow((topRadius - beatRippleRadius) / 0.058, 2.0));
  float beatRippleTrough = exp(-pow((topRadius - (beatRippleRadius + 0.04)) / 0.086, 2.0));
  float beatRippleTrailRadius = max(0.02, beatRippleRadius - 0.18);
  float beatRippleTrailCrest = exp(-pow((topRadius - beatRippleTrailRadius) / 0.072, 2.0));
  float beatRippleTrailTrough = exp(-pow((topRadius - (beatRippleTrailRadius + 0.05)) / 0.104, 2.0));
  float beatRippleSecondRadius = max(0.02, beatRippleRadius - 0.32);
  float beatRippleSecondCrest = exp(-pow((topRadius - beatRippleSecondRadius) / 0.084, 2.0));
  float beatRippleSecondTrough = exp(-pow((topRadius - (beatRippleSecondRadius + 0.058)) / 0.118, 2.0));
  float carryRadius = mix(0.08, 1.08, carryTravel);
  float carryCrest = exp(-pow((topRadius - carryRadius) / 0.074, 2.0));
  float carryTrough = exp(-pow((topRadius - (carryRadius + 0.052)) / 0.11, 2.0));
  float carryReturnPhase = smoothstep(0.7, 1.0, carryTravel);
  float carryReturnRadius = mix(1.02, 0.7, carryReturnPhase);
  float carryReturnCrest = exp(-pow((topRadius - carryReturnRadius) / 0.09, 2.0));
  float carryReturnTrough = exp(-pow((topRadius - (carryReturnRadius + 0.06)) / 0.13, 2.0));
  float outwardRing = ringCrest * smoothstep(0.05, 1.0, travel) * beat * topMask;
  float outwardRingShadow = ringTrough * smoothstep(0.05, 1.0, travel) * beat * topMask;
  float outwardTrail = trailCrest * smoothstep(0.12, 1.0, travel) * beat * topMask;
  float outwardTrailShadow = trailTrough * smoothstep(0.12, 1.0, travel) * beat * topMask;
  float outwardSecond = secondCrest * smoothstep(0.18, 0.92, travel) * beat * topMask * 0.74;
  float outwardSecondShadow = secondTrough * smoothstep(0.18, 0.92, travel) * beat * topMask * 0.74;
  float outwardThird = thirdCrest * smoothstep(0.26, 0.82, travel) * beat * topMask * 0.34;
  float outwardThirdShadow = thirdTrough * smoothstep(0.26, 0.82, travel) * beat * topMask * 0.34;
  float outwardBeatRipple = beatRippleCrest * smoothstep(0.04, 1.0, beatRippleTravel) * beatRipple * topMask;
  float outwardBeatRippleShadow = beatRippleTrough * smoothstep(0.04, 1.0, beatRippleTravel) * beatRipple * topMask;
  float outwardBeatRippleTrail = beatRippleTrailCrest * smoothstep(0.12, 1.0, beatRippleTravel) * beatRipple * topMask * 0.72;
  float outwardBeatRippleTrailShadow = beatRippleTrailTrough * smoothstep(0.12, 1.0, beatRippleTravel) * beatRipple * topMask * 0.72;
  float outwardBeatRippleSecond = beatRippleSecondCrest * smoothstep(0.22, 0.9, beatRippleTravel) * beatRipple * topMask * 0.44;
  float outwardBeatRippleSecondShadow = beatRippleSecondTrough * smoothstep(0.22, 0.9, beatRippleTravel) * beatRipple * topMask * 0.44;
  float carryRing = carryCrest * carryBeat * topMask * 0.82;
  float carryRingShadow = carryTrough * carryBeat * topMask * 0.62;
  float carryReturnRing = carryReturnCrest * carryBeat * carryReturnPhase * topMask * 0.78;
  float carryReturnShadow = carryReturnTrough * carryBeat * carryReturnPhase * topMask * 0.52;
  float bubbleSeedA = 0.5 + 0.5 * sin(rippleAngle * 18.0 + uTime * 1.8 + topRadius * 22.0);
  float bubbleSeedB = 0.5 + 0.5 * sin(rippleAngle * 31.0 - uTime * 1.2 + topRadius * 36.0);
  float edgeMicroBubbles = (pow(bubbleSeedA, 8.0) * 0.08 + pow(bubbleSeedB, 10.0) * 0.04) * edgeBand * (edgeTouch * 0.08 + edgeWake * 0.05 + edgeHit * 0.04) * topMask;
  float waterBody = topMask * (0.15 + (1.0 - ndv) * 0.22);
  float shallowDepth = smoothstep(0.04, 0.88, topRadius) * topMask;
  float rippleSheen = pow(max(dot(reflect(-v, n), normalize(vec3(0.0, 0.96, 0.28))), 0.0), 12.0) * (
    outwardRing * 0.42 +
    outwardTrail * 0.26 +
    outwardBeatRipple * 0.22 +
    outwardBeatRippleTrail * 0.16 +
    carryRing * 0.18 +
    edgeSlosh * 0.12 +
    centerPlop * 0.1
  );
  float microSurfaceA = 0.5 + 0.5 * sin(rippleAngle * 9.0 + topRadius * 26.0 - uTime * 0.52);
  float microSurfaceB = 0.5 + 0.5 * sin(rippleAngle * 14.0 - topRadius * 34.0 + uTime * 0.38);
  float microShimmer = topMask * (microSurfaceA * 0.1 + microSurfaceB * 0.08) * (0.1 + edgeSlosh * 0.22 + outwardTrail * 0.16);
  float restingSurfaceSheen =
    topMask *
    smoothstep(0.16, 0.9, topRadius) *
    (0.5 + 0.5 * sin(rippleAngle * 5.2 + topRadius * 12.0 - uTime * 0.18 + uBreath * 1.6)) *
    (0.16 + microSurfaceA * 0.08 + microSurfaceB * 0.06);
  float restingMicroFlow =
    topMask *
    smoothstep(0.18, 0.9, topRadius) *
    (0.5 + 0.5 * sin(rippleAngle * 4.8 + topRadius * 14.0 - uTime * 0.22)) *
    (0.12 + 0.08 * abs(uBreath) + microSurfaceA * 0.08 + microSurfaceB * 0.06);
  float subSurfaceFlow =
    topMask *
    smoothstep(0.12, 0.88, topRadius) *
    (0.5 + 0.5 * sin(rippleAngle * 6.4 + topRadius * 18.0 - uTime * 0.34 + travel * 7.0)) *
    (0.12 + edgeSlosh * 0.26 + outwardTrail * 0.18 + carryRing * 0.12);
  float waterSpec = pow(1.0 - rim, 2.2) * (
    outwardRing * 1.34 +
    outwardTrail * 0.86 +
    outwardSecond * 0.74 +
    outwardThird * 0.52 +
    outwardBeatRipple * 0.62 +
    outwardBeatRippleTrail * 0.42 +
    outwardBeatRippleSecond * 0.28 +
    centerPlop * 1.02 +
    centerLip * reboundPhase * plopBeat * 0.86 +
    edgeSlosh * 0.18
  );
  float surfaceFresnel = pow(rim, 1.6);
  float surfaceSkyMirror =
    smoothstep(-0.04, 0.94, reflectDir.y) *
    smoothstep(0.2, 0.98, surfaceFresnel) *
    topMask;
  float surfaceHorizonMirror =
    exp(-pow(reflectDir.y * 4.2 - 0.14, 2.0)) *
    smoothstep(0.18, 0.98, surfaceFresnel) *
    topMask;

  vec3 color = vec3(0.0);
  color += vec3(0.06, 0.12, 0.2) * waterBody * 0.48;
  color += vec3(0.42, 0.6, 0.72) * shallowDepth * 0.14;
  color -= vec3(0.025, 0.04, 0.06) * restingSurfaceSheen * 0.16;
  color += vec3(0.62, 0.76, 0.88) * restingSurfaceSheen * 0.12;
  color += vec3(0.12, 0.2, 0.28) * restingMicroFlow * 0.28;
  color += vec3(0.58, 0.74, 0.86) * restingMicroFlow * 0.08;
  color += vec3(0.14, 0.22, 0.3) * subSurfaceFlow * 0.42;
  color += vec3(0.64, 0.78, 0.88) * subSurfaceFlow * 0.12;
  color += vec3(0.03, 0.05, 0.095) * edgePrelude * 0.68;
  color += vec3(0.94, 0.99, 1.0) * edgePrelude * 0.14;
  color += vec3(0.82, 0.93, 1.0) * edgeReturn * 0.22;
  color += vec3(0.9, 0.97, 1.0) * returnRingCrest * 0.96;
  color += vec3(0.02, 0.045, 0.09) * returnRingTrough * 0.56;
  color += vec3(0.94, 0.99, 1.0) * edgeTremor * (0.18 + edgeTouch * 0.16 + edgeWake * 0.08 + edgeHit * 0.11 + edgeWakeLong * 0.11);
  color += vec3(0.94, 0.99, 1.0) * edgeSlosh * (0.036 + edgeTouch * 0.03 + edgeWake * 0.1 + edgeHit * 0.18 + edgeWakeLong * 0.36);
  color += vec3(0.9, 0.97, 1.0) * edgeWholeRingGlow * 0.28;
  color += vec3(0.02, 0.04, 0.078) * edgeWholeRingShade * 0.11;
  color += vec3(0.9, 0.97, 1.0) * edgePerimeterGlow * 0.24;
  color += vec3(0.02, 0.04, 0.078) * edgePerimeterGlow * 0.08;
  color += vec3(0.88, 0.96, 1.0) * surfaceBandWholeGlow * 0.24;
  color += vec3(0.02, 0.04, 0.078) * surfaceBandWholeGlow * 0.08;
  color += vec3(0.86, 0.95, 1.0) * settleRingCrest * 0.82;
  color += vec3(0.02, 0.04, 0.078) * settleRingTrough * 0.38;
  color += vec3(0.9, 0.97, 1.0) * settlePerimeter * 0.2;
  color += vec3(0.028, 0.064, 0.13) * centerDip * 3.4;
  color += vec3(1.0, 1.0, 1.0) * centerPlop * 3.28;
  color += vec3(0.94, 0.99, 1.0) * centerLip * reboundPhase * plopBeat * 1.92;
  color += vec3(0.92, 0.98, 1.0) * centerOuterLip * reboundPhase * plopBeat * 0.72;
  color += vec3(1.0, 1.0, 1.0) * outwardRing * 4.88;
  color += vec3(0.02, 0.045, 0.095) * outwardRingShadow * 1.86;
  color += vec3(0.92, 0.98, 1.0) * outwardTrail * 2.72;
  color += vec3(0.03, 0.055, 0.095) * outwardTrailShadow * 1.08;
  color += vec3(0.88, 0.96, 1.0) * outwardSecond * 1.82;
  color += vec3(0.025, 0.05, 0.09) * outwardSecondShadow * 0.76;
  color += vec3(0.84, 0.94, 1.0) * outwardThird * 1.14;
  color += vec3(0.022, 0.042, 0.082) * outwardThirdShadow * 0.5;
  color += vec3(0.9, 0.97, 1.0) * outwardBeatRipple * 2.1;
  color += vec3(0.024, 0.046, 0.086) * outwardBeatRippleShadow * 0.94;
  color += vec3(0.86, 0.95, 1.0) * outwardBeatRippleTrail * 1.52;
  color += vec3(0.022, 0.044, 0.082) * outwardBeatRippleTrailShadow * 0.58;
  color += vec3(0.82, 0.93, 1.0) * outwardBeatRippleSecond * 0.9;
  color += vec3(0.02, 0.04, 0.078) * outwardBeatRippleSecondShadow * 0.34;
  color += vec3(0.92, 0.98, 1.0) * carryRing * 1.04;
  color += vec3(0.024, 0.046, 0.084) * carryRingShadow * 0.52;
  color += vec3(0.86, 0.95, 1.0) * carryReturnRing * 0.9;
  color += vec3(0.02, 0.04, 0.078) * carryReturnShadow * 0.5;
  color += vec3(0.99, 1.0, 1.0) * edgeMicroBubbles * 0.18;
  color += vec3(0.92, 0.98, 1.0) * rippleSheen * 1.68;
  color += vec3(0.86, 0.94, 0.98) * microShimmer * 1.42;
  color += vec3(0.88, 0.95, 1.0) * surfaceSkyMirror * 0.46;
  color += vec3(1.0, 0.97, 0.92) * surfaceHorizonMirror * 0.24;
  color += vec3(1.0, 1.0, 1.0) * waterSpec * 3.1;

  float alpha = 0.0;
  alpha += edgePrelude * 0.034;
  alpha += edgeReturn * 0.01;
  alpha += returnRingCrest * 0.064;
  alpha += returnRingTrough * 0.022;
  alpha += edgeTremor * (0.012 + edgeTouch * 0.011 + edgeWake * 0.006 + edgeHit * 0.009 + edgeWakeLong * 0.01);
  alpha += edgeSlosh * (0.004 + edgeTouch * 0.003 + edgeWake * 0.008 + edgeHit * 0.012 + edgeWakeLong * 0.02);
  alpha += edgeWholeRingGlow * 0.02;
  alpha += edgeWholeRingShade * 0.005;
  alpha += edgePerimeterGlow * 0.022;
  alpha += surfaceBandWholeGlow * 0.02;
  alpha += settleRingCrest * 0.078;
  alpha += settleRingTrough * 0.022;
  alpha += settlePerimeter * 0.026;
  alpha += centerDip * 0.62;
  alpha += centerPlop * 0.82;
  alpha += centerLip * reboundPhase * plopBeat * 0.48;
  alpha += centerOuterLip * reboundPhase * plopBeat * 0.16;
  alpha += outwardRing * 0.8;
  alpha += outwardRingShadow * 0.22;
  alpha += outwardTrail * 0.54;
  alpha += outwardTrailShadow * 0.15;
  alpha += outwardSecond * 0.36;
  alpha += outwardSecondShadow * 0.11;
  alpha += outwardThird * 0.18;
  alpha += outwardThirdShadow * 0.06;
  alpha += outwardBeatRipple * 0.44;
  alpha += outwardBeatRippleShadow * 0.16;
  alpha += outwardBeatRippleTrail * 0.28;
  alpha += outwardBeatRippleTrailShadow * 0.09;
  alpha += outwardBeatRippleSecond * 0.16;
  alpha += outwardBeatRippleSecondShadow * 0.06;
  alpha += carryRing * 0.22;
  alpha += carryRingShadow * 0.07;
  alpha += carryReturnRing * 0.17;
  alpha += carryReturnShadow * 0.05;
  alpha += edgeMicroBubbles * 0.01;
  alpha += waterBody * 0.04;
  alpha += restingSurfaceSheen * 0.024;
  alpha += restingMicroFlow * 0.02;
  alpha += subSurfaceFlow * 0.022;
  alpha += rippleSheen * 0.048;
  alpha += microShimmer * 0.03;
  alpha += surfaceSkyMirror * 0.024;
  alpha += surfaceHorizonMirror * 0.012;
  alpha += waterSpec * 0.3;
  alpha *= clamp(0.48 + (1.0 - ndv) * 0.52, 0.0, 1.0);
  alpha = clamp(alpha, 0.0, 0.9);

  if (alpha < 0.004) discard;

  gl_FragColor = vec4(color, alpha);
}
`;

const MENISCUS_TOP_RIPPLE_VERTEX_SHADER = `
uniform float uPulse;
uniform float uPulseTravel;
uniform float uImpact;
uniform float uPlopProgress;
uniform float uPlopImpact;
uniform float uBeatRippleProgress;
uniform float uBeatRippleImpact;
uniform float uCarryProgress;
uniform float uCarryImpact;
uniform float uEdgeMemoryProgress;
uniform float uEdgeMemory;
uniform float uSettleProgress;
uniform float uSettleImpact;
uniform float uBreath;
uniform float uFlow;
uniform float uTime;
uniform vec2 uTilt;
uniform vec2 uSourceUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vLocalPos;
varying vec2 vRippleUv;

vec3 sampleSurface(vec2 plate, float beat, float travel, float plopBeat, float plopTravel) {
  float surfaceX = plate.x * 0.98;
  float surfaceZ = plate.y * 0.56;
  vec2 rippleUv = vec2(surfaceX / 0.61, surfaceZ / 0.3);
  float baseRadius = length(rippleUv);
  vec2 sourceDelta = rippleUv - uSourceUv;
  float topRadius = length(sourceDelta);
  float inhaleBias = max(uBreath, 0.0);
  float exhaleBias = max(-uBreath, 0.0);
  float centerProfile = 1.0 - smoothstep(0.0, 0.78, baseRadius);
  float shoulderProfile = smoothstep(0.18, 0.72, baseRadius) * (1.0 - smoothstep(0.72, 0.98, baseRadius));
  float edgeProfile = smoothstep(0.56, 0.96, baseRadius);
  float domeAngle = atan(surfaceX, max(0.001, surfaceZ + 1.1));
  float slosh = surfaceX * uFlow * 0.009 + uTilt.x * surfaceX * 0.004;
  float calmWaveA = sin(domeAngle * 2.2 + uTime * 0.34 + uFlow * 1.6) * (0.0014 + abs(uFlow) * 0.0014);
  float calmWaveB = sin(domeAngle * 4.1 - uTime * 0.28 - uFlow * 1.2) * (0.0009 + abs(uFlow) * 0.001);
  float inhaleBulge = inhaleBias * (0.017 * centerProfile + 0.004 * shoulderProfile);
  float exhaleCenterDrop = exhaleBias * (0.014 * centerProfile + 0.005 * shoulderProfile);
  float exhaleEdgeLift = exhaleBias * edgeProfile * 0.0034;
  float meniscusCenter = 0.813 - baseRadius * 0.009 + inhaleBulge - exhaleCenterDrop + exhaleEdgeLift + slosh + calmWaveA + calmWaveB;

  float topPlateMask = 1.0 - smoothstep(0.962, 1.115, baseRadius);
  float centerMask = (1.0 - smoothstep(0.0, 0.2, topRadius)) * topPlateMask;
  float centerTight = (1.0 - smoothstep(0.0, 0.06, topRadius)) * topPlateMask;
  float centerLipRadius = mix(0.02, 0.062, smoothstep(0.06, 0.28, plopTravel));
  float centerLip = (1.0 - smoothstep(0.006, 0.026, abs(topRadius - centerLipRadius))) * centerMask;
  float centerOuterLipRadius = centerLipRadius * 1.6;
  float centerOuterLip = (1.0 - smoothstep(0.012, 0.036, abs(topRadius - centerOuterLipRadius))) * centerMask;

  float dipPhase = 1.0 - smoothstep(0.0, 0.16, plopTravel);
  float reboundPhase = smoothstep(0.05, 0.18, plopTravel) * (1.0 - smoothstep(0.22, 0.42, plopTravel));
  float restingSurfaceWaveA =
    sin(atan(sourceDelta.y, sourceDelta.x) * 3.8 + topRadius * 8.2 - uTime * 0.18 + uBreath * 2.4) *
    smoothstep(0.16, 0.88, topRadius) *
    topPlateMask;
  float restingSurfaceWaveB =
    sin(atan(sourceDelta.y, sourceDelta.x) * 6.1 - topRadius * 11.6 + uTime * 0.14 - uBreath * 1.8) *
    smoothstep(0.22, 0.92, topRadius) *
    topPlateMask;
  float restingSurfaceLift =
    (restingSurfaceWaveA * 0.00095 + restingSurfaceWaveB * 0.00062) *
    (0.72 + abs(uBreath) * 0.34);
  float ringRadius = mix(0.04, 1.13, travel);
  float ringCrest = exp(-pow((topRadius - ringRadius) / 0.052, 2.0));
  float ringTrough = exp(-pow((topRadius - (ringRadius + 0.038)) / 0.078, 2.0));
  float trailRadius = max(0.02, ringRadius - 0.18);
  float trailCrest = exp(-pow((topRadius - trailRadius) / 0.062, 2.0));
  float trailTrough = exp(-pow((topRadius - (trailRadius + 0.05)) / 0.092, 2.0));
  float secondRadius = max(0.02, ringRadius - 0.3);
  float secondCrest = exp(-pow((topRadius - secondRadius) / 0.072, 2.0));
  float secondTrough = exp(-pow((topRadius - (secondRadius + 0.054)) / 0.104, 2.0));
  float thirdRadius = max(0.02, ringRadius - 0.44);
  float thirdCrest = exp(-pow((topRadius - thirdRadius) / 0.084, 2.0));
  float thirdTrough = exp(-pow((topRadius - (thirdRadius + 0.062)) / 0.116, 2.0));
  float beatRippleTravel = clamp(uBeatRippleProgress, 0.0, 1.0);
  float beatRipple = clamp(uBeatRippleImpact, 0.0, 1.0);
  float beatRippleRadius = mix(0.05, 1.0, beatRippleTravel);
  float beatRippleCrest = exp(-pow((topRadius - beatRippleRadius) / 0.056, 2.0));
  float beatRippleTrough = exp(-pow((topRadius - (beatRippleRadius + 0.038)) / 0.082, 2.0));
  float beatRippleTrailRadius = max(0.02, beatRippleRadius - 0.18);
  float beatRippleTrailCrest = exp(-pow((topRadius - beatRippleTrailRadius) / 0.07, 2.0));
  float beatRippleTrailTrough = exp(-pow((topRadius - (beatRippleTrailRadius + 0.048)) / 0.102, 2.0));
  float beatRippleSecondRadius = max(0.02, beatRippleRadius - 0.32);
  float beatRippleSecondCrest = exp(-pow((topRadius - beatRippleSecondRadius) / 0.082, 2.0));
  float beatRippleSecondTrough = exp(-pow((topRadius - (beatRippleSecondRadius + 0.056)) / 0.116, 2.0));

  float centerCoreDip = centerTight * dipPhase * plopBeat * 0.028;
  float centerDip = centerMask * dipPhase * plopBeat * 0.11;
  float centerRebound = centerMask * reboundPhase * plopBeat * 0.058;
  float vortexCoreRise = centerTight * reboundPhase * plopBeat * 0.026;
  float vortexLipRise = centerLip * reboundPhase * plopBeat * 0.036;
  float vortexOuterLift = centerOuterLip * reboundPhase * plopBeat * 0.014;
  float plopSpike = vortexCoreRise + vortexLipRise + vortexOuterLift;
  float ringLift = (ringCrest * 0.075 - ringTrough * 0.028) * smoothstep(0.06, 1.0, travel) * beat * topPlateMask;
  float trailLift = (trailCrest * 0.036 - trailTrough * 0.0135) * smoothstep(0.12, 1.0, travel) * beat * topPlateMask;
  float secondLift = (secondCrest * 0.02 - secondTrough * 0.0075) * smoothstep(0.18, 0.92, travel) * beat * topPlateMask;
  float thirdLift = (thirdCrest * 0.0075 - thirdTrough * 0.0032) * smoothstep(0.26, 0.82, travel) * beat * topPlateMask;
  float beatRippleLift =
    (beatRippleCrest * 0.018 - beatRippleTrough * 0.0072) *
    smoothstep(0.04, 1.0, beatRippleTravel) *
    beatRipple *
    topPlateMask;
  float beatRippleTrailLift =
    (beatRippleTrailCrest * 0.009 - beatRippleTrailTrough * 0.0038) *
    smoothstep(0.12, 1.0, beatRippleTravel) *
    beatRipple *
    topPlateMask;
  float beatRippleSecondLift =
    (beatRippleSecondCrest * 0.0042 - beatRippleSecondTrough * 0.0021) *
    smoothstep(0.22, 0.9, beatRippleTravel) *
    beatRipple *
    topPlateMask;
  float edgeSeed = 0.5 + 0.5 * cos(baseRadius * 54.0 - uTime * 0.44 + uFlow * 0.03);
  float edgePreludeBand = smoothstep(0.75, 0.985, baseRadius) * (1.0 - smoothstep(1.01, 1.1, baseRadius)) * topPlateMask;
  float edgePrelude = (1.0 - smoothstep(0.02, 0.2, plopTravel)) * plopBeat * edgePreludeBand;
  float edgeArrival = exp(-pow((ringRadius - 1.02) / 0.14, 2.0));
  float edgeTouch = pow(edgeArrival, 1.18);
  float edgeWake = smoothstep(0.58, 1.0, travel) * exp(-pow((ringRadius - 1.02) / 0.18, 2.0)) * beat * topPlateMask;
  float edgeHit = smoothstep(0.84, 1.0, travel) * exp(-pow((ringRadius - 1.01) / 0.11, 2.0)) * beat * topPlateMask;
  float edgeWakeLong = smoothstep(0.78, 1.0, travel) * exp(-pow((ringRadius - 1.015) / 0.2, 2.0)) * beat * topPlateMask;
  float carryTravel = clamp(uCarryProgress, 0.0, 1.0);
  float carryBeat = clamp(uCarryImpact, 0.0, 1.0);
  float edgeMemoryTravel = clamp(uEdgeMemoryProgress, 0.0, 1.0);
  float edgeMemory = clamp(uEdgeMemory, 0.0, 1.0);
  float settleTravel = clamp(uSettleProgress, 0.0, 1.0);
  float settleImpact = clamp(uSettleImpact, 0.0, 1.0);
  float edgeReturnEnvelope = edgeMemory * exp(-pow((edgeMemoryTravel - 0.42) / 0.5, 2.0));
  float settleEnvelope = settleImpact * exp(-pow((settleTravel - 0.5) / 0.64, 2.0));
  float settlePulseA = 0.5 + 0.5 * sin(atan(sourceDelta.y, sourceDelta.x) * 7.0 + uTime * 0.82 + settleTravel * 9.0);
  float settlePulseB = 0.5 + 0.5 * sin(atan(sourceDelta.y, sourceDelta.x) * 12.0 - uTime * 0.54 + settleTravel * 13.0);
  float surfaceBandMask =
    smoothstep(0.36, 0.68, baseRadius) *
    (1.0 - smoothstep(0.85, 0.995, baseRadius)) *
    topPlateMask;
  float edgeReturn = smoothstep(0.9, 1.02, baseRadius) * topPlateMask * edgeReturnEnvelope;
  float edgeWholeRing =
    smoothstep(0.88, 1.01, baseRadius) *
    topPlateMask *
    (edgeTouch * 0.16 + edgeWake * 0.18 + edgeHit * 0.34 + edgeWakeLong * 0.56 + edgeReturn * 1.02);
  float returnRingRadius = mix(1.01, 0.72, edgeMemoryTravel);
  float returnRingCrest = exp(-pow((topRadius - returnRingRadius) / 0.08, 2.0)) * edgeReturnEnvelope * topPlateMask;
  float returnRingTrough = exp(-pow((topRadius - (returnRingRadius + 0.056)) / 0.12, 2.0)) * edgeReturnEnvelope * topPlateMask;
  float carryRadius = mix(0.08, 1.08, carryTravel);
  float carryCrest = exp(-pow((topRadius - carryRadius) / 0.074, 2.0)) * carryBeat * topPlateMask;
  float carryTrough = exp(-pow((topRadius - (carryRadius + 0.052)) / 0.11, 2.0)) * carryBeat * topPlateMask;
  float carryReturnPhase = smoothstep(0.7, 1.0, carryTravel);
  float carryReturnRadius = mix(1.02, 0.7, carryReturnPhase);
  float carryReturnCrest = exp(-pow((topRadius - carryReturnRadius) / 0.09, 2.0)) * carryBeat * carryReturnPhase * topPlateMask;
  float carryReturnTrough = exp(-pow((topRadius - (carryReturnRadius + 0.06)) / 0.13, 2.0)) * carryBeat * carryReturnPhase * topPlateMask;
  float settleRingRadius = mix(1.03, 0.62, settleTravel);
  float settleRingCrest =
    exp(-pow((topRadius - settleRingRadius) / 0.1, 2.0)) *
    settleEnvelope *
    topPlateMask *
    (0.72 + settlePulseA * 0.18 + settlePulseB * 0.1);
  float settleRingTrough =
    exp(-pow((topRadius - (settleRingRadius + 0.074)) / 0.15, 2.0)) *
    settleEnvelope *
    topPlateMask;
  float settlePerimeter =
    smoothstep(0.9, 1.02, baseRadius) *
    (1.0 - smoothstep(1.04, 1.11, baseRadius)) *
    topPlateMask *
    settleEnvelope *
    (0.54 + settlePulseA * 0.22 + settlePulseB * 0.16);
  float edgeTremor = pow(edgeSeed, 4.0) * smoothstep(0.88, 1.0, baseRadius) * topPlateMask * (edgeTouch * 0.002 + edgeWake * 0.002 + edgeHit * 0.0028 + edgeWakeLong * 0.0052 + edgeReturn * 0.0048);
  float edgeSlosh = (0.5 + 0.5 * sin(atan(sourceDelta.y, sourceDelta.x) * 10.0 + uTime * 0.9 + baseRadius * 24.0)) * smoothstep(0.9, 1.02, baseRadius) * topPlateMask * (edgeTouch * 0.0009 + edgeWake * 0.0018 + edgeHit * 0.0028 + edgeWakeLong * 0.0066 + edgeReturn * 0.0094);
  edgeTremor += settlePerimeter * 0.0048;
  edgeSlosh += settlePerimeter * 0.0096;
  float edgeWholeLift = edgeWholeRing * (0.0036 + 0.0016 * sin(uTime * 0.7 + baseRadius * 18.0));
  float edgePerimeterBand =
    smoothstep(0.88, 1.01, baseRadius) *
    (1.0 - smoothstep(1.03, 1.12, baseRadius)) *
    topPlateMask;
  float edgePerimeterLift =
    edgePerimeterBand *
    (edgeWholeRing * 0.0024 + edgeReturn * 0.0014 + settlePerimeter * 0.0022);
  float surfaceBandWake =
    surfaceBandMask *
    (edgePrelude * 0.52 + edgeWake * 0.46 + edgeHit * 0.7 + edgeWakeLong * 0.92 + edgeReturn * 1.12 + settleEnvelope * 0.74);
  float surfaceBandWholeWake =
    surfaceBandMask *
    (edgeWholeRing * 1.08 + edgeReturn * 0.62 + settlePerimeter * 0.88);
  float surfaceBandWaveA = sin(atan(sourceDelta.y, sourceDelta.x) * 8.0 + uTime * 1.24 + travel * 10.0);
  float surfaceBandWaveB = sin(atan(sourceDelta.y, sourceDelta.x) * 13.0 - uTime * 0.92 + edgeMemoryTravel * 11.0);
  float surfaceBandWaveC = sin(baseRadius * 40.0 - uTime * 1.08 + settleTravel * 8.0);
  float surfaceBandWobble =
    surfaceBandWake *
    (
      surfaceBandWaveA * 0.003 +
      surfaceBandWaveB * 0.002 +
      surfaceBandWaveC * 0.0014
    );
  float surfaceBandBreathLift = surfaceBandWake * (0.0018 + 0.001 * sin(uTime * 0.78 + baseRadius * 16.0));
  float surfaceBandWholeLift =
    surfaceBandWholeWake *
    (0.0016 + 0.0009 * sin(baseRadius * 28.0 - uTime * 0.92 + settleTravel * 6.0));

  float returnRingLift = (returnRingCrest * 0.023 - returnRingTrough * 0.0165);
  float carryLift = (carryCrest * 0.016 - carryTrough * 0.0092) + (carryReturnCrest * 0.012 - carryReturnTrough * 0.0075);
  float settleLift = settleRingCrest * 0.018 - settleRingTrough * 0.011;
  float surfaceY = meniscusCenter - centerDip - centerCoreDip + centerRebound + plopSpike + ringLift + trailLift + secondLift + thirdLift + beatRippleLift + beatRippleTrailLift + beatRippleSecondLift + carryLift + returnRingLift + settleLift - edgePrelude * 0.008 + edgeTremor + edgeSlosh + edgeWholeLift + edgePerimeterLift + surfaceBandWobble + surfaceBandBreathLift + surfaceBandWholeLift + restingSurfaceLift;
  return vec3(surfaceX, surfaceY, surfaceZ);
}

void main() {
  float beat = clamp(uImpact, 0.0, 1.0);
  float travel = clamp(uPulseTravel, 0.0, 1.0);
  float plopBeat = clamp(uPlopImpact, 0.0, 1.0);
  float plopTravel = clamp(uPlopProgress, 0.0, 1.0);
  vec2 plate = position.xy;
  vec3 displaced = sampleSurface(plate, beat, travel, plopBeat, plopTravel);
  float eps = 0.005;
  vec3 displacedX = sampleSurface(plate + vec2(eps, 0.0), beat, travel, plopBeat, plopTravel);
  vec3 displacedY = sampleSurface(plate + vec2(0.0, eps), beat, travel, plopBeat, plopTravel);
  vec3 localNormal = normalize(cross(displacedY - displaced, displacedX - displaced));
  vec2 rippleUv = vec2(displaced.x / 0.61, displaced.z / 0.3);

  vLocalPos = displaced;
  vRippleUv = rippleUv;
  vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
  vWorldPos = worldPos.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * localNormal);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const ORB_OUTER_CARRIER_FRAGMENT_SHADER = `
uniform float uBreath;
uniform float uTime;
uniform float uMotion;
uniform float uFlow;
uniform float uSource;
uniform float uCenter;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vLocalPos;

void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 v = normalize(cameraPosition - vWorldPos);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float rim = 1.0 - ndv;
  float fresnel = pow(rim, 1.7);
  vec3 reflectDir = reflect(-v, n);

  float outerRim = smoothstep(0.84, 1.0, rim);
  float innerBand = smoothstep(0.5, 0.72, rim) * (1.0 - smoothstep(0.72, 0.84, rim));
  float upperBow = smoothstep(0.38, 0.98, vLocalPos.y) * smoothstep(0.34, 0.995, rim);
  float sideCarry = smoothstep(0.54, 0.995, rim) * smoothstep(0.18, 0.98, abs(vLocalPos.x));
  float lowerCarry = smoothstep(-0.98, -0.24, vLocalPos.y) * smoothstep(0.54, 0.995, rim);
  float frontLens = smoothstep(0.56, 0.98, ndv) * smoothstep(0.12, 0.98, vLocalPos.y);
  float sideBow = smoothstep(0.26, 0.94, vLocalPos.y) * smoothstep(0.62, 0.98, abs(vLocalPos.x)) * smoothstep(0.5, 0.995, rim);
  float innerWeight = smoothstep(0.12, 0.26, rim) * smoothstep(0.22, 0.96, vLocalPos.y);
  float breathShift = sin(vLocalPos.x * 5.4 + uTime * 0.54 + uBreath * 3.2 + uFlow * 2.8) * (0.008 + abs(uBreath) * 0.01 + abs(uFlow) * 0.006);
  float bowWave = upperBow * (0.82 + breathShift * 2.4);
  float topMirror = smoothstep(0.62, 0.98, vLocalPos.y) * smoothstep(0.46, 0.94, rim) * smoothstep(0.12, 0.92, 1.0 - abs(vLocalPos.x) * 0.82);
  float topMirrorPulse = topMirror * (0.58 + uCenter * 0.38 + uSource * 0.24 + uMotion * 0.1) * (0.9 + 0.2 * sin(uTime * 0.5 + vLocalPos.x * 4.2 + uFlow * 2.4));
  float skyMirror = smoothstep(0.08, 0.94, reflectDir.y) * smoothstep(0.3, 0.98, fresnel);
  float horizonMirror = exp(-pow(reflectDir.y * 4.0 - 0.14, 2.0)) * smoothstep(0.28, 0.98, fresnel);

  vec3 edge = vec3(0.96, 0.99, 1.0);
  vec3 carry = vec3(0.8, 0.9, 0.98);
  vec3 weight = vec3(0.3, 0.38, 0.48);
  vec3 color = edge * (outerRim * 0.92 + upperBow * 0.54 + sideCarry * 0.12 + lowerCarry * 0.045 + frontLens * 0.08 + sideBow * 0.08);
  color += carry * (bowWave * 0.06 + uMotion * sideCarry * 0.018 + outerRim * 0.1);
  color += vec3(0.88, 0.95, 1.0) * skyMirror * 0.16;
  color += vec3(1.0, 0.95, 0.92) * horizonMirror * 0.08;
  color += vec3(0.95, 0.99, 1.0) * topMirrorPulse * 0.58;
  color = mix(color, weight, (innerWeight * 0.08 + innerBand * 0.1));

  float alpha = 0.0;
  alpha += outerRim * 0.086;
  alpha += upperBow * 0.042;
  alpha += sideCarry * 0.022;
  alpha += lowerCarry * 0.008;
  alpha += frontLens * 0.006;
  alpha += sideBow * 0.014;
  alpha += innerBand * 0.014;
  alpha += bowWave * 0.008;
  alpha += topMirrorPulse * 0.034;
  alpha += innerWeight * 0.008;
  alpha += skyMirror * 0.008;
  alpha += horizonMirror * 0.005;
  alpha = clamp(alpha, 0.0, 0.16);

  gl_FragColor = vec4(color, alpha);
}
`;

const ORGANISM_VOLUME_FRAGMENT_SHADER = `
uniform float uPulse;
uniform float uSource;
uniform float uCenter;
uniform float uTime;
uniform vec2 uTilt;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vLocalPos;

void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 v = normalize(cameraPosition - vWorldPos);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float rim = 1.0 - ndv;
  float fresnel = pow(rim, 1.45);

  vec2 warped = vLocalPos.xy * vec2(0.95, 1.05);
  float radial = length(warped);
  float bodyDepth = smoothstep(-0.82, 0.8, -vLocalPos.z);
  float membrane = smoothstep(0.42, 0.98, rim);
  float edgeShell = smoothstep(0.22, 0.52, radial);
  float innerShadow = 1.0 - smoothstep(0.0, 0.42, radial);
  vec3 sourcePos = vec3(0.0, -0.01, -0.18);
  float sourceCore = 1.0 - smoothstep(0.04, 0.26, length(vLocalPos - sourcePos));
  vec2 centerOffset = vec2(uTilt.x * 0.045, -uTilt.y * 0.04);
  float coreCenter = 1.0 - smoothstep(0.05, 0.33, length(vec3((vLocalPos.xy - centerOffset) * vec2(0.95, 1.02), vLocalPos.z + 0.01)));
  float centerDrift = 0.5 + 0.5 * sin(vLocalPos.x * 18.0 - vLocalPos.y * 14.0 + uPulse * 9.0 + uTime * 1.2);
  float centerPulse = coreCenter * smoothstep(-0.28, 0.78, -vLocalPos.z) * (uCenter * 0.42 + uPulse * 0.74 + uSource * 0.5) * (0.78 + centerDrift * 0.32);
  vec2 coreDriftA = vec2(sin(uTime * 0.92 + vLocalPos.y * 8.2 - vLocalPos.z * 3.4), cos(uTime * 0.74 - vLocalPos.x * 7.4 + vLocalPos.y * 3.8)) * 0.038;
  vec2 coreDriftB = vec2(cos(uTime * 0.68 + vLocalPos.x * 8.6 - vLocalPos.y * 2.8), sin(uTime * 0.88 + vLocalPos.z * 6.4 + vLocalPos.x * 2.6)) * 0.032;
  float glintA = smoothstep(0.085, 0.0, length(vLocalPos.xy - vec2(0.14, 0.06) - coreDriftA - uTilt * vec2(0.04, -0.03))) * smoothstep(0.16, 0.94, rim) * (uSource * 0.72 + uPulse * 0.22);
  float glintB = smoothstep(0.07, 0.0, length(vLocalPos.xy + vec2(0.12, -0.18) + coreDriftB + uTilt * vec2(0.03, 0.04))) * smoothstep(-0.12, 0.88, vLocalPos.y) * (uSource * 0.58 + uPulse * 0.18 + uCenter * 0.12);
  float tissueBloom = smoothstep(0.04, 0.44, coreCenter) * smoothstep(-0.34, 0.86, -vLocalPos.z) * (uCenter * 0.4 + uSource * 0.26) * (0.58 + 0.42 * sin(uTime * 1.42 + radial * 16.0 - vLocalPos.y * 11.0));
  float tissueNoise = 0.5 + 0.5 * sin(vLocalPos.x * 14.0 + vLocalPos.y * 10.0 + vLocalPos.z * 12.0);
  float lifeNoiseA =
    0.5 +
    0.5 * sin(vLocalPos.x * 22.0 + vLocalPos.y * 16.0 - vLocalPos.z * 18.0 + uTime * 1.02);
  float lifeNoiseB =
    0.5 +
    0.5 * sin(vLocalPos.x * 11.0 - vLocalPos.y * 21.0 + vLocalPos.z * 15.0 - uTime * 0.82);
  float liquidDrift =
    0.5 +
    0.5 * sin(vLocalPos.y * 17.0 + radial * 22.0 + uTime * 0.9 + uPulse * 6.0);
  float suspendedMist =
    smoothstep(0.02, 0.94, 1.0 - radial) *
    smoothstep(-0.44, 0.82, -vLocalPos.z) *
    (0.22 + lifeNoiseA * 0.26 + lifeNoiseB * 0.18);
  float lowerPool =
    smoothstep(-0.98, -0.16, vLocalPos.y) *
    smoothstep(-0.92, 0.14, -vLocalPos.z) *
    (0.2 + liquidDrift * 0.34 + uPulse * 0.08);
  vec3 nucleusPos = vec3(centerOffset * 0.62 + vec2(0.0, -0.006), -0.025);
  vec3 coreDelta = vec3(
    (vLocalPos.xy - nucleusPos.xy) * vec2(0.94, 0.98),
    (vLocalPos.z - nucleusPos.z) * 0.92
  );
  float nucleus =
    1.0 -
    smoothstep(
      0.024,
      0.27,
      length(coreDelta)
    );
  float nucleusHalo =
    1.0 -
    smoothstep(
      0.08,
      0.52,
      length(vec3((vLocalPos.xy - nucleusPos.xy) * vec2(0.9, 0.94), (vLocalPos.z - nucleusPos.z) * 0.88))
    );
  float nucleusPulse =
    nucleus *
    (uCenter * 0.62 + uPulse * 0.42 + uSource * 0.18) *
    (0.72 + centerDrift * 0.34);
  float nucleusBloom =
    nucleusHalo *
    smoothstep(-0.26, 0.84, -vLocalPos.z) *
    (uCenter * 0.38 + uPulse * 0.18);
  float centerGradient =
    nucleusHalo *
    smoothstep(-0.24, 0.84, -vLocalPos.z) *
    (0.42 + lifeNoiseA * 0.24 + liquidDrift * 0.2);
  float centerColorCarry =
    (1.0 - smoothstep(0.1, 0.86, length(coreDelta))) *
    smoothstep(0.02, 0.92, 1.0 - radial);
  float centerBloomCarry =
    (1.0 - smoothstep(0.04, 0.96, length(coreDelta))) *
    smoothstep(-0.18, 0.88, -vLocalPos.z);
  float ambientCenterPulse = 0.5 + 0.5 * sin(uTime * 1.42 + liquidDrift * 2.6 + lifeNoiseA * 1.8);
  float centerVeinA =
    pow(max(0.0, sin(coreDelta.y * 22.0 + coreDelta.x * 16.0 + uTime * 1.04)), 4.0) *
    centerGradient *
    0.28;
  float centerVeinB =
    pow(max(0.0, sin(coreDelta.x * 18.0 - coreDelta.y * 13.0 - uTime * 0.84)), 4.0) *
    centerGradient *
    0.24;
  float nucleusSpark =
    pow(max(0.0, cos(atan(coreDelta.y, coreDelta.x) * 4.0 + uTime * 0.22)), 12.0) *
    nucleusHalo *
    uCenter *
    0.22;
  float bandPlane =
    exp(-pow((vLocalPos.y - nucleusPos.y) / 0.032, 2.0)) *
    smoothstep(0.16, 0.9, 1.0 - radial) *
    smoothstep(0.24, 0.96, ndv);
  float bandNoise =
    0.5 +
    0.5 * sin(vLocalPos.x * 18.0 + uTime * 0.58 + liquidDrift * 3.4 - vLocalPos.z * 8.0);
  float equatorBreak =
    bandPlane *
    (1.0 - nucleusHalo * 0.82) *
    (0.34 + lifeNoiseB * 0.24 + liquidDrift * 0.1 + bandNoise * 0.12);
  float localGlintLeft =
    exp(-pow((vLocalPos.x + 0.16) / 0.05, 2.0)) *
    bandPlane *
    (0.42 + bandNoise * 0.24);
  float localGlintCenter =
    exp(-pow((vLocalPos.x - nucleusPos.x) / 0.08, 2.0)) *
    bandPlane *
    nucleusHalo *
    (0.54 + bandNoise * 0.18);
  float localGlintRight =
    exp(-pow((vLocalPos.x - 0.16) / 0.05, 2.0)) *
    bandPlane *
    (0.4 + bandNoise * 0.22);
  float frontVeil =
    smoothstep(-0.01, 0.16, vLocalPos.z) *
    smoothstep(0.04, 0.96, 1.0 - radial);
  float backDepth =
    smoothstep(-0.02, 0.32, -vLocalPos.z) *
    smoothstep(0.04, 0.96, 1.0 - radial);
  float frontLens =
    smoothstep(0.02, 0.22, vLocalPos.z) *
    smoothstep(0.08, 0.94, 1.0 - radial);
  float depthPocket =
    smoothstep(-0.34, 0.18, -vLocalPos.z) *
    smoothstep(0.06, 0.9, 1.0 - radial);
  float centerColumn =
    exp(-pow((vLocalPos.x - nucleusPos.x) / 0.18, 2.0)) *
    exp(-pow((vLocalPos.y - nucleusPos.y) / 0.28, 2.0)) *
    smoothstep(-0.02, 0.34, -vLocalPos.z);
  float centerEmitterPulse =
    localGlintCenter *
    (0.18 + ambientCenterPulse * 0.24) *
    (0.42 + uCenter * 0.18);
  float rimCarry =
    smoothstep(0.54, 0.92, radial) *
    smoothstep(-0.14, 0.34, -vLocalPos.z) *
    (0.22 + fresnel * 0.68);
  float causticLineA =
    pow(max(0.0, sin(vLocalPos.y * 18.0 + radial * 26.0 - uTime * 0.82 + uPulse * 5.0)), 6.0) *
    smoothstep(0.08, 0.88, 1.0 - radial) *
    backDepth *
    (0.12 + uPulse * 0.12);
  float causticLineB =
    pow(max(0.0, sin(vLocalPos.x * 24.0 - vLocalPos.y * 11.0 + uTime * 0.64 - uPulse * 4.4)), 7.0) *
    smoothstep(0.12, 0.94, 1.0 - radial) *
    smoothstep(-0.22, 0.42, -vLocalPos.z) *
    (0.1 + liquidDrift * 0.08);
  float lowerGather =
    smoothstep(-0.96, -0.08, vLocalPos.y) *
    smoothstep(-0.22, 0.42, -vLocalPos.z) *
    (0.24 + liquidDrift * 0.2 + lifeNoiseA * 0.14);

  vec3 deep = vec3(0.04, 0.1, 0.14);
  vec3 aqua = vec3(0.16, 0.34, 0.42);
  vec3 greenAqua = vec3(0.34, 0.68, 0.66);
  vec3 membraneEdge = vec3(0.9, 1.0, 0.97);
  vec3 pulseGlow = vec3(0.92, 0.99, 1.0);
  vec3 basinTint = vec3(0.08, 0.17, 0.2);
  vec3 frontTint = vec3(0.14, 0.22, 0.24);
  vec3 rimTint = vec3(0.74, 0.93, 0.98);

  vec3 body = mix(deep, aqua, 0.06 + bodyDepth * 0.14 + tissueNoise * 0.05 + suspendedMist * 0.06);
  body = mix(body, basinTint, lowerPool * 0.3);
  body = mix(body, basinTint * 0.92, lowerGather * 0.34);
  body = mix(body, frontTint, frontVeil * 0.22 + frontLens * 0.06);
  body += membraneEdge * membrane * (0.04 + uSource * 0.14 + fresnel * 0.08);
  body += greenAqua * suspendedMist * 0.048;
  body += greenAqua * lowerPool * 0.086;
  body += greenAqua * backDepth * 0.074;
  body += aqua * depthPocket * 0.046;
  body = mix(body, mix(aqua, greenAqua, 0.52), centerGradient * 0.34 + centerColorCarry * 0.18);
  body += pulseGlow * sourceCore * uSource * 0.88;
  body += vec3(0.08, 0.18, 0.18) * edgeShell * 0.03;
  body -= vec3(0.035, 0.045, 0.045) * innerShadow * 0.2;
  body -= vec3(0.022, 0.03, 0.03) * equatorBreak * 0.52;
  body += membraneEdge * fresnel * 0.08;
  body += rimTint * rimCarry * 0.22;
  body += pulseGlow * centerPulse * 0.92;
  body += greenAqua * centerGradient * (0.18 + uCenter * 0.12 + uSource * 0.05);
  body += greenAqua * centerColorCarry * 0.18;
  body += greenAqua * centerBloomCarry * 0.1;
  body += greenAqua * (centerVeinA + centerVeinB) * 0.48;
  body += rimTint * (localGlintLeft * 0.18 + localGlintRight * 0.18);
  body += pulseGlow * localGlintCenter * 0.42;
  body += pulseGlow * centerEmitterPulse * 0.32;
  body += rimTint * (causticLineA * 0.18 + causticLineB * 0.14);
  body += pulseGlow * centerColumn * (0.06 + nucleusBloom * 0.12);
  body += pulseGlow * nucleusPulse * 1.92;
  body += pulseGlow * nucleusBloom * 1.46;
  body += pulseGlow * nucleusSpark * 0.82;
  body += pulseGlow * (glintA * 0.28 + glintB * 0.22);
  body += greenAqua * tissueBloom * 0.16;

  float alpha = 0.024;
  alpha += bodyDepth * 0.052;
  alpha += edgeShell * 0.022;
  alpha += membrane * (0.016 + fresnel * 0.018);
  alpha += suspendedMist * 0.032;
  alpha += frontVeil * 0.04;
  alpha += frontLens * 0.014;
  alpha += backDepth * 0.034;
  alpha += depthPocket * 0.018;
  alpha += lowerGather * 0.018;
  alpha += lowerPool * 0.028;
  alpha += centerPulse * 0.044;
  alpha += centerGradient * 0.032;
  alpha += centerColorCarry * 0.018;
  alpha += nucleusPulse * 0.082;
  alpha += nucleusBloom * 0.056;
  alpha += nucleusSpark * 0.018;
  alpha += rimCarry * 0.014;
  alpha += localGlintCenter * 0.02;
  alpha += centerEmitterPulse * 0.018;
  alpha += glintA * 0.024 + glintB * 0.02;
  alpha += tissueBloom * 0.022;
  alpha -= equatorBreak * 0.024;
  alpha -= sourceCore * uSource * 0.012;
  alpha = clamp(alpha, 0.0, 0.2);

  gl_FragColor = vec4(body, alpha);
}
`;

const BURIED_SOURCE_FRAGMENT_SHADER = `
uniform float uSource;
varying vec3 vLocalPos;

void main() {
  float d = length(vLocalPos);
  float inner = smoothstep(0.14, 0.0, d);
  float halo = smoothstep(0.52, 0.0, d) * 0.14;
  float bloom = smoothstep(0.9, 0.0, d) * 0.08;
  float pulse = smoothstep(0.015, 0.14, uSource);
  float alpha = (inner * 0.62 + halo * 0.98 + bloom * 0.42) * pulse * 0.64;

  if (alpha < 0.008) discard;

  vec3 color = mix(vec3(0.78, 0.95, 0.92), vec3(1.0), inner * 0.66 + bloom * 0.18);
  gl_FragColor = vec4(color, alpha);
}
`;

export default function PulseScene({ bridge }: Props) {
  const pulseUnitRef = useRef<THREE.Group>(null!);
  const orbShellRef = useRef<THREE.Mesh>(null!);
  const orbOuterCarrierRef = useRef<THREE.Mesh>(null!);
  const orbMediumRef = useRef<THREE.Mesh>(null!);
  const orbTopRippleRef = useRef<THREE.Mesh>(null!);
  const orbParticlesRef = useRef<THREE.Points>(null!);
  const orbBubblesRef = useRef<THREE.Points>(null!);
  const coreGroupRef = useRef<THREE.Group>(null!);
  const coreMembraneRef = useRef<THREE.Mesh>(null!);
  const coreBodyRef = useRef<THREE.Mesh>(null!);
  const coreBreathBubblesRef = useRef<THREE.Points>(null!);
  const coreParticlesRef = useRef<THREE.Points>(null!);
  const coreGlowRef = useRef<THREE.Mesh>(null!);
  const coreCenterGlowRef = useRef<THREE.Mesh>(null!);
  const coreSourceRef = useRef<THREE.Mesh>(null!);
  const coreBackLightRef = useRef<THREE.PointLight>(null!);
  const coreFillLightRef = useRef<THREE.PointLight>(null!);
  const coreCenterLightRef = useRef<THREE.PointLight>(null!);

  const breathSampleRef = useRef(1);
  const breathVelocityRef = useRef(0);
  const breathLowRef = useRef(0.92);
  const breathHighRef = useRef(1.08);
  const sourceFlashRef = useRef(0);
  const orbEchoRef = useRef(0);
  const pulseSurfaceProgressRef = useRef(1);
  const topRippleProgressRef = useRef(1);
  const topRippleImpactRef = useRef(0);
  const topPlopProgressRef = useRef(1);
  const topPlopImpactRef = useRef(0);
  const topBeatRippleProgressRef = useRef(1);
  const topBeatRippleImpactRef = useRef(0);
  const topRippleCarryProgressRef = useRef(1);
  const topRippleCarryImpactRef = useRef(0);
  const topEdgeMemoryProgressRef = useRef(1);
  const topEdgeMemoryImpactRef = useRef(0);
  const topSettleProgressRef = useRef(1);
  const topSettleImpactRef = useRef(0);
  const previousTopRippleProgressRef = useRef(1);
  const previousBeatInstantRef = useRef(0);
  const beatGroupCountRef = useRef(0);
  const beatGroupPeakRef = useRef(0);
  const lastBeatTriggerTimeRef = useRef(-Infinity);
  const pendingHeroRippleRef = useRef(false);
  const pendingHeroRippleReadyAtRef = useRef(-Infinity);
  const pendingHeroRippleStrengthRef = useRef(0);
  const lastHeroRippleTimeRef = useRef(-Infinity);
  const preInhalePlopArmedRef = useRef(false);
  const preInhalePlopTriggeredRef = useRef(false);
  const previousSpinRef = useRef(0);
  const previousTiltXRef = useRef(0);
  const previousTiltYRef = useRef(0);
  const restLightRef = useRef(1);
  const motionTrailRef = useRef(0);
  const spinDirectionRef = useRef(1);
  const bubbleOrbitFlowRef = useRef(0);
  const coreHeartbeatRef = useRef(0);
  const lastCoreBreathDirectionRef = useRef<CoreBreathBubbleStage | "rest">("rest");
  const coreBreathInhaleVisibleTargetRef = useRef(0);
  const coreBreathExhaleVisibleTargetRef = useRef(0);
  const coreBreathInhaleCooldownRef = useRef(0);
  const coreBreathExhaleCooldownRef = useRef(0);
  const coreBreathBubbleStatesRef = useRef<CoreBreathBubbleState[]>(
    Array.from({ length: CORE_BREATH_BUBBLE_MAX }, () => ({
      stage: "hidden" as const,
      progress: 1,
      duration: 1,
      start: new THREE.Vector3(),
      control: new THREE.Vector3(),
      target: new THREE.Vector3(),
      end: new THREE.Vector3(),
      drift: new THREE.Vector3(),
      tangent: new THREE.Vector3(1, 0, 0),
      orbitPhase: 0,
      orbitSpeed: 0,
      alpha: 0,
      size: 0,
    }))
  );

  const orbEmitterTemps = useMemo(
    () => ({
      centerWorld: new THREE.Vector3(),
      topRippleWorld: new THREE.Vector3(),
      sideAWorld: new THREE.Vector3(),
      sideBWorld: new THREE.Vector3(),
      backWorld: new THREE.Vector3(),
      centerLocal: new THREE.Vector3(),
      centerMediumLocal: new THREE.Vector3(),
      topRippleLocal: new THREE.Vector3(),
      sideALocal: new THREE.Vector3(),
      sideBLocal: new THREE.Vector3(),
      backLocal: new THREE.Vector3(),
    }),
    []
  );

  const orbShellUniforms = useMemo(
    () => ({ uPulse: { value: 0 }, uBreath: { value: 0 }, uSource: { value: 0 }, uCenter: { value: 0 }, uRest: { value: 1 }, uTime: { value: 0 }, uMotion: { value: 0 }, uTilt: { value: new THREE.Vector2() }, uEmitCenter: { value: new THREE.Vector3() }, uEmitSideA: { value: new THREE.Vector3() }, uEmitSideB: { value: new THREE.Vector3() }, uEmitBack: { value: new THREE.Vector3() } }),
    []
  );
  const orbMediumUniforms = useMemo(
    () => ({ uPulse: { value: 0 }, uPulseTravel: { value: 1 }, uBreath: { value: 0 }, uSource: { value: 0 }, uCenter: { value: 0 }, uTime: { value: 0 }, uMotion: { value: 0 }, uFlow: { value: 0 }, uTilt: { value: new THREE.Vector2() } }),
    []
  );
  const topSurfaceRippleGeometry = useMemo(
    () => new THREE.PlaneGeometry(1.24, 1.1, 240, 208),
    []
  );
  const orbTopRippleUniforms = useMemo(
    () => ({ uPulse: { value: 0 }, uPulseTravel: { value: 1 }, uImpact: { value: 0 }, uPlopProgress: { value: 1 }, uPlopImpact: { value: 0 }, uBeatRippleProgress: { value: 1 }, uBeatRippleImpact: { value: 0 }, uCarryProgress: { value: 1 }, uCarryImpact: { value: 0 }, uEdgeMemoryProgress: { value: 1 }, uEdgeMemory: { value: 0 }, uSettleProgress: { value: 1 }, uSettleImpact: { value: 0 }, uBreath: { value: 0 }, uFlow: { value: 0 }, uTime: { value: 0 }, uTilt: { value: new THREE.Vector2() }, uSourceUv: { value: new THREE.Vector2() } }),
    []
  );
  const orbOuterCarrierUniforms = useMemo(
    () => ({ uBreath: { value: 0 }, uTime: { value: 0 }, uMotion: { value: 0 }, uFlow: { value: 0 }, uSource: { value: 0 }, uCenter: { value: 0 } }),
    []
  );
  const coreBodyUniforms = useMemo(
    () => ({ uPulse: { value: 0 }, uSource: { value: 0 }, uCenter: { value: 0 }, uTime: { value: 0 }, uTilt: { value: new THREE.Vector2() } }),
    []
  );
  const coreGlowUniforms = useMemo(() => ({ uSource: { value: 0 } }), []);
  const coreCenterUniforms = useMemo(() => ({ uSource: { value: 0 } }), []);
  const orbParticleUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color("#dff6ff") },
      uOpacity: { value: 0.02 },
    }),
    []
  );
  const orbBubbleUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color("#f2fdff") },
      uOpacity: { value: 0 },
    }),
    []
  );
  const coreParticleUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color("#edf9ff") },
      uOpacity: { value: 0.01 },
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uSource: { value: 0 },
      uCenter: { value: 0 },
    }),
    []
  );
  const coreBreathBubbleUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color("#f5fdff") },
      uOpacity: { value: 0.01 },
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uSource: { value: 0 },
      uCenter: { value: 0 },
    }),
    []
  );
  const coreMembraneBaseColor = useMemo(() => new THREE.Color("#eef7ff"), []);
  const coreMembranePulseColor = useMemo(() => new THREE.Color("#fbfdff"), []);
  const coreMembraneEmissiveBase = useMemo(() => new THREE.Color("#74cae3"), []);
  const coreMembraneAttenuationBase = useMemo(() => new THREE.Color("#bfd9ee"), []);

  const orbShellGeometry = useMemo(() => new THREE.SphereGeometry(1, 144, 144), []);
  const coreMembraneGeometry = useMemo(
    () =>
      makeOrganicBodyGeometry(0.31, 0.97, {
        depthFlatten: 0.82,
        middleBulge: 0.12,
        bottomWeight: 0.08,
        backTuck: 0.05,
        organicWarp: 0.05,
        asymmetry: 0.018,
        bellySink: 0.02,
      }),
    []
  );
  const coreBodyGeometry = useMemo(
    () =>
      makeOrganicBodyGeometry(0.285, 0.93, {
        depthFlatten: 0.88,
        middleBulge: 0.08,
        bottomWeight: 0.05,
        backTuck: 0.03,
        organicWarp: 0.035,
        asymmetry: 0.012,
        bellySink: 0.018,
      }),
    []
  );
  const coreSourceGeometry = useMemo(() => new THREE.SphereGeometry(1, 40, 40), []);

  const orbParticleField = useMemo(
    () =>
      makeSuspendedParticleField(360, {
        minRadius: 0.18,
        maxRadius: 0.82,
        yStretch: 1.04,
        radialBias: 0.68,
        sizeMin: 0.18,
        sizeMax: 0.55,
        alphaMin: 0.015,
        alphaMax: 0.06,
        zFlatten: 0.96,
      }),
    []
  );
  const orbParticlePositions = useMemo(
    () => new Float32Array(orbParticleField.base),
    [orbParticleField]
  );
  const orbParticlePositionsRef = useRef<Float32Array>(orbParticlePositions);
  const orbParticleGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(orbParticlePositions, 3)
    );
    geometry.setAttribute("aSize", new THREE.BufferAttribute(orbParticleField.size, 1));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(orbParticleField.alpha, 1));
    geometry.computeBoundingSphere();
    return geometry;
  }, [orbParticleField.alpha, orbParticleField.size, orbParticlePositions]);
  const orbBubbleField = useMemo(
    () => makeOrbBubbleField(9),
    []
  );
  const orbBubblePositions = useMemo(
    () => new Float32Array(orbBubbleField.phase.length * ORB_BUBBLE_TRAIL_STEPS * 3),
    [orbBubbleField]
  );
  const orbBubblePositionsRef = useRef<Float32Array>(orbBubblePositions);
  const orbBubbleSizeValues = useMemo(() => {
    const values = new Float32Array(orbBubbleField.size.length * ORB_BUBBLE_TRAIL_STEPS);
    for (let i = 0; i < orbBubbleField.size.length; i++) {
      for (let trail = 0; trail < ORB_BUBBLE_TRAIL_STEPS; trail++) {
        values[i * ORB_BUBBLE_TRAIL_STEPS + trail] =
          orbBubbleField.size[i] * ORB_BUBBLE_TRAIL_SIZE_FACTORS[trail];
      }
    }
    return values;
  }, [orbBubbleField.size]);
  const orbBubbleAlphaValues = useMemo(
    () => new Float32Array(orbBubbleField.alpha.length * ORB_BUBBLE_TRAIL_STEPS),
    [orbBubbleField]
  );
  const orbBubbleAlphaRef = useRef<Float32Array>(orbBubbleAlphaValues);
  const orbBubblePhaseValues = useMemo(() => {
    const values = new Float32Array(orbBubbleField.phase.length * ORB_BUBBLE_TRAIL_STEPS);
    for (let i = 0; i < orbBubbleField.phase.length; i++) {
      for (let trail = 0; trail < ORB_BUBBLE_TRAIL_STEPS; trail++) {
        values[i * ORB_BUBBLE_TRAIL_STEPS + trail] = orbBubbleField.phase[i] + trail * 0.24;
      }
    }
    return values;
  }, [orbBubbleField.phase]);
  const orbBubbleGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(orbBubblePositions, 3)
    );
    geometry.setAttribute("aSize", new THREE.BufferAttribute(orbBubbleSizeValues, 1));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(orbBubbleAlphaValues, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(orbBubblePhaseValues, 1));
    geometry.computeBoundingSphere();
    return geometry;
  }, [orbBubbleAlphaValues, orbBubblePhaseValues, orbBubblePositions, orbBubbleSizeValues]);

  const coreParticleField = useMemo(() => makeLayeredCoreParticleField(2400), []);
  const coreBreathBubbleField = useMemo(
    () => makeCoreBreathBubbleField(CORE_BREATH_BUBBLE_MAX),
    []
  );
  const coreParticlePositions = useMemo(
    () => new Float32Array(coreParticleField.base),
    [coreParticleField]
  );
  const coreBreathBubblePositions = useMemo(
    () => new Float32Array(CORE_BREATH_BUBBLE_MAX * CORE_BREATH_BUBBLE_TRAIL_STEPS * 3),
    []
  );
  const coreParticlePositionsRef = useRef<Float32Array>(coreParticlePositions);
  const coreBreathBubblePositionsRef = useRef<Float32Array>(coreBreathBubblePositions);
  const coreBreathBubbleSizeValues = useMemo(
    () => new Float32Array(CORE_BREATH_BUBBLE_MAX * CORE_BREATH_BUBBLE_TRAIL_STEPS),
    []
  );
  const coreBreathBubbleAlphaValues = useMemo(
    () => new Float32Array(CORE_BREATH_BUBBLE_MAX * CORE_BREATH_BUBBLE_TRAIL_STEPS),
    []
  );
  const coreBreathBubbleAlphaRef = useRef<Float32Array>(coreBreathBubbleAlphaValues);
  const coreBreathBubbleSizeRef = useRef<Float32Array>(coreBreathBubbleSizeValues);
  const coreParticleGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(coreParticlePositions, 3)
    );
    geometry.setAttribute("aSize", new THREE.BufferAttribute(coreParticleField.size, 1));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(coreParticleField.alpha, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(coreParticleField.phase, 1));
    geometry.setAttribute("aLayer", new THREE.BufferAttribute(coreParticleField.layer, 1));
    geometry.computeBoundingSphere();
    return geometry;
  }, [coreParticleField.alpha, coreParticleField.layer, coreParticleField.phase, coreParticleField.size, coreParticlePositions]);
  const coreBreathBubbleGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(coreBreathBubblePositions, 3)
    );
    geometry.setAttribute(
      "aSize",
      new THREE.BufferAttribute(coreBreathBubbleSizeValues, 1)
    );
    geometry.setAttribute(
      "aAlpha",
      new THREE.BufferAttribute(coreBreathBubbleAlphaValues, 1)
    );
    geometry.setAttribute(
      "aPhase",
      new THREE.BufferAttribute(
        new Float32Array(
          Array.from({ length: CORE_BREATH_BUBBLE_MAX * CORE_BREATH_BUBBLE_TRAIL_STEPS }, (_, i) =>
            coreBreathBubbleField.phase[Math.floor(i / CORE_BREATH_BUBBLE_TRAIL_STEPS)] + (i % CORE_BREATH_BUBBLE_TRAIL_STEPS) * 0.18
          )
        ),
        1
      )
    );
    geometry.computeBoundingSphere();
    return geometry;
  }, [
    coreBreathBubbleAlphaValues,
    coreBreathBubbleField.phase,
    coreBreathBubblePositions,
    coreBreathBubbleSizeValues,
  ]);

  useEffect(() => {
    return () => {
      orbParticleGeometry.dispose();
      orbBubbleGeometry.dispose();
      coreParticleGeometry.dispose();
      coreBreathBubbleGeometry.dispose();
    };
  }, [coreBreathBubbleGeometry, coreParticleGeometry, orbBubbleGeometry, orbParticleGeometry]);

  const beginCoreBreathBubbleIntake = () => {
    const states = coreBreathBubbleStatesRef.current;
    for (let bubbleIndex = 0; bubbleIndex < states.length; bubbleIndex++) {
      const bubble = states[bubbleIndex];
      const shellAngle = THREE.MathUtils.lerp(-Math.PI * 0.92, Math.PI * 0.92, Math.random());
      const shellMode = Math.random();
      const tangent = new THREE.Vector3(Math.cos(shellAngle), 0, -Math.sin(shellAngle)).normalize();
      const target = new THREE.Vector3();

      if (shellMode < 0.6) {
        target.set(
          Math.sin(shellAngle) * 0.31,
          THREE.MathUtils.lerp(-0.38, 0.38, Math.random()),
          0.13 + Math.cos(shellAngle) * 0.06
        );
      } else {
        const topSign = shellMode < 0.8 ? 1 : -1;
        const capRadius = THREE.MathUtils.lerp(0.06, 0.22, Math.random());
        target.set(
          Math.sin(shellAngle) * capRadius,
          topSign * (0.42 + (0.06 - capRadius * 0.22)),
          0.14 + Math.cos(shellAngle) * 0.05 + capRadius * 0.1
        );
      }

      const startX = THREE.MathUtils.lerp(-0.76, 0.76, Math.random());
      const startZ = THREE.MathUtils.lerp(-0.06, 0.18, Math.random());
      const topBandEdge = 1 - clamp01(Math.abs(startX) / 0.82);
      const start = new THREE.Vector3(
        startX,
        THREE.MathUtils.lerp(0.6, 0.74, Math.random()) + topBandEdge * 0.08,
        startZ
      );
      const travelDir = target.clone().sub(start).normalize();
      const curveRadius = THREE.MathUtils.lerp(0.08, 0.22, Math.random());
      const swaySign = Math.random() > 0.5 ? 1 : -1;

      bubble.stage = "inhale";
      bubble.progress = 0;
      bubble.duration = THREE.MathUtils.lerp(2.3, 3.6, Math.random());
      bubble.alpha =
        coreBreathBubbleField.alpha[bubbleIndex] * THREE.MathUtils.lerp(0.72, 1.08, Math.random());
      bubble.size =
        coreBreathBubbleField.size[bubbleIndex] * THREE.MathUtils.lerp(0.82, 1.08, Math.random());
      clampPointToOrbInterior(start, 0.84, 0.52, 0.82);
      clampPointToOrbInterior(target, 0.48, -0.48, 0.48);
      bubble.target.copy(target);
      bubble.start.copy(start);
      bubble.control.copy(bubble.start).lerp(bubble.target, THREE.MathUtils.lerp(0.3, 0.48, Math.random()));
      bubble.control.x += tangent.x * THREE.MathUtils.lerp(0.08, 0.22, Math.random()) * swaySign;
      bubble.control.y += THREE.MathUtils.lerp(-0.08, 0.04, Math.random());
      bubble.control.z += (Math.random() - 0.5) * 0.08 + travelDir.z * curveRadius;
      clampPointToOrbInterior(bubble.control, 0.72, -0.02, 0.76);
      bubble.end.copy(bubble.target);
      bubble.drift.set(
        (Math.random() - 0.5) * 0.024,
        (Math.random() - 0.5) * 0.036,
        (Math.random() - 0.5) * 0.024
      );
      bubble.tangent.copy(tangent);
      bubble.orbitPhase = Math.random() * Math.PI * 2;
      bubble.orbitSpeed = THREE.MathUtils.lerp(0.26, 0.54, Math.random());
    }
    return true;
  };

  const beginCoreBreathBubbleRelease = () => {
    const states = coreBreathBubbleStatesRef.current;
    for (let i = 0; i < states.length; i++) {
      const bubble = states[i];
      const releaseDir = bubble.target
        .clone()
        .normalize()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.7,
            (Math.random() - 0.5) * 0.8,
            (Math.random() - 0.5) * 0.7
          )
        )
        .normalize();
      const tangent = new THREE.Vector3(-releaseDir.z, 0, releaseDir.x).normalize();
      const swaySign = Math.random() > 0.5 ? 1 : -1;

      bubble.stage = "exhale";
      bubble.progress = 0;
      bubble.duration = THREE.MathUtils.lerp(2.1, 3.4, Math.random());
      bubble.start.copy(bubble.target);
      bubble.control.copy(bubble.target);
      bubble.control.addScaledVector(releaseDir, THREE.MathUtils.lerp(0.06, 0.14, Math.random()));
      bubble.control.addScaledVector(tangent, THREE.MathUtils.lerp(0.03, 0.1, Math.random()) * swaySign);
      bubble.control.y += THREE.MathUtils.lerp(-0.06, 0.06, Math.random());
      bubble.end.copy(bubble.target);
      bubble.end.addScaledVector(releaseDir, THREE.MathUtils.lerp(0.72, 1.26, Math.random()));
      bubble.end.addScaledVector(tangent, THREE.MathUtils.lerp(0.12, 0.28, Math.random()) * swaySign);
      bubble.end.y += THREE.MathUtils.lerp(-0.24, 0.24, Math.random());
      clampPointToOrbInterior(bubble.control, 0.74, -0.4, 0.78);
      clampPointToOrbInterior(bubble.end, 0.84, -0.62, 0.8);
      bubble.drift.set(
        (Math.random() - 0.5) * 0.03,
        (Math.random() - 0.5) * 0.038,
        (Math.random() - 0.5) * 0.03
      );
      bubble.tangent.copy(tangent);
      bubble.orbitPhase = Math.random() * Math.PI * 2;
      bubble.orbitSpeed = THREE.MathUtils.lerp(0.28, 0.58, Math.random());
    }
    return true;
  };

  useFrame((state, delta) => {
    if (
      !pulseUnitRef.current ||
      !orbShellRef.current ||
      !orbOuterCarrierRef.current ||
      !orbMediumRef.current ||
      !orbTopRippleRef.current ||
      !orbParticlesRef.current ||
      !orbBubblesRef.current ||
      !coreGroupRef.current ||
      !coreMembraneRef.current ||
      !coreBodyRef.current ||
      !coreBreathBubblesRef.current ||
      !coreParticlesRef.current ||
      !coreGlowRef.current ||
      !coreCenterGlowRef.current ||
      !coreSourceRef.current ||
      !coreBackLightRef.current ||
      !coreFillLightRef.current ||
      !coreCenterLightRef.current
    ) {
      return;
    }

    const breathScaleRef = bridge?.breathScaleRef ?? bridge?.breatheScaleRef;
    const breathScale =
      typeof breathScaleRef?.current === "number" ? breathScaleRef.current : 1;
    const beat =
      typeof bridge?.beatRef?.current === "number"
        ? THREE.MathUtils.clamp(bridge.beatRef.current, 0, 1.2)
        : 0;
    const spin =
      typeof bridge?.spinRadRef?.current === "number" && !bridge?.lockVisualSpin
        ? bridge.spinRadRef.current
        : 0;
    const tiltX =
      typeof bridge?.tiltXRadRef?.current === "number"
        ? bridge.tiltXRadRef.current
        : 0;
    const tiltY =
      typeof bridge?.tiltYRadRef?.current === "number"
        ? bridge.tiltYRadRef.current
        : 0;

    const t = state.clock.getElapsedTime();
    const dt = Math.max(delta, 1 / 240);
    const signedSpinDelta = spin - previousSpinRef.current;
    const spinDelta = Math.abs(signedSpinDelta);
    const tiltDelta = Math.abs(tiltX - previousTiltXRef.current) + Math.abs(tiltY - previousTiltYRef.current);
    if (Math.abs(signedSpinDelta) > 0.0001) {
      spinDirectionRef.current = Math.sign(signedSpinDelta);
    }
    bubbleOrbitFlowRef.current = THREE.MathUtils.lerp(
      bubbleOrbitFlowRef.current,
      signedSpinDelta * 13,
      Math.abs(signedSpinDelta) > 0.0001 ? 0.34 : 0.08
    );
    previousSpinRef.current = spin;
    previousTiltXRef.current = tiltX;
    previousTiltYRef.current = tiltY;
    const motionSample = THREE.MathUtils.clamp(spinDelta * 7 + tiltDelta * 22, 0, 1);
    const motionTarget = THREE.MathUtils.clamp(
      motionSample * 1.35 + Math.min(0.22, Math.abs(tiltX) * 0.42 + Math.abs(tiltY) * 0.42),
      0,
      1
    );
    motionTrailRef.current = THREE.MathUtils.lerp(motionTrailRef.current, motionTarget, motionTarget > motionTrailRef.current ? 0.2 : 0.06);
    const targetRest = 1 - THREE.MathUtils.smoothstep(motionSample, 0.01, 0.18);
    restLightRef.current = THREE.MathUtils.lerp(restLightRef.current, targetRest, 0.12);
    const beatNorm = beat / 1.2;
    const beatInstant = clamp01((beat - 0.06) / 0.42);
    const previewRawBreathVelocity = (breathScale - breathSampleRef.current) / dt;
    const previewBreathVelocity = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(breathVelocityRef.current, previewRawBreathVelocity, 0.18) * 8,
      -1,
      1
    );
    const previewInhale = Math.max(0, previewBreathVelocity);
    const previewExhale = Math.max(0, -previewBreathVelocity);
    const previewBreathRange = Math.max(0.08, breathHighRef.current - breathLowRef.current);
    const previewBreathAmount = clamp01(
      (breathScale - breathLowRef.current) / previewBreathRange
    );
    const previewBreathFill = previewBreathAmount * 2 - 1;
    if (previewBreathFill < -0.44 && previewExhale > 0.035) {
      preInhalePlopArmedRef.current = true;
    }
    if (previewBreathFill > 0.22 && previewInhale > 0.03) {
      preInhalePlopTriggeredRef.current = false;
    }
    const previousTopRippleProgress = previousTopRippleProgressRef.current;
    const beatTriggered = beatInstant > 0.22 && previousBeatInstantRef.current <= 0.22;
    const beatGroupWindow = 0.26;
    const beatGroupSettle = 0.18;
    const heroRippleCooldown = 0.9;
    const heroRippleRestartProgressGate = 0.9;
    const heroRippleRestartImpactGate = 0.18;
    const shouldTriggerCyclePlop =
      preInhalePlopArmedRef.current &&
      !preInhalePlopTriggeredRef.current &&
      previewBreathFill < -0.18 &&
      previewBreathVelocity > -0.04;
    if (beatTriggered) {
      const basePlopImpact = shouldTriggerCyclePlop
        ? 0.58 + beatInstant * 0.18
        : 0.26 + beatInstant * 0.08;
      const fineBeatRippleImpact = shouldTriggerCyclePlop
        ? 0
        : 0.24 + beatInstant * 0.06 + previewExhale * 0.48;
      pulseSurfaceProgressRef.current = 0;
      topPlopProgressRef.current = 0;
      topPlopImpactRef.current = Math.min(
        1,
        Math.max(
          topPlopImpactRef.current * (shouldTriggerCyclePlop ? 0.84 : 0.8),
          basePlopImpact
        )
      );
      if (!shouldTriggerCyclePlop) {
        topBeatRippleProgressRef.current = 0;
        topBeatRippleImpactRef.current = Math.min(
          1,
          Math.max(topBeatRippleImpactRef.current * 0.82, fineBeatRippleImpact)
        );
      }

      if (shouldTriggerCyclePlop) {
        const sameGroup = t - lastBeatTriggerTimeRef.current <= beatGroupWindow;
        beatGroupCountRef.current = sameGroup ? beatGroupCountRef.current + 1 : 1;
        beatGroupPeakRef.current = sameGroup
          ? Math.max(beatGroupPeakRef.current, beatInstant)
          : beatInstant;
        lastBeatTriggerTimeRef.current = t;
        pendingHeroRippleRef.current = true;
        pendingHeroRippleReadyAtRef.current = t + beatGroupSettle;
        pendingHeroRippleStrengthRef.current = Math.max(
          pendingHeroRippleStrengthRef.current,
          0.84 + beatInstant * 0.24
        );
        preInhalePlopTriggeredRef.current = true;
        preInhalePlopArmedRef.current = false;
      }
    }

    if (
      pendingHeroRippleRef.current &&
      t >= pendingHeroRippleReadyAtRef.current &&
      t - lastBeatTriggerTimeRef.current >= beatGroupSettle
    ) {
      const rippleHasSettledEnough =
        topRippleProgressRef.current >= heroRippleRestartProgressGate ||
        topRippleImpactRef.current <= heroRippleRestartImpactGate;
      const settleHasSettledEnough =
        topSettleImpactRef.current <= 0.16 ||
        topSettleProgressRef.current >= 0.9;
      const carryHasSettledEnough =
        topRippleCarryImpactRef.current <= 0.18 ||
        topRippleCarryProgressRef.current >= 0.92;
      if (
        t - lastHeroRippleTimeRef.current >= heroRippleCooldown &&
        rippleHasSettledEnough &&
        settleHasSettledEnough &&
        carryHasSettledEnough
      ) {
        if (topRippleImpactRef.current > 0.08 && topRippleProgressRef.current < 0.98) {
          topRippleCarryProgressRef.current = Math.min(0.96, topRippleProgressRef.current);
          topRippleCarryImpactRef.current = Math.min(
            1,
            Math.max(
              topRippleCarryImpactRef.current * 0.82,
              topRippleImpactRef.current * 1.04,
              topSettleImpactRef.current * 0.72,
              topEdgeMemoryImpactRef.current * 0.48
            )
          );
        }
        pulseSurfaceProgressRef.current = 0;
        topRippleProgressRef.current = 0;
        topRippleImpactRef.current = Math.min(
          1,
          Math.max(
            topRippleImpactRef.current * 0.55,
            pendingHeroRippleStrengthRef.current *
              (beatGroupCountRef.current > 1 ? 1.0 : 0.92)
          )
        );
        lastHeroRippleTimeRef.current = t;
        pendingHeroRippleRef.current = false;
        pendingHeroRippleStrengthRef.current = 0;
        beatGroupCountRef.current = 0;
        beatGroupPeakRef.current = 0;
      } else {
        topRippleImpactRef.current = Math.min(
          1,
          topRippleImpactRef.current + dt * pendingHeroRippleStrengthRef.current * 0.08
        );
        topSettleImpactRef.current = Math.min(
          1,
          topSettleImpactRef.current + dt * pendingHeroRippleStrengthRef.current * 0.03
        );
        topEdgeMemoryImpactRef.current = Math.min(
          1,
          topEdgeMemoryImpactRef.current + dt * pendingHeroRippleStrengthRef.current * 0.018
        );
      }
    }

    pulseSurfaceProgressRef.current = Math.min(
      1,
      pulseSurfaceProgressRef.current + dt * (1.62 + beatInstant * 1.12)
    );
    topRippleProgressRef.current = Math.min(
      1,
      topRippleProgressRef.current + dt * 0.14
    );
    topPlopProgressRef.current = Math.min(
      1,
      topPlopProgressRef.current + dt * 0.36
    );
    topBeatRippleProgressRef.current = Math.min(
      1,
      topBeatRippleProgressRef.current + dt * 0.82
    );
    topRippleCarryProgressRef.current = Math.min(
      1,
      topRippleCarryProgressRef.current + dt * 0.082
    );
    if (
      previousTopRippleProgress < 0.92 &&
      topRippleProgressRef.current >= 0.92 &&
      topRippleImpactRef.current > 0.16
    ) {
      topEdgeMemoryProgressRef.current = 0;
      topEdgeMemoryImpactRef.current = Math.min(
        1,
        Math.max(topEdgeMemoryImpactRef.current * 0.78, topRippleImpactRef.current * 1.14)
      );
      topSettleProgressRef.current = 0;
      topSettleImpactRef.current = Math.min(
        1,
        Math.max(topSettleImpactRef.current * 0.88, topRippleImpactRef.current * 1.12)
      );
    }
    topEdgeMemoryProgressRef.current = Math.min(
      1,
      topEdgeMemoryProgressRef.current + dt * 0.108
    );
    topSettleProgressRef.current = Math.min(
      1,
      topSettleProgressRef.current + dt * 0.07
    );
    topRippleImpactRef.current = Math.max(
      0,
      topRippleImpactRef.current - dt * 0.13
    );
    topPlopImpactRef.current = Math.max(
      0,
      topPlopImpactRef.current - dt * 0.72
    );
    topBeatRippleImpactRef.current = Math.max(
      0,
      topBeatRippleImpactRef.current - dt * 0.11
    );
    topRippleCarryImpactRef.current = Math.max(
      0,
      topRippleCarryImpactRef.current - dt * 0.042
    );
    topEdgeMemoryImpactRef.current = Math.max(
      0,
      topEdgeMemoryImpactRef.current - dt * 0.042
    );
    topSettleImpactRef.current = Math.max(
      0,
      topSettleImpactRef.current - dt * 0.026
    );
    previousTopRippleProgressRef.current = topRippleProgressRef.current;
    previousBeatInstantRef.current = beatInstant;

    sourceFlashRef.current = Math.max(sourceFlashRef.current - dt * 2.45, beatInstant);
    orbEchoRef.current = Math.max(orbEchoRef.current - dt * 0.62, 0);
    orbEchoRef.current = Math.max(orbEchoRef.current, sourceFlashRef.current * 0.96);

    const sourceSpark = Math.pow(sourceFlashRef.current, 0.64);
    const orbResponse = Math.pow(orbEchoRef.current, 0.86);
    const membranePulse = Math.max(
      orbResponse * 0.72,
      Math.pow(clamp01((beatNorm - 0.04) / 0.96), 0.74)
    );
    const heartbeatTarget = Math.pow(membranePulse, 0.76);
    const heartbeatFollow =
      heartbeatTarget > coreHeartbeatRef.current
        ? 1 - Math.exp(-dt * 18)
        : 1 - Math.exp(-dt * 7.5);
    coreHeartbeatRef.current = THREE.MathUtils.lerp(
      coreHeartbeatRef.current,
      heartbeatTarget,
      heartbeatFollow
    );
    const heartClamp = coreHeartbeatRef.current;
    const centerIdle = 0.1 + Math.sin(t * 0.92) * 0.018 + Math.cos(t * 1.37) * 0.014;
    const centerSpark = clamp01(centerIdle + sourceSpark * 0.88 + orbResponse * 0.22);

    const rawBreathVelocity = (breathScale - breathSampleRef.current) / dt;
    breathSampleRef.current = breathScale;
    breathVelocityRef.current = THREE.MathUtils.lerp(
      breathVelocityRef.current,
      rawBreathVelocity,
      0.16
    );

    breathLowRef.current = Math.min(breathLowRef.current, breathScale);
    breathHighRef.current = Math.max(breathHighRef.current, breathScale);
    breathLowRef.current = THREE.MathUtils.lerp(breathLowRef.current, 0.92, 0.0018);
    breathHighRef.current = THREE.MathUtils.lerp(breathHighRef.current, 1.08, 0.0018);

    const breathVelocity = THREE.MathUtils.clamp(breathVelocityRef.current * 8, -1, 1);
    const inhale = Math.max(0, breathVelocity);
    const exhale = Math.max(0, -breathVelocity);
    const breathRange = Math.max(0.08, breathHighRef.current - breathLowRef.current);
    const breathAmount = clamp01((breathScale - breathLowRef.current) / breathRange);
    const breathFill = breathAmount * 2 - 1;

    const breathExtremity = THREE.MathUtils.smoothstep(Math.abs(breathFill), 0.5, 1.0);
    const currentCoreBreathDirection = lastCoreBreathDirectionRef.current;
    let coreBreathDirection: CoreBreathBubbleStage | "rest" = "rest";
    if (
      currentCoreBreathDirection === "inhale" &&
      breathAmount < 0.965 &&
      exhale < 0.08
    ) {
      coreBreathDirection = "inhale";
    } else if (
      currentCoreBreathDirection === "exhale" &&
      breathAmount > 0.035 &&
      inhale < 0.08
    ) {
      coreBreathDirection = "exhale";
    } else if (rawBreathVelocity > 0.0015 && breathAmount < 0.96) {
      coreBreathDirection = "inhale";
    } else if (rawBreathVelocity < -0.0015 && breathAmount > 0.04) {
      coreBreathDirection = "exhale";
    }
    if (coreBreathDirection === "inhale" && lastCoreBreathDirectionRef.current !== "inhale") {
      coreBreathInhaleVisibleTargetRef.current = THREE.MathUtils.randInt(4, 12);
      coreBreathInhaleCooldownRef.current = 0;
      beginCoreBreathBubbleIntake();
    } else if (
      coreBreathDirection === "exhale" &&
      lastCoreBreathDirectionRef.current !== "exhale"
    ) {
      coreBreathExhaleVisibleTargetRef.current = THREE.MathUtils.randInt(4, 12);
      coreBreathExhaleCooldownRef.current = 0;
      beginCoreBreathBubbleRelease();
    }
    lastCoreBreathDirectionRef.current = coreBreathDirection;
    const legacyBreathScale = typeof breathScale === "number"
      ? 1 + (breathScale - 1) * 0.68
      : 1;

    pulseUnitRef.current.scale.setScalar(BASE_PULSE_SCALE * legacyBreathScale);
    pulseUnitRef.current.position.y = -0.008;
    pulseUnitRef.current.rotation.x = tiltX * 0.016;
    pulseUnitRef.current.rotation.z = tiltY * 0.014;

    const wobbleBoost = 1 + breathExtremity * 1.75;
    const shellWaveA = Math.sin(t * 1.12 + breathAmount * Math.PI * 1.4) * 0.0068 * wobbleBoost;
    const shellWaveB = Math.cos(t * 1.42 - breathAmount * Math.PI * 1.15) * 0.0048 * wobbleBoost;
    const shellWaveC = Math.sin(t * 0.78 + breathAmount * Math.PI * 2.6) * 0.0024 * (0.55 + breathExtremity * 0.9);
    const shellPulse = Math.sin(t * 1.86 + breathAmount * Math.PI * 2.0) * 0.0039 * breathExtremity;
    orbShellRef.current.rotation.y = spin * 0.94;
    orbShellRef.current.rotation.x = tiltX * 0.06 + shellWaveA * 0.58 + shellWaveC * 0.45;
    orbShellRef.current.rotation.z = tiltY * 0.05 + shellWaveB * 0.52 - shellWaveC * 0.25;
    orbShellRef.current.position.y = breathFill * 0.014 + inhale * 0.004 - exhale * 0.0025 + shellPulse * 0.26;
    orbShellRef.current.scale.set(
      1.0 - breathFill * 0.011 + shellWaveA + shellPulse + shellWaveC,
      1.0 + breathFill * 0.022 + inhale * 0.009 - exhale * 0.007 + shellWaveB + shellPulse,
      0.998 - breathFill * 0.007 - shellWaveA * 0.36 + shellPulse * 0.38 - shellWaveC * 0.55
    );
    orbOuterCarrierRef.current.rotation.copy(orbShellRef.current.rotation);
    orbOuterCarrierRef.current.position.copy(orbShellRef.current.position);
    orbOuterCarrierRef.current.scale.set(
      orbShellRef.current.scale.x * 1.014,
      orbShellRef.current.scale.y * 1.016,
      orbShellRef.current.scale.z * 1.013
    );
    const shellFollowMix = 0.72 + breathExtremity * 0.1 + exhale * 0.08;
    const shellTiltDepthInset =
      (Math.abs(orbShellRef.current.rotation.x) + Math.abs(orbShellRef.current.rotation.z)) * 0.018;
    const mediumInsetX = 0.018 + exhale * 0.005 + breathExtremity * 0.002;
    const mediumInsetY = 0.024 + exhale * 0.008 + breathExtremity * 0.003;
    const mediumInsetZ = 0.02 + exhale * 0.005 + breathExtremity * 0.002;

    orbMediumRef.current.rotation.y = spin * 0.84 + motionTrailRef.current * 0.024;
    orbMediumRef.current.rotation.x =
      orbShellRef.current.rotation.x * shellFollowMix + motionTrailRef.current * 0.008;
    orbMediumRef.current.rotation.z =
      orbShellRef.current.rotation.z * shellFollowMix - motionTrailRef.current * 0.006;
    orbMediumRef.current.position.set(
      tiltY * (0.0014 + motionTrailRef.current * 0.0018),
      orbShellRef.current.position.y * (0.58 + exhale * 0.14) - 0.0015 - exhale * 0.0008,
      -0.004 - shellTiltDepthInset - exhale * 0.0012
    );
    orbMediumRef.current.scale.set(
      orbShellRef.current.scale.x - mediumInsetX,
      orbShellRef.current.scale.y - mediumInsetY,
      orbShellRef.current.scale.z - mediumInsetZ
    );
    orbTopRippleRef.current.rotation.set(
      -tiltX * 0.012 + breathVelocity * 0.006,
      0,
      -tiltY * 0.012 - breathVelocity * 0.004
    );
    orbTopRippleRef.current.position.set(
      0,
      orbMediumRef.current.position.y - exhale * 0.0008,
      orbMediumRef.current.position.z
    );
    orbTopRippleRef.current.scale.copy(orbMediumRef.current.scale);
    orbTopRippleRef.current.scale.multiplyScalar(0.994 - exhale * 0.0025);

    const coreContainmentInset = 0.018 + breathExtremity * 0.008;
    const coreDepthInset = 0.02 + inhale * 0.006 + exhale * 0.004;
    const coreInnerSeparation = 0.018 + breathExtremity * 0.004 + sourceSpark * 0.003;

    coreGroupRef.current.position.set(
      tiltY * 0.0048,
      -0.017 - tiltX * 0.0052 + breathFill * 0.007 - breathExtremity * 0.002,
      -0.05 + sourceSpark * 0.012 + inhale * 0.003 - exhale * 0.002
    );
    coreGroupRef.current.rotation.x = tiltX * 0.12 + Math.sin(t * 0.66) * 0.018;
    coreGroupRef.current.rotation.z = tiltY * 0.1 - Math.cos(t * 0.58) * 0.014;
    coreGroupRef.current.rotation.y = spin * 0.06 + Math.sin(t * 0.34) * 0.02;

    coreMembraneRef.current.scale.set(
      1.002 - coreContainmentInset - breathFill * 0.008 + sourceSpark * 0.008 + shellPulse * 0.28 + shellWaveC * 0.11,
      1.008 - coreContainmentInset + breathFill * 0.024 + inhale * 0.007 - exhale * 0.006 + sourceSpark * 0.02 + shellPulse * 0.78,
      0.988 - coreContainmentInset - breathFill * 0.006 + sourceSpark * 0.007 + shellPulse * 0.22 - shellWaveC * 0.08
    );

    coreBodyRef.current.position.set(
      -0.002 + Math.sin(t * 0.5) * 0.002,
      -0.018 + breathFill * 0.006 - breathExtremity * 0.0015,
      -0.082 - coreDepthInset - coreInnerSeparation + sourceSpark * 0.014 + inhale * 0.003 - exhale * 0.002
    );
    coreBodyRef.current.rotation.x = 0.045 + Math.sin(t * 0.58) * 0.015;
    coreBodyRef.current.rotation.y = -0.035 + Math.cos(t * 0.46) * 0.02;
    coreBodyRef.current.rotation.z = 0.02 + Math.sin(t * 0.4) * 0.012;
    const heartSqueeze = heartClamp * (0.034 + sourceSpark * 0.016 + centerSpark * 0.01);
    const heartDepthSqueeze = heartSqueeze * 0.96;
    const heartHeightLift = heartClamp * 0.026;
    coreBodyRef.current.scale.set(
      0.954 - coreContainmentInset - coreInnerSeparation - breathFill * 0.007 + sourceSpark * 0.01 + shellPulse * 0.24 + shellWaveC * 0.09 - heartSqueeze,
      0.962 - coreContainmentInset - coreInnerSeparation + breathFill * 0.02 + inhale * 0.005 - exhale * 0.004 + sourceSpark * 0.014 + shellPulse * 0.68 + heartHeightLift,
      0.928 - coreContainmentInset - coreInnerSeparation - breathFill * 0.004 + sourceSpark * 0.007 + shellPulse * 0.18 - shellWaveC * 0.06 - heartDepthSqueeze
    );
    coreBreathBubblesRef.current.position.copy(coreMembraneRef.current.position);
    coreBreathBubblesRef.current.rotation.set(0, 0, 0);
    coreBreathBubblesRef.current.scale.set(1, 1, 1);
    coreParticlesRef.current.position.copy(coreBodyRef.current.position);
    coreParticlesRef.current.rotation.copy(coreBodyRef.current.rotation);
    coreParticlesRef.current.scale.set(
      coreBodyRef.current.scale.x * 0.97,
      coreBodyRef.current.scale.y * 0.985,
      coreBodyRef.current.scale.z * 1.1
    );

    coreSourceRef.current.position.set(0.0, -0.008, -0.18);
    coreSourceRef.current.scale.setScalar(0.0001 + sourceSpark * 0.065);

    coreGlowRef.current.position.copy(coreSourceRef.current.position);
    coreGlowRef.current.scale.set(
      0.0001 + sourceSpark * 0.42 + orbResponse * 0.036,
      0.0001 + sourceSpark * 0.42 + orbResponse * 0.036,
      0.0001 + sourceSpark * 0.31 + orbResponse * 0.024
    );
    coreCenterGlowRef.current.position.set(
      tiltY * 0.018 + Math.sin(t * 0.82) * 0.004,
      -0.002 - tiltX * 0.014 + breathFill * 0.004 + Math.cos(t * 0.74) * 0.003,
      -0.09 + sourceSpark * 0.018 + Math.sin(t * 0.58) * 0.005
    );
    coreCenterGlowRef.current.scale.set(
      0.0001 + centerSpark * 0.26 + sourceSpark * 0.04,
      0.0001 + centerSpark * 0.26 + sourceSpark * 0.04,
      0.0001 + centerSpark * 0.18 + sourceSpark * 0.028
    );

    pulseUnitRef.current.updateWorldMatrix(true, true);
    orbShellRef.current.updateWorldMatrix(true, false);
    coreGroupRef.current.updateWorldMatrix(true, true);

    coreCenterGlowRef.current.getWorldPosition(orbEmitterTemps.centerWorld);
    coreGroupRef.current.getWorldPosition(orbEmitterTemps.topRippleWorld);
    coreMembraneRef.current.localToWorld(orbEmitterTemps.sideAWorld.set(-0.22, -0.01, -0.01));
    coreMembraneRef.current.localToWorld(orbEmitterTemps.sideBWorld.set(0.22, -0.01, -0.01));
    coreBodyRef.current.localToWorld(orbEmitterTemps.backWorld.set(0, -0.01, -0.2));

    orbEmitterTemps.centerLocal.copy(orbEmitterTemps.centerWorld);
    orbEmitterTemps.centerMediumLocal.copy(orbEmitterTemps.centerWorld);
    orbEmitterTemps.topRippleLocal.copy(orbEmitterTemps.topRippleWorld);
    orbEmitterTemps.sideALocal.copy(orbEmitterTemps.sideAWorld);
    orbEmitterTemps.sideBLocal.copy(orbEmitterTemps.sideBWorld);
    orbEmitterTemps.backLocal.copy(orbEmitterTemps.backWorld);
    orbShellRef.current.worldToLocal(orbEmitterTemps.centerLocal);
    orbMediumRef.current.worldToLocal(orbEmitterTemps.centerMediumLocal);
    orbMediumRef.current.worldToLocal(orbEmitterTemps.topRippleLocal);
    orbShellRef.current.worldToLocal(orbEmitterTemps.sideALocal);
    orbShellRef.current.worldToLocal(orbEmitterTemps.sideBLocal);
    orbShellRef.current.worldToLocal(orbEmitterTemps.backLocal);

    const orbShellMaterial = orbShellRef.current.material as THREE.ShaderMaterial;
    const coreBodyMaterial = coreBodyRef.current.material as THREE.ShaderMaterial;
    const coreGlowMaterial = coreGlowRef.current.material as THREE.ShaderMaterial;
    const coreMembraneMaterial = coreMembraneRef.current.material as THREE.MeshPhysicalMaterial;

    orbShellMaterial.uniforms.uPulse.value = orbResponse;
    orbShellMaterial.uniforms.uBreath.value = breathFill + inhale * 0.5 - exhale * 0.22;
    orbShellMaterial.uniforms.uSource.value = sourceSpark;
    orbShellMaterial.uniforms.uCenter.value = centerSpark;
    orbShellMaterial.uniforms.uRest.value = restLightRef.current;
    orbShellMaterial.uniforms.uTime.value = t;
    orbShellMaterial.uniforms.uMotion.value = motionTrailRef.current;
    orbShellMaterial.uniforms.uTilt.value.set(tiltY * 5.4, tiltX * 5.4);
    orbShellMaterial.uniforms.uEmitCenter.value.copy(orbEmitterTemps.centerLocal);
    orbShellMaterial.uniforms.uEmitSideA.value.copy(orbEmitterTemps.sideALocal);
    orbShellMaterial.uniforms.uEmitSideB.value.copy(orbEmitterTemps.sideBLocal);
    orbShellMaterial.uniforms.uEmitBack.value.copy(orbEmitterTemps.backLocal);
    const orbMediumMaterial = orbMediumRef.current.material as THREE.ShaderMaterial;
    const orbTopRippleMaterial = orbTopRippleRef.current.material as THREE.ShaderMaterial;
    const orbOuterCarrierMaterial = orbOuterCarrierRef.current.material as THREE.ShaderMaterial;
    orbMediumMaterial.uniforms.uPulse.value = orbResponse;
    orbMediumMaterial.uniforms.uPulseTravel.value = pulseSurfaceProgressRef.current;
    orbMediumMaterial.uniforms.uBreath.value = breathFill + inhale * 0.45 - exhale * 0.18;
    orbMediumMaterial.uniforms.uSource.value = sourceSpark;
    orbMediumMaterial.uniforms.uCenter.value = centerSpark;
    orbMediumMaterial.uniforms.uTime.value = t;
    orbMediumMaterial.uniforms.uMotion.value = motionTrailRef.current;
    orbMediumMaterial.uniforms.uFlow.value = breathVelocity;
    orbMediumMaterial.uniforms.uTilt.value.set(tiltY * 4.8, tiltX * 4.8);
    orbTopRippleMaterial.uniforms.uPulse.value = orbResponse;
    orbTopRippleMaterial.uniforms.uPulseTravel.value = topRippleProgressRef.current;
    orbTopRippleMaterial.uniforms.uImpact.value = topRippleImpactRef.current;
    orbTopRippleMaterial.uniforms.uPlopProgress.value = topPlopProgressRef.current;
    orbTopRippleMaterial.uniforms.uPlopImpact.value = topPlopImpactRef.current;
    orbTopRippleMaterial.uniforms.uBeatRippleProgress.value = topBeatRippleProgressRef.current;
    orbTopRippleMaterial.uniforms.uBeatRippleImpact.value = topBeatRippleImpactRef.current;
    orbTopRippleMaterial.uniforms.uCarryProgress.value = topRippleCarryProgressRef.current;
    orbTopRippleMaterial.uniforms.uCarryImpact.value = topRippleCarryImpactRef.current;
    orbTopRippleMaterial.uniforms.uEdgeMemoryProgress.value = topEdgeMemoryProgressRef.current;
    orbTopRippleMaterial.uniforms.uEdgeMemory.value = topEdgeMemoryImpactRef.current;
    orbTopRippleMaterial.uniforms.uSettleProgress.value = topSettleProgressRef.current;
    orbTopRippleMaterial.uniforms.uSettleImpact.value = topSettleImpactRef.current;
    orbTopRippleMaterial.uniforms.uBreath.value = breathFill + inhale * 0.45 - exhale * 0.18;
    orbTopRippleMaterial.uniforms.uFlow.value = breathVelocity;
    orbTopRippleMaterial.uniforms.uTime.value = t;
    orbTopRippleMaterial.uniforms.uTilt.value.set(tiltY * 4.8, tiltX * 4.8);
    orbTopRippleMaterial.uniforms.uSourceUv.value.set(0, 0);
    orbOuterCarrierMaterial.uniforms.uBreath.value = breathFill + inhale * 0.45 - exhale * 0.18;
    orbOuterCarrierMaterial.uniforms.uTime.value = t;
    orbOuterCarrierMaterial.uniforms.uMotion.value = motionTrailRef.current;
    orbOuterCarrierMaterial.uniforms.uFlow.value = breathVelocity;
    orbOuterCarrierMaterial.uniforms.uSource.value = sourceSpark;
    orbOuterCarrierMaterial.uniforms.uCenter.value = centerSpark;
    coreBodyMaterial.uniforms.uPulse.value = membranePulse;
    coreBodyMaterial.uniforms.uSource.value = sourceSpark;
    coreBodyMaterial.uniforms.uCenter.value = centerSpark;
    coreBodyMaterial.uniforms.uTime.value = t;
    coreBodyMaterial.uniforms.uTilt.value.set(tiltY * 2.8, tiltX * 2.8);
    coreGlowMaterial.uniforms.uSource.value = sourceSpark;
    (coreCenterGlowRef.current.material as THREE.ShaderMaterial).uniforms.uSource.value = centerSpark;

    coreMembraneMaterial.color
      .copy(coreMembraneBaseColor)
      .lerp(coreMembranePulseColor, 0.06 + centerSpark * 0.1 + sourceSpark * 0.04);
    coreMembraneMaterial.emissive
      .copy(coreMembraneEmissiveBase)
      .lerp(coreMembranePulseColor, sourceSpark * 0.14 + centerSpark * 0.04);
    coreMembraneMaterial.attenuationColor
      .copy(coreMembraneAttenuationBase)
      .lerp(coreMembranePulseColor, 0.04 + sourceSpark * 0.08);
    coreMembraneMaterial.roughness =
      0.036 + breathExtremity * 0.005 + (1 - centerSpark) * 0.008;
    coreMembraneMaterial.emissiveIntensity =
      sourceSpark * 0.08 + centerSpark * 0.02 + orbResponse * 0.024;
    coreMembraneMaterial.opacity = 0.084 + sourceSpark * 0.014 + centerSpark * 0.004;
    coreMembraneMaterial.thickness =
      3.22 + breathFill * 0.12 + orbResponse * 0.07 + sourceSpark * 0.04;

    const orbParticleMaterial = orbParticlesRef.current.material as THREE.ShaderMaterial;
    const orbBubbleMaterial = orbBubblesRef.current.material as THREE.ShaderMaterial;
    const coreBreathBubbleMaterial = coreBreathBubblesRef.current.material as THREE.ShaderMaterial;
    const coreParticleMaterial = coreParticlesRef.current.material as THREE.ShaderMaterial;
    orbParticleMaterial.uniforms.uOpacity.value =
      0.014 + orbResponse * 0.05 + sourceSpark * 0.02 + inhale * 0.014;
    orbBubbleMaterial.uniforms.uOpacity.value =
      Math.pow(motionTrailRef.current, 0.8) * 1.56;
    coreParticleMaterial.uniforms.uOpacity.value =
      THREE.MathUtils.clamp(
        0.24 + sourceSpark * 0.08 + centerSpark * 0.08 + orbResponse * 0.03,
        0.24,
        0.4
      );
    coreParticleMaterial.uniforms.uTime.value = t;
    coreParticleMaterial.uniforms.uPulse.value = membranePulse;
    coreParticleMaterial.uniforms.uSource.value = sourceSpark;
    coreParticleMaterial.uniforms.uCenter.value = centerSpark;
    coreBreathBubbleMaterial.uniforms.uOpacity.value =
      THREE.MathUtils.clamp(0.92 + sourceSpark * 0.24 + centerSpark * 0.18, 0.92, 1.26);
    coreBreathBubbleMaterial.uniforms.uTime.value = t;
    coreBreathBubbleMaterial.uniforms.uPulse.value = membranePulse;
    coreBreathBubbleMaterial.uniforms.uSource.value = sourceSpark;
    coreBreathBubbleMaterial.uniforms.uCenter.value = centerSpark;

    const orbPositionAttr = orbParticlesRef.current.geometry
      .attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < orbParticleField.phase.length; i++) {
      const o = i * 3;
      const bx = orbParticleField.base[o];
      const by = orbParticleField.base[o + 1];
      const bz = orbParticleField.base[o + 2];
      const phase = orbParticleField.phase[i];
      const sway = orbParticleField.sway[i];
      const radius = Math.sqrt(bx * bx + by * by + bz * bz);
      const angle = t * (0.05 + sway * 0.03) + phase;
      const spinDrift = 0.018 + (1 - radius) * 0.012;
      const px = bx * Math.cos(spinDrift) - bz * Math.sin(spinDrift);
      const pz = bz * Math.cos(spinDrift) + bx * Math.sin(spinDrift);
      const py =
        by +
        Math.sin(angle * 0.72) * 0.003 +
        breathFill * (0.02 - radius * 0.008) +
        inhale * (0.008 - radius * 0.003) -
        exhale * (0.006 - radius * 0.002) +
        orbResponse * (0.012 - radius * 0.005);

      orbParticlePositionsRef.current[o] = px;
      orbParticlePositionsRef.current[o + 1] = py;
      orbParticlePositionsRef.current[o + 2] = pz + Math.cos(angle * 0.42) * 0.002;
    }
    orbPositionAttr.needsUpdate = true;

    const orbBubblePositionAttr = orbBubblesRef.current.geometry
      .attributes.position as THREE.BufferAttribute;
    const orbBubbleAlphaAttr = orbBubblesRef.current.geometry
      .attributes.aAlpha as THREE.BufferAttribute;
    const bubbleCount = orbBubbleField.phase.length;
    const visibilityCycle = Math.floor(t * 0.48);
    const visibleCountSeed =
      Math.sin((visibilityCycle + 1) * 53.173 + motionTrailRef.current * 1.7) * 43758.5453;
    const visibleCountFrac = visibleCountSeed - Math.floor(visibleCountSeed);
    const visibleCount = 4 + Math.floor(visibleCountFrac * 6);
    const orderOffsetSeed = Math.sin((visibilityCycle + 1) * 91.417) * 43758.5453;
    const orderOffsetFrac = orderOffsetSeed - Math.floor(orderOffsetSeed);
    const orderOffset = Math.floor(orderOffsetFrac * bubbleCount);
    const stepOptions = [1, 2, 4, 5, 7, 8];
    const stepSeed = Math.sin((visibilityCycle + 1) * 17.913) * 43758.5453;
    const stepFrac = stepSeed - Math.floor(stepSeed);
    const orderStep = stepOptions[Math.floor(stepFrac * stepOptions.length)];
    for (let i = 0; i < orbBubbleField.phase.length; i++) {
      const baseOffset = i * 3;
      const bx = orbBubbleField.base[baseOffset];
      const by = orbBubbleField.base[baseOffset + 1];
      const bz = orbBubbleField.base[baseOffset + 2];
      const phase = orbBubbleField.phase[i];
      const sway = orbBubbleField.sway[i];
      const angle = t * (0.16 + sway * 0.08) + phase;
      const bubbleRadius = Math.sqrt(bx * bx + by * by + bz * bz);
      const baseAngle = Math.atan2(bz, bx);
      const baseElevation = Math.asin(by / Math.max(0.001, bubbleRadius));
      const life = t * (0.085 + sway * 0.04) + phase * 0.31;
      const cycle = Math.floor(life);
      const cycleT = life - cycle;
      const cycleSeed = Math.sin((i + 1) * 45.137 + Math.floor(t * 0.2 + phase) * 91.713) * 43758.5453;
      const cycleFrac = cycleSeed - Math.floor(cycleSeed);
      const pathProgress = THREE.MathUtils.smootherstep(cycleT, 0, 1);
      const spawnAngleSeed = Math.sin((i + 1) * 11.173 + (cycle + 1) * 83.911) * 43758.5453;
      const spawnAngleFrac = spawnAngleSeed - Math.floor(spawnAngleSeed);
      const spawnElevationSeed = Math.sin((i + 1) * 23.417 + (cycle + 1) * 61.337) * 43758.5453;
      const spawnElevationFrac = spawnElevationSeed - Math.floor(spawnElevationSeed);
      const spawnRadiusSeed = Math.sin((i + 1) * 37.719 + (cycle + 1) * 49.153) * 43758.5453;
      const spawnRadiusFrac = spawnRadiusSeed - Math.floor(spawnRadiusSeed);
      const orbitFlow = bubbleOrbitFlowRef.current * (0.82 + sway * 0.18);
      const arcSpan =
        (1.24 + cycleFrac * 1.52) * motionTrailRef.current + Math.abs(orbitFlow) * 0.22;
      const orbitLead =
        (motionTrailRef.current * 0.22 + Math.abs(orbitFlow) * 0.18) *
        spinDirectionRef.current;
      const orbitAngle =
        baseAngle +
        THREE.MathUtils.lerp(-Math.PI * 0.95, Math.PI * 0.95, spawnAngleFrac) +
        orbitLead +
        orbitFlow +
        spinDirectionRef.current * pathProgress * arcSpan;
      const elevationDir = Math.sign(Math.sin(phase * 1.7 + cycle * 1.3) || 1);
      const elevationSpan = (0.22 + cycleFrac * 0.24) * motionTrailRef.current * elevationDir;
      const elevationBias = THREE.MathUtils.clamp(
        baseElevation * 0.28 +
          THREE.MathUtils.lerp(-0.84, 0.84, spawnElevationFrac) * 0.72 +
          elevationDir * 0.08,
        -0.9,
        0.9
      );
      const elevation = THREE.MathUtils.clamp(
        elevationBias + (pathProgress - 0.5) * elevationSpan + Math.sin(angle * 0.52) * motionTrailRef.current * 0.04,
        -0.98,
        0.98
      );
      const radialPulse = Math.sin(angle * 0.54 + phase * 0.7) * motionTrailRef.current * 0.045;
      const sphereRadius = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(bubbleRadius, THREE.MathUtils.lerp(0.38, 0.9, spawnRadiusFrac), 0.72) +
          radialPulse +
          THREE.MathUtils.lerp(-0.04, 0.08, cycleFrac),
        0.38,
        0.92
      );
      const orderIndex = (orderOffset + i * orderStep) % bubbleCount;
      const visibleThisCycle = orderIndex < visibleCount ? 1 : 0;
      const envelope =
        THREE.MathUtils.smoothstep(cycleT, 0.01, 0.08) *
        (1 - THREE.MathUtils.smoothstep(cycleT, 0.92, 0.995));
      const burst = THREE.MathUtils.lerp(0.96, 1.62, cycleFrac);
      const bubbleVisibility =
        motionTrailRef.current * visibleThisCycle * envelope * burst;
      for (let trail = 0; trail < ORB_BUBBLE_TRAIL_STEPS; trail++) {
        const trailIndex = i * ORB_BUBBLE_TRAIL_STEPS + trail;
        const trailOffset = trailIndex * 3;
        const trailLag = trail * (0.09 + sway * 0.035 + motionTrailRef.current * 0.05);
        const trailAngle = orbitAngle - spinDirectionRef.current * trailLag;
        const trailElevation = THREE.MathUtils.clamp(
          elevation - elevationDir * trail * (0.028 + motionTrailRef.current * 0.03),
          -0.98,
          0.98
        );
        const trailRadius = THREE.MathUtils.clamp(sphereRadius - trail * 0.018, 0.36, 0.92);
        const trailPx = Math.cos(trailAngle) * Math.cos(trailElevation) * trailRadius;
        const trailPz = Math.sin(trailAngle) * Math.cos(trailElevation) * trailRadius;
        const trailPy = Math.sin(trailElevation) * trailRadius;

        orbBubblePositionsRef.current[trailOffset] = trailPx + tiltY * 0.006;
        orbBubblePositionsRef.current[trailOffset + 1] = trailPy;
        orbBubblePositionsRef.current[trailOffset + 2] = trailPz - tiltX * 0.005;
        orbBubbleAlphaRef.current[trailIndex] =
          orbBubbleField.alpha[i] *
          bubbleVisibility *
          ORB_BUBBLE_TRAIL_ALPHA_FACTORS[trail];
      }
    }
    orbBubblePositionAttr.needsUpdate = true;
    orbBubbleAlphaAttr.needsUpdate = true;

    const coreBreathBubblePositionAttr = coreBreathBubblesRef.current.geometry
      .attributes.position as THREE.BufferAttribute;
    const coreBreathBubbleAlphaAttr = coreBreathBubblesRef.current.geometry
      .attributes.aAlpha as THREE.BufferAttribute;
    const coreBreathBubbleSizeAttr = coreBreathBubblesRef.current.geometry
      .attributes.aSize as THREE.BufferAttribute;
    const bubbleCurvePoint = new THREE.Vector3();
    const bubbleCurvePointB = new THREE.Vector3();
    const bubbleBinormalPoint = new THREE.Vector3();
    const inhalePhaseProgress = clamp01(breathAmount);
    const exhalePhaseProgress = clamp01(1 - breathAmount);
    for (let i = 0; i < coreBreathBubbleStatesRef.current.length; i++) {
      const bubble = coreBreathBubbleStatesRef.current[i];

      if (bubble.stage === "hidden") {
        for (let trail = 0; trail < CORE_BREATH_BUBBLE_TRAIL_STEPS; trail++) {
          const trailIndex = i * CORE_BREATH_BUBBLE_TRAIL_STEPS + trail;
          const o = trailIndex * 3;
          coreBreathBubblePositionsRef.current[o] = 0;
          coreBreathBubblePositionsRef.current[o + 1] = 0;
          coreBreathBubblePositionsRef.current[o + 2] = 0;
          coreBreathBubbleAlphaRef.current[trailIndex] = 0;
          coreBreathBubbleSizeRef.current[trailIndex] = coreBreathBubbleField.size[i] * 0.01;
        }
        continue;
      }

      let currentAlpha = 0;
      let currentSize = 0;
      bubbleCurvePoint.set(0, 0, 0);
      bubbleCurvePointB.set(0, 0, 0);
      const inhaleVisible = coreBreathDirection === "inhale" && i < coreBreathInhaleVisibleTargetRef.current;
      const exhaleVisible = coreBreathDirection === "exhale" && i < coreBreathExhaleVisibleTargetRef.current;

      if (bubble.stage === "inhale" && inhaleVisible) {
        const offset = i / Math.max(1, coreBreathInhaleVisibleTargetRef.current) * 0.72;
        const local = clamp01((inhalePhaseProgress - offset) / Math.max(0.18, 1 - offset));
        const ease = THREE.MathUtils.smootherstep(local, 0, 1);
        bubbleCurvePoint.copy(bubble.start).lerp(bubble.control, ease);
        bubbleCurvePointB.copy(bubble.control).lerp(bubble.target, ease);
        bubbleCurvePoint.lerp(bubbleCurvePointB, ease);
        bubbleCurvePoint.x += Math.sin(t * 0.82 + i * 0.9) * bubble.drift.x * (1 - ease);
        bubbleCurvePoint.y += Math.cos(t * 0.74 + i * 0.7) * bubble.drift.y * (1 - ease);
        bubbleCurvePoint.z += Math.sin(t * 0.66 + i * 1.1) * bubble.drift.z * (1 - ease);
        currentAlpha =
          bubble.alpha *
          (0.46 + membranePulse * 0.3 + sourceSpark * 0.18) *
          (0.24 + ease * 0.76);
        currentSize =
          bubble.size * (0.92 + ease * 0.16 + sourceSpark * 0.08);
      } else if (bubble.stage === "held") {
        bubbleBinormalPoint
          .crossVectors(bubble.target, bubble.tangent)
          .normalize();
        const orbitT = t * bubble.orbitSpeed + bubble.orbitPhase;
        bubbleCurvePoint.copy(bubble.target);
        bubbleCurvePoint.addScaledVector(
          bubble.tangent,
          Math.sin(orbitT) * (0.018 + Math.abs(bubble.drift.x) * 0.8)
        );
        bubbleCurvePoint.addScaledVector(
          bubbleBinormalPoint,
          Math.cos(orbitT * 0.92) * (0.014 + Math.abs(bubble.drift.y) * 0.68)
        );
        bubbleCurvePoint.y += Math.sin(orbitT * 0.74) * bubble.drift.y * 0.42;
        currentAlpha = 0;
        currentSize = bubble.size * 0.01;
      } else if (bubble.stage === "exhale" && exhaleVisible) {
        const offset = i / Math.max(1, coreBreathExhaleVisibleTargetRef.current) * 0.72;
        const local = clamp01((exhalePhaseProgress - offset) / Math.max(0.18, 1 - offset));
        const ease = THREE.MathUtils.smootherstep(local, 0, 1);
        bubbleCurvePoint.copy(bubble.start).lerp(bubble.control, ease);
        bubbleCurvePointB.copy(bubble.control).lerp(bubble.end, ease);
        bubbleCurvePoint.lerp(bubbleCurvePointB, ease);
        bubbleCurvePoint.addScaledVector(
          bubble.tangent,
          Math.sin(t * bubble.orbitSpeed + bubble.orbitPhase) * bubble.drift.x * ease
        );
        bubbleCurvePoint.y += Math.cos(t * 0.62 + i * 0.76) * bubble.drift.y * ease;
        bubbleCurvePoint.z += Math.sin(t * 0.56 + i * 1.02) * bubble.drift.z * ease;
        currentAlpha =
          bubble.alpha *
          (0.42 + sourceSpark * 0.2 + membranePulse * 0.16) *
          (1 - THREE.MathUtils.smoothstep(local, 0.0, 1));
        currentSize =
          bubble.size * (1 + ease * 0.08) * (1 - THREE.MathUtils.smoothstep(local, 0.72, 1) * 0.18);
      } else {
        currentAlpha = 0;
        currentSize = bubble.size * 0.01;
      }

      const direction =
        bubble.stage === "held"
          ? bubble.tangent.clone()
          : bubble.stage === "inhale"
            ? bubble.target.clone().sub(bubble.start).normalize()
            : bubble.end.clone().sub(bubble.start).normalize();
      for (let trail = 0; trail < CORE_BREATH_BUBBLE_TRAIL_STEPS; trail++) {
        const trailIndex = i * CORE_BREATH_BUBBLE_TRAIL_STEPS + trail;
        const o = trailIndex * 3;
        const offset = CORE_BREATH_BUBBLE_TRAIL_OFFSETS[trail];
        const trailPos = bubbleCurvePoint.clone().addScaledVector(direction, offset);
        clampPointToOrbInterior(trailPos, 0.86, -0.78, 0.82);
        coreBreathBubblePositionsRef.current[o] = trailPos.x;
        coreBreathBubblePositionsRef.current[o + 1] = trailPos.y;
        coreBreathBubblePositionsRef.current[o + 2] = trailPos.z;
        const stageAlphaFactor =
          trail === 1 && bubble.stage !== "held"
            ? 0.7 + membranePulse * 0.24
            : trail === 2
              ? 0.44
              : 1;
        coreBreathBubbleAlphaRef.current[trailIndex] =
          currentAlpha * CORE_BREATH_BUBBLE_TRAIL_ALPHA_FACTORS[trail] * stageAlphaFactor;
        coreBreathBubbleSizeRef.current[trailIndex] =
          currentSize * CORE_BREATH_BUBBLE_TRAIL_SIZE_FACTORS[trail];
      }
    }
    coreBreathBubblePositionAttr.needsUpdate = true;
    coreBreathBubbleAlphaAttr.needsUpdate = true;
    coreBreathBubbleSizeAttr.needsUpdate = true;

    const corePositionAttr = coreParticlesRef.current.geometry
      .attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < coreParticleField.phase.length; i++) {
      const o = i * 3;
      const bx = coreParticleField.base[o];
      const by = coreParticleField.base[o + 1];
      const bz = coreParticleField.base[o + 2];
      const phase = coreParticleField.phase[i];
      const sway = coreParticleField.sway[i];
      const layer = coreParticleField.layer[i];
      const radius = Math.sqrt(bx * bx + by * by + bz * bz);
      const angle = t * (0.08 + sway * 0.06) + phase;
      const cluster = 1 - clamp01(radius / 0.38);
      const livingCurl = Math.sin(t * (0.62 + sway * 0.14) + phase * 2.4 + by * 12.0);
      const livingLift = Math.cos(t * (0.54 + sway * 0.12) - phase * 1.8 + bx * 10.0);
      const shimmer = 0.5 + 0.5 * Math.sin(t * 0.9 + phase * 3.2 + bz * 18.0);
      const centerPull = 0.00016 + cluster * 0.0008 + centerSpark * 0.00036;
      const pulseEnvelope = membranePulse * (0.26 + cluster * 0.92);
      const pulseWave = Math.sin(angle * 0.86 - radius * 14.0 + membranePulse * 6.0 + phase * 0.8);
      const pulseWaveB = Math.cos(angle * 0.64 + radius * 11.0 - membranePulse * 4.8 + phase * 0.4);
      const tangentX = -bz / Math.max(0.001, radius);
      const tangentZ = bx / Math.max(0.001, radius);
      const layerPhase = layer * 0.8;
      const layerOrbitGain = layer < 0.5 ? 0.66 : layer < 1.5 ? 1.0 : 1.18;
      const layerLiftGain = layer < 0.5 ? 0.52 : layer < 1.5 ? 0.88 : 1.08;
      const fluidOrbit = pulseEnvelope * (0.001 + cluster * 0.0034) * layerOrbitGain;
      const fluidLift = pulseEnvelope * (0.0008 + cluster * 0.003) * layerLiftGain;
      const depthBias = layer < 0.5 ? 0.012 : layer < 1.5 ? -0.02 : -0.15;
      const layerSpread = layer < 0.5 ? 0.0018 : layer < 1.5 ? 0.003 : 0.0042;
      const layerDrift = Math.sin(t * (0.34 + layer * 0.12) + phase * 1.6 + bx * 9.0);
      const depthSwim = Math.cos(t * (0.44 + sway * 0.08) + phase * 2.1 + by * 8.0);
      const frontBackFlow = layer < 0.5 ? 0.0052 : layer < 1.5 ? 0.0042 : 0.0064;

      coreParticlePositionsRef.current[o] =
        bx +
        Math.sin(angle * 0.92 + bz * 8.0 + layerPhase) * (0.0014 + cluster * 0.0042 + layerSpread) +
        livingCurl * cluster * 0.0032 -
        bx * centerPull * (0.12 + shimmer * 0.08) +
        tangentX * pulseWave * fluidOrbit +
        bx * pulseWaveB * pulseEnvelope * 0.0008 +
        layerDrift * layerSpread;
      coreParticlePositionsRef.current[o + 1] =
        by +
        Math.cos(angle * 0.66 + bx * 6.0 + layerPhase) * (0.0018 + cluster * 0.0052 + layerSpread) +
        livingLift * cluster * 0.0036 +
        pulseWaveB * fluidLift +
        pulseEnvelope * (0.0012 + layer * 0.0004) +
        breathFill * (0.001 + cluster * 0.0022) +
        layerDrift * layerSpread * 0.7;
      coreParticlePositionsRef.current[o + 2] =
        bz +
        Math.sin(angle * 0.76 + by * 7.0 + layerPhase) * (0.0022 + cluster * 0.0052 + layerSpread) +
        tangentZ * pulseWave * fluidOrbit +
        shimmer * cluster * 0.0024 -
        bz * centerPull * (0.1 + shimmer * 0.08) +
        depthBias +
        pulseWaveB * pulseEnvelope * 0.0028 +
        depthSwim * frontBackFlow -
        heartClamp * cluster * 0.0042 -
        layer * 0.008;
    }
    corePositionAttr.needsUpdate = true;

    coreBackLightRef.current.position.set(-0.012, -0.02, -0.44);
    coreBackLightRef.current.intensity = sourceSpark * (13.4 + orbResponse * 8.2) + centerSpark * 0.54;
    coreFillLightRef.current.position.set(tiltY * 0.12, 0.03 - tiltX * 0.08, -0.32);
    coreFillLightRef.current.intensity = sourceSpark * (3.8 + orbResponse * 2.8) + orbResponse * 0.72 + centerSpark * 0.82;
    coreFillLightRef.current.distance = 2.2;
    coreCenterLightRef.current.position.set(
      tiltY * 0.12,
      -0.01 - tiltX * 0.1,
      -0.18
    );
    coreCenterLightRef.current.intensity = centerSpark * (2.4 + orbResponse * 1.6);
    coreCenterLightRef.current.distance = 2.0;
    coreBackLightRef.current.distance = 1.56;
  });

  return (
    <>
      <ambientLight intensity={0.011} />
      <directionalLight position={[2.6, 2.6, 3.4]} intensity={0.28} color="#f6fbff" />
      <directionalLight position={[-2.4, -1.7, 2.4]} intensity={0.05} color="#d7e7ff" />
      <pointLight position={[0.14, -0.2, -0.94]} intensity={0.015} color="#b8d6ff" />
      <pointLight
        ref={coreBackLightRef}
        position={[-0.012, -0.02, -0.42]}
        intensity={0}
        distance={1.35}
        decay={2}
        color="#a6ecff"
      />
      <pointLight
        ref={coreFillLightRef}
        position={[0.0, 0.02, -0.32]}
        intensity={0}
        distance={2.2}
        decay={2}
        color="#8fdcff"
      />
      <pointLight
        ref={coreCenterLightRef}
        position={[0.0, -0.01, -0.26]}
        intensity={0}
        distance={1.7}
        decay={2}
        color="#d5fbff"
      />

      <group ref={pulseUnitRef}>
        <mesh ref={orbMediumRef} geometry={orbShellGeometry} renderOrder={1}>
          <shaderMaterial
            uniforms={orbMediumUniforms}
            vertexShader={VOLUME_VERTEX_SHADER}
            fragmentShader={ORB_MEDIUM_FRAGMENT_SHADER}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>

        <mesh ref={orbTopRippleRef} geometry={topSurfaceRippleGeometry} renderOrder={2}>
          <shaderMaterial
            uniforms={orbTopRippleUniforms}
            vertexShader={MENISCUS_TOP_RIPPLE_VERTEX_SHADER}
            fragmentShader={MENISCUS_TOP_RIPPLE_FRAGMENT_SHADER}
            transparent
            depthWrite={false}
            depthTest
            side={THREE.DoubleSide}
            blending={THREE.NormalBlending}
          />
        </mesh>

        <mesh ref={orbOuterCarrierRef} geometry={orbShellGeometry} renderOrder={3}>
          <shaderMaterial
            uniforms={orbOuterCarrierUniforms}
            vertexShader={VOLUME_VERTEX_SHADER}
            fragmentShader={ORB_OUTER_CARRIER_FRAGMENT_SHADER}
            transparent
            depthWrite={false}
            blending={THREE.NormalBlending}
            side={THREE.FrontSide}
          />
        </mesh>

        <mesh ref={orbShellRef} geometry={orbShellGeometry} renderOrder={4}>
          <shaderMaterial
            uniforms={orbShellUniforms}
            vertexShader={VOLUME_VERTEX_SHADER}
            fragmentShader={VESSEL_SHELL_FRAGMENT_SHADER}
            transparent
            depthWrite={false}
            side={THREE.FrontSide}
          />
        </mesh>

        <points ref={orbParticlesRef} geometry={orbParticleGeometry} renderOrder={2}>
          <shaderMaterial
            uniforms={orbParticleUniforms}
            vertexShader={ROUND_PARTICLE_VERTEX_SHADER}
            fragmentShader={ROUND_PARTICLE_FRAGMENT_SHADER}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>

        <points ref={orbBubblesRef} geometry={orbBubbleGeometry} renderOrder={3}>
          <shaderMaterial
            uniforms={orbBubbleUniforms}
            vertexShader={BUBBLE_VERTEX_SHADER}
            fragmentShader={BUBBLE_FRAGMENT_SHADER}
            transparent
            depthWrite={false}
            depthTest
            blending={THREE.NormalBlending}
          />
        </points>

        <group ref={coreGroupRef}>
          <mesh ref={coreMembraneRef} geometry={coreMembraneGeometry} position={[0, 0, -0.01]} renderOrder={7}>
            <meshPhysicalMaterial
              color="#eef7ff"
              emissive="#74cae3"
              emissiveIntensity={0}
              transmission={1}
              roughness={0.038}
              thickness={3.1}
              ior={1.24}
              metalness={0}
              transparent
              opacity={0.084}
              clearcoat={1}
              clearcoatRoughness={0.082}
              attenuationColor="#bfd9ee"
              attenuationDistance={1.12}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>

          <mesh ref={coreBodyRef} geometry={coreBodyGeometry} position={[0, -0.007, -0.052]} renderOrder={5}>
            <shaderMaterial
              uniforms={coreBodyUniforms}
              vertexShader={VOLUME_VERTEX_SHADER}
              fragmentShader={ORGANISM_VOLUME_FRAGMENT_SHADER}
              transparent
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>

          <points ref={coreBreathBubblesRef} geometry={coreBreathBubbleGeometry} renderOrder={6.2}>
            <shaderMaterial
              uniforms={coreBreathBubbleUniforms}
              vertexShader={CORE_BREATH_BUBBLE_VERTEX_SHADER}
              fragmentShader={CORE_BREATH_BUBBLE_FRAGMENT_SHADER}
              transparent
              depthWrite={false}
              depthTest
              blending={THREE.AdditiveBlending}
            />
          </points>

          <points ref={coreParticlesRef} geometry={coreParticleGeometry} renderOrder={6}>
            <shaderMaterial
              uniforms={coreParticleUniforms}
              vertexShader={CORE_PARTICLE_VERTEX_SHADER}
              fragmentShader={CORE_PARTICLE_FRAGMENT_SHADER}
              transparent
              depthWrite={false}
              depthTest
              blending={THREE.AdditiveBlending}
            />
          </points>

          <mesh ref={coreGlowRef} geometry={coreSourceGeometry} renderOrder={8}>
            <shaderMaterial
              uniforms={coreGlowUniforms}
              vertexShader={VOLUME_VERTEX_SHADER}
              fragmentShader={BURIED_SOURCE_FRAGMENT_SHADER}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
            />
          </mesh>

          <mesh ref={coreCenterGlowRef} geometry={coreSourceGeometry} renderOrder={8}>
            <shaderMaterial
              uniforms={coreCenterUniforms}
              vertexShader={VOLUME_VERTEX_SHADER}
              fragmentShader={BURIED_SOURCE_FRAGMENT_SHADER}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
            />
          </mesh>

          <mesh ref={coreSourceRef} geometry={coreSourceGeometry} renderOrder={9}>
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      </group>
    </>
  );
}


