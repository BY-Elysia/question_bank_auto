import { useRef } from 'react';
import { useParticleField } from './useParticleField';
export function ParticleField({ enabled }: { enabled: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useParticleField(canvas, enabled);
  return <canvas ref={canvas} className="particle-field" aria-hidden="true" />;
}
