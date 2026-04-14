import { useCallback, useEffect, useState } from 'react';
import { SettingsForm } from './components/SettingsForm';
import { NovelUploader } from './components/NovelUploader';
import { OutlineEditor } from './components/OutlineEditor';
import { ChapterViewer } from './components/ChapterViewer';
import { useLLM } from './hooks/useLLM';
import { useOutline } from './hooks/useOutline';
import { useChapters } from './hooks/useChapters';
import {
  loadCurrentOutlineId,
  loadLLMConfig,
  loadOutlineChapterCount,
  loadStyleAnalysis,
  saveCurrentOutlineId,
  saveOutlineChapterCount,
  saveStyleAnalysis,
} from './storage/localStorage';
import './App.css';

interface LLMConfig {
  apiUrl: string;
  apiToken: string;
  model: string;
}

interface NovelChapter {
  id: string;
  chapterNumber: number;
  title: string;
  content: string;
  createdAt: number;
}

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

interface StyleAnalysis {
  styleDescription: string;
  keyElements: string[];
  plotPatternAnalysis: string;
}

type AppState = 'settings' | 'upload' | 'analysis' | 'outline' | 'chapters';

const DEFAULT_OUTLINE_CHAPTER_COUNT = 100;
const MIN_OUTLINE_CHAPTER_COUNT = 1;
const MAX_OUTLINE_CHAPTER_COUNT = 200;

function normalizeOutlineChapterCount(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_OUTLINE_CHAPTER_COUNT;
  }

  return Math.min(MAX_OUTLINE_CHAPTER_COUNT, Math.max(MIN_OUTLINE_CHAPTER_COUNT, Math.floor(value)));
}

function extractAndParseJSON(text: string): any {
  const cleaned = text
    .replace(/^```(?:json|JSON)?\s*/gm, '')
    .replace(/```\s*$/gm, '');

  const objectStartIndex = cleaned.indexOf('{');
  const arrayStartIndex = cleaned.indexOf('[');
  let startIndex = -1;

  if (objectStartIndex !== -1 && arrayStartIndex !== -1) {
    startIndex = Math.min(objectStartIndex, arrayStartIndex);
  } else if (objectStartIndex !== -1) {
    startIndex = objectStartIndex;
  } else if (arrayStartIndex !== -1) {
    startIndex = arrayStartIndex;
  }

  if (startIndex === -1) {
    throw new Error('No JSON start marker found');
  }

  const startChar = cleaned[startIndex];
  const endChar = startChar === '{' ? '}' : ']';
  let bracketCount = 0;
  let inString = false;
  let escaped = false;
  let endIndex = -1;

  for (let i = startIndex; i < cleaned.length; i++) {
    const char = cleaned[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === startChar) {
        bracketCount++;
      } else if (char === endChar) {
        bracketCount--;
        if (bracketCount === 0) {
          endIndex = i;
          break;
        }
      }
    }
  }

  if (endIndex === -1) {
    throw new Error('No matching JSON closing bracket found');
  }

  const jsonStr = cleaned.slice(startIndex, endIndex + 1);

  try {
    return JSON.parse(jsonStr);
  } catch {
    const fixed = jsonStr.replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(fixed);
  }
}

function parseStyleAnalysisResponse(response: string): StyleAnalysis {
  const parsed = extractAndParseJSON(response);

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const plotPatternAnalysis =
      typeof parsed.plotPatternAnalysis === 'string'
        ? parsed.plotPatternAnalysis.trim()
        : typeof parsed.plotPattern === 'string'
          ? parsed.plotPattern.trim()
          : typeof parsed.storyPatternAnalysis === 'string'
            ? parsed.storyPatternAnalysis.trim()
            : typeof parsed['剧情模式分析'] === 'string'
              ? parsed['剧情模式分析'].trim()
              : '';

    return {
      styleDescription: typeof parsed.styleDescription === 'string' ? parsed.styleDescription.trim() : response.trim(),
      keyElements: Array.isArray(parsed.keyElements)
        ? parsed.keyElements.filter((item): item is string => typeof item === 'string')
        : [],
      plotPatternAnalysis,
    };
  }

  if (Array.isArray(parsed)) {
    return {
      styleDescription: response.trim(),
      keyElements: parsed.filter((item): item is string => typeof item === 'string'),
      plotPatternAnalysis: '',
    };
  }

  return {
    styleDescription: response.trim(),
    keyElements: [],
    plotPatternAnalysis: '',
  };
}

