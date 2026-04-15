import { useCallback, useEffect, useState } from 'react';
import { SettingsForm } from './components/SettingsForm';
import { NovelUploader } from './components/NovelUploader';
import { OutlineEditor } from './components/OutlineEditor';
import { ChapterViewer } from './components/ChapterViewer';
import { useLLM } from './hooks/useLLM';
import { useOutline } from './hooks/useOutline';
import { useChapters } from './hooks/useChapters';
import {
  loadAnalysisDepthMode,
  loadOutlineAnchorCount,
  loadCurrentOutlineId,
  loadHighOriginalityMode,
  loadLLMConfig,
  loadOutlineChapterCount,
  loadOutlineGenerationMode,
  loadStyleAnalysis,
  saveAnalysisDepthMode,
  saveCurrentOutlineId,
  saveHighOriginalityMode,
  saveOutlineAnchorCount,
  saveOutlineGenerationMode,
  saveOutlineChapterCount,
  saveStyleAnalysis,
  type AnalysisDepthMode,
  type OutlineAnchorCount,
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

interface StyleAnalysis {
  styleDescription: string;
  keyElements: string[];
  plotPatternAnalysis: string;
}

type OutlineGenerationMode = 'faithful' | 'blend' | 'forced';

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

interface AnalysisProgressState {
  current: number;
  total: number;
  message: string;
  startedAt: number;
}

type AppState = 'settings' | 'upload' | 'analysis' | 'outline' | 'chapters';

const DEFAULT_OUTLINE_CHAPTER_COUNT = 50;
const MIN_OUTLINE_CHAPTER_COUNT = 1;
const MAX_OUTLINE_CHAPTER_COUNT = 150;
const OUTLINE_BATCH_CHAPTER_LIMIT = 25;
const OUTLINE_RECENT_BATCH_WINDOW = 2;
const DEFAULT_OUTLINE_ANCHOR_COUNT: OutlineAnchorCount = 8;
const MIN_DEEP_PLOT_ANALYSIS_CHAPTERS = 100;
const MAX_DEEP_PLOT_ANALYSIS_CHAPTERS = 100;
const MAX_PLOT_ANALYSIS_CHUNK_CHAPTERS = 30;
const MAX_PLOT_ANALYSIS_CHUNK_CHARACTERS = 28000;
const QUICK_ANALYSIS_MAX_CHAPTERS = 80;
const QUICK_ANALYSIS_SAMPLE_POINTS = 6;

const OUTLINE_GENERATION_MODE_OPTIONS: Array<{ value: OutlineGenerationMode; label: string; description: string }> = [
  {
    value: 'faithful',
    label: '忠实原作节奏',
    description: '只仿写原作风格与节奏，故事、人物、设定必须全新，剧情模式分析只作辅助参考。',
  },
  {
    value: 'blend',
    label: '融合剧情模式分析',
    description: '在保持全新故事和人物的前提下，适度吸收剧情模式分析里的推进规律和节奏设计。',
  },
  {
    value: 'forced',
    label: '强制黄金逆袭模式',
    description: '只借用黄金逆袭的爽点框架，但人物、设定、主线事件仍必须完全原创。',
  },
];

function normalizeOutlineChapterCount(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_OUTLINE_CHAPTER_COUNT;
  }

  return Math.min(MAX_OUTLINE_CHAPTER_COUNT, Math.max(MIN_OUTLINE_CHAPTER_COUNT, Math.floor(value)));
}

function buildOutlineBatchRanges(chapterCount: number): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];

  for (let start = 1; start <= chapterCount; start += OUTLINE_BATCH_CHAPTER_LIMIT) {
    ranges.push({
      start,
      end: Math.min(chapterCount, start + OUTLINE_BATCH_CHAPTER_LIMIT - 1),
    });
  }

  return ranges;
}

function compactOutlineText(text: string, maxLength = 80): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

const OUTLINE_ANCHOR_COUNT_OPTIONS: Array<{ value: OutlineAnchorCount; label: string; description: string }> = [
  { value: 6, label: '精简（6个锚点）', description: '上下文更短，适合更快生成。' },
  { value: 8, label: '标准（8个锚点）', description: '连贯性和上下文长度更平衡。' },
  { value: 10, label: '增强（10个锚点）', description: '保留更多长线记忆，适合更长篇的大纲。' },
];

function selectOutlineAnchorChapters(chapters: OutlineItem[], maxAnchors = DEFAULT_OUTLINE_ANCHOR_COUNT): OutlineItem[] {
  if (chapters.length <= maxAnchors) {
    return chapters;
  }

  const indexes = new Set<number>();
  for (let index = 0; index < maxAnchors; index++) {
    indexes.add(Math.floor((index * (chapters.length - 1)) / Math.max(1, maxAnchors - 1)));
  }

  return Array.from(indexes)
    .sort((left, right) => left - right)
    .map((index) => chapters[index]);
}

function buildOutlineGlobalMemory(title: string, chapters: OutlineItem[], anchorCount: OutlineAnchorCount): string {
  if (chapters.length === 0) {
    return '暂无已生成大纲。这是第一批，请先确定小说标题、核心主线、主要人物关系与前期冲突升级路径。';
  }

  const anchorChapters = selectOutlineAnchorChapters(chapters, anchorCount);
  const recentTail = chapters.slice(-Math.min(3, chapters.length));

  return [
    `已确定小说标题：${title || '待定'}`,
    `已生成 ${chapters.length} 章。以下是覆盖全局故事推进的关键记忆锚点，请后续批次严格承接，不得重写已有章节。`,
    '全局关键锚点：',
    ...anchorChapters.map((chapter) => `第${chapter.chapterNumber}章｜${compactOutlineText(chapter.title, 32)}｜${compactOutlineText(chapter.description, 88)}`),
    '最近阶段状态：',
    ...recentTail.map((chapter) => `第${chapter.chapterNumber}章｜${compactOutlineText(chapter.title, 32)}｜${compactOutlineText(chapter.description, 88)}`),
  ].join('\n');
}

