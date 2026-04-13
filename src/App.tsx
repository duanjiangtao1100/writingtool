import { useState, useCallback, useEffect } from 'react';
import { SettingsForm } from './components/SettingsForm';
import { NovelUploader } from './components/NovelUploader';
import { OutlineEditor } from './components/OutlineEditor';
import { ChapterViewer } from './components/ChapterViewer';
import { useLLM } from './hooks/useLLM';
import { useOutline } from './hooks/useOutline';
import { useChapters } from './hooks/useChapters';
import { saveLLMConfig, loadLLMConfig, saveStyleAnalysis, loadStyleAnalysis } from './storage/localStorage';
import './App.css';

// 类型定义
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
}

type AppState = 'settings' | 'upload' | 'analysis' | 'outline' | 'chapters';

// 健壮的 JSON 提取和解析函数
function extractAndParseJSON(text: string): any {
  // 1. 移除 markdown 代码块标记
  let cleaned = text
    .replace(/^```(?:json|JSON)?\s*/gm, '')
    .replace(/```\s*$/gm, '');

  // 2. 找到第一个 { 或 [ 作为开始
  let startIndex = Math.max(cleaned.indexOf('{'), cleaned.indexOf('['));
  if (startIndex === -1) {
    throw new Error('未找到 JSON 开始标记');
  }

  // 3. 找到匹配的结束括号
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
    throw new Error('未找到匹配的结束括号');
  }

  const jsonStr = cleaned.slice(startIndex, endIndex + 1);

  // 4. 尝试解析
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // 5. 如果失败，尝试修复常见问题
    let fixed = jsonStr;

    // 修复未转义的引号（简单处理）
    // 移除 trailing commas
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');

    // 尝试解析
    return JSON.parse(fixed);
  }
}

// Prompt 模板
const ANALYSIS_PROMPT = `你是一个专业的小说风格分析师。请分析以下小说的写作风格。

请输出以下内容：

1. 风格描述：用一段话描述这部小说的整体风格（叙事节奏、语言特点、情绪基调等）

2. 关键元素：列出5-8个这部小说最鲜明的特点（比如：升级节奏、战斗描写、人物塑造、对话风格等）

小说内容：
{{novelContent}}

请用JSON格式输出：
{
  "styleDescription": "风格描述...",
  "keyElements": ["元素1", "元素2", ...]
}`;

const OUTLINE_PROMPT = `你是一个专业的网络小说作家，擅长写爽文。

参考小说风格：
{{styleAnalysis}}

请基于上述风格，创作一个全新的小说大纲。要求：

1. 同人创作要求：
   - 改变所有人物名称
   - 改变场景和故事背景
   - 改变故事走向，不要和原作雷同
   - 保留原作的爽文节奏和风格

2. 写作原则：
   - 展示而非讲述：用动作和对话表现，不要直接陈述
   - 冲突驱动剧情：每章必须有冲突或转折
   - 悬念承上启下：每章结尾必须留下钩子
   - 开头即高潮：前20%必须极其吸引人

3. 大纲要求：
   - 总共50章
   - 每章一个标题
   - 每章一段简短的剧情描述（50-100字）

重要：输出严格的JSON格式！
- 所有字符串中的双引号必须转义为 \"
- 字符串中的换行符必须转义为 \\n
- 不要在JSON外添加任何解释文字
- 不要添加markdown格式标记

请用JSON格式输出：
{
  "title": "小说标题",
  "chapters": [
    {
      "chapterNumber": 1,
      "title": "第一章标题",
      "description": "第一章剧情描述..."
    }
  ]
}`;

const CHAPTER_PROMPT = `你是一个专业的网络小说作家，擅长写爽文。

参考小说风格：
{{styleAnalysis}}

故事核心摘要：
{{coreSummary}}

前面章节内容摘要：
{{previousChaptersSummary}}

当前章节信息：
- 章节号：{{chapterNumber}}
- 章节标题：{{chapterTitle}}
- 本章剧情：{{chapterDescription}}

请基于以上信息，创作这一章的完整内容。要求：

1. 写作原则：
   - 展示而非讲述：用动作和对话表现，不要直接陈述
   - 冲突驱动剧情：本章必须有冲突或转折
   - 悬念承上启下：本章结尾必须留下钩子
   - 保持风格一致：和参考小说的风格保持一致

2. 内容要求：
   - 本章至少2300字
   - 情节要连贯，和前面章节衔接自然
   - 对话要符合人物性格
   - 要有爽点，让读者感到畅快

现在开始创作：`;

