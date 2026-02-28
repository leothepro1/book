import "./checkin.css";

import CheckInClient from "./ui";
import { submitCheckIn } from "./actions";

export default function Page() {
  return <CheckInClient onSubmit={submitCheckIn} />;
}
