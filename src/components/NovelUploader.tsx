// 小说上传组件

import { useState } from 'react';
import mammoth from 'mammoth';

interface NovelUploaderProps {
  onNovelUploaded: (content: string) => void;
}

function decodeTextContent(arrayBuffer: ArrayBuffer): string {
  const bytes = new Uint8Array(arrayBuffer);

  const hasUtf8Bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  if (hasUtf8Bom) {
    return new TextDecoder('utf-8').decode(bytes);
  }

  const hasUtf16LeBom = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;
  if (hasUtf16LeBom) {
    return new TextDecoder('utf-16le').decode(bytes);
  }

  const hasUtf16BeBom = bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff;
  if (hasUtf16BeBom) {
    return new TextDecoder('utf-16be').decode(bytes);
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {}

  try {
    return new TextDecoder('gb18030').decode(bytes);
  } catch {}

  return new TextDecoder().decode(bytes);
}

export function NovelUploader({ onNovelUploaded }: NovelUploaderProps) {
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      if (file.name.toLowerCase().endsWith('.docx')) {
        // 处理 docx 文件
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        setContent(result.value);
      } else {
        // 处理纯文本文件
        const arrayBuffer = await file.arrayBuffer();
        const text = decodeTextContent(arrayBuffer);
        setContent(text);
      }
    } catch (err) {
      console.error('文件读取失败:', err);
      alert('文件读取失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = () => {
    if (content.trim()) {
      onNovelUploaded(content);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>上传样章/小说</h2>
      <div style={{ marginBottom: '10px' }}>
        <input type="file" accept=".txt,.md,.docx" onChange={handleFileUpload} />
        <p style={{ fontSize: '12px', color: '#666' }}>
          支持格式：.txt, .md, .docx
        </p>
      </div>
      <div style={{ marginBottom: '10px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>
          或者直接粘贴内容:
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={{ width: '100%', height: '300px', padding: '8px' }}
          placeholder="粘贴小说内容在这里..."
        />
      </div>
      <button
        onClick={handleSubmit}
        disabled={!content.trim() || isLoading}
        style={{ padding: '10px 20px' }}
      >
        {isLoading ? '加载中...' : '开始分析'}
      </button>
    </div>
  );
}
