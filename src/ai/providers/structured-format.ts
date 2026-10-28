/** Provider schema subset; the original Zod schema still enforces bounds and business rules locally. */
export function providerSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of ['type', 'enum', 'const', '$ref']) if (key in schema) result[key] = schema[key];
  for (const key of ['anyOf', 'oneOf', 'allOf'])
    if (Array.isArray(schema[key]))
      result[key] = (schema[key] as Record<string, unknown>[]).map(providerSchema);
  if (schema.properties && typeof schema.properties === 'object') {
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    result.properties = Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [key, providerSchema(value)]),
    );
    result.required = Object.keys(properties);
    result.additionalProperties = false;
  }
  if (schema.$defs && typeof schema.$defs === 'object')
    result.$defs = Object.fromEntries(
      Object.entries(schema.$defs).map(([key, value]) => [
        key,
        providerSchema(value as Record<string, unknown>),
      ]),
    );
  if (Array.isArray(schema.prefixItems)) {
    const items = [
      ...new Map(
        schema.prefixItems.map((item) => {
          const converted = providerSchema(item as Record<string, unknown>);
          return [JSON.stringify(converted), converted];
        }),
      ).values(),
    ];
    result.items = items.length === 1 ? items[0] : { anyOf: items };
  } else if (schema.items && typeof schema.items === 'object')
    result.items = providerSchema(schema.items as Record<string, unknown>);
  return result;
}
