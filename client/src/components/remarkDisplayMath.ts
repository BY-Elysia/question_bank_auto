import type { Paragraph, Root, RootContent } from 'mdast';

// remark-math treats same-line $$...$$ as inline math. Textbook output also
// uses that spelling for display equations; promote only parsed math nodes,
// leaving escaped dollars, code, and the saved source text untouched.
export function remarkDisplayMath() {
  return (tree: Root, file: { value: unknown }) => {
    const source = String(file.value);
    function split(paragraph: Paragraph): RootContent[] {
      const blocks: RootContent[] = [];
      let inline: Paragraph['children'] = [];
      const flush = () => {
        if (inline.some((node) => node.type !== 'text' || node.value.trim()))
          blocks.push({ type: 'paragraph', children: inline });
        inline = [];
      };
      for (const node of paragraph.children) {
        const start = node.position?.start.offset;
        const display =
          node.type === 'inlineMath' &&
          start !== undefined &&
          source.slice(start, start + 2) === '$$';
        if (!display || node.type !== 'inlineMath') {
          inline.push(node);
          continue;
        }
        flush();
        blocks.push({
          type: 'math',
          value: node.value,
          data: {
            hName: 'div',
            hProperties: { className: ['math-display'] },
            hChildren: [{ type: 'text', value: node.value }],
          },
        });
      }
      flush();
      return blocks;
    }
    function visit(node: Root | RootContent) {
      if (!('children' in node)) return;
      const children: RootContent[] = [];
      for (const child of node.children) {
        if (child.type === 'paragraph') children.push(...split(child));
        else {
          visit(child);
          children.push(child);
        }
      }
      // Only paragraphs become block siblings; all other child types retain
      // their original parent and position in the Markdown tree.
      node.children = children as typeof node.children;
    }
    visit(tree);
  };
}
