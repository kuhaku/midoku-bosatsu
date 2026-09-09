function quotedText(line: string): string {
  return line.replace(/^>\s?/u, '');
}

type TreeQuoteTextSegment = {
  text: string;
  generated: boolean;
  endsLine?: boolean;
};

/** 表示用に挿入したUIを除き、投稿者が書いた引用本文を復元する。 */
export function treeQuoteSourceText(segments: Iterable<TreeQuoteTextSegment>): string {
  const sourceText: string[] = [];
  for (const segment of segments) {
    if (segment.endsLine) break;
    if (!segment.generated) sourceText.push(segment.text);
  }
  return sourceText.join('');
}

/**
 * 親本文と同じ引用行はツリーの親子関係で代替できるため省略する。
 * 親本文に存在しない行は、投稿者が改変した引用として残す。
 */
export function shouldKeepTreeQuoteLine(quoteLine: string, parentBodyText: string): boolean {
  const parentLines = new Set(parentBodyText.split(/\r\n|\r|\n/u));
  return !parentLines.has(quotedText(quoteLine));
}
