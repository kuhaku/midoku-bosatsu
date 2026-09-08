function quotedText(line: string): string {
  return line.replace(/^>\s?/u, '');
}

/**
 * 親本文と同じ引用行はツリーの親子関係で代替できるため省略する。
 * 親本文に存在しない行は、投稿者が改変した引用として残す。
 */
export function shouldKeepTreeQuoteLine(quoteLine: string, parentBodyText: string): boolean {
  const parentLines = new Set(parentBodyText.split(/\r\n|\r|\n/u));
  return !parentLines.has(quotedText(quoteLine));
}
