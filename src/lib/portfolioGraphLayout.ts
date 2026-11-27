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
