import { z } from 'zod';
import { Range, Section, Source } from '../../../modules/textbooks/domain/content.js';
import { BoundaryResult, StructureResult } from './contracts.js';
import type { OutputContract } from '../../ports/skills.js';
const Coordinate = z.number().int().min(0).max(1000);
export const WireSource = Source.extend({
  box: z
    .strictObject({ left: Coordinate, top: Coordinate, right: Coordinate, bottom: Coordinate })
    .refine((b) => b.left < b.right && b.top < b.bottom, 'Expected left < right and top < bottom'),
});
export const coordinateInstructions =
  '模型输入和输出的 box 均为千分位整数对象 {left,top,right,bottom}，左上角为(0,0)，右下角为(1000,1000)。禁止小数或宽高形式；top 必须小于 bottom，left 必须小于 right。';
export function mapBoxes(value: unknown, direction: 'encode' | 'decode'): unknown {
  if (Array.isArray(value)) return value.map((v) => mapBoxes(v, direction));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => {
      if (
        key === 'box' &&
        direction === 'encode' &&
        Array.isArray(v) &&
        v.length === 4 &&
        v.every((n) => typeof n === 'number')
      )
        return [
          key,
          Object.fromEntries(
            ['left', 'top', 'right', 'bottom'].map((name, i) => [name, Math.round(v[i]! * 1000)]),
          ),
        ];
      if (
        key === 'box' &&
        direction === 'decode' &&
        v &&
        typeof v === 'object' &&
        !Array.isArray(v)
      ) {
        const b = v as Record<string, number>;
        return [key, ['left', 'top', 'right', 'bottom'].map((name) => b[name]! / 1000)];
      }
      return [key, mapBoxes(v, direction)];
    }),
  );
}
export function spatialOutput(mode: 'structure' | 'boundary' | 'seam'): OutputContract {
  const wireRange = Range.extend({ sources: z.array(WireSource).min(1) });
  const schema =
    mode === 'structure'
      ? StructureResult.extend({ sections: z.array(Section.extend({ source: WireSource })) })
      : mode === 'boundary'
        ? BoundaryResult.extend({ complete: z.array(wireRange), pending: z.array(wireRange) })
        : z.strictObject({
            targetKey: z.string(),
            decision: z.enum(['continues', 'independent', 'uncertain']),
            sources: z.array(WireSource),
            reason: z.string().min(1),
          });
  return {
    schema,
    instructions: coordinateInstructions,
    encode: (v) => mapBoxes(v, 'encode'),
    decode: (v) => mapBoxes(schema.parse(v), 'decode'),
  };
}
