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

interface StyleAnalysis {
  styleDescription: string;
  keyElements: string[];
  plotPatternAnalysis: string;
}

interface ChapterSection {
  chapterNumber: number;
  heading: string;
  content: string;
}

interface PlotChunkAnalysis {
  chapterRange: string;
  mainProgression: string;
  conflictPattern: string;
  turningPoints: string[];
  pacingRhythm: string;
  objectiveNotes: string;
}

type AppState = 'settings' | 'upload' | 'analysis' | 'outline' | 'chapters';

const DEFAULT_OUTLINE_CHAPTER_COUNT = 50;
const MIN_OUTLINE_CHAPTER_COUNT = 1;
const MAX_OUTLINE_CHAPTER_COUNT = 50;
const MIN_DEEP_PLOT_ANALYSIS_CHAPTERS = 200;
const MAX_DEEP_PLOT_ANALYSIS_CHAPTERS = 300;
const MAX_PLOT_ANALYSIS_CHUNK_CHAPTERS = 30;
const MAX_PLOT_ANALYSIS_CHUNK_CHARACTERS = 28000;

function normalizeOutlineChapterCount(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_OUTLINE_CHAPTER_COUNT;
  }

  return Math.min(MAX_OUTLINE_CHAPTER_COUNT, Math.max(MIN_OUTLINE_CHAPTER_COUNT, Math.floor(value)));
}

function parseKeyElementsInput(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function sanitizeAnalysisText(text: string, maxLength: number): string {
  return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, maxLength);
}

function extractChapterSections(content: string): ChapterSection[] {
  const normalizedContent = content.replace(/\r\n/g, '\n');
  const headingPattern = /^(\s*(?:第[0-9一二三四五六七八九十百千万零〇两]+[章节回卷集部篇幕]|chapter\s+\d+|chap\.?\s*\d+)[^\n]*)$/gim;
  const matches = Array.from(normalizedContent.matchAll(headingPattern));

  if (matches.length === 0) {
    return [];
  }

  return matches
    .map((match, index) => {
      const heading = match[1].trim();
      const startIndex = match.index ?? 0;
      const nextStartIndex = index < matches.length - 1 ? (matches[index + 1].index ?? normalizedContent.length) : normalizedContent.length;
      const sectionContent = normalizedContent.slice(startIndex, nextStartIndex).trim();

      return {
        chapterNumber: index + 1,
        heading,
        content: sectionContent,
      };
    })
    .filter((section) => section.content.length > 0);
}

function selectChaptersForDeepPlotAnalysis(chapters: ChapterSection[]): ChapterSection[] {
  if (chapters.length === 0) {
    return [];
  }

  const targetCount = chapters.length >= MIN_DEEP_PLOT_ANALYSIS_CHAPTERS
    ? Math.min(MAX_DEEP_PLOT_ANALYSIS_CHAPTERS, chapters.length)
    : chapters.length;

  return chapters.slice(0, targetCount);
}

