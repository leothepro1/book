import type { LooseCard } from "./resolveHomeItems";

export function HeaderCard({ card }: { card: LooseCard }) {
  return (
    <h2 className="guest-header-card">{card.title}</h2>
  );
}
