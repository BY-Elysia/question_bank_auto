export function buildRelativeMediaCropInstructionLines(imageCount: number) {
  const safeCount = Number.isFinite(Number(imageCount)) && Number(imageCount) > 0 ? Math.trunc(Number(imageCount)) : 1
  return [
    '本次 media 不要输出伪造 url，也不要输出 https://xxx.png 这类占位地址。',
    '如果题干、公共题干或标准答案里有配图，必须把图片写到对应 TextBlock.media 里；没有图就保持 media=[]。',
    `每个 media 项固定输出为: { "type":"image", "sourcePageIndex":1-${safeCount}, "x1":0.123, "y1":0.234, "x2":0.456, "y2":0.567, "caption":"", "orderNo":1 }。`,
    'sourcePageIndex 表示图片出自本次输入序列里的第几张图，按上传顺序从 1 开始计数。',
    'x1,y1 是左上角相对坐标；x2,y2 是右下角相对坐标；都必须是 0 到 1 之间的小数。',
    '坐标必须只框住当前题目真正需要保留的图，不要把题号、无关文字、其他题目的图框进去。',
    '如果同一个 TextBlock 里有多张图，就按阅读顺序输出多个 media 项，orderNo 从 1 递增。',
    '如果图片属于公共题干，就写到 GROUP.stem.media；如果属于小题题干，就写到对应 child.prompt.media；如果属于答案区域，就写到对应 standardAnswer.media。',
  ]
}
