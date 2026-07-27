import { MAX_INFL } from '../shaders/chunks';

/**
 * Packs per-primitive influence lists into the Int32Array layout the shader
 * expects: MAX_INFL slots per primitive, slot 0 = self, -1 terminated.
 *
 * Blending only happens inside these lists, so two primitives that are not
 * graph neighbors can pass arbitrarily close at runtime without welding —
 * and the shader cost is bounded by list length, not primitive count.
 */
export function packInfluences(lists: number[][], maxPrims: number): Int32Array {
  const packed = new Int32Array(maxPrims * MAX_INFL).fill(-1);
  lists.forEach((neighbors, prim) => {
    let infl = [prim, ...neighbors.filter((n) => n !== prim)];
    if (infl.length > MAX_INFL) {
      console.warn(
        `blendGraph: prim ${prim} has ${infl.length - 1} neighbors; keeping first ${MAX_INFL - 1}`,
      );
      infl = infl.slice(0, MAX_INFL);
    }
    infl.forEach((j, i) => (packed[prim * MAX_INFL + i] = j));
  });
  return packed;
}

/**
 * Symmetric adjacency from explicit edges (usually skeleton parent-child
 * pairs plus authored extras).
 */
export function edgesToLists(count: number, edges: [number, number][]): number[][] {
  const lists: number[][] = Array.from({ length: count }, () => []);
  for (const [a, b] of edges) {
    if (!lists[a].includes(b)) lists[a].push(b);
    if (!lists[b].includes(a)) lists[b].push(a);
  }
  return lists;
}

/** Fully connected lists — every prim blends with every other (small counts only). */
export function fullyConnected(count: number): number[][] {
  return Array.from({ length: count }, (_, i) =>
    Array.from({ length: count }, (_, j) => j).filter((j) => j !== i),
  );
}
