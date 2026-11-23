import { getCollection } from "astro:content";
import type { PortfolioNode, PortfolioRelation } from "./portfolioGraph";

export async function getPortfolioGraph() {
  const entries = await getCollection("portfolio");
  const relations: PortfolioRelation[] = await getCollection("relation");
  const nodes: PortfolioNode[] = [...entries];
  const tagTargets = new Map(
    entries
      .filter(({ data }) => data.category === "skills")
      .map(({ id, data }) => [data.title.toLowerCase(), id]),
  );
  const edgeKey = (a: string, b: string) => JSON.stringify([a, b].sort());
  const linked = new Set(
    relations.map(({ data }) => edgeKey(data.source.id, data.target.id)),
  );

  for (const { id, data } of entries) {
    if (data.category === "slides") continue;
    for (const value of data.tags) {
      const title = value.trim();
      if (!title) continue;
      const key = title.toLowerCase();
      let target = tagTargets.get(key);
      if (!target) {
        target = `tags/${key}`;
        tagTargets.set(key, target);
        nodes.push({
          id: target,
          data: {
            category: "tags",
            title,
            description: `「${title}」タグが付いている要素。`,
            icon: "ri:price-tag-3-line",
            order: 0,
            tags: [],
            links: [],
          },
        });
      }
      const pair = edgeKey(id, target);
      if (id === target || linked.has(pair)) continue;
      linked.add(pair);
      relations.push({
        id: pair,
        data: {
          source: { id, collection: "portfolio" },
          target: { id: target, collection: "portfolio" },
          label: `タグ「${title}」`,
        },
      });
    }
  }

  return { nodes, relations };
}
