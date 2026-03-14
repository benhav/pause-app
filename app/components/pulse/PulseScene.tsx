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
    const radius = THREE.MathUtils.lerp(0.46, 0.8, Math.pow(Math.random(), 0.56));

    let x = radius * sinPhi * Math.cos(theta);
    const y = radius * u * 0.92;
    let z = radius * sinPhi * Math.sin(theta);

    // Keep the field outside the core while biasing the initial seed slightly behind it.
    if (Math.abs(x) < 0.24 && Math.abs(y) < 0.34 && z > -0.22) {
      z -= 0.26;
      x += Math.sign(x || 1) * 0.12;
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

  vec3 lightA = normalize(vec3(0.82, 0.56, 0.44));
  vec3 lightB = normalize(vec3(-0.72, -0.24, 0.58));
  float specA = pow(max(dot(n, normalize(lightA + v)), 0.0), 52.0);
  float specB = pow(max(dot(n, normalize(lightB + v)), 0.0), 24.0);

  float silhouette = smoothstep(0.68, 1.0, rim);
  float frontGlass = smoothstep(0.14, 0.86, ndv) * smoothstep(-0.12, 0.92, vLocalPos.z);
  float sideWall = smoothstep(0.24, 0.96, rim) * smoothstep(-0.96, 0.2, -vLocalPos.z);
  float backWall = smoothstep(-0.98, 0.12, -vLocalPos.z) * (0.16 + smoothstep(0.08, 0.74, ndv) * 0.84);
  float wallThickness = sideWall * (0.58 + uMotion * 0.18) + backWall * 0.72 + frontGlass * 0.34;
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
  vec3 frontTint = vec3(0.48, 0.62, 0.74);
  vec3 backTint = vec3(0.1, 0.18, 0.32);
  vec3 edge = vec3(0.94, 0.98, 1.0);
  vec3 caustic = vec3(0.64, 0.84, 1.0);

  vec3 color = mix(deep, glass, lowerLens * 0.08 + pulseEcho * 0.18 + breathingBand * 0.05 + innerScatter * 0.06 + sourceLift * 0.04 + backWall * 0.12);
  color += frontTint * frontGlass * 0.08;
  color += backTint * backWall * 0.16;
  color += edge * (silhouette * 0.74 + specA * 0.76 + specB * 0.2 + sideWall * 0.24 + frontGlass * 0.08);
  color += caustic * (pulseRays * 0.34 + centerArcA * 0.78 + centerArcB * 0.62 + sideArcA * 0.7 + sideArcB * 0.7 + backArc * 0.72 + fluidTravelA * 0.46 + fluidTravelB * 0.38 + ceilingGlow * 0.14 + innerScatter * 0.14 + backRimPulse * 0.28 + tiltSweep * 0.1 + restHalo * 0.18 + restArcA * 0.28 + restArcB * 0.28 + restBack * 0.24);
  color += glass * wallThickness * 0.08;

  float alpha = 0.008;
  alpha += silhouette * 0.38;
  alpha += frontGlass * 0.028;
  alpha += sideWall * 0.058;
  alpha += backWall * 0.052;
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
  float rim = 1.0 - ndv;
  float frontFace = gl_FrontFacing ? 1.0 : 0.0;
  float backFace = 1.0 - frontFace;

  vec3 warpedPos = vec3(vLocalPos.x * 0.98, vLocalPos.y * 1.01, vLocalPos.z * 0.98);
  float radial = length(warpedPos.xy);
  float sideDensity = smoothstep(0.08, 0.98, radial);
  float backDepth = smoothstep(-0.98, 0.1, -warpedPos.z);
  float frontDepth = smoothstep(-0.12, 0.94, warpedPos.z);
  float upperDome = smoothstep(0.12, 0.96, warpedPos.y);
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
  float pulseEdgeBand = smoothstep(0.8, 0.98, surfaceRadius) * (1.0 - smoothstep(0.99, 1.08, surfaceRadius)) * topSurfaceZone * frontFace;
  float pulseEdgeNoiseA = 0.5 + 0.5 * sin(domeAngle * 22.0 + uTime * 1.8 + surfaceRadius * 18.0);
  float pulseEdgeNoiseB = 0.5 + 0.5 * sin(domeAngle * 31.0 - uTime * 1.2 + surfaceRadius * 27.0);
  float pulseEdgeSkvulp = (pow(pulseEdgeNoiseA, 4.2) * 0.68 + pow(pulseEdgeNoiseB, 4.0) * 0.34) * pulseEdgeBand * pulseEdgeArrival * uPulse;
  float inhaleBulge = inhaleBias * (0.017 * centerProfile + 0.004 * shoulderProfile);
  float exhaleCenterDrop = exhaleBias * (0.014 * centerProfile + 0.005 * shoulderProfile);
  float exhaleEdgeLift = exhaleBias * edgeProfile * 0.0034;
  float pulseCenterDip = (1.0 - smoothstep(0.0, 0.16, pulseTravel)) * pulseCenterProfile * uPulse * 0.018;
  float meniscusCenter = 0.813 - radial * 0.009 + inhaleBulge - exhaleCenterDrop + exhaleEdgeLift + slosh + calmWaveA + calmWaveB + pulseRipple - pulseCenterDip + pulseEdgeSkvulp * 0.0032;
  float meniscusBand = smoothstep(meniscusCenter - 0.018, meniscusCenter + 0.042, warpedPos.y) * smoothstep(0.08, 0.92, radial) * frontFace;
  float meniscusRim = smoothstep(0.08, 0.58, meniscusBand) * smoothstep(0.12, 0.88, sideDensity);
  float waveCarry = meniscusRim * (0.18 + abs(uBreath) * 0.28 + uMotion * 0.08 + uPulse * 0.12);
  float liquidMask = 1.0 - smoothstep(meniscusCenter - 0.01, meniscusCenter + 0.028, warpedPos.y);
  float surfaceBand = 1.0 - smoothstep(0.002, 0.013, abs(warpedPos.y - meniscusCenter));
  float visibleTopFace = max(backFace, frontFace * 0.12);
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
  float topReflect = smoothstep(meniscusCenter - 0.03, meniscusCenter + 0.012, warpedPos.y) * smoothstep(0.06, 0.9, radial) * frontFace;
  float topReflectHalo = smoothstep(meniscusCenter - 0.048, meniscusCenter + 0.028, warpedPos.y) * smoothstep(0.02, 0.82, radial) * frontFace;
  float topReflectDrift = 0.5 + 0.5 * sin(domeAngle * 2.1 + uTime * 0.42 + uFlow * 2.2);
  float topReflectLight = topReflect * (0.6 + uCenter * 0.46 + uSource * 0.3 + uPulse * 0.2) * (0.92 + topReflectDrift * 0.28);
  float topReflectLift = topReflectHalo * (0.14 + uCenter * 0.16 + uSource * 0.08);

  vec3 deep = vec3(0.07, 0.13, 0.19);
  vec3 liquid = vec3(0.24, 0.38, 0.48);
  vec3 edge = vec3(0.72, 0.86, 0.95);
  vec3 carry = vec3(0.78, 0.92, 1.0);

  vec3 color = mix(deep, liquid, backFace * 0.58 + sideDensity * 0.12 + lowerBasin * 0.06);
  color += liquid * frontFace * 0.08;
  color *= liquidMask;
  color += edge * meniscusRim * 0.24;
  color += vec3(0.92, 0.98, 1.0) * pulseEdgeSkvulp * 0.42;
  color += carry * waveCarry * 0.34;
  color += vec3(0.94, 0.99, 1.0) * pulseSurfaceLines * 1.9;
  color += vec3(0.97, 1.0, 1.0) * pulsePlop * 0.7;
  color += vec3(0.92, 0.98, 1.0) * pulseCrest;
  color += vec3(0.9, 0.97, 1.0) * topReflectLift * 0.92;
  color += vec3(0.97, 1.0, 1.0) * topReflectLight * 1.74;
  color += edge * (sideDensity * 0.08 + lowerBasin * 0.04) * liquidMask;
  color += carry * (motionSweep * 0.08 + carryBand * 0.14) * liquidMask;

  float alpha = 0.01;
  alpha += (frontFace * (0.016 + frontDepth * 0.008));
  alpha += (backFace * (0.05 + backDepth * 0.028));
  alpha += sideDensity * 0.04;
  alpha += lowerBasin * 0.02;
  alpha += motionSweep * 0.01;
  alpha += carryBand * 0.02;
  alpha *= liquidMask;
  alpha += meniscusRim * 0.04;
  alpha += pulseEdgeSkvulp * 0.024;
  alpha += pulseSurfaceLines * 0.088;
  alpha += pulsePlop * 0.05;
  alpha += pulseCrest * 0.02;
  alpha += topReflectLift * 0.034;
  alpha += topReflectLight * 0.112;
  alpha = clamp(alpha, 0.0, 0.2);

  gl_FragColor = vec4(color, alpha);
}
`;

const MENISCUS_TOP_RIPPLE_FRAGMENT_SHADER = `
uniform float uPulse;
uniform float uPulseTravel;
uniform float uImpact;
uniform float uPlopProgress;
uniform float uPlopImpact;
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
  float baseRadius = length(vRippleUv);
  vec2 sourceDelta = vRippleUv - uSourceUv;
  float topRadius = length(sourceDelta);
  float rippleAngle = atan(vRippleUv.y - uSourceUv.y, vRippleUv.x - uSourceUv.x);
  float topMask = 1.0 - smoothstep(0.94, 1.08, baseRadius);
  if (topMask < 0.002) discard;

  float beat = clamp(uImpact, 0.0, 1.0);
  float travel = clamp(uPulseTravel, 0.0, 1.0);
  float plopBeat = clamp(uPlopImpact, 0.0, 1.0);
  float plopTravel = clamp(uPlopProgress, 0.0, 1.0);
  float carryTravel = clamp(uCarryProgress, 0.0, 1.0);
  float carryBeat = clamp(uCarryImpact, 0.0, 1.0);
  float edgeMemoryTravel = clamp(uEdgeMemoryProgress, 0.0, 1.0);
  float edgeMemory = clamp(uEdgeMemory, 0.0, 1.0);
  float settleTravel = clamp(uSettleProgress, 0.0, 1.0);
  float settleImpact = clamp(uSettleImpact, 0.0, 1.0);
  float edgeBand = smoothstep(0.9, 0.995, baseRadius) * (1.0 - smoothstep(1.0, 1.06, baseRadius));
  float centerMask = (1.0 - smoothstep(0.0, 0.2, topRadius)) * topMask;
  float centerTight = (1.0 - smoothstep(0.0, 0.065, topRadius)) * topMask;
  float centerLipRadius = mix(0.02, 0.062, smoothstep(0.06, 0.28, plopTravel));
  float centerLip = (1.0 - smoothstep(0.006, 0.026, abs(topRadius - centerLipRadius))) * centerMask;
  float centerOuterLipRadius = centerLipRadius * 1.6;
  float centerOuterLip = (1.0 - smoothstep(0.012, 0.036, abs(topRadius - centerOuterLipRadius))) * centerMask;
  float edgeArrival = exp(-pow((mix(0.06, 1.12, travel) - 1.02) / 0.14, 2.0));

  float edgeSeedA = 0.5 + 0.5 * cos(baseRadius * 42.0 - uTime * 0.4 + uFlow * 0.02);
  float edgeSeedB = 0.5 + 0.5 * cos(baseRadius * 64.0 + uTime * 0.34 - uFlow * 0.02);
  float edgePreludeBand = smoothstep(0.75, 0.97, baseRadius) * (1.0 - smoothstep(0.995, 1.085, baseRadius)) * topMask;
  float edgePrelude = (1.0 - smoothstep(0.02, 0.2, plopTravel)) * plopBeat * edgePreludeBand;
  float edgeTouch = pow(edgeArrival, 1.18);
  float edgeWake = smoothstep(0.58, 1.0, travel) * exp(-pow((mix(0.06, 1.12, travel) - 1.02) / 0.18, 2.0)) * beat * topMask;
  float edgeHit = smoothstep(0.84, 1.0, travel) * exp(-pow((mix(0.06, 1.12, travel) - 1.01) / 0.11, 2.0)) * beat * topMask;
  float edgeWakeLong = smoothstep(0.78, 1.0, travel) * exp(-pow((mix(0.06, 1.12, travel) - 1.015) / 0.2, 2.0)) * beat * topMask;
  float edgeReturnEnvelope = edgeMemory * exp(-pow((edgeMemoryTravel - 0.34) / 0.44, 2.0));
  float settleEnvelope = settleImpact * exp(-pow((settleTravel - 0.42) / 0.56, 2.0));
  float settlePulseA = 0.5 + 0.5 * sin(rippleAngle * 7.0 + uTime * 0.82 + settleTravel * 9.0);
  float settlePulseB = 0.5 + 0.5 * sin(rippleAngle * 12.0 - uTime * 0.54 + settleTravel * 13.0);
  float edgeReturnPulseA = 0.5 + 0.5 * sin(rippleAngle * 10.0 + uTime * 1.15 + edgeMemoryTravel * 10.0);
  float edgeReturnPulseB = 0.5 + 0.5 * sin(rippleAngle * 17.0 - uTime * 0.72 + edgeMemoryTravel * 16.0);
  float edgeReturn =
    edgeBand *
    topMask *
    edgeReturnEnvelope *
    (0.42 + edgeReturnPulseA * 0.34 + edgeReturnPulseB * 0.24);
  float edgeWholeRing =
    edgeBand *
    topMask *
    (edgeTouch * 0.18 + edgeWake * 0.18 + edgeHit * 0.34 + edgeWakeLong * 0.58 + edgeReturn * 0.94);
  float edgeSettleBand =
    edgeBand *
    topMask *
    (edgeWakeLong * 0.34 + edgeReturnEnvelope * 0.8 + settleEnvelope * 1.05);
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
    edgeBand *
    topMask *
    settleEnvelope *
    (0.54 + settlePulseA * 0.22 + settlePulseB * 0.16);
  float edgeMemoryTremor =
    (pow(edgeSeedA, 4.0) * 0.24 + pow(edgeSeedB, 4.0) * 0.1) *
    edgeBand *
    topMask *
    edgeReturn *
    0.72;
  float edgeTremor =
    (pow(edgeSeedA, 4.0) * 0.28 + pow(edgeSeedB, 4.0) * 0.11) *
    edgeBand *
    beat *
    topMask *
    (edgeTouch * 0.58 + edgeWake * 0.34 + edgeHit * 0.48 + edgeWakeLong * 0.54 + edgeReturn * 0.46);
  edgeTremor += edgeMemoryTremor;
  edgeTremor += settlePerimeter * 0.18;
  float edgeMemorySlosh =
    (0.5 + 0.5 * sin(rippleAngle * 10.0 + uTime * 0.9 + baseRadius * 24.0)) *
    edgeBand *
    topMask *
    edgeReturn *
    0.96;
  float edgeSlosh =
    (0.5 + 0.5 * sin(rippleAngle * 10.0 + uTime * 0.9 + baseRadius * 24.0)) *
    edgeBand *
    (edgeTouch * 0.16 + edgeWake * 0.44 + edgeHit * 0.82 + edgeWakeLong * 1.18 + edgeReturn * 1.38) *
    beat *
    topMask;
  edgeSlosh += edgeMemorySlosh;
  edgeSlosh += settlePerimeter * 0.32;
  float edgeWholeRingGlow = edgeWholeRing * (0.66 + 0.34 * sin(uTime * 0.62 + baseRadius * 20.0));
  float edgeWholeRingShade = edgeSettleBand * (0.62 + 0.38 * cos(uTime * 0.58 + baseRadius * 17.0));

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
  float carryRing = carryCrest * carryBeat * topMask * 0.82;
  float carryRingShadow = carryTrough * carryBeat * topMask * 0.62;
  float carryReturnRing = carryReturnCrest * carryBeat * carryReturnPhase * topMask * 0.78;
  float carryReturnShadow = carryReturnTrough * carryBeat * carryReturnPhase * topMask * 0.52;
  float bubbleSeedA = 0.5 + 0.5 * sin(rippleAngle * 18.0 + uTime * 1.8 + topRadius * 22.0);
  float bubbleSeedB = 0.5 + 0.5 * sin(rippleAngle * 31.0 - uTime * 1.2 + topRadius * 36.0);
  float edgeMicroBubbles = (pow(bubbleSeedA, 8.0) * 0.08 + pow(bubbleSeedB, 10.0) * 0.04) * edgeBand * (edgeTouch * 0.08 + edgeWake * 0.05 + edgeHit * 0.04) * topMask;
  float waterSpec = pow(1.0 - rim, 2.2) * (
    outwardRing * 1.34 +
    outwardTrail * 0.86 +
    outwardSecond * 0.74 +
    outwardThird * 0.52 +
    centerPlop * 1.02 +
    centerLip * reboundPhase * plopBeat * 0.86 +
    edgeSlosh * 0.18
  );

  vec3 color = vec3(0.0);
  color += vec3(0.03, 0.05, 0.095) * edgePrelude * 0.74;
  color += vec3(0.94, 0.99, 1.0) * edgePrelude * 0.18;
  color += vec3(0.82, 0.93, 1.0) * edgeReturn * 0.22;
  color += vec3(0.9, 0.97, 1.0) * returnRingCrest * 1.62;
  color += vec3(0.02, 0.045, 0.09) * returnRingTrough * 0.94;
  color += vec3(0.94, 0.99, 1.0) * edgeTremor * (0.34 + edgeTouch * 0.28 + edgeWake * 0.14 + edgeHit * 0.18 + edgeWakeLong * 0.18);
  color += vec3(0.94, 0.99, 1.0) * edgeSlosh * (0.08 + edgeTouch * 0.08 + edgeWake * 0.24 + edgeHit * 0.42 + edgeWakeLong * 0.86);
  color += vec3(0.9, 0.97, 1.0) * edgeWholeRingGlow * 0.32;
  color += vec3(0.02, 0.04, 0.078) * edgeWholeRingShade * 0.18;
  color += vec3(0.86, 0.95, 1.0) * settleRingCrest * 1.42;
  color += vec3(0.02, 0.04, 0.078) * settleRingTrough * 0.64;
  color += vec3(0.9, 0.97, 1.0) * settlePerimeter * 0.18;
  color += vec3(0.028, 0.064, 0.13) * centerDip * 3.4;
  color += vec3(1.0, 1.0, 1.0) * centerPlop * 3.28;
  color += vec3(0.94, 0.99, 1.0) * centerLip * reboundPhase * plopBeat * 1.92;
  color += vec3(0.92, 0.98, 1.0) * centerOuterLip * reboundPhase * plopBeat * 0.72;
  color += vec3(1.0, 1.0, 1.0) * outwardRing * 8.9;
  color += vec3(0.02, 0.045, 0.095) * outwardRingShadow * 3.3;
  color += vec3(0.92, 0.98, 1.0) * outwardTrail * 5.2;
  color += vec3(0.03, 0.055, 0.095) * outwardTrailShadow * 2.0;
  color += vec3(0.88, 0.96, 1.0) * outwardSecond * 3.7;
  color += vec3(0.025, 0.05, 0.09) * outwardSecondShadow * 1.5;
  color += vec3(0.84, 0.94, 1.0) * outwardThird * 2.4;
  color += vec3(0.022, 0.042, 0.082) * outwardThirdShadow * 0.98;
  color += vec3(0.92, 0.98, 1.0) * carryRing * 2.18;
  color += vec3(0.024, 0.046, 0.084) * carryRingShadow * 1.06;
  color += vec3(0.86, 0.95, 1.0) * carryReturnRing * 1.84;
  color += vec3(0.02, 0.04, 0.078) * carryReturnShadow * 0.96;
  color += vec3(0.99, 1.0, 1.0) * edgeMicroBubbles * 0.18;
  color += vec3(1.0, 1.0, 1.0) * waterSpec * 3.1;

  float alpha = 0.0;
  alpha += edgePrelude * 0.044;
  alpha += edgeReturn * 0.016;
  alpha += returnRingCrest * 0.1;
  alpha += returnRingTrough * 0.034;
  alpha += edgeTremor * (0.018 + edgeTouch * 0.02 + edgeWake * 0.01 + edgeHit * 0.014 + edgeWakeLong * 0.016);
  alpha += edgeSlosh * (0.008 + edgeTouch * 0.008 + edgeWake * 0.016 + edgeHit * 0.026 + edgeWakeLong * 0.042);
  alpha += edgeWholeRingGlow * 0.018;
  alpha += edgeWholeRingShade * 0.008;
  alpha += settleRingCrest * 0.14;
  alpha += settleRingTrough * 0.042;
  alpha += settlePerimeter * 0.026;
  alpha += centerDip * 0.62;
  alpha += centerPlop * 0.82;
  alpha += centerLip * reboundPhase * plopBeat * 0.48;
  alpha += centerOuterLip * reboundPhase * plopBeat * 0.16;
  alpha += outwardRing * 1.42;
  alpha += outwardRingShadow * 0.42;
  alpha += outwardTrail * 0.96;
  alpha += outwardTrailShadow * 0.28;
  alpha += outwardSecond * 0.66;
  alpha += outwardSecondShadow * 0.21;
  alpha += outwardThird * 0.38;
  alpha += outwardThirdShadow * 0.12;
  alpha += carryRing * 0.44;
  alpha += carryRingShadow * 0.14;
  alpha += carryReturnRing * 0.34;
  alpha += carryReturnShadow * 0.11;
  alpha += edgeMicroBubbles * 0.01;
  alpha += waterSpec * 0.36;
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

  float topPlateMask = 1.0 - smoothstep(0.94, 1.08, baseRadius);
  float centerMask = (1.0 - smoothstep(0.0, 0.2, topRadius)) * topPlateMask;
  float centerTight = (1.0 - smoothstep(0.0, 0.06, topRadius)) * topPlateMask;
  float centerLipRadius = mix(0.02, 0.062, smoothstep(0.06, 0.28, plopTravel));
  float centerLip = (1.0 - smoothstep(0.006, 0.026, abs(topRadius - centerLipRadius))) * centerMask;
  float centerOuterLipRadius = centerLipRadius * 1.6;
  float centerOuterLip = (1.0 - smoothstep(0.012, 0.036, abs(topRadius - centerOuterLipRadius))) * centerMask;

  float dipPhase = 1.0 - smoothstep(0.0, 0.16, plopTravel);
  float reboundPhase = smoothstep(0.05, 0.18, plopTravel) * (1.0 - smoothstep(0.22, 0.42, plopTravel));
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

  float centerCoreDip = centerTight * dipPhase * plopBeat * 0.028;
  float centerDip = centerMask * dipPhase * plopBeat * 0.11;
  float centerRebound = centerMask * reboundPhase * plopBeat * 0.058;
  float vortexCoreRise = centerTight * reboundPhase * plopBeat * 0.026;
  float vortexLipRise = centerLip * reboundPhase * plopBeat * 0.036;
  float vortexOuterLift = centerOuterLip * reboundPhase * plopBeat * 0.014;
  float plopSpike = vortexCoreRise + vortexLipRise + vortexOuterLift;
  float ringLift = (ringCrest * 0.108 - ringTrough * 0.042) * smoothstep(0.06, 1.0, travel) * beat * topPlateMask;
  float trailLift = (trailCrest * 0.056 - trailTrough * 0.022) * smoothstep(0.12, 1.0, travel) * beat * topPlateMask;
  float secondLift = (secondCrest * 0.032 - secondTrough * 0.012) * smoothstep(0.18, 0.92, travel) * beat * topPlateMask;
  float thirdLift = (thirdCrest * 0.012 - thirdTrough * 0.005) * smoothstep(0.26, 0.82, travel) * beat * topPlateMask;
  float edgeSeed = 0.5 + 0.5 * cos(baseRadius * 54.0 - uTime * 0.44 + uFlow * 0.03);
  float edgePreludeBand = smoothstep(0.75, 0.97, baseRadius) * (1.0 - smoothstep(0.995, 1.085, baseRadius)) * topPlateMask;
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
  float edgeReturnEnvelope = edgeMemory * exp(-pow((edgeMemoryTravel - 0.34) / 0.44, 2.0));
  float settleEnvelope = settleImpact * exp(-pow((settleTravel - 0.42) / 0.56, 2.0));
  float settlePulseA = 0.5 + 0.5 * sin(atan(sourceDelta.y, sourceDelta.x) * 7.0 + uTime * 0.82 + settleTravel * 9.0);
  float settlePulseB = 0.5 + 0.5 * sin(atan(sourceDelta.y, sourceDelta.x) * 12.0 - uTime * 0.54 + settleTravel * 13.0);
  float edgeReturn = smoothstep(0.9, 1.02, baseRadius) * topPlateMask * edgeReturnEnvelope;
  float edgeWholeRing =
    smoothstep(0.88, 1.01, baseRadius) *
    topPlateMask *
    (edgeTouch * 0.16 + edgeWake * 0.16 + edgeHit * 0.26 + edgeWakeLong * 0.46 + edgeReturn * 0.92);
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
    topPlateMask *
    settleEnvelope *
    (0.54 + settlePulseA * 0.22 + settlePulseB * 0.16);
  float edgeTremor = pow(edgeSeed, 4.0) * smoothstep(0.88, 1.0, baseRadius) * topPlateMask * (edgeTouch * 0.0014 + edgeWake * 0.0014 + edgeHit * 0.0018 + edgeWakeLong * 0.0032 + edgeReturn * 0.0028);
  float edgeSlosh = (0.5 + 0.5 * sin(atan(sourceDelta.y, sourceDelta.x) * 10.0 + uTime * 0.9 + baseRadius * 24.0)) * smoothstep(0.9, 1.02, baseRadius) * topPlateMask * (edgeTouch * 0.0006 + edgeWake * 0.0012 + edgeHit * 0.0018 + edgeWakeLong * 0.0046 + edgeReturn * 0.0064);
  edgeTremor += settlePerimeter * 0.0022;
  edgeSlosh += settlePerimeter * 0.0048;
  float edgeWholeLift = edgeWholeRing * (0.0016 + 0.0007 * sin(uTime * 0.7 + baseRadius * 18.0));

  float returnRingLift = (returnRingCrest * 0.032 - returnRingTrough * 0.024);
  float carryLift = (carryCrest * 0.024 - carryTrough * 0.014) + (carryReturnCrest * 0.018 - carryReturnTrough * 0.012);
  float settleLift = settleRingCrest * 0.026 - settleRingTrough * 0.016;
  float surfaceY = meniscusCenter - centerDip - centerCoreDip + centerRebound + plopSpike + ringLift + trailLift + secondLift + thirdLift + carryLift + returnRingLift + settleLift - edgePrelude * 0.008 + edgeTremor + edgeSlosh + edgeWholeLift;
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

  float outerRim = smoothstep(0.78, 1.0, rim);
  float innerBand = smoothstep(0.38, 0.72, rim) * (1.0 - smoothstep(0.72, 0.9, rim));
  float upperBow = smoothstep(0.28, 0.98, vLocalPos.y) * smoothstep(0.24, 0.995, rim);
  float sideCarry = smoothstep(0.38, 0.995, rim) * smoothstep(0.14, 0.98, abs(vLocalPos.x));
  float lowerCarry = smoothstep(-0.98, -0.16, vLocalPos.y) * smoothstep(0.38, 0.995, rim);
  float frontLens = smoothstep(0.46, 0.98, ndv) * smoothstep(0.06, 0.98, vLocalPos.y);
  float sideBow = smoothstep(0.18, 0.94, vLocalPos.y) * smoothstep(0.52, 0.98, abs(vLocalPos.x)) * smoothstep(0.34, 0.995, rim);
  float innerWeight = smoothstep(0.08, 0.32, rim) * smoothstep(0.18, 0.96, vLocalPos.y);
  float breathShift = sin(vLocalPos.x * 5.4 + uTime * 0.54 + uBreath * 3.2 + uFlow * 2.8) * (0.008 + abs(uBreath) * 0.01 + abs(uFlow) * 0.006);
  float bowWave = upperBow * (0.82 + breathShift * 2.4);
  float topMirror = smoothstep(0.5, 0.98, vLocalPos.y) * smoothstep(0.3, 0.94, rim) * smoothstep(0.08, 0.94, 1.0 - abs(vLocalPos.x) * 0.8);
  float topMirrorPulse = topMirror * (0.58 + uCenter * 0.38 + uSource * 0.24 + uMotion * 0.1) * (0.9 + 0.2 * sin(uTime * 0.5 + vLocalPos.x * 4.2 + uFlow * 2.4));

  vec3 edge = vec3(0.94, 0.98, 1.0);
  vec3 carry = vec3(0.78, 0.88, 0.98);
  vec3 weight = vec3(0.4, 0.5, 0.62);
  vec3 color = edge * (outerRim * 0.8 + upperBow * 0.84 + sideCarry * 0.28 + lowerCarry * 0.12 + frontLens * 0.22 + sideBow * 0.18);
  color += carry * (bowWave * 0.16 + uMotion * sideCarry * 0.06 + outerRim * 0.18);
  color += vec3(0.94, 0.99, 1.0) * topMirrorPulse * 1.68;
  color = mix(color, weight, (innerWeight * 0.38 + innerBand * 0.54));

  float alpha = 0.0;
  alpha += outerRim * 0.11;
  alpha += upperBow * 0.09;
  alpha += sideCarry * 0.05;
  alpha += lowerCarry * 0.022;
  alpha += frontLens * 0.024;
  alpha += sideBow * 0.04;
  alpha += innerBand * 0.08;
  alpha += bowWave * 0.024;
  alpha += topMirrorPulse * 0.132;
  alpha += innerWeight * 0.06;
  alpha = clamp(alpha, 0.0, 0.26);

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
  const orbOuterCarrierRef = useRef<THREE.Mesh>(null!);
  const orbMediumRef = useRef<THREE.Mesh>(null!);
  const orbTopRippleRef = useRef<THREE.Mesh>(null!);
  const orbParticlesRef = useRef<THREE.Points>(null!);
  const orbBubblesRef = useRef<THREE.Points>(null!);
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
  const pulseSurfaceProgressRef = useRef(1);
  const topRippleProgressRef = useRef(1);
  const topRippleImpactRef = useRef(0);
  const topPlopProgressRef = useRef(1);
  const topPlopImpactRef = useRef(0);
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
  const previousSpinRef = useRef(0);
  const previousTiltXRef = useRef(0);
  const previousTiltYRef = useRef(0);
  const restLightRef = useRef(1);
  const motionTrailRef = useRef(0);
  const spinDirectionRef = useRef(1);
  const bubbleOrbitFlowRef = useRef(0);

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
    () => ({ uPulse: { value: 0 }, uPulseTravel: { value: 1 }, uImpact: { value: 0 }, uPlopProgress: { value: 1 }, uPlopImpact: { value: 0 }, uCarryProgress: { value: 1 }, uCarryImpact: { value: 0 }, uEdgeMemoryProgress: { value: 1 }, uEdgeMemory: { value: 0 }, uSettleProgress: { value: 1 }, uSettleImpact: { value: 0 }, uBreath: { value: 0 }, uFlow: { value: 0 }, uTime: { value: 0 }, uTilt: { value: new THREE.Vector2() }, uSourceUv: { value: new THREE.Vector2() } }),
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
  const orbBubbleField = useMemo(
    () => makeOrbBubbleField(18),
    []
  );
  const orbBubblePositions = useMemo(
    () => new Float32Array(orbBubbleField.base),
    [orbBubbleField]
  );
  const orbBubblePositionsRef = useRef<Float32Array>(orbBubblePositions);
  const orbBubbleAlphaValues = useMemo(
    () => new Float32Array(orbBubbleField.alpha),
    [orbBubbleField]
  );
  const orbBubbleAlphaRef = useRef<Float32Array>(orbBubbleAlphaValues);
  const orbBubbleGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(orbBubblePositions, 3)
    );
    geometry.setAttribute("aSize", new THREE.BufferAttribute(orbBubbleField.size, 1));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(orbBubbleAlphaValues, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(orbBubbleField.phase, 1));
    geometry.computeBoundingSphere();
    return geometry;
  }, [orbBubbleAlphaValues, orbBubbleField.phase, orbBubbleField.size, orbBubblePositions]);

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
      orbBubbleGeometry.dispose();
      coreParticleGeometry.dispose();
    };
  }, [coreParticleGeometry, orbBubbleGeometry, orbParticleGeometry]);

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
    const previousTopRippleProgress = previousTopRippleProgressRef.current;
    const beatTriggered = beatInstant > 0.22 && previousBeatInstantRef.current <= 0.22;
    const beatGroupWindow = 0.26;
    const beatGroupSettle = 0.18;
    const heroRippleCooldown = 0.9;
    const heroRippleRestartProgressGate = 0.84;
    const heroRippleRestartImpactGate = 0.22;
    if (beatTriggered) {
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
        0.72 + beatInstant * 0.28
      );

      topPlopProgressRef.current = 0;
      topPlopImpactRef.current = Math.min(
        1,
        Math.max(topPlopImpactRef.current * 0.82, 0.7 + beatInstant * 0.3)
      );
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
      if (
        t - lastHeroRippleTimeRef.current >= heroRippleCooldown &&
        rippleHasSettledEnough &&
        settleHasSettledEnough
      ) {
        if (topRippleImpactRef.current > 0.08 && topRippleProgressRef.current < 0.98) {
          topRippleCarryProgressRef.current = topRippleProgressRef.current;
          topRippleCarryImpactRef.current = Math.min(
            1,
            Math.max(
              topRippleCarryImpactRef.current * 0.74,
              topRippleImpactRef.current * 0.9,
              topSettleImpactRef.current * 0.5
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
    topRippleCarryProgressRef.current = Math.min(
      1,
      topRippleCarryProgressRef.current + dt * 0.1
    );
    if (
      previousTopRippleProgress < 0.9 &&
      topRippleProgressRef.current >= 0.9 &&
      topRippleImpactRef.current > 0.16
    ) {
      topEdgeMemoryProgressRef.current = 0;
      topEdgeMemoryImpactRef.current = Math.min(
        1,
        Math.max(topEdgeMemoryImpactRef.current * 0.72, topRippleImpactRef.current * 1.02)
      );
      topSettleProgressRef.current = 0;
      topSettleImpactRef.current = Math.min(
        1,
        Math.max(topSettleImpactRef.current * 0.82, topRippleImpactRef.current * 0.98)
      );
    }
    topEdgeMemoryProgressRef.current = Math.min(
      1,
      topEdgeMemoryProgressRef.current + dt * 0.13
    );
    topSettleProgressRef.current = Math.min(
      1,
      topSettleProgressRef.current + dt * 0.085
    );
    topRippleImpactRef.current = Math.max(
      0,
      topRippleImpactRef.current - dt * 0.16
    );
    topPlopImpactRef.current = Math.max(
      0,
      topPlopImpactRef.current - dt * 0.72
    );
    topRippleCarryImpactRef.current = Math.max(
      0,
      topRippleCarryImpactRef.current - dt * 0.08
    );
    topEdgeMemoryImpactRef.current = Math.max(
      0,
      topEdgeMemoryImpactRef.current - dt * 0.065
    );
    topSettleImpactRef.current = Math.max(
      0,
      topSettleImpactRef.current - dt * 0.05
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
    orbOuterCarrierRef.current.rotation.copy(orbShellRef.current.rotation);
    orbOuterCarrierRef.current.position.copy(orbShellRef.current.position);
    orbOuterCarrierRef.current.scale.set(
      orbShellRef.current.scale.x * 1.014,
      orbShellRef.current.scale.y * 1.016,
      orbShellRef.current.scale.z * 1.013
    );
    orbMediumRef.current.rotation.y = spin * 0.82 + motionTrailRef.current * 0.03;
    orbMediumRef.current.rotation.x = tiltX * 0.045 + shellWaveA * 0.2 + motionTrailRef.current * 0.018;
    orbMediumRef.current.rotation.z = tiltY * 0.04 + shellWaveB * 0.18 - motionTrailRef.current * 0.012;
    orbMediumRef.current.position.set(
      tiltY * (0.002 + motionTrailRef.current * 0.003),
      breathFill * 0.001 + shellPulse * 0.018,
      -0.002
    );
    orbMediumRef.current.scale.set(
      0.992 - breathFill * 0.001 + shellWaveA * 0.03,
      0.993 + breathFill * 0.002 + shellWaveB * 0.04,
      0.99 - breathFill * 0.001 - shellWaveC * 0.03
    );
    orbTopRippleRef.current.rotation.set(
      -tiltX * 0.012 + breathVelocity * 0.006,
      0,
      -tiltY * 0.012 - breathVelocity * 0.004
    );
    orbTopRippleRef.current.position.set(
      0,
      orbMediumRef.current.position.y,
      orbMediumRef.current.position.z
    );
    orbTopRippleRef.current.scale.copy(orbMediumRef.current.scale);

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

    coreMembraneMaterial.emissiveIntensity = sourceSpark * 0.26 + orbResponse * 0.05;
    coreMembraneMaterial.opacity = 0.17 + sourceSpark * 0.082;
    coreMembraneMaterial.thickness = 3.18 + breathFill * 0.14 + orbResponse * 0.08;

    const orbParticleMaterial = orbParticlesRef.current.material as THREE.ShaderMaterial;
    const orbBubbleMaterial = orbBubblesRef.current.material as THREE.ShaderMaterial;
    const coreParticleMaterial = coreParticlesRef.current.material as THREE.ShaderMaterial;
    orbParticleMaterial.uniforms.uOpacity.value =
      0.014 + orbResponse * 0.05 + sourceSpark * 0.02 + inhale * 0.014;
    orbBubbleMaterial.uniforms.uOpacity.value =
      Math.pow(motionTrailRef.current, 0.8) * 1.56;
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

    const orbBubblePositionAttr = orbBubblesRef.current.geometry
      .attributes.position as THREE.BufferAttribute;
    const orbBubbleAlphaAttr = orbBubblesRef.current.geometry
      .attributes.aAlpha as THREE.BufferAttribute;
    for (let i = 0; i < orbBubbleField.phase.length; i++) {
      const o = i * 3;
      const bx = orbBubbleField.base[o];
      const by = orbBubbleField.base[o + 1];
      const bz = orbBubbleField.base[o + 2];
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
      const orbitFlow = bubbleOrbitFlowRef.current * (0.82 + sway * 0.18);
      const arcSpan =
        (1.24 + cycleFrac * 1.52) * motionTrailRef.current + Math.abs(orbitFlow) * 0.22;
      const orbitLead =
        (motionTrailRef.current * 0.22 + Math.abs(orbitFlow) * 0.18) *
        spinDirectionRef.current;
      const orbitAngle =
        baseAngle + orbitLead + orbitFlow + spinDirectionRef.current * pathProgress * arcSpan;
      const elevationDir = Math.sign(Math.sin(phase * 1.7 + cycle * 1.3) || 1);
      const elevationSpan = (0.18 + cycleFrac * 0.18) * motionTrailRef.current * elevationDir;
      const elevationBias = THREE.MathUtils.clamp(baseElevation * 0.58 + elevationDir * 0.12, -0.86, 0.86);
      const elevation = THREE.MathUtils.clamp(
        elevationBias + (pathProgress - 0.5) * elevationSpan + Math.sin(angle * 0.52) * motionTrailRef.current * 0.025,
        -0.98,
        0.98
      );
      const radialPulse = Math.sin(angle * 0.54 + phase * 0.7) * motionTrailRef.current * 0.03;
      const sphereRadius = THREE.MathUtils.clamp(
        bubbleRadius + radialPulse + THREE.MathUtils.lerp(-0.02, 0.05, cycleFrac),
        0.48,
        0.84
      );
      const px = Math.cos(orbitAngle) * Math.cos(elevation) * sphereRadius;
      const pz = Math.sin(orbitAngle) * Math.cos(elevation) * sphereRadius;
      const py = Math.sin(elevation) * sphereRadius;
      const gateSeed = Math.sin((cycle + 1) * 12.9898 + (i + 1) * 78.233) * 43758.5453;
      const gateFrac = gateSeed - Math.floor(gateSeed);
      const visibleThisCycle = gateFrac > 0.12 ? 1 : 0;
      const envelope =
        THREE.MathUtils.smoothstep(cycleT, 0.01, 0.08) *
        (1 - THREE.MathUtils.smoothstep(cycleT, 0.92, 0.995));
      const burst = THREE.MathUtils.lerp(0.96, 1.62, gateFrac);
      const bubbleVisibility =
        motionTrailRef.current * visibleThisCycle * envelope * burst;

      orbBubblePositionsRef.current[o] = px + tiltY * 0.006;
      orbBubblePositionsRef.current[o + 1] = py;
      orbBubblePositionsRef.current[o + 2] = pz - tiltX * 0.005;
      orbBubbleAlphaRef.current[i] =
        orbBubbleField.alpha[i] * bubbleVisibility;
    }
    orbBubblePositionAttr.needsUpdate = true;
    orbBubbleAlphaAttr.needsUpdate = true;

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
