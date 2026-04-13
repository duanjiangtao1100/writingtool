// 小说上传组件

import { useState } from 'react';
import mammoth from 'mammoth';

interface NovelUploaderProps {
  onNovelUploaded: (content: string) => void;
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
        const reader = new FileReader();
        reader.onload = (event) => {
          const text = event.target?.result as string;
          setContent(text);
        };
        reader.readAsText(file);
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
