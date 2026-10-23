import type { ModelImagePart } from './model-image-part.js';
import type { ModelTextPart } from './model-text-part.js';

/** ModelPart contract. */
export type ModelPart = ModelTextPart | ModelImagePart;
