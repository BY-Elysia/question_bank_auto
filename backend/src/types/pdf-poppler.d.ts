declare module 'pdf-poppler' {
  const poppler: {
    convert: (file: string, options: Record<string, unknown>) => Promise<unknown>
    info: (file: string) => Promise<unknown>
  }
  export = poppler
}
