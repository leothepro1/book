import "./checkin.css";

import CheckInClient from "./ui";
import { checkInLookup } from "./actions";

export default function Page() {
  return <CheckInClient onSubmit={ checkInLookup } />;
}