const SUMMARY_PROMPT = `请把以下章节内容精炼成一个简短的核心事件摘要（200-300字），保留关键情节、人物关系和重要设定。

章节内容：
{{chapterContent}}

摘要：`;

function App() {
  const [appState, setAppState] = useState<AppState>('settings');
  const [llmConfig, setLLMConfig] = useState<LLMConfig | null>(null);
  const [styleAnalysis, setStyleAnalysis] = useState<StyleAnalysis | null>(null);
  const [currentOutlineId, setCurrentOutlineId] = useState<string | null>(null);
  const [currentChapterNumber, setCurrentChapterNumber] = useState(1);

  const { isLoading, error, callLLM } = useLLM();
  const { outline, allOutlines, saveOutlineData, setOutline } = useOutline(currentOutlineId || undefined);
  const { chapters, saveChapterData, getPreviousChaptersSummary } = useChapters(currentOutlineId || undefined);

  // 初始化加载配置和分析结果
  useEffect(() => {
    const savedConfig = loadLLMConfig();
    if (savedConfig) {
      setLLMConfig(savedConfig);
      setAppState('upload');
    }
    const savedAnalysis = loadStyleAnalysis();
    if (savedAnalysis) {
      setStyleAnalysis(savedAnalysis);
    }
  }, []);

  const handleConfigSaved = useCallback((config: LLMConfig) => {
    setLLMConfig(config);
    setAppState('upload');
  }, []);

  // generateOutline 定义在前面
  const generateOutline = useCallback(async () => {
    console.log('generateOutline called');
    console.log('llmConfig:', llmConfig);
    console.log('styleAnalysis:', styleAnalysis);

    if (!llmConfig) {
      alert('请先配置 LLM 设置');
      return;
    }
    if (!styleAnalysis) {
      alert('请先分析小说风格');
      return;
    }

    try {
      console.log('Generating outline...');
      const prompt = OUTLINE_PROMPT.replace('{{styleAnalysis}}', JSON.stringify(styleAnalysis));
      console.log('Calling LLM...');
      const response = await callLLM({ config: llmConfig, prompt });
      console.log('LLM response length:', response.length);
      console.log('=== FULL LLM RESPONSE START ===');
      console.log(response);
      console.log('=== FULL LLM RESPONSE END ===');

      // 使用健壮的 JSON 解析函数
      console.log('Extracting and parsing JSON...');
      const outlineData = extractAndParseJSON(response);

      const newOutline: NovelOutline = {
        id: Date.now().toString(),
        title: outlineData.title || '新小说',
        chapters: (Array.isArray(outlineData.chapters) ? outlineData.chapters : []).map((chapter: any, index: number): OutlineItem => ({
          id: (index + 1).toString(),
          chapterNumber: chapter.chapterNumber || index + 1,
          title: chapter.title || `第${index + 1}章`,
          description: chapter.description || '',
        })),
        coreSummary: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      console.log('Saving outline...');
      setOutline(newOutline);
      setCurrentOutlineId(newOutline.id);
      await saveOutlineData(newOutline);
      console.log('Navigating to outline page...');
      setAppState('outline');
    } catch (err) {
      console.error('生成大纲失败:', err);
      alert('生成大纲失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  }, [llmConfig, styleAnalysis, callLLM, setOutline, saveOutlineData]);

  const handleNovelUploaded = useCallback(async (content: string) => {
    console.log('handleNovelUploaded called, content length:', content.length);
    console.log('llmConfig:', llmConfig);

    if (!llmConfig) {
      console.log('No llmConfig, returning');
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
        const parsed = extractAndParseJSON(response);
        analysis = {
          styleDescription: parsed.styleDescription || '',
          keyElements: Array.isArray(parsed.keyElements) ? parsed.keyElements : [],
        };
        console.log('Parsed analysis:', analysis);
      } catch {
        console.log('No JSON found, using raw response');
        analysis = {
          styleDescription: response,
          keyElements: ['风格分析完成'],
        };
      }
      setStyleAnalysis(analysis);
      saveStyleAnalysis(analysis);
      console.log('Navigating to analysis page...');
      setAppState('analysis');
    } catch (err) {
      console.error('分析失败:', err);
      alert('分析失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  }, [llmConfig, callLLM]);

  const handleGenerateChapter = useCallback(async (chapterIndex: number) => {
    if (!llmConfig || !outline || !styleAnalysis) return;

    const chapter = outline.chapters[chapterIndex];
    const previousSummary = getPreviousChaptersSummary(chapter.chapterNumber);

    try {
      const prompt = CHAPTER_PROMPT
        .replace('{{styleAnalysis}}', JSON.stringify(styleAnalysis))
        .replace('{{coreSummary}}', outline.coreSummary)
        .replace('{{previousChaptersSummary}}', previousSummary)
        .replace('{{chapterNumber}}', chapter.chapterNumber.toString())
        .replace('{{chapterTitle}}', chapter.title)
        .replace('{{chapterDescription}}', chapter.description);

      const content = await callLLM({ config: llmConfig, prompt });

      const newChapter: NovelChapter = {
        id: Date.now().toString(),
        chapterNumber: chapter.chapterNumber,
        title: chapter.title,
        content,
        createdAt: Date.now(),
      };

      await saveChapterData(newChapter);

      const summaryPrompt = SUMMARY_PROMPT.replace('{{chapterContent}}', content.slice(0, 5000));
      const chapterSummary = await callLLM({ config: llmConfig, prompt: summaryPrompt });

      const updatedOutline = {
        ...outline,
        coreSummary: outline.coreSummary
          ? outline.coreSummary + '\n\n' + chapterSummary
          : chapterSummary,
        updatedAt: Date.now(),
      };
      await saveOutlineData(updatedOutline);

      setCurrentChapterNumber(chapter.chapterNumber);
      setAppState('chapters');
    } catch (err) {
      console.error('生成章节失败:', err);
    }
  }, [llmConfig, outline, styleAnalysis, callLLM, getPreviousChaptersSummary, saveChapterData, saveOutlineData]);

  return (
    <div className="App">
      <nav style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
        <button onClick={() => setAppState('settings')} style={{ marginRight: '10px' }}>
          设置
        </button>
        <button onClick={() => setAppState('upload')} style={{ marginRight: '10px' }}>
          上传
        </button>
        <button onClick={() => styleAnalysis && setAppState('analysis')} style={{ marginRight: '10px' }} disabled={!styleAnalysis}>
          分析结果
        </button>
        <button onClick={() => outline && setAppState('outline')} style={{ marginRight: '10px' }} disabled={!outline}>
          大纲
        </button>
        <button onClick={() => chapters.length > 0 && setAppState('chapters')} disabled={chapters.length === 0}>
          章节
        </button>
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

      {appState === 'settings' && (
        <SettingsForm onConfigSaved={handleConfigSaved} />
      )}

      {appState === 'upload' && (
        <NovelUploader onNovelUploaded={handleNovelUploaded} />
      )}

      {appState === 'analysis' && styleAnalysis && (
        <div style={{ padding: '20px' }}>
          <h2>风格分析结果</h2>
          <div style={{ marginBottom: '20px' }}>
            <h3>风格描述</h3>
            <p>{styleAnalysis.styleDescription}</p>
          </div>
          <div style={{ marginBottom: '20px' }}>
            <h3>关键元素</h3>
            <ul>
              {(styleAnalysis.keyElements || []).map((elem, index) => (
                <li key={index}>{elem}</li>
              ))}
            </ul>
          </div>
          <button onClick={generateOutline} style={{ padding: '10px 20px', fontSize: '16px' }}>
            生成大纲
          </button>
        </div>
      )}

      {appState === 'outline' && outline && (
        <>
          <OutlineEditor
            outline={outline}
            onUpdate={saveOutlineData}
            onGenerateChapter={handleGenerateChapter}
          />
        </>
      )}

      {appState === 'chapters' && (
        <ChapterViewer
          chapters={chapters}
          currentChapterNumber={currentChapterNumber}
          onChapterChange={setCurrentChapterNumber}
        />
      )}
    </div>
  );
}

export default App;
