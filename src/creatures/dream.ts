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
- Body space: +z is forward, +y is up, origin sits at the creature's mid-height. Units are meters; a typical body radius is 0.16-0.28.
- Proportions are relative to the first body radius r: heads read cute at 0.6-0.9r, legs 1.2-2.5r long, ears 0.8-1.5r.
- "walker" needs legs. "flyer" needs wings. "hopper" and "wiggler" need neither.
- A wiggler's body should be 5-7 spheres of shrinking size (they form the spine).
- flat:true lays a capsule body along +z — use it for four-legged animals.
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

/** Pull the first JSON object out of a reply, tolerating fences and chatter. */
export function extractDNA(text: string): CritterDNA {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in reply');
  return JSON.parse(body.slice(start, end + 1)) as CritterDNA;
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
