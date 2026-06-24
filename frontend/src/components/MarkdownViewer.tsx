import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import type { Components } from 'react-markdown';

interface MarkdownViewerProps {
  content: string;
  onImageClick?: (src: string) => void;
}

export default function MarkdownViewer({ content, onImageClick }: MarkdownViewerProps) {
  // 预处理内容：将行首空格替换为 Non-Breaking Space，保留缩进
  const processedContent = (content || '').replace(/^ +/gm, (match) => {
    return match.replace(/ /g, ' ');
  });

  const components: Components = {
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const isInline = !match;
      if (isInline) {
        return (
          <code className={`${className} bg-noc-bg px-1 py-0.5 rounded text-sm text-noc-text font-mono`} {...props}>
            {children}
          </code>
        );
      }
      return (
        <SyntaxHighlighter
          style={oneLight as Record<string, React.CSSProperties>}
          language={match[1]}
          PreTag="div"
          className="rounded-lg border border-noc-border shadow-sm bg-noc-bg !m-0 my-2"
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      );
    },
    p: ({ children, ...props }) => (
      <div style={{ marginBottom: '1em', whiteSpace: 'pre-wrap' }} {...props}>
        {children}
      </div>
    ),
    img: ({ ...props }) => (
      <img
        {...props}
        className="rounded-lg shadow-sm border border-noc-border cursor-zoom-in hover:shadow-md transition-all max-h-96 object-contain bg-noc-bg my-4"
        onClick={() => onImageClick && onImageClick(props.src || '')}
        alt={props.alt || ''}
      />
    ),
  };

  return (
    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} className="text-noc-text text-base leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