function parseOutlineResponse(response: string): { title: string; chapters: OutlineItem[] } {
  const parsed = extractAndParseJSON(response);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Outline response is not a JSON object');
  }

  const chapters = Array.isArray(parsed.chapters) ? parsed.chapters : [];

  return {
    title: typeof parsed.title === 'string' ? parsed.title.trim() : 'New Novel',
    chapters: chapters.map((chapter: any, index: number) => ({
      id: String(index + 1),
      chapterNumber: typeof chapter?.chapterNumber === 'number' ? chapter.chapterNumber : index + 1,
      title: typeof chapter?.title === 'string' && chapter.title.trim() ? chapter.title.trim() : `Chapter ${index + 1}`,
      description: typeof chapter?.description === 'string' ? chapter.description.trim() : '',
    })),
  };
}

function salvageOutlineResponse(response: string): { title: string; chapters: OutlineItem[] } {
  const cleaned = response
    .replace(/^```(?:json|JSON)?\s*/gm, '')
    .replace(/```\s*$/gm, '');

  const titleMatch = cleaned.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const title = titleMatch?.[1]
    ? titleMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').trim()
    : 'New Novel';

  const chapterPattern = /\{[^{}]*"chapterNumber"\s*:\s*(\d+)[^{}]*"title"\s*:\s*"((?:[^"\\]|\\.)*)"[^{}]*"description"\s*:\s*"((?:[^"\\]|\\.)*)"[^{}]*\}/g;
  const chapters: OutlineItem[] = [];

  for (const match of cleaned.matchAll(chapterPattern)) {
    chapters.push({
      id: String(chapters.length + 1),
      chapterNumber: Number(match[1]),
      title: match[2].replace(/\\"/g, '"').replace(/\\n/g, '\n').trim() || `Chapter ${chapters.length + 1}`,
      description: match[3].replace(/\\"/g, '"').replace(/\\n/g, '\n').trim(),
    });
  }

  if (chapters.length === 0) {
    throw new Error('Failed to salvage any chapters from outline response');
  }

  return { title, chapters };
}

const ANALYSIS_PROMPT = `你是一个专业的小说风格分析师。请分析以下小说的写作风格。

请输出以下内容：
1. 风格描述：用一段话描述这部小说的整体风格。
2. 关键元素：列出 5-8 个最鲜明的风格要素。

小说内容：{{novelContent}}

请额外输出 'plotPatternAnalysis' 字段，总结这部小说的剧情推进模式（例如起承转合、冲突节奏、常见反转与高潮分布）。
该字段请优先使用“剧情链路 + 节奏总结”的一句话格式，例如：受辱 -> 得奇遇 -> 苦修 -> 打脸升级 -> 遇更强敌 -> 再苦修 -> 再次打脸。节奏明快，爽点密集。

请严格输出 JSON：
{
  "styleDescription": "...",
  "keyElements": ["元素1", "元素2"],
  "plotPatternAnalysis": "受辱 -> 得奇遇 -> 苦修 -> 打脸升级 -> 遇更强敌 -> 再苦修 -> 再次打脸。节奏明快，爽点密集。"
}`;

const OUTLINE_PROMPT = `你是一个专业的网络小说作者。
参考小说风格：
{{styleAnalysis}}

请基于上述风格，创作一个全新的小说大纲。
要求：
1. 总共 {{chapterCount}} 章。
2. 每章包含 chapterNumber、title、description。
3. 严格返回 JSON，不要附带解释文字。

请输出格式：
{
  "title": "小说标题",
  "chapters": [
    {
      "chapterNumber": 1,
      "title": "第一章标题",
      "description": "第一章简介"
    }
  ]
}`;

const CHAPTER_PROMPT = `你是一位网络小说作者，请根据以下信息创作章节正文。

风格分析：
{{styleAnalysis}}

当前小说核心摘要：
{{coreSummary}}

前文摘要：
{{previousChaptersSummary}}

当前章节：
第 {{chapterNumber}} 章 {{chapterTitle}}
章节简介：{{chapterDescription}}

请直接输出章节正文，不要输出 JSON。`;

const SUMMARY_PROMPT = `请把以下章节内容精炼成一个简短的核心摘要，供后续章节续写使用。

章节内容：
{{chapterContent}}

请直接输出摘要文本。`;

function App() {
  const [appState, setAppState] = useState<AppState>(() => (loadLLMConfig() ? 'upload' : 'settings'));
  const [llmConfig, setLLMConfig] = useState<LLMConfig | null>(() => loadLLMConfig());
  const [styleAnalysis, setStyleAnalysis] = useState<StyleAnalysis | null>(() => loadStyleAnalysis());
  const [currentOutlineId, setCurrentOutlineId] = useState<string | null>(() => loadCurrentOutlineId());
  const [currentChapterNumber, setCurrentChapterNumber] = useState(1);
  const [outlineChapterCountInput, setOutlineChapterCountInput] = useState(() => {
    const savedChapterCount = loadOutlineChapterCount();
    return String(savedChapterCount ?? DEFAULT_OUTLINE_CHAPTER_COUNT);
  });

  const { isLoading, error, callLLM } = useLLM();
  const { outline, allOutlines, saveOutlineData, setOutline } = useOutline(currentOutlineId || undefined);
  const { chapters, saveChapterData, getPreviousChaptersSummary } = useChapters(currentOutlineId || undefined);

  const setActiveOutlineId = useCallback((outlineId: string) => {
    saveCurrentOutlineId(outlineId);
    setCurrentOutlineId(outlineId);
  }, []);

  const handleConfigSaved = useCallback((config: LLMConfig) => {
    setLLMConfig(config);
    setAppState('upload');
  }, []);

  const handleOutlineSelectionChange = useCallback((outlineId: string) => {
    if (!outlineId) return;
    setActiveOutlineId(outlineId);
    setCurrentChapterNumber(1);
  }, [setActiveOutlineId]);

  useEffect(() => {
    if (chapters.length === 0) return;
    if (!chapters.some((chapter) => chapter.chapterNumber === currentChapterNumber)) {
      setCurrentChapterNumber(chapters[0].chapterNumber);
    }
  }, [chapters, currentChapterNumber]);

  const generateOutline = useCallback(async (chapterCount: number) => {
    const currentStyleAnalysis = styleAnalysis && styleAnalysis.styleDescription ? styleAnalysis : loadStyleAnalysis();

    if (!llmConfig) {
      alert('请先配置 LLM 设置');
      return;
    }

    if (!currentStyleAnalysis || !currentStyleAnalysis.styleDescription) {
      alert('请先分析小说风格');
      return;
    }

    try {
      console.log('Generating outline...');
      const prompt = OUTLINE_PROMPT
        .replace('{{styleAnalysis}}', JSON.stringify(currentStyleAnalysis))
        .replace('{{chapterCount}}', String(chapterCount));
      const response = await callLLM({ config: llmConfig, prompt });
      console.log('LLM response length:', response.length);
      console.log('=== FULL LLM RESPONSE START ===');
      console.log(response);
      console.log('=== FULL LLM RESPONSE END ===');

      let outlineData: { title: string; chapters: OutlineItem[] };

      try {
        outlineData = parseOutlineResponse(response);
      } catch (parseError) {
        console.warn('Full outline JSON parse failed, attempting salvage parse:', parseError);
        outlineData = salvageOutlineResponse(response);
        console.log('Salvaged outline chapters:', outlineData.chapters.length);
      }

      const now = Date.now();
      const newOutline: NovelOutline = {
        id: String(now),
        title: outlineData.title || 'New Novel',
        chapters: outlineData.chapters,
        coreSummary: '',
        createdAt: now,
        updatedAt: now,
      };

      setOutline(newOutline);
      setActiveOutlineId(newOutline.id);
      await saveOutlineData(newOutline);
      setAppState('outline');
    } catch (err) {
      console.error('生成大纲失败:', err);
      alert('生成大纲失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  }, [callLLM, llmConfig, saveOutlineData, setActiveOutlineId, setOutline, styleAnalysis]);

  const handleNovelUploaded = useCallback(async (content: string) => {
    console.log('handleNovelUploaded called, content length:', content.length);
    console.log('llmConfig:', llmConfig);

    if (!llmConfig) {
      return;
    }

    try {
      console.log('Starting analysis...');
      const prompt = ANALYSIS_PROMPT.replace('{{novelContent}}', content.slice(0, 10000));
      console.log('Calling LLM...');
      const response = await callLLM({ config: llmConfig, prompt });
      console.log('LLM response:', response);

      let analysis: StyleAnalysis;
      try {
        analysis = parseStyleAnalysisResponse(response);
        console.log('Parsed analysis:', analysis);
      } catch {
        analysis = {
          styleDescription: response.trim(),
          keyElements: ['analysis completed'],
          plotPatternAnalysis: '',
        };
      }

      saveStyleAnalysis(analysis);
      console.log('Saved to localStorage');
      setStyleAnalysis(analysis);
      console.log('Set styleAnalysis state');
      setAppState('analysis');
      console.log('Set appState to analysis');
    } catch (err) {
      console.error('分析失败:', err);
      alert('分析失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  }, [callLLM, llmConfig]);

  const handleGenerateChapter = useCallback(async (chapterIndex: number) => {
    const currentStyleAnalysis = styleAnalysis && styleAnalysis.styleDescription ? styleAnalysis : loadStyleAnalysis();

    if (!llmConfig || !outline || !currentStyleAnalysis) {
      return;
    }

    const chapter = outline.chapters[chapterIndex];
    const previousSummary = getPreviousChaptersSummary(chapter.chapterNumber);

    try {
      const prompt = CHAPTER_PROMPT
        .replace('{{styleAnalysis}}', JSON.stringify(currentStyleAnalysis))
        .replace('{{coreSummary}}', outline.coreSummary)
        .replace('{{previousChaptersSummary}}', previousSummary)
        .replace('{{chapterNumber}}', String(chapter.chapterNumber))
        .replace('{{chapterTitle}}', chapter.title)
        .replace('{{chapterDescription}}', chapter.description);

      const content = await callLLM({ config: llmConfig, prompt });

      const newChapter: NovelChapter = {
        id: String(Date.now()),
        chapterNumber: chapter.chapterNumber,
        title: chapter.title,
        content,
        createdAt: Date.now(),
      };

      await saveChapterData(newChapter);

      const summaryPrompt = SUMMARY_PROMPT.replace('{{chapterContent}}', content.slice(0, 5000));
      const chapterSummary = await callLLM({ config: llmConfig, prompt: summaryPrompt });

      const updatedOutline: NovelOutline = {
        ...outline,
        coreSummary: outline.coreSummary ? outline.coreSummary + '\n\n' + chapterSummary : chapterSummary,
        updatedAt: Date.now(),
      };

      await saveOutlineData(updatedOutline);
      setCurrentChapterNumber(chapter.chapterNumber);
      setAppState('chapters');
    } catch (err) {
      console.error('生成章节失败:', err);
      alert('生成章节失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  }, [callLLM, getPreviousChaptersSummary, llmConfig, outline, saveChapterData, saveOutlineData, styleAnalysis]);

  const savedAnalysis = styleAnalysis && styleAnalysis.styleDescription ? styleAnalysis : loadStyleAnalysis();

  return (
    <div className="App">
      <nav style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
        <button onClick={() => setAppState('settings')} style={{ marginRight: '10px' }}>
          设置
        </button>
        <button onClick={() => setAppState('upload')} style={{ marginRight: '10px' }}>
          上传
        </button>
        <button onClick={() => setAppState('analysis')} style={{ marginRight: '10px' }}>
          分析结果
        </button>
        <button onClick={() => currentOutlineId && setAppState('outline')} style={{ marginRight: '10px' }} disabled={!currentOutlineId}>
          大纲
        </button>
        <button onClick={() => currentOutlineId && setAppState('chapters')} disabled={!currentOutlineId}>
          章节
        </button>
        {allOutlines.length > 0 && (
          <span style={{ marginLeft: '16px' }}>
            <label htmlFor="outline-switcher" style={{ marginRight: '8px' }}>
              切换大纲
            </label>
            <select
              id="outline-switcher"
              value={currentOutlineId || ''}
              onChange={(e) => handleOutlineSelectionChange(e.target.value)}
              style={{ minWidth: '240px' }}
            >
              {allOutlines.map((item) => (
                <option key={item.id} value={item.id}>
                  {(item.title || item.id) + ' | ' + new Date(item.updatedAt).toLocaleString()}
                </option>
              ))}
            </select>
          </span>
        )}
      </nav>

      {error && (
        <div style={{ padding: '10px', color: 'red', backgroundColor: '#fee' }}>
          错误: {error}
        </div>
      )}

      {isLoading && (
        <div style={{ padding: '10px', backgroundColor: '#efe' }}>
          处理中...
        </div>
      )}

      {appState === 'settings' && <SettingsForm onConfigSaved={handleConfigSaved} />}

      {appState === 'upload' && <NovelUploader onNovelUploaded={handleNovelUploaded} />}

      {appState === 'analysis' && (
        <div style={{ padding: '20px' }}>
          <h2>风格分析结果</h2>
          {savedAnalysis && savedAnalysis.styleDescription ? (
            <>
              <div style={{ marginBottom: '20px' }}>
                <h3>风格描述</h3>
                <p>{savedAnalysis.styleDescription}</p>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <h3>关键元素</h3>
                <ul>
                  {savedAnalysis.keyElements.map((elem, index) => (
                    <li key={index}>{elem}</li>
                  ))}
                </ul>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <h3>剧情模式分析</h3>
                <p>{savedAnalysis.plotPatternAnalysis || '暂无剧情模式分析结果'}</p>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label htmlFor="outline-chapter-count" style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                  大纲章节数
                </label>
                <input
                  id="outline-chapter-count"
                  type="number"
                  min={MIN_OUTLINE_CHAPTER_COUNT}
                  max={MAX_OUTLINE_CHAPTER_COUNT}
                  step={1}
                  value={outlineChapterCountInput}
                  onChange={(e) => setOutlineChapterCountInput(e.target.value)}
                  onBlur={() => {
                    const normalized = normalizeOutlineChapterCount(Number.parseInt(outlineChapterCountInput, 10));
                    setOutlineChapterCountInput(String(normalized));
                    saveOutlineChapterCount(normalized);
                  }}
                  style={{ width: '220px', padding: '8px' }}
                />
                <div style={{ marginTop: '6px', fontSize: '12px', color: '#6b7280' }}>
                  支持 {MIN_OUTLINE_CHAPTER_COUNT}-{MAX_OUTLINE_CHAPTER_COUNT} 章
                </div>
              </div>
              <button
                onClick={() => {
                  const normalized = normalizeOutlineChapterCount(Number.parseInt(outlineChapterCountInput, 10));
                  setOutlineChapterCountInput(String(normalized));
                  saveOutlineChapterCount(normalized);
                  if (!styleAnalysis || !styleAnalysis.styleDescription) {
                    setStyleAnalysis(savedAnalysis);
                  }
                  void generateOutline(normalized);
                }}
                style={{ padding: '10px 20px', fontSize: '16px' }}
              >
                生成大纲
              </button>
            </>
          ) : (
            <div style={{ color: 'red' }}>
              <p>没有找到分析结果，请重新上传小说进行分析。</p>
            </div>
          )}
        </div>
      )}

      {appState === 'outline' && outline && (
        <OutlineEditor outline={outline} onUpdate={saveOutlineData} onGenerateChapter={handleGenerateChapter} />
      )}

      {appState === 'chapters' && (
        <ChapterViewer
          chapters={chapters}
          currentChapterNumber={currentChapterNumber}
          onChapterChange={setCurrentChapterNumber}
          outlineTitle={outline?.title}
          onChapterUpdate={saveChapterData}
        />
      )}
    </div>
  );
}

export default App;