function chunkChaptersForPlotAnalysis(chapters: ChapterSection[]): ChapterSection[][] {
  const chunks: ChapterSection[][] = [];
  let currentChunk: ChapterSection[] = [];
  let currentLength = 0;

  for (const chapter of chapters) {
    const chapterLength = chapter.content.length;
    const shouldStartNewChunk =
      currentChunk.length > 0 && (
        currentChunk.length >= MAX_PLOT_ANALYSIS_CHUNK_CHAPTERS ||
        currentLength + chapterLength > MAX_PLOT_ANALYSIS_CHUNK_CHARACTERS
      );

    if (shouldStartNewChunk) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentLength = 0;
    }

    currentChunk.push(chapter);
    currentLength += chapterLength;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function formatChapterChunk(chapters: ChapterSection[]): string {
  return chapters
    .map((chapter) => sanitizeAnalysisText(chapter.content, 4000))
    .join('\n\n');
}

function buildStyleAnalysisSample(content: string, chapters: ChapterSection[]): string {
  if (chapters.length === 0) {
    return sanitizeAnalysisText(content, 18000);
  }

  const sampledSections = [
    chapters[0],
    chapters[Math.floor((chapters.length - 1) / 2)],
    chapters[chapters.length - 1],
  ].filter((section, index, array) => array.findIndex((item) => item.chapterNumber === section.chapterNumber) === index);

  return sampledSections
    .map((section) => sanitizeAnalysisText(section.content, 5000))
    .join('\n\n');
}

function parsePlotChunkAnalysisResponse(response: string): PlotChunkAnalysis {
  const parsed = extractAndParseJSON(response);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Plot chunk analysis response is not a JSON object');
  }

  return {
    chapterRange: typeof parsed.chapterRange === 'string' ? parsed.chapterRange.trim() : '未知章节范围',
    mainProgression: typeof parsed.mainProgression === 'string' ? parsed.mainProgression.trim() : '',
    conflictPattern: typeof parsed.conflictPattern === 'string' ? parsed.conflictPattern.trim() : '',
    turningPoints: Array.isArray(parsed.turningPoints)
      ? parsed.turningPoints.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
      : [],
    pacingRhythm: typeof parsed.pacingRhythm === 'string' ? parsed.pacingRhythm.trim() : '',
    objectiveNotes: typeof parsed.objectiveNotes === 'string' ? parsed.objectiveNotes.trim() : '',
  };
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

function normalizeContinuitySeverity(value: unknown): ContinuityIssue['severity'] {
  if (value === 'high' || value === '严重' || value === 'high_risk') {
    return 'high';
  }

  if (value === 'low' || value === '轻微' || value === 'minor') {
    return 'low';
  }

  return 'medium';
}

function parseOutlineContinuityCheckResponse(response: string): OutlineContinuityCheck {
  const parsed = extractAndParseJSON(response);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Continuity check response is not a JSON object');
  }

  const rawIssues = Array.isArray(parsed.issues)
    ? parsed.issues
    : Array.isArray(parsed.problems)
      ? parsed.problems
      : [];

  const summary =
    typeof parsed.summary === 'string'
      ? parsed.summary.trim()
      : typeof parsed.conclusion === 'string'
        ? parsed.conclusion.trim()
        : typeof parsed['总结'] === 'string'
          ? parsed['总结'].trim()
          : '';

  const overallVerdict =
    typeof parsed.overallVerdict === 'string'
      ? parsed.overallVerdict.trim()
      : typeof parsed.verdict === 'string'
        ? parsed.verdict.trim()
        : typeof parsed.overallAssessment === 'string'
          ? parsed.overallAssessment.trim()
          : typeof parsed['总体判断'] === 'string'
            ? parsed['总体判断'].trim()
            : '已完成检查';

  return {
    checkedAt: Date.now(),
    overallVerdict,
    summary,
    issues: rawIssues
      .map((issue: any, index: number): ContinuityIssue => ({
        id: String(index + 1),
        chapterRange:
          typeof issue?.chapterRange === 'string' && issue.chapterRange.trim()
            ? issue.chapterRange.trim()
            : typeof issue?.chapter === 'string' && issue.chapter.trim()
              ? issue.chapter.trim()
              : typeof issue?.chapterNumber === 'number'
                ? `第${issue.chapterNumber}章`
                : '待定位章节',
        severity: normalizeContinuitySeverity(issue?.severity),
        problem:
          typeof issue?.problem === 'string' && issue.problem.trim()
            ? issue.problem.trim()
            : typeof issue?.issue === 'string' && issue.issue.trim()
              ? issue.issue.trim()
              : typeof issue?.description === 'string'
                ? issue.description.trim()
                : '',
        impact:
          typeof issue?.impact === 'string' && issue.impact.trim()
            ? issue.impact.trim()
            : typeof issue?.risk === 'string'
              ? issue.risk.trim()
              : '',
        suggestion:
          typeof issue?.suggestion === 'string' && issue.suggestion.trim()
            ? issue.suggestion.trim()
            : typeof issue?.recommendation === 'string' && issue.recommendation.trim()
              ? issue.recommendation.trim()
              : typeof issue?.fix === 'string'
                ? issue.fix.trim()
                : '',
      }))
      .filter((issue) => issue.problem || issue.impact || issue.suggestion),
  };
}

const ANALYSIS_PROMPT = `你是一个专业的小说风格分析师。请分析以下小说样本的写作风格。

请输出以下内容：
1. 风格描述：用一段话描述这部小说的整体风格。
2. 关键元素：列出 5-8 个最鲜明的风格要素。

小说内容：{{novelContent}}

请严格输出 JSON：
{
  "styleDescription": "...",
  "keyElements": ["元素1", "元素2"]
}`;

