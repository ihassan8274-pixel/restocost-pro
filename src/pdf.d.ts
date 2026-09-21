declare module 'arabic-reshaper' {
  const ArabicReshaper: {
    convertArabic: (text: string) => string;
    convertArabicBack: (text: string) => string;
  };
  export default ArabicReshaper;
}

declare module 'bidi-js' {
  interface EmbeddingLevelsResult {
    levels: Int8Array;
    paragraphs: { level: number; start: number; end: number }[];
  }
  interface Bidi {
    getEmbeddingLevels: (text: string, baseDirection?: 'ltr' | 'rtl') => EmbeddingLevelsResult;
    getReorderedString: (text: string, levels: EmbeddingLevelsResult, start?: number, end?: number) => string;
  }
  const bidiFactory: () => Bidi;
  export default bidiFactory;
}
