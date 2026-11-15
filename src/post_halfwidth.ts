const halfwidthKana = new Map<string, string>();
for (let code = 0xff66; code <= 0xff9d; code++) {
  const half = String.fromCharCode(code);
  halfwidthKana.set(half.normalize('NFKC'), half);
  for (const mark of ['ﾞ', 'ﾟ']) {
    const full = (half + mark).normalize('NFKC');
    if (full.length === 1) halfwidthKana.set(full, half + mark);
  }
}

/** 引用行以外のカタカナ・英数字を半角化し、長音だけはハイフンにする。 */
export function convertPostBodyToHalfwidth(body: string): string {
  return body.replace(/[^\r\n]+/g, (line) => {
    if (line.startsWith('>')) return line;
    return line.replace(/[ァ-ヺーＡ-Ｚａ-ｚ０-９]/g, (character) => {
      if (character === 'ー') return '-';
      if (/[Ａ-Ｚａ-ｚ０-９]/.test(character)) {
        return String.fromCharCode(character.charCodeAt(0) - 0xfee0);
      }
      // 半角に対応する文字がない小書きカナなどは保持する。
      return halfwidthKana.get(character) ?? character;
    });
  });
}
