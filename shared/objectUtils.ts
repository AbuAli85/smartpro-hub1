/** Drop keys whose value is `undefined` (PATCH semantics; avoids accidental wipes in spreads / ORM sets). */
export function omitUndefined<T extends Record<string, unknown>>(obj: T): { [K in keyof T]?: T[K] } {
  const out = {} as { [K in keyof T]?: T[K] };
  for (const key of Object.keys(obj) as (keyof T)[]) {
    const v = obj[key];
    if (v !== undefined) (out as Record<string, unknown>)[key as string] = v;
  }
  return out;
}
