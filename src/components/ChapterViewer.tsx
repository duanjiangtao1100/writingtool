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
}

export function ChapterViewer({
  chapters,
  currentChapterNumber,
  onChapterChange,
  outlineTitle,
}: ChapterViewerProps) {
  const currentChapter = chapters.find((chapter) => chapter.chapterNumber === currentChapterNumber) || chapters[0];

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
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>
            {outlineTitle || '当前大纲'}
          </div>
          <div style={{ fontSize: '18px', fontWeight: 700 }}>章节列表</div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '6px' }}>
            已生成 {chapters.length} 章
          </div>
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
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                {new Date(chapter.createdAt).toLocaleString()}
              </div>
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
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>
            {outlineTitle || '当前大纲'}
          </div>
          <h2 style={{ marginTop: 0, marginBottom: '8px' }}>
            第 {currentChapter.chapterNumber} 章 {currentChapter.title}
          </h2>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '20px' }}>
            生成时间：{new Date(currentChapter.createdAt).toLocaleString()}
          </div>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.9, color: '#111827' }}>
            {currentChapter.content}
          </div>
        </div>
      </main>
    </div>
  );
}