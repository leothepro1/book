import "./checkout.css";

import { Suspense } from "react";
import CheckOutClient from "./ui";
import { checkOutLookup } from "./actions";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
      <CheckOutClient onSubmit={checkOutLookup} />
    </Suspense>
  );
}
