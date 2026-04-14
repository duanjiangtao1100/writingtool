import { useEffect, useState } from 'react';

interface NovelChapter {
  id: string;
  chapterNumber: number;
  title: string;
  content: string;
  createdAt: number;
}

interface ChapterViewerProps {
  chapters: NovelChapter[];
  currentChapterNumber: number;
  onChapterChange: (chapterNumber: number) => void;
  outlineTitle?: string;
  onChapterUpdate?: (chapter: NovelChapter) => Promise<void> | void;
}

export function ChapterViewer({
  chapters,
  currentChapterNumber,
  onChapterChange,
  outlineTitle,
  onChapterUpdate,
}: ChapterViewerProps) {
  const currentChapter = chapters.find((chapter) => chapter.chapterNumber === currentChapterNumber) || chapters[0];
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!currentChapter) {
      return;
    }

    setDraftContent(currentChapter.content);
    setIsEditing(false);
    setIsCopied(false);
  }, [currentChapter]);

  const fallbackCopyText = (text: string) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  };

  const handleCopy = async () => {
    if (!currentChapter) {
      return;
    }

    const text = isEditing ? draftContent : currentChapter.content;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopyText(text);
      }
    } catch {
      fallbackCopyText(text);
    }

    setIsCopied(true);
    window.setTimeout(() => setIsCopied(false), 1500);
  };

  const handleExportAllChapters = () => {
    if (chapters.length === 0) {
      return;
    }

    const sortedChapters = [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);
    const novelTitle = (outlineTitle || '小说').trim() || '小说';
    const safeTitle = novelTitle.replace(/[\\/:*?"<>|]+/g, '_');
    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

    const exportContent = [
      `标题：${novelTitle}`,
      `导出时间：${now.toLocaleString()}`,
      '',
      ...sortedChapters.flatMap((chapter, index) => [
        `第${chapter.chapterNumber}章 ${chapter.title || `第${chapter.chapterNumber}章`}`,
        '',
        chapter.content,
        ...(index === sortedChapters.length - 1 ? [] : ['', '--------------------------------------------------', '']),
      ]),
    ].join('\n');

    const blob = new Blob(['\uFEFF', exportContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeTitle}_全部章节_${timestamp}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleEditOrSave = async () => {
    if (!isEditing) {
      setIsEditing(true);
      return;
    }

    if (!currentChapter || !onChapterUpdate) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onChapterUpdate({
        ...currentChapter,
        content: draftContent,
      });
      setIsEditing(false);
    } catch (error) {
      console.error('保存章节失败:', error);
      alert('保存失败，请稍后重试');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (!currentChapter) {
      return;
    }

    setDraftContent(currentChapter.content);
    setIsEditing(false);
  };

  if (chapters.length === 0) {
    return (
      <div style={{ padding: '20px' }}>
        <h2>章节内容</h2>
        <p>当前大纲还没有生成章节，请先回到大纲页生成章节。</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 60px)', backgroundColor: '#fafafa' }}>
      <aside
        style={{
          width: '280px',
          borderRight: '1px solid #e5e7eb',
          backgroundColor: '#fff',
          overflowY: 'auto',
        }}
      >
        <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>{outlineTitle || '当前大纲'}</div>
          <div style={{ fontSize: '18px', fontWeight: 700 }}>章节列表</div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '6px' }}>已生成 {chapters.length} 章</div>
        </div>

        {chapters.map((chapter) => {
          const isActive = chapter.chapterNumber === currentChapter.chapterNumber;

          return (
            <button
              key={chapter.id}
              onClick={() => onChapterChange(chapter.chapterNumber)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '14px 16px',
                border: 'none',
                borderBottom: '1px solid #f3f4f6',
                backgroundColor: isActive ? '#eff6ff' : '#fff',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '12px', color: isActive ? '#2563eb' : '#6b7280', marginBottom: '4px' }}>
                第 {chapter.chapterNumber} 章
              </div>
              <div style={{ fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
                {chapter.title || `第 ${chapter.chapterNumber} 章`}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>{new Date(chapter.createdAt).toLocaleString()}</div>
            </button>
          );
        })}
      </aside>

      <main style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        <div
          style={{
            maxWidth: '960px',
            margin: '0 auto',
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.04)',
          }}
        >
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>{outlineTitle || '当前大纲'}</div>
          <h2 style={{ marginTop: 0, marginBottom: '8px' }}>
            第 {currentChapter.chapterNumber} 章 · {currentChapter.title}
          </h2>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginBottom: '12px' }}>
            <button
              onClick={handleExportAllChapters}
              style={{
                border: '1px solid #d1d5db',
                backgroundColor: '#fff',
                color: '#111827',
                padding: '6px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              一键导出
            </button>
            <button
              onClick={() => {
                void handleEditOrSave();
              }}
              disabled={isSaving}
              style={{
                border: '1px solid #d1d5db',
                backgroundColor: '#fff',
                color: '#111827',
                padding: '6px 12px',
                borderRadius: '8px',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                opacity: isSaving ? 0.6 : 1,
              }}
            >
              {isSaving ? '保存中...' : isEditing ? '保存' : '编辑'}
            </button>
            {isEditing && (
              <button
                onClick={handleCancelEdit}
                disabled={isSaving}
                style={{
                  border: '1px solid #d1d5db',
                  backgroundColor: '#fff',
                  color: '#111827',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  opacity: isSaving ? 0.6 : 1,
                }}
              >
                取消编辑
              </button>
            )}
            <button
              onClick={() => {
                void handleCopy();
              }}
              style={{
                border: '1px solid #d1d5db',
                backgroundColor: '#fff',
                color: '#111827',
                padding: '6px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              {isCopied ? '已复制' : '复制'}
            </button>
          </div>

          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '20px' }}>
            生成时间：{new Date(currentChapter.createdAt).toLocaleString()}
          </div>

          {isEditing ? (
            <textarea
              value={draftContent}
              onChange={(event) => setDraftContent(event.target.value)}
              style={{
                width: '100%',
                minHeight: '420px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                padding: '12px',
                lineHeight: 1.9,
                color: '#111827',
                fontFamily: 'inherit',
                fontSize: '15px',
                resize: 'vertical',
              }}
            />
          ) : (
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.9, color: '#111827' }}>{currentChapter.content}</div>
          )}
        </div>
      </main>
    </div>
  );
}
