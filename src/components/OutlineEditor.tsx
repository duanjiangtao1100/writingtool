// 大纲编辑器组件

import { useState } from 'react';

// 类型定义
interface OutlineItem {
  id: string;
  chapterNumber: number;
  title: string;
  description: string;
}

interface ContinuityIssue {
  id: string;
  chapterRange: string;
  severity: 'high' | 'medium' | 'low';
  problem: string;
  impact: string;
  suggestion: string;
}

interface OutlineContinuityCheck {
  checkedAt: number;
  overallVerdict: string;
  summary: string;
  issues: ContinuityIssue[];
  usedFallback?: boolean;
}

interface NovelOutline {
  id: string;
  title: string;
  chapters: OutlineItem[];
  coreSummary: string;
  continuityCheck?: OutlineContinuityCheck | null;
  createdAt: number;
  updatedAt: number;
}

interface OutlineEditorProps {
  outline: NovelOutline;
  onUpdate: (outline: NovelOutline) => void;
  onGenerateChapter: (chapterIndex: number) => void;
  onCheckContinuity: () => void | Promise<void>;
  isCheckingContinuity?: boolean;
  globalMemorySummary?: string;
  recentOutlineSummary?: string;
  outlineAnchorCount?: number;
}

export function OutlineEditor({
  outline,
  onUpdate,
  onGenerateChapter,
  onCheckContinuity,
  isCheckingContinuity = false,
  globalMemorySummary,
  recentOutlineSummary,
  outlineAnchorCount,
}: OutlineEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const continuityCheck = outline.continuityCheck;
  const isContinuityCheckStale = Boolean(continuityCheck && outline.updatedAt > continuityCheck.checkedAt);

  const getSeverityStyles = (severity: ContinuityIssue['severity']) => {
    if (severity === 'high') {
      return { backgroundColor: '#fef2f2', color: '#b91c1c', label: '高' };
    }

    if (severity === 'low') {
      return { backgroundColor: '#f0fdf4', color: '#15803d', label: '低' };
    }

    return { backgroundColor: '#fffbeb', color: '#b45309', label: '中' };
  };

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

  return (
    <div style={{ padding: '20px' }}>
      <h2>{outline.title}</h2>
      <div style={{ marginBottom: '20px' }}>
        <h3>核心摘要</h3>
        <textarea
          value={outline.coreSummary}
          onChange={(e) => onUpdate({ ...outline, coreSummary: e.target.value, updatedAt: Date.now() })}
          style={{ width: '100%', height: '100px', padding: '8px' }}
        />
      </div>
      {(globalMemorySummary || recentOutlineSummary) && (
        <div style={{ marginBottom: '20px', padding: '16px', border: '1px solid #ddd6fe', borderRadius: '12px', backgroundColor: '#faf5ff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <h3 style={{ margin: 0 }}>全局记忆概览</h3>
            {outlineAnchorCount ? (
              <span style={{ fontSize: '12px', color: '#6d28d9', backgroundColor: '#ede9fe', borderRadius: '999px', padding: '4px 10px', fontWeight: 600 }}>
                当前锚点数：{outlineAnchorCount}
              </span>
            ) : null}
          </div>
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px', lineHeight: 1.6 }}>
            这里展示系统用于后续批次续写的全局故事记忆，帮助你快速理解整部小说的主线走向、关键转折和最近阶段状态。
          </div>
          {globalMemorySummary && (
            <div style={{ marginBottom: recentOutlineSummary ? '14px' : 0 }}>
              <div style={{ fontWeight: 700, marginBottom: '8px', color: '#581c87' }}>整体走向 / 关键故事线</div>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, color: '#111827', backgroundColor: '#fff', border: '1px solid #e9d5ff', borderRadius: '10px', padding: '12px' }}>
                {globalMemorySummary}
              </div>
            </div>
          )}
          {recentOutlineSummary && (
            <div>
              <div style={{ fontWeight: 700, marginBottom: '8px', color: '#581c87' }}>最近两批走势</div>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, color: '#111827', backgroundColor: '#fff', border: '1px solid #e9d5ff', borderRadius: '10px', padding: '12px' }}>
                {recentOutlineSummary}
              </div>
            </div>
          )}
        </div>
      )}
      <div style={{ marginBottom: '20px', padding: '16px', border: '1px solid #e5e7eb', borderRadius: '12px', backgroundColor: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '12px', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>章节故事剧情连贯性检查</h3>
          <button onClick={() => void onCheckContinuity()} disabled={isCheckingContinuity}>
            {isCheckingContinuity ? '检查中...' : continuityCheck ? '重新检查' : '开始检查'}
          </button>
        </div>

        {continuityCheck ? (
          <div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '10px', fontSize: '13px', color: '#4b5563' }}>
              <span>总体判断：{continuityCheck.overallVerdict || '已完成检查'}</span>
              <span>检查时间：{new Date(continuityCheck.checkedAt).toLocaleString()}</span>
              {continuityCheck.usedFallback && (
                <span style={{ color: '#b45309', fontWeight: 600 }}>当前结果为容错解析版，建议必要时重试一次</span>
              )}
              {isContinuityCheckStale && (
                <span style={{ color: '#b45309', fontWeight: 600 }}>当前大纲已更新，结果可能已过期</span>
              )}
            </div>

            {continuityCheck.usedFallback && (
              <div style={{ marginBottom: '12px', padding: '10px 12px', borderRadius: '8px', backgroundColor: '#fffbeb', color: '#92400e', lineHeight: 1.6 }}>
                本次连贯性检查的模型返回并非完整 JSON，系统已自动进行容错解析并尽量还原结果；如果你想获得更稳定的检查结论，建议点击“重新检查”。
              </div>
            )}

            <div style={{ marginBottom: '12px', color: '#374151', lineHeight: 1.6 }}>
              {continuityCheck.summary || '已完成连贯性检查，当前未返回摘要。'}
            </div>

            {continuityCheck.issues.length === 0 ? (
              <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#f0fdf4', color: '#166534' }}>
                未发现明显的章节剧情连贯性问题，可以继续写作。
              </div>
            ) : (
              <div>
                {continuityCheck.issues.map((issue) => {
                  const severityStyles = getSeverityStyles(issue.severity);

                  return (
                    <div
                      key={issue.id}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '10px',
                        padding: '12px',
                        marginBottom: '10px',
                        backgroundColor: '#fafafa',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                        <strong>{issue.chapterRange}</strong>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '999px',
                            fontSize: '12px',
                            fontWeight: 600,
                            backgroundColor: severityStyles.backgroundColor,
                            color: severityStyles.color,
                          }}
                        >
                          {severityStyles.label}风险
                        </span>
                      </div>
                      <div style={{ marginBottom: '6px', color: '#111827' }}>
                        <strong>问题：</strong>{issue.problem || '未提供'}
                      </div>
                      <div style={{ marginBottom: '6px', color: '#4b5563' }}>
                        <strong>影响：</strong>{issue.impact || '未提供'}
                      </div>
                      <div style={{ color: '#1d4ed8' }}>
                        <strong>建议：</strong>{issue.suggestion || '未提供'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: '#6b7280', lineHeight: 1.6 }}>
            点击“开始检查”后，AI 会从因果链、角色动机、伏笔回收、设定一致性和节奏衔接几个维度检查当前大纲。
          </div>
        )}
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
                  style={{ marginRight: '5px' }}
                >
                  编辑
                </button>
                <button onClick={() => onGenerateChapter(index)}>
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
