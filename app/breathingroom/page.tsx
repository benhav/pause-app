export const dynamic = "force-dynamic";

import { Suspense } from "react";
import BreathingRoomClient from "./BreathingRoomClient";

export default function Page() {
  return (
    <Suspense fallback={<main className="min-h-[100svh]" />}>
      <BreathingRoomClient />
    </Suspense>
  );
}
