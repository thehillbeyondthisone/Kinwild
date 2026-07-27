import { CritterDNA } from './schema';
import { LIBRARY } from './library';

/**
 * Turn a plain-English description into critter DNA using a local
 * OpenAI-compatible server (LM Studio by default, proxied at /llm to keep
 * the browser same-origin).
 *
 * The normalizer downstream clamps every field, so the model is allowed to
 * be sloppy — the prompt aims for *plausible* output, not perfect output.
 */

const SCHEMA_DOC = `
{
  "name": string,
  "mode": "walker" | "hopper" | "flyer" | "wiggler",
  "palette": [4 hex colors: base, light accent, dark accent, highlight],
  "pattern": { "kind": "spots"|"stripes"|"gradient", "color": palette index, "scale": 1-8, "amount": 0.1-0.9 },   // optional
  "body": [ { "shape": "sphere"|"capsule"|"cone", "size": [radius] or [radius, halfLength] or [radius, halfLength, topRadius], "at": [x,y,z], "flat": bool, "color": palette index } ],
  "head": { "size": number, "at": [x,y,z], "color": palette index, "eyes": radius, "beak": [baseRadius, length], "beakColor": palette index },
  "legs": { "count": 2|4|6, "length": number, "thickness": number, "stance": number, "spread": number, "color": palette index },
  "arms": { "length": number, "thickness": number, "color": palette index },
  "wings": { "length": number, "thickness": number, "color": palette index },
  "ropes": [ { "kind": "ear"|"tail"|"antenna", "at": [x,y,z], "segments": 1-4, "length": number, "thickness": number, "color": palette index, "floppy": bool } ],
  "speed": 0.2-3,
  "altitude": 0.6-3
}`.trim();

const RULES = `
Rules:
- Body space: +z is forward (the face), +y is up, origin is the body center. Units are meters and every number is a NUMBER, never a quoted string.
- Call the first body radius r (use 0.16-0.30). Everything scales off it:
    head.size      0.7-0.95 x r
    legs.length    1.3-2.2 x r   (must exceed r, or the body drags on the ground)
    legs.thickness 0.2-0.35 x r
    ropes.length   0.8-1.5 x r
- Head placement, and this is the part that is easy to get wrong:
    upright two-legged critters -> head.at = [0, 1.3*r, 0]
    flat:true four/six-legged bodies -> head.at = [0, 0.7*r, 1.6*r]   (forward, only slightly up)
  The head must sit clear of the torso, not inside it.
- Ears and antennae go ON TOP OF THE HEAD: their "at" y must be ABOVE head.at y, and their z near the head's z. Never give them a negative y.
- Tails go behind: "at" z clearly negative, y near 0.
- "walker" needs legs. "flyer" needs wings. "hopper" and "wiggler" need neither.
- A wiggler's body should be 5-7 spheres of shrinking size (they form the spine).
- flat:true lays a capsule body along +z — use it for four-legged animals.
- Match speed to the creature: heavy/armored 0.5-0.9, ordinary 1.0-1.4, darting 1.5-2.5.
- Reply with ONE JSON object and nothing else. No markdown fence, no commentary.`.trim();

function example(name: string): string {
  const dna = LIBRARY.find((d) => d.name === name);
  return JSON.stringify(dna);
}

export const DREAM_SYSTEM_PROMPT = [
  'You design small cartoon creatures as JSON for a procedural animation engine.',
  '',
  'Schema:',
  SCHEMA_DOC,
  '',
  RULES,
  '',
  'Example — "a chunky blue puppy that trots around":',
  example('Bumble'),
  '',
  'Example — "a fluffy rabbit that hops":',
  example('Thumper'),
].join('\n');

/**
 * Pull the first JSON object out of a reply, tolerating the things small
 * local models actually do: markdown fences, chatter either side, and
 * trailing commas (`[0.1,]`), which JSON.parse rejects outright.
 */
export function extractDNA(text: string): CritterDNA {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in reply');
  const raw = body.slice(start, end + 1);
  try {
    return JSON.parse(raw) as CritterDNA;
  } catch {
    // Strip commas that sit before a closing bracket/brace, ignoring any
    // that appear inside string values.
    const repaired = raw.replace(/,(?=\s*[}\]])/g, (m, offset: number) => {
      const before = raw.slice(0, offset);
      const quotes = (before.match(/(?<!\\)"/g) ?? []).length;
      return quotes % 2 === 1 ? m : '';
    });
    return JSON.parse(repaired) as CritterDNA;
  }
}

/**
 * Chat-capable model ids the local server currently offers. Embedding
 * models are filtered out — they appear in the same list but cannot answer
 * a chat completion, so offering them would only invite a confusing error.
 */
export async function listModels(endpoint = '/llm/v1/models'): Promise<string[]> {
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`models endpoint returned ${res.status}`);
  const json = (await res.json()) as { data?: { id?: string }[] };
  return (json.data ?? [])
    .map((m) => m.id)
    .filter((id): id is string => !!id && !/embed/i.test(id));
}

export interface DreamOptions {
  /** Model id; '' lets LM Studio use whatever is loaded. */
  model?: string;
  endpoint?: string;
  signal?: AbortSignal;
}

export async function dreamCritter(
  description: string,
  opts: DreamOptions = {},
): Promise<CritterDNA> {
  const res = await fetch(opts.endpoint ?? '/llm/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: opts.signal,
    body: JSON.stringify({
      model: opts.model ?? '',
      temperature: 0.9,
      max_tokens: 900,
      messages: [
        { role: 'system', content: DREAM_SYSTEM_PROMPT },
        { role: 'user', content: description },
      ],
    }),
  });
  // The dev proxy answers 5xx when nothing is listening upstream, which is
  // the usual "I forgot to start LM Studio" case.
  if (res.status >= 500) throw new Error('LM Studio not reachable');
  if (!res.ok) throw new Error(`LM Studio returned ${res.status}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error('empty reply');
  const dna = extractDNA(text);
  if (!dna.name) dna.name = description.slice(0, 24);
  return dna;
}
