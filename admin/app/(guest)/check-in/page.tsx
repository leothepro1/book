import "./checkin.css";

import { Suspense } from "react";
import CheckInClient from "./ui";
import { checkInLookup } from "./actions";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
      <CheckInClient onSubmit={checkInLookup} />
    </Suspense>
  );
}
