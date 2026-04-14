// 大纲编辑器组件

import { useState } from 'react';

// 类型定义
interface OutlineItem {
  id: string;
  chapterNumber: number;
  title: string;
  description: string;
}

interface NovelOutline {
  id: string;
  title: string;
  chapters: OutlineItem[];
  coreSummary: string;
  createdAt: number;
  updatedAt: number;
}

interface OutlineEditorProps {
  outline: NovelOutline;
  onUpdate: (outline: NovelOutline) => void;
  onGenerateChapter: (chapterIndex: number) => void;
  onGenerateAllChapters: (startChapterNumber: number) => void;
  isGeneratingAllChapters: boolean;
  batchGenerationProgress: { current: number; total: number } | null;
}

export function OutlineEditor({
  outline,
  onUpdate,
  onGenerateChapter,
  onGenerateAllChapters,
  isGeneratingAllChapters,
  batchGenerationProgress,
}: OutlineEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [batchStartChapterInput, setBatchStartChapterInput] = useState('1');

  const maxChapterNumber = outline.chapters.reduce((max, chapter) => Math.max(max, chapter.chapterNumber), 1);

  const startEdit = (index: number, item: OutlineItem) => {
    setEditingIndex(index);
    setEditTitle(item.title);
    setEditDescription(item.description);
  };

  const saveEdit = () => {
    if (editingIndex === null) return;

    const updatedChapters = [...outline.chapters];
    updatedChapters[editingIndex] = {
      ...updatedChapters[editingIndex],
      title: editTitle,
      description: editDescription,
    };

    onUpdate({
      ...outline,
      chapters: updatedChapters,
      updatedAt: Date.now(),
    });
    setEditingIndex(null);
  };

  const handleGenerateAllClick = () => {
    const parsed = Number.parseInt(batchStartChapterInput, 10);
    const normalized = Number.isFinite(parsed) ? Math.min(maxChapterNumber, Math.max(1, Math.floor(parsed))) : 1;
    setBatchStartChapterInput(String(normalized));
    onGenerateAllChapters(normalized);
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>{outline.title}</h2>
      <div style={{ marginBottom: '16px' }}>
        <label style={{ marginRight: '8px' }}>
          从第
        </label>
        <input
          type="number"
          min={1}
          max={maxChapterNumber}
          step={1}
          value={batchStartChapterInput}
          onChange={(e) => setBatchStartChapterInput(e.target.value)}
          disabled={isGeneratingAllChapters || outline.chapters.length === 0}
          style={{ width: '90px', marginRight: '6px', padding: '4px 6px' }}
        />
        <span style={{ marginRight: '10px' }}>章开始</span>
        <button
          onClick={handleGenerateAllClick}
          disabled={isGeneratingAllChapters || outline.chapters.length === 0}
          style={{ marginRight: '10px' }}
        >
          {isGeneratingAllChapters ? '批量生成中...' : '一键生成全部章节'}
        </button>
        {isGeneratingAllChapters && batchGenerationProgress && (
          <span style={{ color: '#666', fontSize: '14px' }}>
            {`进度：${batchGenerationProgress.current}/${batchGenerationProgress.total}`}
          </span>
        )}
      </div>
      <div style={{ marginBottom: '20px' }}>
        <h3>核心摘要</h3>
        <textarea
          value={outline.coreSummary}
          onChange={(e) => onUpdate({ ...outline, coreSummary: e.target.value })}
          style={{ width: '100%', height: '100px', padding: '8px' }}
        />
      </div>
      <h3>大纲 ({outline.chapters.length} 章)</h3>
      <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
        {outline.chapters.map((chapter, index) => (
          <div key={chapter.id} style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
            {editingIndex === index ? (
              <div>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  style={{ width: '100%', padding: '8px', marginBottom: '5px' }}
                />
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  style={{ width: '100%', height: '80px', padding: '8px' }}
                />
                <button onClick={saveEdit} style={{ marginRight: '5px' }}>
                  保存
                </button>
                <button onClick={() => setEditingIndex(null)}>
                  取消
                </button>
              </div>
            ) : (
              <div>
                <div style={{ fontWeight: 'bold' }}>
                  第{chapter.chapterNumber}章: {chapter.title}
                </div>
                <div style={{ color: '#666', fontSize: '14px' }}>
                  {chapter.description}
                </div>
                <button
                  onClick={() => startEdit(index, chapter)}
                  disabled={isGeneratingAllChapters}
                  style={{ marginRight: '5px' }}
                >
                  编辑
                </button>
                <button onClick={() => onGenerateChapter(index)} disabled={isGeneratingAllChapters}>
                  生成章节
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
