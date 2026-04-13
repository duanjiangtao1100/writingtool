// 章节查看器组件

// 类型定义
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
}

export function ChapterViewer({ chapters, currentChapterNumber, onChapterChange }: ChapterViewerProps) {
  const currentChapter = chapters.find(c => c.chapterNumber === currentChapterNumber);

  if (chapters.length === 0) {
    return (
      <div style={{ padding: '20px' }}>
        <h2>章节查看器</h2>
        <p>还没有生成章节，请先从大纲开始。</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* 侧边栏 - 章节列表 */}
      <div style={{ width: '200px', borderRight: '1px solid #eee', overflowY: 'auto' }}>
        <div style={{ padding: '10px', fontWeight: 'bold' }}>
          章节列表
        </div>
        {chapters.map((chapter) => (
          <div
            key={chapter.id}
            onClick={() => onChapterChange(chapter.chapterNumber)}
            style={{
              padding: '10px',
              cursor: 'pointer',
              backgroundColor: chapter.chapterNumber === currentChapterNumber ? '#f0f0f0' : 'transparent',
            }}
          >
            第{chapter.chapterNumber}章<br />
            <span style={{ fontSize: '12px', color: '#666' }}>
              {chapter.title}
            </span>
          </div>
        ))}
      </div>

      {/* 主内容区 */}
      <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
        {currentChapter ? (
          <>
            <h2>第{currentChapter.chapterNumber}章: {currentChapter.title}</h2>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.8' }}>
              {currentChapter.content}
            </div>
          </>
        ) : (
          <p>请选择一个章节查看。</p>
        )}
      </div>
    </div>
  );
}
