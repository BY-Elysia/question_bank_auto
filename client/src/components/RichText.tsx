import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { remarkDisplayMath } from './remarkDisplayMath';
import { memo } from 'react';
import 'katex/dist/katex.min.css';
export default memo(function RichText({ text }: { text: string }) {
  return (
    <div className="rich-text">
      <Markdown
        components={{ img: ({ alt }) => <span>{alt ?? '图片请查看原图区域'}</span> }}
        remarkPlugins={[remarkMath, remarkDisplayMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {text}
      </Markdown>
    </div>
  );
});
