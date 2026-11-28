import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

export interface GraphNode extends SimulationNodeDatum {
  id: string;
  hop: number;
}
export type GraphLink = SimulationLinkDatum<GraphNode>;

export const graphNodeWidth = 216;
export const graphNodeSize = 64;
export const graphNodeTop = 110;

type Point = { x: number; y: number };
function crossesNode(
  a: Point,
  b: Point,
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // A segment and rectangle intersect when their projections overlap on
  // both rectangle axes and on the normal to the segment.
  return (
    x + halfWidth >= Math.min(a.x, b.x) &&
    x - halfWidth <= Math.max(a.x, b.x) &&
    y + halfHeight >= Math.min(a.y, b.y) &&
    y - halfHeight <= Math.max(a.y, b.y) &&
    Math.abs((x - a.x) * dy - (y - a.y) * dx) <=
      halfWidth * Math.abs(dy) + halfHeight * Math.abs(dx)
  );
}

// After the force simulation, move nodes to clear any remaining edge crossings.
export function separateGraphNodes(nodes: GraphNode[], links: GraphLink[]) {
  const positions = new Map(
    nodes.map((node) => [node.id, { x: node.x!, y: node.y! }]),
  );
  const crossings = links.flatMap(({ source, target }) => {
    const sourceId = typeof source === "object" ? source.id : String(source);
    const targetId = typeof target === "object" ? target.id : String(target);
    return nodes
      .filter(({ id }) => id !== sourceId && id !== targetId)
      .map(
        ({ id }) =>
          [
            positions.get(sourceId)!,
            positions.get(targetId)!,
            positions.get(id)!,
          ] as const,
      );
  });
  const radius = graphNodeSize / 2;
  const labelHalfHeight = (graphNodeTop - radius) / 2;
  const clearance = 4;
  const overlaps = ([source, target, node]: (typeof crossings)[number]) =>
    crossesNode(
      source,
      target,
      node.x,
      node.y,
      radius + clearance,
      radius + clearance,
    ) ||
    crossesNode(
      source,
      target,
      node.x,
      node.y - radius - labelHalfHeight,
      graphNodeWidth / 2 + clearance,
      labelHalfHeight + clearance,
    );

  const candidates = nodes
    .filter(({ fx, fy }) => fx == null && fy == null)
    .map(({ id }) => {
      const position = positions.get(id)!;
      return {
        position,
        affected: crossings.filter((crossing) => crossing.includes(position)),
      };
    });
  const directions = Array.from({ length: 16 }, (_, index) => {
    const angle = (index * Math.PI) / 8;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  });
  const minSpacing = (graphNodeWidth * 0.85) ** 2;
  const allPositions = Array.from(positions.values());
  const anchor = nodes.find(({ fx, fy }) => fx != null || fy != null);
  const centerX = anchor?.x ?? 0;
  const centerY = anchor?.y ?? 0;
  let expansions = 0;

  while (true) {
    let best:
      { position: Point; x: number; y: number; score: number } | undefined;
    for (const { position, affected } of candidates) {
      const current = affected.filter(overlaps).length;
      if (!current) continue;

      const { x, y } = position;
      for (const step of [12, 24, 48, 72, 108, 156, 216, 288]) {
        if (best && current / step <= best.score) break;
        for (const direction of directions) {
          position.x = x + step * direction.x;
          position.y = y + step * direction.y;
          if (
            allPositions.some(
              (other) =>
                other !== position &&
                (other.x - position.x) ** 2 + (other.y - position.y) ** 2 <
                  minSpacing,
            )
          )
            continue;

          const score = (current - affected.filter(overlaps).length) / step;
          if (score > (best?.score ?? 0))
            best = { position, x: position.x, y: position.y, score };
        }
      }
      position.x = x;
      position.y = y;
    }
    if (!best) {
      const count = crossings.filter(overlaps).length;
      if (!count) break;
      let swap: [Point, Point] | undefined;
      let swapCount = count;
      for (let first = 0; first < candidates.length; first++) {
        for (let second = first + 1; second < candidates.length; second++) {
          const a = candidates[first].position;
          const b = candidates[second].position;
          [a.x, b.x] = [b.x, a.x];
          [a.y, b.y] = [b.y, a.y];
          const remaining = crossings.filter(overlaps).length;
          [a.x, b.x] = [b.x, a.x];
          [a.y, b.y] = [b.y, a.y];
          if (remaining < swapCount) {
            swapCount = remaining;
            swap = [a, b];
          }
        }
      }
      if (swap) {
        const [a, b] = swap;
        [a.x, b.x] = [b.x, a.x];
        [a.y, b.y] = [b.y, a.y];
        continue;
      }
      // Give crowded layouts room when no individual move improves them.
      if (expansions === 5) break;
      expansions++;
      for (const { position } of candidates) {
        position.x += (position.x - centerX) * 0.15;
        position.y += (position.y - centerY) * 0.15;
      }
      continue;
    }
    best.position.x = best.x;
    best.position.y = best.y;
  }

  for (const node of nodes) Object.assign(node, positions.get(node.id)!);
}

export function graphSimulation(
  nodes: GraphNode[],
  links: GraphLink[],
  centered: boolean,
) {
  const linkDistance = 195;
  return forceSimulation(nodes)
    .force(
      "links",
      forceLink<GraphNode, GraphLink>(links)
        .id((node) => node.id)
        .distance(linkDistance)
        .strength(0.3),
    )
    .force("repulsion", forceManyBody().strength(-180))
    .force("collision", forceCollide(graphNodeWidth / 2).iterations(3))
    .force(
      "radius",
      forceRadial<GraphNode>((node) =>
        centered ? node.hop * linkDistance : 0,
      ).strength(centered ? 0.35 : 0.055),
    )
    .stop();
}
