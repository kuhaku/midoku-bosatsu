const numericCharacterReferencePattern = /&#(?:x([0-9a-f]+)|([0-9]+));/giu;

export function expandNumericCharacterReferences(value: string): string {
  return value.replace(numericCharacterReferencePattern, (reference, hexadecimal: string | undefined, decimal: string | undefined) => {
    const digits = hexadecimal ?? decimal;
    if (!digits) return reference;
    const codePoint = Number.parseInt(digits, hexadecimal ? 16 : 10);
    if (!Number.isInteger(codePoint) || codePoint < 1 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      return reference;
    }
    return String.fromCodePoint(codePoint);
  });
}
