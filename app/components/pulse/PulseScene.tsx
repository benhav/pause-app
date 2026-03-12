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

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
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

  vec3 lightA = normalize(vec3(0.82, 0.56, 0.44));
  vec3 lightB = normalize(vec3(-0.72, -0.24, 0.58));
  float specA = pow(max(dot(n, normalize(lightA + v)), 0.0), 52.0);
  float specB = pow(max(dot(n, normalize(lightB + v)), 0.0), 24.0);

  float silhouette = smoothstep(0.68, 1.0, rim);
  float lowerLens = smoothstep(-0.94, -0.06, vLocalPos.y) * smoothstep(-0.86, 0.4, -vLocalPos.z);
  float breathingBand = smoothstep(-0.26, 0.78, vLocalPos.y + uBreath * 0.08) * smoothstep(0.26, 0.86, rim);
  float pulseEcho = smoothstep(-0.72, 0.32, -vLocalPos.z) * smoothstep(0.18, 0.74, rim) * uPulse;

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

  vec3 deep = vec3(0.03, 0.07, 0.14);
  vec3 glass = vec3(0.18, 0.34, 0.54);
  vec3 edge = vec3(0.94, 0.98, 1.0);
  vec3 caustic = vec3(0.64, 0.84, 1.0);

  vec3 color = mix(deep, glass, lowerLens * 0.08 + pulseEcho * 0.18 + breathingBand * 0.05 + innerScatter * 0.06 + sourceLift * 0.04);
  color += edge * (silhouette * 0.74 + specA * 0.76 + specB * 0.2);
  color += caustic * (pulseRays * 0.34 + centerArcA * 0.78 + centerArcB * 0.62 + sideArcA * 0.7 + sideArcB * 0.7 + backArc * 0.72 + fluidTravelA * 0.46 + fluidTravelB * 0.38 + ceilingGlow * 0.14 + innerScatter * 0.14 + backRimPulse * 0.28 + tiltSweep * 0.1 + restHalo * 0.18 + restArcA * 0.28 + restArcB * 0.28 + restBack * 0.24);

  float alpha = 0.008;
  alpha += silhouette * 0.38;
  alpha += specA * 0.18;
  alpha += specB * 0.05;
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
  alpha = clamp(alpha, 0.0, 0.64);

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

  vec3 deep = vec3(0.06, 0.12, 0.18);
  vec3 aqua = vec3(0.28, 0.48, 0.58);
  vec3 membraneEdge = vec3(0.84, 0.97, 1.0);
  vec3 pulseGlow = vec3(0.76, 0.95, 1.0);

  vec3 body = mix(deep, aqua, 0.04 + bodyDepth * 0.08 + tissueNoise * 0.025);
  body += membraneEdge * membrane * (0.06 + uSource * 0.24);
  body += pulseGlow * sourceCore * uSource * 1.14;
  body += vec3(0.12, 0.24, 0.32) * edgeShell * 0.03;
  body -= vec3(0.04, 0.05, 0.06) * innerShadow * 0.22;
  body += membraneEdge * uPulse * 0.045;
  body += pulseGlow * centerPulse * 1.24;
  body += pulseGlow * (glintA * 0.42 + glintB * 0.32);
  body += pulseGlow * tissueBloom * 0.4;

  float alpha = 0.018;
  alpha += bodyDepth * 0.045;
  alpha += edgeShell * 0.03;
  alpha += membrane * (0.02 + uSource * 0.06);
  alpha += centerPulse * 0.082;
  alpha += glintA * 0.05 + glintB * 0.04;
  alpha += tissueBloom * 0.032;
  alpha -= sourceCore * uSource * 0.018;
  alpha = clamp(alpha, 0.0, 0.14);

  gl_FragColor = vec4(body, alpha);
}
`;

const BURIED_SOURCE_FRAGMENT_SHADER = `
uniform float uSource;
varying vec3 vLocalPos;

