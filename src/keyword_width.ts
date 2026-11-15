type WidthSegment = { source: string; text: string; start: number; end: number };

function widthSegments(value: string): WidthSegment[] {
  const result: WidthSegment[] = [];
  for (let start = 0; start < value.length;) {
    let source = String.fromCodePoint(value.codePointAt(start)!);
    const next = value[start + source.length] ?? '';
    // 半角カナ＋濁点は一緒に変換し、元の2文字をハイライト対象にする。
    if (/[\uFF66-\uFF9D\u30A0-\u30FF]/u.test(source) && /[\uFF9E\uFF9F\u3099\u309A]/u.test(next)) source += next;
    const text = /[\uFF01-\uFFEF\u3000]/u.test(source) ? source.normalize('NFKC') : source.normalize('NFC');
    result.push({ source, text, start, end: start + source.length });
    start += source.length;
  }
  return result;
}

export function normalizeKeywordWidth(value: string): string {
  return widthSegments(value).map(segment => segment.text).join('');
}

/** 正規表現の既存構文を保ち、幅を変えた文字はリテラルとして埋め込む。 */
export function normalizeKeywordPattern(value: string): string {
  const segments = widthSegments(value);
  const literal = (text: string) => Array.from(text, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`).join('');
  let result = '';
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.source === '\\' && i + 1 < segments.length) {
      const next = segments[++i];
      result += next.source === next.text ? `\\${next.text}` : literal(next.text);
    } else {
      result += segment.source === segment.text ? segment.text : literal(segment.text);
    }
  }
  return result;
}

export function keywordWidthMap(value: string): { text: string; starts: number[]; ends: number[] } {
  let text = '';
  const starts: number[] = [];
  const ends: number[] = [];
  for (const segment of widthSegments(value)) {
    text += segment.text;
    for (let i = 0; i < segment.text.length; i++) {
      starts.push(segment.source === segment.text ? segment.start + i : segment.start);
      ends.push(segment.source === segment.text ? segment.start + i + 1 : segment.end);
    }
  }
  return { text, starts, ends };
}
