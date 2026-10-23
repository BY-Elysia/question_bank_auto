/** 归一化坐标，左上为原点；x + width <= 1 且 y + height <= 1，由业务校验器检查。 */
export type CropBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};
