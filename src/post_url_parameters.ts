/** 引用行を除く各HTTP(S) URLから、末尾のクエリパラメータを1つ削除する。 */
export function removeOneUrlParameter(body: string): string {
  return body.replace(/[^\r\n]+/g, (line) => {
    if (line.startsWith('>')) return line;
    return line.replace(/https?:\/\/[^\s<>"']+/gi, (url) => {
      const hashIndex = url.indexOf('#');
      const queryEnd = hashIndex < 0 ? url.length : hashIndex;
      const queryStart = url.indexOf('?');
      if (queryStart < 0 || queryStart >= queryEnd - 1) return url;

      // URLSearchParamsで再シリアライズせず、残るURLの表記を保持する。
      const query = url.slice(queryStart + 1, queryEnd);
      const lastSeparator = query.lastIndexOf('&');
      const end = lastSeparator < 0 ? queryStart : queryStart + 1 + lastSeparator;
      return url.slice(0, end) + url.slice(queryEnd);
    });
  });
}
