import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionEntry } from "astro:content";
import { neighborhood } from "../src/lib/skillGraph.ts";

const skills = ["a", "b", "c", "d", "isolated"].map((id) => ({
  id,
})) as CollectionEntry<"skill">[];
// Reversed edges and a cycle exercise undirected shortest-path traversal.
const relations = [
  ["b", "a"],
  ["c", "b"],
  ["d", "c"],
  ["c", "a"],
].map(([source, target], i) => ({
  id: String(i),
  data: {
    source: { collection: "skill", id: source },
    target: { collection: "skill", id: target },
    label: "関連",
  },
})) as CollectionEntry<"relation">[];

test("traverses both directions and keeps the shortest distance in cycles", () => {
  const graph = neighborhood(skills, relations, "a");
  assert.deepEqual([...graph.distance].sort(), [
    ["a", 0],
    ["b", 1],
    ["c", 1],
    ["d", 2],
  ]);
  assert.equal(graph.edges.length, 4);
});

test("excludes third-degree nodes and their edges", () => {
  const graph = neighborhood(skills, relations.slice(0, 3), "a");
  assert.deepEqual(
    graph.nodes.map(({ id }) => id),
    ["a", "b", "c"],
  );
  assert.equal(graph.edges.length, 2);
});

test("supports isolated nodes", () => {
  const graph = neighborhood(skills, relations, "isolated");
  assert.deepEqual(
    graph.nodes.map(({ id }) => id),
    ["isolated"],
  );
  assert.equal(graph.edges.length, 0);
});
