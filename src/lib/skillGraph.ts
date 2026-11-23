import type { CollectionEntry } from "astro:content";

type Skill = CollectionEntry<"skill">;
type Relation = CollectionEntry<"relation">;
export const skillUrl = (id: string) =>
  `/about/skills/${encodeURIComponent(id)}/`;

// Relations are stored once and traversed in both directions.
export function neighborhood(
  skills: Skill[],
  relations: Relation[],
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
    nodes: skills.filter(({ id }) => distance.has(id)),
    edges: relations.filter(
      ({ data: { source, target } }) =>
        distance.has(source.id) && distance.has(target.id),
    ),
    distance,
  };
}