function buildRecentOutlineContext(chapters: OutlineItem[]): string {
  if (chapters.length === 0) {
    return '当前还没有最近批次大纲可供参考。';
  }

  const recentChapters = chapters.slice(-(OUTLINE_BATCH_CHAPTER_LIMIT * OUTLINE_RECENT_BATCH_WINDOW));
  return [
    `最近两批大纲范围：第${recentChapters[0].chapterNumber}-${recentChapters[recentChapters.length - 1].chapterNumber}章。`,
    ...recentChapters.map((chapter) => `第${chapter.chapterNumber}章｜${compactOutlineText(chapter.title, 32)}｜${compactOutlineText(chapter.description, 88)}`),
  ].join('\n');
}

function buildOutlineChapterNumbers(batchStart: number, batchEnd: number): number[] {
  return Array.from({ length: Math.max(0, batchEnd - batchStart + 1) }, (_, index) => batchStart + index);
}

function buildCurrentBatchContext(chapters: OutlineItem[]): string {
  if (chapters.length === 0) {
    return '当前批次暂未生成任何章节。';
  }

  return chapters
    .map((chapter) => `第${chapter.chapterNumber}章｜${compactOutlineText(chapter.title, 32)}｜${compactOutlineText(chapter.description, 88)}`)
    .join('\n');
}

function normalizeOutlineChaptersByNumbers(
  outlineData: { title: string; chapters: OutlineItem[] },
  chapterNumbers: number[],
): { title: string; chapters: OutlineItem[] } {
  const expectedChapterNumberSet = new Set(chapterNumbers);
  const chaptersByNumber = new Map<number, OutlineItem>();
  const fallbackChapters: OutlineItem[] = [];

  for (const chapter of outlineData.chapters) {
    const rawChapterNumber = typeof chapter.chapterNumber === 'number' ? Math.floor(chapter.chapterNumber) : null;

    if (rawChapterNumber !== null && expectedChapterNumberSet.has(rawChapterNumber)) {
      if (!chaptersByNumber.has(rawChapterNumber)) {
        chaptersByNumber.set(rawChapterNumber, {
          id: String(rawChapterNumber),
          chapterNumber: rawChapterNumber,
          title: chapter.title?.trim() || `第${rawChapterNumber}章`,
          description: chapter.description?.trim() || '',
        });
      }
      continue;
    }

    fallbackChapters.push(chapter);
  }

  const normalizedChapters = chapterNumbers.flatMap((chapterNumber) => {
    const matchedChapter = chaptersByNumber.get(chapterNumber);
    if (matchedChapter) {
      return [matchedChapter];
    }

    const fallbackChapter = fallbackChapters.shift();
    if (!fallbackChapter) {
      return [];
    }

    return [{
      id: String(chapterNumber),
      chapterNumber,
      title: fallbackChapter.title?.trim() || `第${chapterNumber}章`,
      description: fallbackChapter.description?.trim() || '',
    }];
  });

  return {
    title: outlineData.title?.trim() || 'New Novel',
    chapters: normalizedChapters,
  };
}

function normalizeOutlineBatchResponse(
  outlineData: { title: string; chapters: OutlineItem[] },
  batchStart: number,
  batchEnd: number,
): { title: string; chapters: OutlineItem[] } {
  const expectedChapterNumbers = buildOutlineChapterNumbers(batchStart, batchEnd);
  const normalized = normalizeOutlineChaptersByNumbers(outlineData, expectedChapterNumbers);

  if (normalized.chapters.length !== expectedChapterNumbers.length) {
    throw new Error(`批次大纲章节数不足：期望 ${expectedChapterNumbers.length} 章，实际 ${normalized.chapters.length} 章`);
  }

  return normalized;
}