void main() {
  float d = length(vLocalPos);
  float inner = smoothstep(0.12, 0.0, d);
  float halo = smoothstep(0.48, 0.0, d) * 0.14;
  float pulse = smoothstep(0.015, 0.14, uSource);
  float alpha = (inner * 0.54 + halo * 1.1) * pulse * 0.58;

  if (alpha < 0.008) discard;

  vec3 color = mix(vec3(0.7, 0.9, 0.96), vec3(1.0), inner * 0.6);
  gl_FragColor = vec4(color, alpha);
}
`;

export default function PulseScene({ bridge }: Props) {
  const pulseUnitRef = useRef<THREE.Group>(null!);
  const orbShellRef = useRef<THREE.Mesh>(null!);
  const orbParticlesRef = useRef<THREE.Points>(null!);
  const coreGroupRef = useRef<THREE.Group>(null!);
  const coreMembraneRef = useRef<THREE.Mesh>(null!);
  const coreBodyRef = useRef<THREE.Mesh>(null!);
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
  const previousSpinRef = useRef(0);
  const previousTiltXRef = useRef(0);
  const previousTiltYRef = useRef(0);
  const restLightRef = useRef(1);

  const orbEmitterTemps = useMemo(
    () => ({
      centerWorld: new THREE.Vector3(),
      sideAWorld: new THREE.Vector3(),
      sideBWorld: new THREE.Vector3(),
      backWorld: new THREE.Vector3(),
      centerLocal: new THREE.Vector3(),
      sideALocal: new THREE.Vector3(),
      sideBLocal: new THREE.Vector3(),
      backLocal: new THREE.Vector3(),
    }),
    []
  );

  const orbShellUniforms = useMemo(
    () => ({ uPulse: { value: 0 }, uBreath: { value: 0 }, uSource: { value: 0 }, uCenter: { value: 0 }, uRest: { value: 1 }, uTime: { value: 0 }, uTilt: { value: new THREE.Vector2() }, uEmitCenter: { value: new THREE.Vector3() }, uEmitSideA: { value: new THREE.Vector3() }, uEmitSideB: { value: new THREE.Vector3() }, uEmitBack: { value: new THREE.Vector3() } }),
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
  const coreParticleUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color("#eefcff") },
      uOpacity: { value: 0.01 },
    }),
    []
  );

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

  const coreParticleField = useMemo(
    () =>
      makeSuspendedParticleField(180, {
        minRadius: 0.03,
        maxRadius: 0.23,
        yStretch: 1.08,
        radialBias: 0.86,
        sizeMin: 0.12,
        sizeMax: 0.36,
        alphaMin: 0.01,
        alphaMax: 0.05,
        zFlatten: 0.92,
      }),
    []
  );
  const coreParticlePositions = useMemo(
    () => new Float32Array(coreParticleField.base),
    [coreParticleField]
  );
  const coreParticlePositionsRef = useRef<Float32Array>(coreParticlePositions);
  const coreParticleGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(coreParticlePositions, 3)
    );
    geometry.setAttribute("aSize", new THREE.BufferAttribute(coreParticleField.size, 1));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(coreParticleField.alpha, 1));
    geometry.computeBoundingSphere();
    return geometry;
  }, [coreParticleField.alpha, coreParticleField.size, coreParticlePositions]);

  useEffect(() => {
    return () => {
      orbParticleGeometry.dispose();
      coreParticleGeometry.dispose();
    };
  }, [coreParticleGeometry, orbParticleGeometry]);

  useFrame((state, delta) => {
    if (
      !pulseUnitRef.current ||
      !orbShellRef.current ||
      !orbParticlesRef.current ||
      !coreGroupRef.current ||
      !coreMembraneRef.current ||
      !coreBodyRef.current ||
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
    const spinDelta = Math.abs(spin - previousSpinRef.current);
    const tiltDelta = Math.abs(tiltX - previousTiltXRef.current) + Math.abs(tiltY - previousTiltYRef.current);
    previousSpinRef.current = spin;
    previousTiltXRef.current = tiltX;
    previousTiltYRef.current = tiltY;
    const motionSample = THREE.MathUtils.clamp(spinDelta * 7 + tiltDelta * 22, 0, 1);
    const targetRest = 1 - THREE.MathUtils.smoothstep(motionSample, 0.01, 0.18);
    restLightRef.current = THREE.MathUtils.lerp(restLightRef.current, targetRest, 0.12);
    const beatNorm = beat / 1.2;
    const beatInstant = clamp01((beat - 0.06) / 0.42);

    sourceFlashRef.current = Math.max(sourceFlashRef.current - dt * 2.45, beatInstant);
    orbEchoRef.current = Math.max(orbEchoRef.current - dt * 0.62, 0);
    orbEchoRef.current = Math.max(orbEchoRef.current, sourceFlashRef.current * 0.96);

    const sourceSpark = Math.pow(sourceFlashRef.current, 0.64);
    const orbResponse = Math.pow(orbEchoRef.current, 0.86);
    const membranePulse = Math.max(
      orbResponse * 0.72,
      Math.pow(clamp01((beatNorm - 0.04) / 0.96), 0.74)
    );
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

    coreGroupRef.current.position.set(
      tiltY * 0.006,
      -0.004 - tiltX * 0.006 + breathFill * 0.012,
      -0.03 + sourceSpark * 0.022 + inhale * 0.008 - exhale * 0.004
    );
    coreGroupRef.current.rotation.x = tiltX * 0.12 + Math.sin(t * 0.66) * 0.018;
    coreGroupRef.current.rotation.z = tiltY * 0.1 - Math.cos(t * 0.58) * 0.014;
    coreGroupRef.current.rotation.y = spin * 0.06 + Math.sin(t * 0.34) * 0.02;

    coreMembraneRef.current.scale.set(
      0.998 - breathFill * 0.012 + sourceSpark * 0.01 + shellPulse * 0.38 + shellWaveC * 0.14,
      1.018 + breathFill * 0.042 + inhale * 0.012 - exhale * 0.008 + sourceSpark * 0.03 + shellPulse * 1.05,
      0.986 - breathFill * 0.009 + sourceSpark * 0.008 + shellPulse * 0.28 - shellWaveC * 0.1
    );

    coreBodyRef.current.position.set(
      -0.002 + Math.sin(t * 0.5) * 0.002,
      -0.007 + breathFill * 0.009,
      -0.052 + sourceSpark * 0.03 + inhale * 0.006 - exhale * 0.003
    );
    coreBodyRef.current.rotation.x = 0.045 + Math.sin(t * 0.58) * 0.015;
    coreBodyRef.current.rotation.y = -0.035 + Math.cos(t * 0.46) * 0.02;
    coreBodyRef.current.rotation.z = 0.02 + Math.sin(t * 0.4) * 0.012;
    coreBodyRef.current.scale.set(
      0.994 - breathFill * 0.011 + sourceSpark * 0.014 + shellPulse * 0.32 + shellWaveC * 0.12,
      1.0 + breathFill * 0.034 + inhale * 0.008 - exhale * 0.006 + sourceSpark * 0.02 + shellPulse * 0.94,
      0.97 - breathFill * 0.007 + sourceSpark * 0.01 + shellPulse * 0.22 - shellWaveC * 0.08
    );

    coreSourceRef.current.position.set(0.0, -0.008, -0.18);
    coreSourceRef.current.scale.setScalar(0.0001 + sourceSpark * 0.065);

    coreGlowRef.current.position.copy(coreSourceRef.current.position);
    coreGlowRef.current.scale.set(
      0.0001 + sourceSpark * 0.34 + orbResponse * 0.03,
      0.0001 + sourceSpark * 0.34 + orbResponse * 0.03,
      0.0001 + sourceSpark * 0.24 + orbResponse * 0.02
    );
    coreCenterGlowRef.current.position.set(
      tiltY * 0.018 + Math.sin(t * 0.82) * 0.004,
      -0.002 - tiltX * 0.014 + breathFill * 0.004 + Math.cos(t * 0.74) * 0.003,
      -0.09 + sourceSpark * 0.018 + Math.sin(t * 0.58) * 0.005
    );
    coreCenterGlowRef.current.scale.set(
      0.0001 + centerSpark * 0.19,
      0.0001 + centerSpark * 0.19,
      0.0001 + centerSpark * 0.14
    );

    pulseUnitRef.current.updateWorldMatrix(true, true);
    orbShellRef.current.updateWorldMatrix(true, false);
    coreGroupRef.current.updateWorldMatrix(true, true);

    coreCenterGlowRef.current.getWorldPosition(orbEmitterTemps.centerWorld);
    coreMembraneRef.current.localToWorld(orbEmitterTemps.sideAWorld.set(-0.22, -0.01, -0.01));
    coreMembraneRef.current.localToWorld(orbEmitterTemps.sideBWorld.set(0.22, -0.01, -0.01));
    coreBodyRef.current.localToWorld(orbEmitterTemps.backWorld.set(0, -0.01, -0.2));

    orbEmitterTemps.centerLocal.copy(orbEmitterTemps.centerWorld);
    orbEmitterTemps.sideALocal.copy(orbEmitterTemps.sideAWorld);
    orbEmitterTemps.sideBLocal.copy(orbEmitterTemps.sideBWorld);
    orbEmitterTemps.backLocal.copy(orbEmitterTemps.backWorld);
    orbShellRef.current.worldToLocal(orbEmitterTemps.centerLocal);
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
    orbShellMaterial.uniforms.uTilt.value.set(tiltY * 5.4, tiltX * 5.4);
    orbShellMaterial.uniforms.uEmitCenter.value.copy(orbEmitterTemps.centerLocal);
    orbShellMaterial.uniforms.uEmitSideA.value.copy(orbEmitterTemps.sideALocal);
    orbShellMaterial.uniforms.uEmitSideB.value.copy(orbEmitterTemps.sideBLocal);
    orbShellMaterial.uniforms.uEmitBack.value.copy(orbEmitterTemps.backLocal);
    coreBodyMaterial.uniforms.uPulse.value = membranePulse;
    coreBodyMaterial.uniforms.uSource.value = sourceSpark;
    coreBodyMaterial.uniforms.uCenter.value = centerSpark;
    coreBodyMaterial.uniforms.uTime.value = t;
    coreBodyMaterial.uniforms.uTilt.value.set(tiltY * 2.8, tiltX * 2.8);
    coreGlowMaterial.uniforms.uSource.value = sourceSpark;
    (coreCenterGlowRef.current.material as THREE.ShaderMaterial).uniforms.uSource.value = centerSpark;

    coreMembraneMaterial.emissiveIntensity = sourceSpark * 0.26 + orbResponse * 0.05;
    coreMembraneMaterial.opacity = 0.17 + sourceSpark * 0.082;
    coreMembraneMaterial.thickness = 3.18 + breathFill * 0.14 + orbResponse * 0.08;

    const orbParticleMaterial = orbParticlesRef.current.material as THREE.ShaderMaterial;
    const coreParticleMaterial = coreParticlesRef.current.material as THREE.ShaderMaterial;
    orbParticleMaterial.uniforms.uOpacity.value =
      0.014 + orbResponse * 0.05 + sourceSpark * 0.02 + inhale * 0.014;
    coreParticleMaterial.uniforms.uOpacity.value =
      0.004 + sourceSpark * 0.12;

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

    const corePositionAttr = coreParticlesRef.current.geometry
      .attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < coreParticleField.phase.length; i++) {
      const o = i * 3;
      const bx = coreParticleField.base[o];
      const by = coreParticleField.base[o + 1];
      const bz = coreParticleField.base[o + 2];
      const phase = coreParticleField.phase[i];
      const sway = coreParticleField.sway[i];
      const radius = Math.sqrt(bx * bx + by * by + bz * bz);
      const angle = t * (0.08 + sway * 0.06) + phase;
      const cluster = 1 - clamp01(radius / 0.23);

      coreParticlePositionsRef.current[o] =
        bx + Math.sin(angle * 0.92) * (0.002 + cluster * 0.005);
      coreParticlePositionsRef.current[o + 1] =
        by + Math.cos(angle * 0.66) * (0.003 + cluster * 0.005) + sourceSpark * 0.016;
      coreParticlePositionsRef.current[o + 2] =
        bz + Math.sin(angle * 0.76) * (0.002 + cluster * 0.004) - 0.04 + sourceSpark * 0.03;
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
        <mesh ref={orbShellRef} geometry={orbShellGeometry}>
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

        <group ref={coreGroupRef}>
          <mesh ref={coreMembraneRef} geometry={coreMembraneGeometry} position={[0, 0, -0.01]}>
            <meshPhysicalMaterial
              color="#cbeefa"
              emissive="#78d6ef"
              emissiveIntensity={0}
              transmission={0.99}
              roughness={0.045}
              thickness={3.1}
              ior={1.18}
              metalness={0}
              transparent
              opacity={0.16}
              clearcoat={1}
              clearcoatRoughness={0.018}
              attenuationColor="#84d7e8"
              attenuationDistance={0.92}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>

          <mesh ref={coreBodyRef} geometry={coreBodyGeometry} position={[0, -0.007, -0.052]}>
            <shaderMaterial
              uniforms={coreBodyUniforms}
              vertexShader={VOLUME_VERTEX_SHADER}
              fragmentShader={ORGANISM_VOLUME_FRAGMENT_SHADER}
              transparent
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>

          <points ref={coreParticlesRef} geometry={coreParticleGeometry} renderOrder={7}>
            <shaderMaterial
              uniforms={coreParticleUniforms}
              vertexShader={ROUND_PARTICLE_VERTEX_SHADER}
              fragmentShader={ROUND_PARTICLE_FRAGMENT_SHADER}
              transparent
              depthWrite={false}
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