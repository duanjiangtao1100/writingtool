import { useState } from 'react';
import mammoth from 'mammoth';
import type { AnalysisDepthMode } from '../storage/localStorage';

interface NovelUploaderProps {
  onNovelUploaded: (content: string) => void;
  analysisDepthMode: AnalysisDepthMode;
  onAnalysisDepthModeChange: (mode: AnalysisDepthMode) => void;
}

type TextEncoding = 'auto' | 'utf-8' | 'gb18030';

function decodeTextContent(arrayBuffer: ArrayBuffer, encoding: TextEncoding): string {
  const bytes = new Uint8Array(arrayBuffer);

  if (encoding !== 'auto') {
    return new TextDecoder(encoding).decode(bytes);
  }

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

export function NovelUploader({ onNovelUploaded, analysisDepthMode, onAnalysisDepthModeChange }: NovelUploaderProps) {
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [textEncoding, setTextEncoding] = useState<TextEncoding>('auto');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      if (file.name.toLowerCase().endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        setContent(result.value);
      } else {
        const arrayBuffer = await file.arrayBuffer();
        const text = decodeTextContent(arrayBuffer, textEncoding);
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
          支持格式：.txt、.md、.docx
        </p>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>文本编码</label>
        <select
          value={textEncoding}
          onChange={(e) => setTextEncoding(e.target.value as TextEncoding)}
          style={{ minWidth: '220px', padding: '6px' }}
        >
          <option value="auto">自动检测（推荐）</option>
          <option value="utf-8">UTF-8</option>
          <option value="gb18030">GB18030（兼容 GBK/ANSI）</option>
        </select>
      </div>

      <div style={{ marginBottom: '14px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>分析模式</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label
            style={{
              display: 'block',
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              padding: '12px',
              backgroundColor: analysisDepthMode === 'quick' ? '#eff6ff' : '#fff',
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name="analysis-depth-mode"
              value="quick"
              checked={analysisDepthMode === 'quick'}
              onChange={() => onAnalysisDepthModeChange('quick')}
              style={{ marginRight: '8px' }}
            />
            <strong>快速分析（默认）</strong>
            <div style={{ marginTop: '6px', color: '#4b5563', lineHeight: 1.6 }}>
              只做必要的风格分析和快速剧情总结，明显更快，适合先出结果再生成大纲。
            </div>
          </label>

          <label
            style={{
              display: 'block',
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              padding: '12px',
              backgroundColor: analysisDepthMode === 'deep' ? '#eff6ff' : '#fff',
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name="analysis-depth-mode"
              value="deep"
              checked={analysisDepthMode === 'deep'}
              onChange={() => onAnalysisDepthModeChange('deep')}
              style={{ marginRight: '8px' }}
            />
            <strong>深度分析（较慢）</strong>
            <div style={{ marginTop: '6px', color: '#4b5563', lineHeight: 1.6 }}>
              会对前 100 章做更细的剧情模式拆解，结果更完整，但请求次数更多。
            </div>
          </label>
        </div>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>
          或者直接粘贴内容
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
