import type { CollectionEntry } from "astro:content";

type ItemData = CollectionEntry<"portfolio">["data"];
export type PortfolioNode = {
  id: string;
  data: Omit<ItemData, "category"> & {
    category: ItemData["category"] | "tags";
  };
};
export type PortfolioRelation = Pick<
  CollectionEntry<"relation">,
  "id" | "data"
>;
export const portfolioUrl = (id: string) =>
  `/about/${id.split("/").map(encodeURIComponent).join("/")}/`;

// Relations are stored once and traversed in both directions.
export function neighborhood(
  items: PortfolioNode[],
  relations: PortfolioRelation[],
  root: string,
  depth = 2,
) {
  const distance = new Map<string, number>([[root, 0]]);
  for (let step = 0; step < depth; step++) {
    for (const {
      data: { source, target },
    } of relations) {
      if (distance.get(source.id) === step && !distance.has(target.id))
        distance.set(target.id, step + 1);
      if (distance.get(target.id) === step && !distance.has(source.id))
        distance.set(source.id, step + 1);
    }
  }
  return {
    nodes: items.filter(({ id }) => distance.has(id)),
    edges: relations.filter(
      ({ data: { source, target } }) =>
        distance.has(source.id) && distance.has(target.id),
    ),
    distance,
  };
}
