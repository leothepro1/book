"use client";

import { useRouter } from "next/navigation";

type Props = {
  nextHref: string;
  tenantName: string;
  booking?: {
    arrivalISO: string;
    departureISO: string;
  };
};

export default function SuccessView({ nextHref, tenantName }: Props) {
  const router = useRouter();

  return (
    <div className="sektion73-success">
      <div className="sektion73-success__top">
        <div className="sektion73-success__title">Välkommen!</div>
        <div className="sektion73-success__body">
          Incheckningen är klar.{tenantName ? ` Varmt välkommen till ${tenantName}!` : " Varmt välkommen!"}
        </div>
      </div>

      <div className="sektion73-success__spacer" />

      <div className="sektion73-cta" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="sektion73-btn sektion73-btn--primary"
          onClick={() => router.push(nextHref)}
        >
          Fortsätt
        </button>
      </div>
    </div>
  );
}
