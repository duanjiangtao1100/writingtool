// localStorage 封装

interface LLMConfig {
  apiUrl: string;
  apiToken: string;
  model: string;
}

interface StyleAnalysis {
  styleDescription: string;
  keyElements: string[];
}

const LLM_CONFIG_KEY = 'llm-config';
const STYLE_ANALYSIS_KEY = 'style-analysis';

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
    return JSON.parse(data);
  } catch {
    return null;
  }
}
