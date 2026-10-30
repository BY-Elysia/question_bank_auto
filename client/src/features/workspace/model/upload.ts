export function uploadProblem(next: File[]): string | null {
  if (next.some((f) => !/\.(pdf|png|jpe?g|webp)$/i.test(f.name))) {
    return '请选择 PDF、PNG、JPEG 或 WebP 文件。';
  }
  const pdf = next.filter((f) => /\.pdf$/i.test(f.name));
  if (pdf.length && (pdf.length !== 1 || next.length !== 1)) {
    return '一次上传一个 PDF，或一组图片，请勿混合。';
  }
  if (
    next.length > 500 ||
    next.reduce((n, f) => n + f.size, 0) > 100 * 1024 * 1024 ||
    (!pdf.length && next.some((f) => f.size > 20 * 1024 * 1024))
  ) {
    return '总大小不超过 100 MB；图片最多 500 张，每张不超过 20 MB。';
  }
  return null;
}
