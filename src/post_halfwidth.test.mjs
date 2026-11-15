import test from 'node:test';
import assert from 'node:assert/strict';

const module = await import('./post_halfwidth.ts').catch(() => null);
const convert = (text) => {
  assert.ok(module, '半角カナ変換モジュールが必要です');
  return module.convertPostBodyToHalfwidth(text);
};

test('全角カタカナ・濁音・半濁音と英数字を半角にする', () => {
  assert.equal(convert('アイウエオ カタカナ ガギグゲゴ パピプペポ ヴ ァィゥェォッャュョ ＡＺａｚ０９'),
    'ｱｲｳｴｵ ｶﾀｶﾅ ｶﾞｷﾞｸﾞｹﾞｺﾞ ﾊﾟﾋﾟﾌﾟﾍﾟﾎﾟ ｳﾞ ｧｨｩｪｫｯｬｭｮ AZaz09');
});

test('記号は長音だけをハイフンにし、空白や他の文字を保持する', () => {
  assert.equal(convert('コーヒー　「」、。・！？－〜 ゛゜ ひらがな漢字 ① ｶﾞ ABC123'),
    'ｺ-ﾋ-　「」、。・！？－〜 ゛゜ ひらがな漢字 ① ｶﾞ ABC123');
});

test('引用行と改行コードを保持し、行頭以外の > は引用扱いしない', () => {
  assert.equal(convert('>ガーＡ１\r\n>>パーＢ２\n カーＣ３\r本文 > カー\n'),
    '>ガーＡ１\r\n>>パーＢ２\n ｶ-C3\r本文 > ｶ-\n');
});

test('空文字と変換済みの本文は変わらず、繰り返し変換できる', () => {
  assert.equal(convert(''), '');
  const once = convert('ガーＡ１');
  assert.equal(convert(once), once);
});