function parseKeyElementsInput(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function buildOutlineModeInstruction(mode: OutlineGenerationMode): string {
  if (mode === 'forced') {
    return `大纲生成模式：强制黄金逆袭模式。
请把 plotPatternAnalysis 视为抽象节奏模板，优先围绕“耻辱 -> 奋斗 -> 打脸”的黄金循环组织整部小说。
允许为了强化爽点节奏而主动重组题材表达、冲突排序、成长路径与阶段高潮。
请显式安排：前期受辱、金手指降临、换地图成长、小打脸密集分布、阶段性大打脸、打脸后引出更高层冲突。
但你只能借用抽象结构，严禁复用原小说的任何具体人物、关系、宗门、世界名、法宝、桥段、事件顺序或一对一角色映射；故事必须彻底原创。`;
  }

  if (mode === 'blend') {
    return `大纲生成模式：融合剧情模式分析。
请以原始风格分析为主，同时吸收 plotPatternAnalysis 中已经验证有效的剧情推进规律。
可以借鉴其中的主线驱动、冲突节奏、爽点分布和阶段循环，但不要强行把所有题材都改写成单一逆袭爽文。
如果原文本身不完全符合“耻辱 -> 奋斗 -> 打脸”，请只融合相容部分。
无论如何，都只允许仿写风格和节奏，不允许沿用原小说的具体人物、阵营、设定名词、核心事件链或章节对应关系；新大纲必须是全新的故事。`;
  }

  return `大纲生成模式：忠实原作节奏。
请优先还原上传小说本身的题材气质、叙事结构、冲突密度和节奏分布。
plotPatternAnalysis 只能作为辅助观察，不得喧宾夺主；如果它与原始风格不一致，请以 styleDescription 和 keyElements 为准。
不要为了套用固定爽文模板而强行引入“耻辱 -> 奋斗 -> 打脸”循环。
  注意：忠实的是节奏和气质，不是剧情内容；人物、故事、世界设定、冲突事件必须全部原创，绝不能照抄原小说。`;
}

function buildHighOriginalityInstruction(enabled: boolean): string {
  if (!enabled) {
    return '原创性增强：关闭。仍然必须保证新故事、新人物、新设定，但不额外施加更强的去相似化约束。';
  }

  return `原创性增强：开启。
请进一步降低与原小说的相似度，除了不得照抄外，还要主动避开容易形成“换皮感”的对应关系。
特别要求：
1. 不要沿用相同类型的开篇羞辱事件、相同类型的金手指载体、相同类型的核心地图推进顺序。
2. 不要让主角、反派、导师、白月光、垫脚石形成与原小说可一一对照的功能映射。
3. 不要让前三章的冲突触发逻辑与原小说明显同构；如原作是退婚开局，新作应改为另一类受压迫或失势开局。
4. 自检世界观、修炼体系、组织结构、关键转折是否过于接近原作；若接近，必须改写。
5. 宁可保留抽象风格和节奏，也不要保留具体桥段轮廓。`;
}

function buildOutlineStyleReference(styleAnalysis: StyleAnalysis): string {
  return [
    '以下内容仅可用于仿写写作气质、叙事节奏、爽点分布与冲突推进方式。',
    '禁止把其中任何具体世界名、人名、宗门、法宝、职业、关系、桥段、剧情节点直接搬入新大纲。',
    '如果剧情模式分析中包含具体设定，它们也只能被抽象理解为“某类设定功能”，不能原样复用。',
    '',
    `风格描述：${styleAnalysis.styleDescription}`,
    `关键元素：${styleAnalysis.keyElements.join('、') || '无'}`,
    `剧情模式分析（仅抽象参考节奏，不可复用具体内容）：${styleAnalysis.plotPatternAnalysis || '无'}`,
  ].join('\n');
}

function sanitizeAnalysisText(text: string, maxLength: number): string {
  return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, maxLength);
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${seconds}秒`;
  }

  return `${minutes}分${seconds.toString().padStart(2, '0')}秒`;
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

function buildQuickPlotAnalysisSample(content: string, chapters: ChapterSection[]): { sampledChapterCount: number; sampleText: string } {
  if (chapters.length === 0) {
    return {
      sampledChapterCount: 0,
      sampleText: sanitizeAnalysisText(content, 18000),
    };
  }

  const candidateChapters = chapters.slice(0, Math.min(QUICK_ANALYSIS_MAX_CHAPTERS, chapters.length));
  const selectedSections: ChapterSection[] = [];

  for (let index = 0; index < Math.min(QUICK_ANALYSIS_SAMPLE_POINTS, candidateChapters.length); index++) {
    const candidateIndex = Math.floor((index * (candidateChapters.length - 1)) / Math.max(1, Math.min(QUICK_ANALYSIS_SAMPLE_POINTS, candidateChapters.length) - 1));
    const selectedChapter = candidateChapters[candidateIndex];
    if (!selectedSections.some((item) => item.chapterNumber === selectedChapter.chapterNumber)) {
      selectedSections.push(selectedChapter);
    }
  }

  return {
    sampledChapterCount: candidateChapters.length,
    sampleText: selectedSections
      .map((section) => sanitizeAnalysisText(section.content, 3200))
      .join('\n\n'),
  };
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

function decodeEscapedJsonText(value: string): string {
  return value
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, '\t')
    .trim();
}

function extractQuotedField(text: string, fieldNames: string[]): string {
  for (const fieldName of fieldNames) {
    const pattern = new RegExp(`"${fieldName}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
    const match = text.match(pattern);
    if (match?.[1]) {
      return decodeEscapedJsonText(match[1]);
    }
  }

  return '';
}

function salvageOutlineContinuityCheckResponse(response: string): OutlineContinuityCheck {
  const cleaned = response
    .replace(/^```(?:json|JSON)?\s*/gm, '')
    .replace(/```\s*$/gm, '');

  const overallVerdict = extractQuotedField(cleaned, ['overallVerdict', 'verdict', 'overallAssessment', '总体判断']) || '已完成检查';
  const summary = extractQuotedField(cleaned, ['summary', 'conclusion', '总结']);
  const objectPattern = /\{[\s\S]*?\}/g;
  const issues: ContinuityIssue[] = [];

  for (const match of cleaned.matchAll(objectPattern)) {
    const snippet = match[0];
    const problem = extractQuotedField(snippet, ['problem', 'issue', 'description']);
    const impact = extractQuotedField(snippet, ['impact', 'risk']);
    const suggestion = extractQuotedField(snippet, ['suggestion', 'recommendation', 'fix']);

    if (!problem && !impact && !suggestion) {
      continue;
    }

    const chapterRange =
      extractQuotedField(snippet, ['chapterRange', 'chapter'])
      || (() => {
        const chapterNumberMatch = snippet.match(/"chapterNumber"\s*:\s*(\d+)/);
        return chapterNumberMatch?.[1] ? `第${chapterNumberMatch[1]}章` : '待定位章节';
      })();

    const severityValue = extractQuotedField(snippet, ['severity']);
    issues.push({
      id: String(issues.length + 1),
      chapterRange,
      severity: normalizeContinuitySeverity(severityValue),
      problem,
      impact,
      suggestion,
    });
  }

  return {
    checkedAt: Date.now(),
    overallVerdict,
    summary,
    issues,
    usedFallback: true,
  };
}

