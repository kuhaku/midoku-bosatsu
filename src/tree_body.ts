export type TreeLineToken = 'content' | 'break' | 'space';

function addRange(target: Set<number>, start: number, endExclusive: number): void {
  for (let index = start; index < endExclusive; index += 1) target.add(index);
}

export function treeLayoutTokenIndexesToRemove(tokens: readonly TreeLineToken[]): number[] {
  const contentIndexes: number[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index] === 'content') contentIndexes.push(index);
  }

  const remove = new Set<number>();
  if (contentIndexes.length === 0) {
    for (let index = 0; index < tokens.length; index += 1) {
      if (tokens[index] !== 'content') remove.add(index);
    }
    return Array.from(remove).sort((a, b) => a - b);
  }

  const firstContent = contentIndexes[0];
  let lastLeadingBreak = -1;
  for (let index = 0; index < firstContent; index += 1) {
    if (tokens[index] === 'break') lastLeadingBreak = index;
  }
  if (lastLeadingBreak >= 0) addRange(remove, 0, lastLeadingBreak + 1);

  for (let pairIndex = 0; pairIndex < contentIndexes.length - 1; pairIndex += 1) {
    const leftContent = contentIndexes[pairIndex];
    const rightContent = contentIndexes[pairIndex + 1];
    const breaks: number[] = [];

    for (let index = leftContent + 1; index < rightContent; index += 1) {
      if (tokens[index] === 'break') breaks.push(index);
    }

    if (breaks.length > 1) {
      addRange(remove, breaks[0], breaks.at(-1) ?? breaks[0]);
    }
  }

  const lastContent = contentIndexes.at(-1) ?? 0;
  let firstTrailingBreak = -1;
  for (let index = lastContent + 1; index < tokens.length; index += 1) {
    if (tokens[index] === 'break') {
      firstTrailingBreak = index;
      break;
    }
  }
  if (firstTrailingBreak >= 0) addRange(remove, firstTrailingBreak, tokens.length);

  return Array.from(remove).sort((a, b) => a - b);
}

function replaceTextNewlinesWithBreaks(body: HTMLElement): void {
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text && /[\r\n]/u.test(current.data)) textNodes.push(current);
    current = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const normalized = textNode.data.replace(/\r\n?/gu, '\n');
    const parts = normalized.split('\n');
    const fragment = document.createDocumentFragment();

    for (let index = 0; index < parts.length; index += 1) {
      if (index > 0) fragment.append(document.createElement('br'));
      if (parts[index]) fragment.append(document.createTextNode(parts[index]));
    }

    textNode.replaceWith(fragment);
  }
}

export function removeTreeEmptyLines(body: HTMLElement): void {
  replaceTextNewlinesWithBreaks(body);

  const walker = document.createTreeWalker(
    body,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );
  const entries: Array<{ token: TreeLineToken; node: Node }> = [];

  let current = walker.nextNode();
  while (current) {
    if (current instanceof HTMLBRElement) {
      entries.push({ token: 'break', node: current });
    } else if (current instanceof HTMLImageElement) {
      entries.push({ token: 'content', node: current });
    } else if (current instanceof Text) {
      const text = current.data;
      if (text.length > 0) {
        entries.push({ token: /^\s*$/u.test(text) ? 'space' : 'content', node: current });
      }
    }
    current = walker.nextNode();
  }

  const removableIndexes = treeLayoutTokenIndexesToRemove(entries.map((entry) => entry.token));
  for (const index of removableIndexes) entries[index]?.node.parentNode?.removeChild(entries[index].node);
}
