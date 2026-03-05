import type { CategoryCard } from "@/app/(guest)/_lib/portal/homeLinks";
import type { LooseCard } from "./resolveHomeItems";
import type { ButtonRadius } from "@/app/(guest)/_lib/theme/types";
import { StackLayout }    from "./StackLayout";
import { GridLayout }     from "./GridLayout";
import { SliderLayout }   from "./SliderLayout";
import { ShowcaseLayout } from "./ShowcaseLayout";

export function CategorySection({
  category,
  cards,
  radius,
}: {
  category: CategoryCard;
  cards: LooseCard[];
  radius?: ButtonRadius;
}) {
  if (cards.length === 0) return null;

  return (
    <section className="guest-category">
      <h3 className="guest-category__title">{category.title}</h3>
      {category.layout === "stack"    && <StackLayout    cards={cards} radius={radius} />}
      {category.layout === "grid"     && <GridLayout     cards={cards} radius={radius} />}
      {category.layout === "slider"   && <SliderLayout   cards={cards} radius={radius} />}
      {category.layout === "showcase" && <ShowcaseLayout cards={cards} radius={radius} />}
    </section>
  );
}