const PLOT_CHUNK_ANALYSIS_PROMPT = `你是一位专业的网文剧情编辑，请只基于以下章节原文，客观提炼这一段剧情推进规律。

分析范围：{{chapterRange}}

章节内容：
{{chapterContent}}

要求：
1. 只总结文本中已经出现的剧情规律，不要脑补后文。
2. 重点观察主线推进、冲突触发方式、升级节奏、反转/高潮分布。
3. 表述保持客观，尽量使用“常见/多为/通常/偶尔”等词。
4. 严格输出 JSON，不要附加解释。

输出格式：
{
  "chapterRange": "第1-30章",
  "mainProgression": "这一段主线如何推进",
  "conflictPattern": "冲突通常如何发起、升级、收束",
  "turningPoints": ["转折1", "转折2"],
  "pacingRhythm": "节奏特征",
  "objectiveNotes": "补充的客观观察"
}`;

const PLOT_PATTERN_SYNTHESIS_PROMPT = `你是一位专业的网文策划编辑。下面是对一部小说前 {{sampledChapterCount}} 章的分段剧情分析结果。

分段分析：
{{chunkAnalyses}}

请把这些结果整合为一段更客观的“剧情模式分析”。

要求：
1. 明确说明这是“基于前 {{sampledChapterCount}} 章样本”的结论；如果样本不足 200 章，也要如实说明基于现有全部章节。
2. 不要只复述开篇剧情，要总结长线主线、阶段性循环、常见冲突触发方式、升级/反转/高潮分布。
3. 语气客观，不夸张，不脑补未出现的内容。
4. 优先使用“剧情链路 + 节奏总结”的表达，但允许比一句话稍展开。
5. 只输出纯文本，不要 JSON，不要列表。
`;

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

const OUTLINE_CONTINUITY_CHECK_PROMPT = `你是一位长篇网络小说的剧情统筹编辑，请检查下面这份小说大纲的章节故事剧情连贯性。

风格分析（如有）：
{{styleAnalysis}}

待检查大纲：
{{outline}}

请重点检查：
1. 关键事件的因果链是否完整。
2. 主角动机、目标与阶段变化是否连贯。
3. 重要人物、设定、伏笔是否前后矛盾或遗失。
4. 章节节奏衔接是否突兀，是否存在明显跳步。
5. 高潮、转折、升级是否铺垫不足或重复。

请严格输出 JSON，不要附加解释文字。issues 最多返回 8 条，按严重程度排序。
如果没有明显问题，issues 返回空数组。

输出格式：
{
  "overallVerdict": "整体连贯/存在少量问题/存在明显问题",
  "summary": "用 1-2 句话概括整份大纲的连贯性表现",
  "issues": [
    {
      "chapterRange": "第3-5章",
      "severity": "high",
      "problem": "问题描述",
      "impact": "会导致什么阅读问题",
      "suggestion": "如何修改更顺"
    }
  ]
}`;

