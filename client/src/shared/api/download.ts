export async function downloadFile(url: string, filename: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('导出失败，请刷新后重试。');
  const blob = await response.blob(),
    link = document.createElement('a'),
    objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
}
