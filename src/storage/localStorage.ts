// localStorage 封装

interface LLMConfig {
  apiUrl: string;
  apiToken: string;
  model: string;
}

interface StyleAnalysis {
  styleDescription: string;
  keyElements: string[];
  plotPatternAnalysis: string;
}

const LLM_CONFIG_KEY = 'llm-config';
const STYLE_ANALYSIS_KEY = 'style-analysis';
const CURRENT_OUTLINE_ID_KEY = 'current-outline-id';
const OUTLINE_CHAPTER_COUNT_KEY = 'outline-chapter-count';

export function saveLLMConfig(config: LLMConfig): void {
  localStorage.setItem(LLM_CONFIG_KEY, JSON.stringify(config));
}

export function loadLLMConfig(): LLMConfig | null {
  const data = localStorage.getItem(LLM_CONFIG_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function saveStyleAnalysis(analysis: StyleAnalysis): void {
  localStorage.setItem(STYLE_ANALYSIS_KEY, JSON.stringify(analysis));
}

export function loadStyleAnalysis(): StyleAnalysis | null {
  const data = localStorage.getItem(STYLE_ANALYSIS_KEY);
  if (!data) return null;
  try {
    const parsed = JSON.parse(data);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const styleDescription = typeof parsed.styleDescription === 'string' ? parsed.styleDescription : '';
    if (!styleDescription) {
      return null;
    }

    return {
      styleDescription,
      keyElements: Array.isArray(parsed.keyElements)
        ? parsed.keyElements.filter((item: unknown): item is string => typeof item === 'string')
        : [],
      plotPatternAnalysis: typeof parsed.plotPatternAnalysis === 'string' ? parsed.plotPatternAnalysis : '',
    };
  } catch {
    return null;
  }
}

export function saveCurrentOutlineId(outlineId: string): void {
  localStorage.setItem(CURRENT_OUTLINE_ID_KEY, outlineId);
}

export function loadCurrentOutlineId(): string | null {
  return localStorage.getItem(CURRENT_OUTLINE_ID_KEY);
}

export function saveOutlineChapterCount(chapterCount: number): void {
  localStorage.setItem(OUTLINE_CHAPTER_COUNT_KEY, String(chapterCount));
}

export function loadOutlineChapterCount(): number | null {
  const value = localStorage.getItem(OUTLINE_CHAPTER_COUNT_KEY);
  if (!value) return null;

  const chapterCount = Number.parseInt(value, 10);
  if (!Number.isFinite(chapterCount) || chapterCount < 1) {
    return null;
  }

  return chapterCount;
}