function parseOutlineContinuityCheckResponse(response: string): OutlineContinuityCheck {
  let parsed: any;

  try {
    parsed = extractAndParseJSON(response);
  } catch (error) {
    console.warn('Continuity check JSON parse failed, attempting salvage parse:', error);
    return salvageOutlineContinuityCheckResponse(response);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return salvageOutlineContinuityCheckResponse(response);
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
    usedFallback: false,
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

const PLOT_PATTERN_SYNTHESIS_PROMPT = `你是一位精通网文创作的大师，请结合下面对小说前 {{sampledChapterCount}} 章的分段剧情分析结果，严格按照以下黄金逆袭剧情模式，生成这部小说可复用的【核心设定/第一章/故事大纲】分析模板。

分段分析：
{{chunkAnalyses}}

重要要求：
1. 这是对已分析样本的结构化提炼，不是脱离原文的随意原创。
2. 结论必须尽量客观，优先依据样本中反复出现的设定、冲突、角色关系与节奏规律。
3. 如果样本中没有明确证据支撑某一项，请直接写“文本中未明确”或“样本里未充分展开”，不要脑补。
4. 开头请明确写出“基于前 {{sampledChapterCount}} 章样本提炼”。
5. 请输出结构化纯文本，保留清晰分段和标题，不要输出 JSON。
6. 只提炼可迁移的创作框架，不得沿用原文中的具体人名、宗门名、地名、法宝名、血脉名、事件顺序或角色关系；如样本里出现具体元素，也必须抽象成通用功能描述。

你是一位精通网文创作的大师，请严格按照以下黄金逆袭剧情模式，生成一部小说的【核心设定/第一章/故事大纲】。

核心驱动模型：耻辱  奋斗  打脸

一、 世界观与力量体系
世界名称：【例：斗气大陆】

力量等级：【例：斗者、斗师、大斗师、斗灵、斗王、斗皇、斗宗】需严格分级，清晰明确。

特色设定：【例：异火榜/天鼎榜/本命神器】一种稀有且强大的特殊物品，是主角越级挑战和金手指的核心。

二、 主角设定
主角名：【】

初始身份：【例：曾经的天才，因故沦为废物/被家族轻视的少年】

核心性格：【例：坚韧、隐忍、重情重义、杀伐果断】

三、 剧情引擎（黄金循环）
第一步：施加耻辱（制造情绪负债）

羞辱事件：【例：被未婚妻/宗门上门强行退婚；被家族长老公开驱逐；被昔日同伴背叛嘲笑】

羞辱核心：羞辱者必须身份高贵、态度高傲、实力远超主角，且事件要当众发生，践踏主角与家族的尊严。

主角反应：压抑愤怒，立下誓言。【例：三十年河东三十年河西，莫欺少年穷！】

第二步：金手指降临（提供翻盘点）

金手指类型：【例：戒指/玉佩/书籍中的老爷爷灵魂；神秘传承；系统】

金手指能力：需具备导师（提供功法/知识） 与 保镖（提供危机保护） 双重功能。

核心功法/能力：【例：焚决一种可通过吞噬稀有能量（如异火）进化的功法】必须有越阶战斗和成长性特点。

第三步：艰苦奋斗（建立代入感）

修炼路径：需经历 换地图 模式：

新手村：家族内部，解决内部矛盾，初步展现实力。
野外地图：【例：魔兽山脉/危险森林/大沙漠】进行严酷的生死历练，修炼斗技，磨练心性。
社会舞台：【例：炼药师大会/宗门大比】在公开场合获得荣誉，积累声望和人脉。
终极目标地：【例：云岚宗】完成最终打脸。
具体磨炼：必须描写高强度的身体训练、炼丹/炼器的失败与成功、与魔兽/敌人的生死搏杀，强调主角付出的汗水与代价。

第四步：成功打脸（释放情绪价值）

打脸对象：羞辱主角的【未婚妻/宗门/仇敌】。

打脸方式：在公开场合，以绝对优势击败对手，并说出当年立下的誓言，完成情绪闭环。

后果：打脸后，往往引发更高层次的冲突（如对方宗门长辈出手），为下一阶段剧情做铺垫。

四、 情感与关系线
白月光（情感动力）：【例：身份神秘的青梅竹马】主角变强的初心之一，背景强大，一直默默支持主角。

垫脚石（目标与耻辱）：【例：退婚未婚妻】主角前期必须击败的对象，她的存在是耻辱的具象化。

红颜知己（伙伴与患难）：【例：共同患难的女伴】与主角有过生死与共的经历，自身带有特殊体质/秘密，为后续剧情提供伏笔。

复杂关系者（戏剧张力）：【例：敌对宗门的宗主，却与主角有过暧昧】身份对立与个人情感的矛盾，增加故事的曲折度。

五、 生成要求
开篇节奏：必须在第一章或第二章内完成天才废物受辱获得金手指的全过程，迅速抓住读者。

爽点分布：每几章就要有一个小打脸（如测试震惊众人），每隔一个大阶段就要有一个大打脸（如击败强敌）。

语言风格：热血、直接、略带中二但足够燃。
`;

const QUICK_PLOT_PATTERN_ANALYSIS_PROMPT = `你是一位精通网文创作的大师。下面是从一部小说前 {{sampledChapterCount}} 章中抽取的代表性章节样本。

章节样本：
{{sampledContent}}

请基于这些样本，快速提炼这部小说的“剧情模式分析”。

要求：
1. 这是快速分析，只基于样本概括，不要假装看过全部章节。
2. 重点总结可迁移的剧情推进规律、冲突触发方式、升级节奏和爽点分布。
3. 只仿写创作框架，不得复述样本中的具体人名、宗门、地名、法宝或事件。
4. 开头明确写出“基于前 {{sampledChapterCount}} 章内抽样样本的快速分析”。
5. 输出结构化纯文本，适合作为后续生成全新大纲的参考模板。

请尽量使用【核心设定/第一章/故事大纲】这种结构化方式来表达，但内容必须是抽象可复用的创作规律，而不是对原文剧情的复刻。
`;

const OUTLINE_BATCH_PROMPT = `你是一个专业的网络小说作者。
参考小说风格：
{{styleAnalysis}}

模式要求：
{{outlineModeInstruction}}

原创性要求：
{{highOriginalityInstruction}}

当前任务：按批次生成全新小说大纲，以减少上下文长度压力。
整部小说总计 {{chapterCount}} 章。
本次只生成第 {{batchStartChapter}}-{{batchEndChapter}} 章，共 {{batchChapterCount}} 章。

全局故事记忆：
{{globalStoryMemory}}

最近两批大纲：
{{recentOutlineContext}}

要求：
1. 只输出本批次章节，不要重复输出前面已经生成过的章节。
2. 如果这不是第一批，必须同时参考全局故事记忆和最近两批大纲，保证人物目标、冲突升级、伏笔、设定与节奏自然衔接。
3. 本批次必须恰好输出 {{batchChapterCount}} 章，chapterNumber 覆盖第 {{batchStartChapter}}-{{batchEndChapter}} 章且顺序连续。
4. 每章包含 chapterNumber、title、description。
5. 仅仅仿写风格，故事、人物、世界设定、阵营关系、关键冲突、金手指、成长路线都必须是全新的。
6. 严禁照抄、套改、影射原小说的核心剧情；不得复用原小说的人名、地名、宗门、法宝、名场面、退婚桥段、章节顺序，禁止一对一角色映射和章节映射。
7. 允许借鉴抽象叙事规律，但最终产物必须让读者一眼看出是“新故事”，而不是原小说换皮版。
8. 在生成前先自检：如果任何章节简介与原小说存在明显对应关系，请重写后再输出。
9. 如果这不是第一批，小说标题必须与前文保持一致，不得改名。
10. 严格返回 JSON，不要附带解释文字。

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

const OUTLINE_BATCH_SUPPLEMENT_PROMPT = `你是一个专业的网络小说作者。
参考小说风格：
{{styleAnalysis}}

模式要求：
{{outlineModeInstruction}}

原创性要求：
{{highOriginalityInstruction}}

当前任务：补齐某一批次大纲中缺失的章节。
整部小说总计 {{chapterCount}} 章。
当前批次范围：第 {{batchStartChapter}}-{{batchEndChapter}} 章。
当前批次已经生成的章节：
{{currentBatchContext}}

全局故事记忆：
{{globalStoryMemory}}

最近两批大纲：
{{recentOutlineContext}}

现在只需要补齐这些缺失章节：{{missingChapterNumbers}}。
共 {{missingChapterCount}} 章。

要求：
1. 只输出缺失章节，不要重复输出已生成章节。
2. chapterNumber 必须严格对应 {{missingChapterNumbers}}，顺序连续，不得缺漏。
3. 必须严格承接全局故事记忆、最近两批大纲和本批次已生成章节，保证人物状态、冲突推进、伏笔与节奏自然衔接。
4. 每章包含 chapterNumber、title、description。
5. 小说标题必须与前文保持一致，不得改名。
6. 严格返回合法 JSON，不要附带解释文字、备注、Markdown 代码块或任何多余前后缀。

请输出格式：
{
  "title": "小说标题",
  "chapters": [
    {
      "chapterNumber": 1,
      "title": "章节标题",
      "description": "章节简介"
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
  const [analysisDepthMode, setAnalysisDepthMode] = useState<AnalysisDepthMode>(() => loadAnalysisDepthMode());
  const [outlineAnchorCount, setOutlineAnchorCount] = useState<OutlineAnchorCount>(() => loadOutlineAnchorCount());
  const [outlineGenerationMode, setOutlineGenerationMode] = useState<OutlineGenerationMode>(() => loadOutlineGenerationMode());
  const [highOriginalityMode, setHighOriginalityMode] = useState(() => loadHighOriginalityMode());
  const [isEditingAnalysis, setIsEditingAnalysis] = useState(false);
  const [editedStyleDescription, setEditedStyleDescription] = useState('');
  const [editedKeyElements, setEditedKeyElements] = useState('');
  const [editedPlotPatternAnalysis, setEditedPlotPatternAnalysis] = useState('');
  const [isCheckingOutlineContinuity, setIsCheckingOutlineContinuity] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgressState | null>(null);
  const [analysisElapsedMs, setAnalysisElapsedMs] = useState(0);
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);

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

  useEffect(() => {
    if (!analysisProgress) {
      setAnalysisElapsedMs(0);
      return;
    }

    setAnalysisElapsedMs(Date.now() - analysisProgress.startedAt);
    const timer = window.setInterval(() => {
      setAnalysisElapsedMs(Date.now() - analysisProgress.startedAt);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [analysisProgress]);

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

    setIsGeneratingOutline(true);

    try {
      console.log('Generating outline in batches...');
      const outlineModeInstruction = buildOutlineModeInstruction(outlineGenerationMode);
      const highOriginalityInstruction = buildHighOriginalityInstruction(highOriginalityMode);
      const styleReference = buildOutlineStyleReference(currentStyleAnalysis);
      const batchRanges = buildOutlineBatchRanges(chapterCount);
      const outlineStartedAt = Date.now();
      const mergedChapters: OutlineItem[] = [];
      let outlineTitle = '';

      setAnalysisProgress({
        current: 0,
        total: batchRanges.length,
        message: `准备分 ${batchRanges.length} 批生成大纲，每批最多 ${OUTLINE_BATCH_CHAPTER_LIMIT} 章...`,
        startedAt: outlineStartedAt,
      });

      for (const [batchIndex, batchRange] of batchRanges.entries()) {
        const batchChapterCount = batchRange.end - batchRange.start + 1;
        const expectedBatchChapterNumbers = buildOutlineChapterNumbers(batchRange.start, batchRange.end);
        setAnalysisProgress({
          current: batchIndex,
          total: batchRanges.length,
          message: `步骤 ${batchIndex + 1}/${batchRanges.length}：正在生成第 ${batchRange.start}-${batchRange.end} 章大纲...`,
          startedAt: outlineStartedAt,
        });

        let normalizedBatch: { title: string; chapters: OutlineItem[] } | null = null;
        let lastBatchError: unknown = null;

        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            if (attempt > 1) {
              setAnalysisProgress({
                current: batchIndex,
                total: batchRanges.length,
                message: `步骤 ${batchIndex + 1}/${batchRanges.length}：第 ${batchRange.start}-${batchRange.end} 章生成失败，正在重试（${attempt}/2）...`,
                startedAt: outlineStartedAt,
              });
            }

            const retryInstruction = attempt > 1
              ? '\n\n重试补充要求：你上一次输出未通过校验。这一次请严格只输出合法 JSON，禁止输出任何解释、备注、Markdown 代码块或多余前后缀；chapters 数组必须完整且数量准确。'
              : '';

            const prompt = `${OUTLINE_BATCH_PROMPT
              .replace('{{styleAnalysis}}', styleReference)
              .replace('{{outlineModeInstruction}}', outlineModeInstruction)
              .replace('{{highOriginalityInstruction}}', highOriginalityInstruction)
              .replace('{{chapterCount}}', String(chapterCount))
              .replaceAll('{{batchStartChapter}}', String(batchRange.start))
              .replaceAll('{{batchEndChapter}}', String(batchRange.end))
              .replaceAll('{{batchChapterCount}}', String(batchChapterCount))
              .replace('{{globalStoryMemory}}', buildOutlineGlobalMemory(outlineTitle, mergedChapters, outlineAnchorCount))
              .replace('{{recentOutlineContext}}', buildRecentOutlineContext(mergedChapters))}${retryInstruction}`;
            const response = await callLLM({ config: llmConfig, prompt });
            console.log(`Batch ${batchIndex + 1}/${batchRanges.length} attempt ${attempt}/2 response length:`, response.length);
            console.log(`=== OUTLINE BATCH ${batchIndex + 1} ATTEMPT ${attempt} RESPONSE START ===`);
            console.log(response);
            console.log(`=== OUTLINE BATCH ${batchIndex + 1} ATTEMPT ${attempt} RESPONSE END ===`);

            let outlineData: { title: string; chapters: OutlineItem[] };

            try {
              outlineData = parseOutlineResponse(response);
            } catch (parseError) {
              console.warn('Batch outline JSON parse failed, attempting salvage parse:', parseError);
              outlineData = salvageOutlineResponse(response);
              console.log('Salvaged outline chapters:', outlineData.chapters.length);
            }

            let normalizedCandidate = normalizeOutlineChaptersByNumbers(outlineData, expectedBatchChapterNumbers);

            if (normalizedCandidate.chapters.length < expectedBatchChapterNumbers.length) {
              const missingChapterNumbers = expectedBatchChapterNumbers.slice(normalizedCandidate.chapters.length);
              setAnalysisProgress({
                current: batchIndex,
                total: batchRanges.length,
                message: `步骤 ${batchIndex + 1}/${batchRanges.length}：第 ${batchRange.start}-${batchRange.end} 章数量不足，正在补齐缺失章节...`,
                startedAt: outlineStartedAt,
              });

              const supplementPrompt = OUTLINE_BATCH_SUPPLEMENT_PROMPT
                .replace('{{styleAnalysis}}', styleReference)
                .replace('{{outlineModeInstruction}}', outlineModeInstruction)
                .replace('{{highOriginalityInstruction}}', highOriginalityInstruction)
                .replace('{{chapterCount}}', String(chapterCount))
                .replace('{{batchStartChapter}}', String(batchRange.start))
                .replace('{{batchEndChapter}}', String(batchRange.end))
                .replace('{{currentBatchContext}}', buildCurrentBatchContext(normalizedCandidate.chapters))
                .replace('{{globalStoryMemory}}', buildOutlineGlobalMemory(outlineTitle, mergedChapters, outlineAnchorCount))
                .replace('{{recentOutlineContext}}', buildRecentOutlineContext(mergedChapters))
                .replaceAll('{{missingChapterNumbers}}', missingChapterNumbers.map((chapterNumber) => `第${chapterNumber}章`).join('、'))
                .replace('{{missingChapterCount}}', String(missingChapterNumbers.length));
              const supplementResponse = await callLLM({ config: llmConfig, prompt: supplementPrompt });
              console.log(`Batch ${batchIndex + 1}/${batchRanges.length} supplement response length:`, supplementResponse.length);
              console.log(`=== OUTLINE BATCH ${batchIndex + 1} SUPPLEMENT RESPONSE START ===`);
              console.log(supplementResponse);
              console.log(`=== OUTLINE BATCH ${batchIndex + 1} SUPPLEMENT RESPONSE END ===`);

              let supplementData: { title: string; chapters: OutlineItem[] };

              try {
                supplementData = parseOutlineResponse(supplementResponse);
              } catch (parseError) {
                console.warn('Supplement outline JSON parse failed, attempting salvage parse:', parseError);
                supplementData = salvageOutlineResponse(supplementResponse);
                console.log('Salvaged supplement chapters:', supplementData.chapters.length);
              }

              const normalizedSupplement = normalizeOutlineChaptersByNumbers(supplementData, missingChapterNumbers);
              normalizedCandidate = {
                title: normalizedCandidate.title || normalizedSupplement.title,
                chapters: [...normalizedCandidate.chapters, ...normalizedSupplement.chapters],
              };
            }

            normalizedBatch = normalizeOutlineBatchResponse(normalizedCandidate, batchRange.start, batchRange.end);
            break;
          } catch (batchError) {
            lastBatchError = batchError;
            console.warn(`Outline batch ${batchIndex + 1}/${batchRanges.length} attempt ${attempt}/2 failed:`, batchError);
          }
        }

        if (!normalizedBatch) {
          const errorMessage = lastBatchError instanceof Error ? lastBatchError.message : '未知错误';
          throw new Error(`第 ${batchRange.start}-${batchRange.end} 章大纲生成失败，已自动重试 1 次：${errorMessage}`);
        }

        outlineTitle = outlineTitle || normalizedBatch.title;
        mergedChapters.push(...normalizedBatch.chapters);

        setAnalysisProgress({
          current: batchIndex + 1,
          total: batchRanges.length,
          message: batchIndex < batchRanges.length - 1
            ? `第 ${batchRange.start}-${batchRange.end} 章已生成，正在整理前文上下文...`
            : '所有批次已生成完成，正在保存大纲...',
          startedAt: outlineStartedAt,
        });
      }

      const now = Date.now();
      const newOutline: NovelOutline = {
        id: String(now),
        title: outlineTitle || 'New Novel',
        chapters: mergedChapters,
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
    } finally {
      setIsGeneratingOutline(false);
      setAnalysisProgress(null);
    }
  }, [callLLM, highOriginalityMode, llmConfig, outlineAnchorCount, outlineGenerationMode, saveOutlineData, setActiveOutlineId, setOutline, styleAnalysis]);

  const handleNovelUploaded = useCallback(async (content: string) => {
    console.log('handleNovelUploaded called, content length:', content.length);
    console.log('llmConfig:', llmConfig);

    if (!llmConfig) {
      return;
    }

    try {
      console.log('Starting analysis...');
      const analysisStartedAt = Date.now();
      setAnalysisProgress({ current: 0, total: 0, message: '正在解析章节结构...', startedAt: analysisStartedAt });

      const extractedChapters = extractChapterSections(content);
      const deepPlotAnalysisChapters = analysisDepthMode === 'deep' ? selectChaptersForDeepPlotAnalysis(extractedChapters) : [];
      const chapterChunks = deepPlotAnalysisChapters.length > 0 ? chunkChaptersForPlotAnalysis(deepPlotAnalysisChapters) : [];
      const quickPlotSample = buildQuickPlotAnalysisSample(content, extractedChapters);
      const styleSample = buildStyleAnalysisSample(content, deepPlotAnalysisChapters.length > 0 ? deepPlotAnalysisChapters : extractedChapters);
      const totalAnalysisSteps = analysisDepthMode === 'deep'
        ? 1 + (chapterChunks.length > 0 ? chapterChunks.length + 1 : 1)
        : 2;

      setAnalysisProgress({
        current: 0,
        total: totalAnalysisSteps,
        message: analysisDepthMode === 'deep'
          ? deepPlotAnalysisChapters.length > 0
            ? `已识别 ${deepPlotAnalysisChapters.length} 章，准备开始深度分析...`
            : '未识别到稳定章节标题，准备按全文样本分析...'
          : quickPlotSample.sampledChapterCount > 0
            ? `已识别 ${quickPlotSample.sampledChapterCount} 章候选样本，准备开始快速分析...`
            : '未识别到稳定章节标题，准备按全文样本快速分析...',
        startedAt: analysisStartedAt,
      });

      const stylePrompt = ANALYSIS_PROMPT.replace('{{novelContent}}', styleSample);
      setAnalysisProgress({ current: 0, total: totalAnalysisSteps, message: `步骤 1/${totalAnalysisSteps}：正在分析写作风格...`, startedAt: analysisStartedAt });
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

      if (analysisDepthMode === 'deep' && deepPlotAnalysisChapters.length > 0) {
        const chunkAnalyses: PlotChunkAnalysis[] = [];

        for (const [index, chunk] of chapterChunks.entries()) {
          const chapterRange = `第${chunk[0].chapterNumber}-${chunk[chunk.length - 1].chapterNumber}章`;
          setAnalysisProgress({
            current: 1 + index,
            total: totalAnalysisSteps,
            message: `步骤 ${2 + index}/${totalAnalysisSteps}：正在分析 ${chapterRange} 的剧情节奏...`,
            startedAt: analysisStartedAt,
          });
          const plotChunkPrompt = PLOT_CHUNK_ANALYSIS_PROMPT
            .replace('{{chapterRange}}', chapterRange)
            .replace('{{chapterContent}}', formatChapterChunk(chunk));

          const chunkResponse = await callLLM({ config: llmConfig, prompt: plotChunkPrompt, deepThinking: true });
          chunkAnalyses.push(parsePlotChunkAnalysisResponse(chunkResponse));
        }

        const synthesisPrompt = PLOT_PATTERN_SYNTHESIS_PROMPT
          .replaceAll('{{sampledChapterCount}}', String(deepPlotAnalysisChapters.length))
          .replace('{{chunkAnalyses}}', JSON.stringify(chunkAnalyses, null, 2));

        setAnalysisProgress({
          current: 1 + chapterChunks.length,
          total: totalAnalysisSteps,
          message: `步骤 ${totalAnalysisSteps}/${totalAnalysisSteps}：正在汇总整体剧情模式...`,
          startedAt: analysisStartedAt,
        });
        plotPatternAnalysis = (await callLLM({ config: llmConfig, prompt: synthesisPrompt, deepThinking: true })).trim();
      } else if (analysisDepthMode === 'quick') {
        const quickPrompt = QUICK_PLOT_PATTERN_ANALYSIS_PROMPT
          .replaceAll('{{sampledChapterCount}}', String(quickPlotSample.sampledChapterCount))
          .replace('{{sampledContent}}', quickPlotSample.sampleText || sanitizeAnalysisText(content, 18000));

        setAnalysisProgress({
          current: 1,
          total: totalAnalysisSteps,
          message: `步骤 2/${totalAnalysisSteps}：正在生成快速剧情模式分析...`,
          startedAt: analysisStartedAt,
        });
        plotPatternAnalysis = (await callLLM({ config: llmConfig, prompt: quickPrompt })).trim();
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

        setAnalysisProgress({
          current: 1,
          total: totalAnalysisSteps,
          message: `步骤 ${totalAnalysisSteps}/${totalAnalysisSteps}：正在生成剧情模式总结...`,
          startedAt: analysisStartedAt,
        });
        plotPatternAnalysis = (await callLLM({ config: llmConfig, prompt: fallbackPrompt, deepThinking: true })).trim();
      }

      const analysis: StyleAnalysis = {
        ...baseAnalysis,
        plotPatternAnalysis,
      };

      setAnalysisProgress({ current: totalAnalysisSteps, total: totalAnalysisSteps, message: '分析完成，正在保存结果...', startedAt: analysisStartedAt });
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
    } finally {
      setAnalysisProgress(null);
    }
  }, [analysisDepthMode, callLLM, llmConfig]);

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
    if (isGeneratingOutline) {
      return;
    }

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
  }, [generateOutline, isEditingAnalysis, isGeneratingOutline, outlineChapterCountInput, saveEditedAnalysis, savedAnalysis]);

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

      {analysisProgress ? (
        <div style={{ padding: '12px', backgroundColor: '#ecfeff', borderBottom: '1px solid #bae6fd' }}>
          <div style={{ fontWeight: 600, color: '#0f172a' }}>{analysisProgress.message}</div>
          <div style={{ marginTop: '8px', height: '8px', backgroundColor: '#cffafe', borderRadius: '999px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${analysisProgress.total > 0 ? Math.max(6, Math.round((analysisProgress.current / analysisProgress.total) * 100)) : 6}%`,
                height: '100%',
                backgroundColor: '#06b6d4',
                transition: 'width 0.25s ease',
              }}
            />
          </div>
          <div style={{ marginTop: '6px', fontSize: '12px', color: '#155e75' }}>
            {analysisProgress.total > 0
              ? `${Math.min(analysisProgress.current, analysisProgress.total)}/${analysisProgress.total} 步`
              : '准备中'}
          </div>
          <div style={{ marginTop: '4px', fontSize: '12px', color: '#155e75' }}>
            已耗时：{formatDuration(analysisElapsedMs)}
            {analysisProgress.total > 0 && analysisProgress.current > 0 && analysisProgress.current < analysisProgress.total && (
              <>
                {' · '}预计剩余：{
                  formatDuration(
                    Math.max(
                      0,
                      (analysisElapsedMs / Math.max(1, analysisProgress.current)) * (analysisProgress.total - analysisProgress.current),
                    ),
                  )
                }
              </>
            )}
          </div>
        </div>
      ) : isLoading && (
        <div style={{ padding: '10px', backgroundColor: '#efe' }}>
          处理中...
        </div>
      )}

      {appState === 'settings' && <SettingsForm onConfigSaved={handleConfigSaved} />}

      {appState === 'upload' && (
        <NovelUploader
          onNovelUploaded={handleNovelUploaded}
          analysisDepthMode={analysisDepthMode}
          onAnalysisDepthModeChange={(mode) => {
            setAnalysisDepthMode(mode);
            saveAnalysisDepthMode(mode);
          }}
        />
      )}

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
                    style={{ width: '100%', minHeight: '260px', padding: '8px' }}
                  />
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
                    {savedAnalysis.plotPatternAnalysis || '暂无剧情模式分析结果'}
                  </div>
                )}
              </div>
              <div style={{ marginBottom: '20px' }}>
                <h3>大纲生成模式</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {OUTLINE_GENERATION_MODE_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      style={{
                        display: 'block',
                        border: '1px solid #e5e7eb',
                        borderRadius: '10px',
                        padding: '12px',
                        backgroundColor: outlineGenerationMode === option.value ? '#eff6ff' : '#fff',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="outline-generation-mode"
                        value={option.value}
                        checked={outlineGenerationMode === option.value}
                        onChange={() => {
                          setOutlineGenerationMode(option.value);
                          saveOutlineGenerationMode(option.value);
                        }}
                        style={{ marginRight: '8px' }}
                      />
                      <strong>{option.label}</strong>
                      <div style={{ marginTop: '6px', color: '#4b5563', lineHeight: 1.6 }}>{option.description}</div>
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <h3>原创性更强</h3>
                <label
                  style={{
                    display: 'block',
                    border: '1px solid #e5e7eb',
                    borderRadius: '10px',
                    padding: '12px',
                    backgroundColor: highOriginalityMode ? '#f0fdf4' : '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={highOriginalityMode}
                    onChange={(e) => {
                      const nextValue = e.target.checked;
                      setHighOriginalityMode(nextValue);
                      saveHighOriginalityMode(nextValue);
                    }}
                    style={{ marginRight: '8px' }}
                  />
                  <strong>启用更强去相似化约束（默认开启）</strong>
                  <div style={{ marginTop: '6px', color: '#4b5563', lineHeight: 1.6 }}>
                    会额外避免与原小说在开篇冲突、角色功能映射、金手指载体、地图推进顺序上的明显同构，减少“换皮感”。
                  </div>
                </label>
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
                <h3>全局记忆强度</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {OUTLINE_ANCHOR_COUNT_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      style={{
                        display: 'block',
                        border: '1px solid #e5e7eb',
                        borderRadius: '10px',
                        padding: '12px',
                        backgroundColor: outlineAnchorCount === option.value ? '#f5f3ff' : '#fff',
                        cursor: isGeneratingOutline ? 'not-allowed' : 'pointer',
                        opacity: isGeneratingOutline ? 0.7 : 1,
                      }}
                    >
                      <input
                        type="radio"
                        name="outline-anchor-count"
                        value={option.value}
                        checked={outlineAnchorCount === option.value}
                        disabled={isGeneratingOutline}
                        onChange={() => {
                          setOutlineAnchorCount(option.value);
                          saveOutlineAnchorCount(option.value);
                        }}
                        style={{ marginRight: '8px' }}
                      />
                      <strong>{option.label}</strong>
                      <div style={{ marginTop: '6px', color: '#4b5563', lineHeight: 1.6 }}>{option.description}</div>
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label htmlFor="outline-chapter-count" style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                  大纲章节数
                </label>
                <input
                  id="outline-chapter-count"
                  type="number"
                  disabled={isGeneratingOutline}
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
                <div style={{ marginTop: '4px', fontSize: '12px', color: '#6b7280', lineHeight: 1.7 }}>
                  为避免模型上下文过长，系统会按每批最多 {OUTLINE_BATCH_CHAPTER_LIMIT} 章分批生成，并优先参考全局故事记忆与最近两批大纲来续写后续批次。
                  <br />
                  当前全局记忆强度为 {outlineAnchorCount} 个锚点，可在上方切换精简 / 标准 / 增强档位。
                  <br />
                  如果某一批生成失败，系统会自动重试 1 次；如果某一批章节数量不足，系统会优先只补齐缺失章节，再继续后续流程。
                  <br />
                  如果模型重复返回同一章节，系统会自动去重后再合并到最终大纲。
                </div>
              </div>
              <button
                onClick={handleGenerateOutline}
                disabled={isGeneratingOutline}
                style={{ padding: '10px 20px', fontSize: '16px' }}
              >
                {isGeneratingOutline ? '正在分批生成大纲...' : '生成大纲'}
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
          globalMemorySummary={buildOutlineGlobalMemory(outline.title, outline.chapters, outlineAnchorCount)}
          recentOutlineSummary={buildRecentOutlineContext(outline.chapters)}
          outlineAnchorCount={outlineAnchorCount}
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
