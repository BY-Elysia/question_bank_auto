function deref(
  schema: Record<string, unknown>,
  defs: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
  return typeof schema.$ref === 'string' && schema.$ref.startsWith('#/$defs/')
    ? (defs[schema.$ref.slice(8)] ?? schema)
    : schema;
}

function isNullable(
  schema: Record<string, unknown>,
  defs: Record<string, Record<string, unknown>>,
  seen = new Set<string>(),
): boolean {
  if (typeof schema.$ref === 'string' && schema.$ref.startsWith('#/$defs/')) {
    const key = schema.$ref.slice(8);
    if (seen.has(key)) return false;
    const target = defs[key];
    return target ? isNullable(target, defs, new Set([...seen, key])) : false;
  }
  if (schema.type === 'null' || (Array.isArray(schema.type) && schema.type.includes('null')))
    return true;
  for (const key of ['anyOf', 'oneOf'])
    if (
      Array.isArray(schema[key]) &&
      (schema[key] as Record<string, unknown>[]).some((s) => isNullable(s, defs, seen))
    )
      return true;
  return false;
}

function nullable(schema: Record<string, unknown>): Record<string, unknown> {
  if (schema.type === 'null' || (Array.isArray(schema.type) && schema.type.includes('null')))
    return schema;
  if (Array.isArray(schema.anyOf))
    return schema.anyOf.some((s) => (s as Record<string, unknown>)?.type === 'null')
      ? schema
      : { anyOf: [...schema.anyOf, { type: 'null' }] };
  return { anyOf: [schema, { type: 'null' }] };
}

/** Provider schema subset; the original Zod schema still enforces bounds and business rules locally. */
export function providerSchema(
  schema: Record<string, unknown>,
  defs: Record<string, Record<string, unknown>> = (schema.$defs as Record<
    string,
    Record<string, unknown>
  >) ?? {},
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of ['type', 'enum', 'const', '$ref']) if (key in schema) result[key] = schema[key];
  for (const key of ['anyOf', 'oneOf', 'allOf'])
    if (Array.isArray(schema[key]))
      result[key] = (schema[key] as Record<string, unknown>[]).map((s) => providerSchema(s, defs));
  if (schema.properties && typeof schema.properties === 'object') {
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
    result.properties = Object.fromEntries(
      Object.entries(properties).map(([key, value]) => {
        const converted = providerSchema(value, defs);
        return [
          key,
          required.has(key) || isNullable(value, defs) ? converted : nullable(converted),
        ];
      }),
    );
    result.required = Object.keys(properties);
    result.additionalProperties = false;
  }
  if (schema.$defs && typeof schema.$defs === 'object')
    result.$defs = Object.fromEntries(
      Object.entries(schema.$defs).map(([key, value]) => [
        key,
        providerSchema(value as Record<string, unknown>, defs),
      ]),
    );
  if (Array.isArray(schema.prefixItems)) {
    const items = [
      ...new Map(
        schema.prefixItems.map((item) => {
          const converted = providerSchema(item as Record<string, unknown>, defs);
          return [JSON.stringify(converted), converted];
        }),
      ).values(),
    ];
    result.items = items.length === 1 ? items[0] : { anyOf: items };
  } else if (schema.items && typeof schema.items === 'object')
    result.items = providerSchema(schema.items as Record<string, unknown>, defs);
  return result;
}

function matchesObjectBranch(
  value: Record<string, unknown>,
  branch: Record<string, unknown>,
  defs: Record<string, Record<string, unknown>>,
): boolean {
  if (!branch.properties || typeof branch.properties !== 'object') return false;
  const props = branch.properties as Record<string, Record<string, unknown>>;
  for (const [k, raw] of Object.entries(props)) {
    const prop = deref(raw, defs);
    if ('const' in prop && value[k] !== prop.const) return false;
    if (
      Array.isArray(prop.enum) &&
      k in value &&
      value[k] !== null &&
      !prop.enum.includes(value[k])
    )
      return false;
  }
  return true;
}

function pickObjectBranch(
  value: Record<string, unknown>,
  branches: Record<string, unknown>[],
  defs: Record<string, Record<string, unknown>>,
): Record<string, unknown> | undefined {
  const objs = branches.filter((b) => matchesObjectBranch(value, b, defs));
  return (
    objs.find(
      (b) => !Array.isArray(b.required) || (b.required as string[]).every((r) => r in value),
    ) ?? objs[0]
  );
}

/** Remove provider-emitted `null` values for optional non-nullable schema fields before Zod parsing. */
export function stripNullOptionals(
  value: unknown,
  schema: Record<string, unknown>,
  defs: Record<string, Record<string, unknown>> = (schema.$defs as Record<
    string,
    Record<string, unknown>
  >) ?? {},
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof schema.$ref === 'string' && schema.$ref.startsWith('#/$defs/')) {
    const target = defs[schema.$ref.slice(8)];
    return target ? stripNullOptionals(value, target, defs) : value;
  }
  for (const key of ['anyOf', 'oneOf']) {
    if (!Array.isArray(schema[key])) continue;
    const branches = (schema[key] as Record<string, unknown>[])
      .map((b) => deref(b, defs))
      .filter((b) => b.type !== 'null');
    if (branches.length === 1) return stripNullOptionals(value, branches[0]!, defs);
    if (Array.isArray(value)) {
      const arr = branches.find((b) => b.type === 'array' || b.items || b.prefixItems);
      return arr ? stripNullOptionals(value, arr, defs) : value;
    }
    if (typeof value === 'object') {
      const obj = pickObjectBranch(value as Record<string, unknown>, branches, defs);
      return obj ? stripNullOptionals(value, obj, defs) : value;
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (Array.isArray(schema.prefixItems)) {
      const items = schema.prefixItems as Record<string, unknown>[];
      return value.map((item, i) => (items[i] ? stripNullOptionals(item, items[i]!, defs) : item));
    }
    if (schema.items && typeof schema.items === 'object')
      return value.map((item) =>
        stripNullOptionals(item, schema.items as Record<string, unknown>, defs),
      );
    return value;
  }
  if (typeof value === 'object' && schema.properties && typeof schema.properties === 'object') {
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const prop = properties[k];
      if (!prop) {
        out[k] = v;
        continue;
      }
      if (v === null && !required.has(k) && !isNullable(prop, defs)) continue;
      out[k] = stripNullOptionals(v, prop, defs);
    }
    return out;
  }
  return value;
}