function App() {
  const [appState, setAppState] = useState<AppState>(() => (loadLLMConfig() ? 'upload' : 'settings'));
  const [llmConfig, setLLMConfig] = useState<LLMConfig | null>(() => loadLLMConfig());
  const [styleAnalysis, setStyleAnalysis] = useState<StyleAnalysis | null>(() => loadStyleAnalysis());
  const [currentOutlineId, setCurrentOutlineId] = useState<string | null>(() => loadCurrentOutlineId());
  const [currentChapterNumber, setCurrentChapterNumber] = useState(1);
  const [outlineChapterCountInput, setOutlineChapterCountInput] = useState(() => {
    const savedChapterCount = loadOutlineChapterCount();
    return String(normalizeOutlineChapterCount(savedChapterCount ?? DEFAULT_OUTLINE_CHAPTER_COUNT));
  });
  const [isEditingAnalysis, setIsEditingAnalysis] = useState(false);
  const [editedStyleDescription, setEditedStyleDescription] = useState('');
  const [editedKeyElements, setEditedKeyElements] = useState('');
  const [editedPlotPatternAnalysis, setEditedPlotPatternAnalysis] = useState('');
  const [isCheckingOutlineContinuity, setIsCheckingOutlineContinuity] = useState(false);

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

  const generateOutline = useCallback(async (chapterCount: number, overrideStyleAnalysis?: StyleAnalysis) => {
    const currentStyleAnalysis = overrideStyleAnalysis ?? (styleAnalysis && styleAnalysis.styleDescription ? styleAnalysis : loadStyleAnalysis());

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
      const extractedChapters = extractChapterSections(content);
      const deepPlotAnalysisChapters = selectChaptersForDeepPlotAnalysis(extractedChapters);
      const styleSample = buildStyleAnalysisSample(content, deepPlotAnalysisChapters.length > 0 ? deepPlotAnalysisChapters : extractedChapters);

      const stylePrompt = ANALYSIS_PROMPT.replace('{{novelContent}}', styleSample);
      console.log('Calling LLM for style analysis...');
      const styleResponse = await callLLM({ config: llmConfig, prompt: stylePrompt });
      console.log('Style analysis response:', styleResponse);

      let baseAnalysis: StyleAnalysis;
      try {
        baseAnalysis = parseStyleAnalysisResponse(styleResponse);
        console.log('Parsed style analysis:', baseAnalysis);
      } catch {
        baseAnalysis = {
          styleDescription: styleResponse.trim(),
          keyElements: ['analysis completed'],
          plotPatternAnalysis: '',
        };
      }

      let plotPatternAnalysis = '';

      if (deepPlotAnalysisChapters.length > 0) {
        const chapterChunks = chunkChaptersForPlotAnalysis(deepPlotAnalysisChapters);
        const chunkAnalyses: PlotChunkAnalysis[] = [];

        for (const chunk of chapterChunks) {
          const chapterRange = `第${chunk[0].chapterNumber}-${chunk[chunk.length - 1].chapterNumber}章`;
          const plotChunkPrompt = PLOT_CHUNK_ANALYSIS_PROMPT
            .replace('{{chapterRange}}', chapterRange)
            .replace('{{chapterContent}}', formatChapterChunk(chunk));

          const chunkResponse = await callLLM({ config: llmConfig, prompt: plotChunkPrompt });
          chunkAnalyses.push(parsePlotChunkAnalysisResponse(chunkResponse));
        }

        const synthesisPrompt = PLOT_PATTERN_SYNTHESIS_PROMPT
          .replaceAll('{{sampledChapterCount}}', String(deepPlotAnalysisChapters.length))
          .replace('{{chunkAnalyses}}', JSON.stringify(chunkAnalyses, null, 2));

        plotPatternAnalysis = (await callLLM({ config: llmConfig, prompt: synthesisPrompt })).trim();
      } else {
        const fallbackPrompt = PLOT_PATTERN_SYNTHESIS_PROMPT
          .replaceAll('{{sampledChapterCount}}', '0')
          .replace('{{chunkAnalyses}}', JSON.stringify([
            {
              chapterRange: '未识别章节标题，按全文片段分析',
              mainProgression: '无法稳定切分章节，建议上传带明确章节标题的文本以获得更客观的长线剧情分析。',
              conflictPattern: '',
              turningPoints: [],
              pacingRhythm: '',
              objectiveNotes: '当前文本没有识别出稳定的章节边界。',
            },
          ], null, 2));

        plotPatternAnalysis = (await callLLM({ config: llmConfig, prompt: fallbackPrompt })).trim();
      }

      const analysis: StyleAnalysis = {
        ...baseAnalysis,
        plotPatternAnalysis,
      };

      saveStyleAnalysis(analysis);
      console.log('Saved to localStorage');
      setStyleAnalysis(analysis);
      console.log('Set styleAnalysis state');
      setIsEditingAnalysis(false);
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

  const handleCheckOutlineContinuity = useCallback(async () => {
    if (!llmConfig || !outline) {
      alert('请先配置 LLM 并生成大纲');
      return;
    }

    const currentStyleAnalysis = styleAnalysis && styleAnalysis.styleDescription ? styleAnalysis : loadStyleAnalysis();

    setIsCheckingOutlineContinuity(true);
    try {
      const prompt = OUTLINE_CONTINUITY_CHECK_PROMPT
        .replace('{{styleAnalysis}}', currentStyleAnalysis ? JSON.stringify(currentStyleAnalysis, null, 2) : '暂无')
        .replace('{{outline}}', JSON.stringify({
          title: outline.title,
          coreSummary: outline.coreSummary,
          chapters: outline.chapters,
        }, null, 2));

      const response = await callLLM({ config: llmConfig, prompt });
      const checkResult = parseOutlineContinuityCheckResponse(response);
      const now = Date.now();
      const updatedOutline: NovelOutline = {
        ...outline,
        continuityCheck: {
          ...checkResult,
          checkedAt: now,
        },
        updatedAt: now,
      };

      await saveOutlineData(updatedOutline);
    } catch (err) {
      console.error('剧情连贯性检查失败:', err);
      alert('剧情连贯性检查失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setIsCheckingOutlineContinuity(false);
    }
  }, [callLLM, llmConfig, outline, saveOutlineData, styleAnalysis]);

  const savedAnalysis = styleAnalysis && styleAnalysis.styleDescription ? styleAnalysis : loadStyleAnalysis();

  const startEditingAnalysis = useCallback(() => {
    if (!savedAnalysis) {
      return;
    }

    setEditedStyleDescription(savedAnalysis.styleDescription);
    setEditedKeyElements(savedAnalysis.keyElements.join('\n'));
    setEditedPlotPatternAnalysis(savedAnalysis.plotPatternAnalysis);
    setIsEditingAnalysis(true);
  }, [savedAnalysis]);

  const saveEditedAnalysis = useCallback((): StyleAnalysis | null => {
    const styleDescription = editedStyleDescription.trim();
    if (!styleDescription) {
      alert('风格描述不能为空');
      return null;
    }

    const updatedAnalysis: StyleAnalysis = {
      styleDescription,
      keyElements: parseKeyElementsInput(editedKeyElements),
      plotPatternAnalysis: editedPlotPatternAnalysis.trim(),
    };

    saveStyleAnalysis(updatedAnalysis);
    setStyleAnalysis(updatedAnalysis);
    setIsEditingAnalysis(false);
    return updatedAnalysis;
  }, [editedKeyElements, editedPlotPatternAnalysis, editedStyleDescription]);

  const cancelEditingAnalysis = useCallback(() => {
    setIsEditingAnalysis(false);
  }, []);

  const handleGenerateOutline = useCallback(() => {
    const normalized = normalizeOutlineChapterCount(Number.parseInt(outlineChapterCountInput, 10));
    setOutlineChapterCountInput(String(normalized));
    saveOutlineChapterCount(normalized);

    let analysisForOutline = savedAnalysis;
    if (isEditingAnalysis) {
      const saved = saveEditedAnalysis();
      if (!saved) {
        return;
      }
      analysisForOutline = saved;
    }

    void generateOutline(normalized, analysisForOutline ?? undefined);
  }, [generateOutline, isEditingAnalysis, outlineChapterCountInput, saveEditedAnalysis, savedAnalysis]);

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
                {isEditingAnalysis ? (
                  <textarea
                    value={editedStyleDescription}
                    onChange={(e) => setEditedStyleDescription(e.target.value)}
                    style={{ width: '100%', minHeight: '100px', padding: '8px' }}
                  />
                ) : (
                  <p>{savedAnalysis.styleDescription}</p>
                )}
              </div>
              <div style={{ marginBottom: '20px' }}>
                <h3>关键元素</h3>
                {isEditingAnalysis ? (
                  <textarea
                    value={editedKeyElements}
                    onChange={(e) => setEditedKeyElements(e.target.value)}
                    placeholder="每行一个关键元素"
                    style={{ width: '100%', minHeight: '140px', padding: '8px' }}
                  />
                ) : (
                  <ul>
                    {savedAnalysis.keyElements.map((elem, index) => (
                      <li key={index}>{elem}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div style={{ marginBottom: '20px' }}>
                <h3>剧情模式分析</h3>
                {isEditingAnalysis ? (
                  <textarea
                    value={editedPlotPatternAnalysis}
                    onChange={(e) => setEditedPlotPatternAnalysis(e.target.value)}
                    style={{ width: '100%', minHeight: '80px', padding: '8px' }}
                  />
                ) : (
                  <p>{savedAnalysis.plotPatternAnalysis || '暂无剧情模式分析结果'}</p>
                )}
              </div>
              <div style={{ marginBottom: '20px' }}>
                {isEditingAnalysis ? (
                  <>
                    <button onClick={saveEditedAnalysis} style={{ marginRight: '8px' }}>
                      保存分析
                    </button>
                    <button onClick={cancelEditingAnalysis}>取消</button>
                  </>
                ) : (
                  <button onClick={startEditingAnalysis}>编辑分析</button>
                )}
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
                onClick={handleGenerateOutline}
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
        <OutlineEditor
          outline={outline}
          onUpdate={saveOutlineData}
          onGenerateChapter={handleGenerateChapter}
          onCheckContinuity={handleCheckOutlineContinuity}
          isCheckingContinuity={isCheckingOutlineContinuity}
        />
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
