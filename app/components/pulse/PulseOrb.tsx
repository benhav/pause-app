"use client";

// app/components/pulse/PulseOrb.tsx
import dynamic from "next/dynamic";

const PulseOrb = dynamic(() => import("./PulseOrbR3F"), { ssr: false });

export default PulseOrb;