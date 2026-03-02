"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SuccessLoader from "../../_components/SuccessLoader";
import CountdownRing from "../../_components/CountdownRing";

export default function SuccessView({
  nextHref,
  seconds = 20,
}: {
  nextHref: string;
  seconds?: number;
}) {
  const router = useRouter();
  const [countdown, setCountdown] = useState(seconds);

  useEffect(() => {
    setCountdown(seconds);

    const t = window.setInterval(() => {
      setCountdown((v) => {
        const nv = v - 1;
        if (nv <= 0) {
          window.clearInterval(t);
          router.push(nextHref);
          return 0;
        }
        return nv;
      });
    }, 1000);

    return () => window.clearInterval(t);
  }, [router, nextHref, seconds]);

  return (
    <div className="sektion73-success">
      <div className="sektion73-success__top">
        <SuccessLoader size={160} />
        <div className="sektion73-success__title">Välkommen!</div>
        <div className="sektion73-success__body">Utcheckningen är klar. Varmt välkommen!</div>
      </div>

      <div className="sektion73-success__spacer" />

      <div className="sektion73-success__ctaWrap">
        <button
          type="button"
          className="sektion73-btn sektion73-btn--primary sektion73-btn--withTimer"
          onClick={() => router.push(nextHref)}
        >
          <span className="sektion73-timerPuck" aria-hidden="true">
            <span className="sektion73-timerPuck__inner">
              <CountdownRing value={countdown} total={seconds} size={26} stroke={2.5} />
              <span className="sektion73-timerPuck__num">{countdown}</span>
            </span>
          </span>
          Fortsätt
        </button>
      </div>
    </div>
  );
}
