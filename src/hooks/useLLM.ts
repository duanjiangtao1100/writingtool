// LLM 调用 hook

import { useState } from 'react';

// 类型定义
interface LLMConfig {
  apiUrl: string;
  apiToken: string;
  model: string;
}

interface LLMCallOptions {
  config: LLMConfig;
  prompt: string;
  deepThinking?: boolean;
}

export function useLLM() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callLLM = async ({ config, prompt, deepThinking = false }: LLMCallOptions): Promise<string> => {
    setIsLoading(true);
    setError(null);

    try {
      // 火山引擎/豆包 API 特殊处理
      let apiUrl = config.apiUrl;
      let authHeader = `Bearer ${config.apiToken}`;

      // 确保 URL 格式正确
      if (apiUrl.includes('volces.com') && !apiUrl.includes('/chat/completions')) {
        if (!apiUrl.endsWith('/')) apiUrl += '/';
        apiUrl = apiUrl.replace('/coding/', '/').replace('/api/v3', '/api/v3/chat/completions');
        if (!apiUrl.includes('/chat/completions')) {
          apiUrl = apiUrl.replace('/api/v3', '/api/v3/chat/completions');
        }
      }

      console.log('Calling API:', apiUrl, 'deepThinking:', deepThinking);

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      };

      const messages = deepThinking
        ? [
            { role: 'system', content: '这是一个需要深度思考的任务。请先充分分析，再给出结构完整、质量优先的最终答案。' },
            { role: 'user', content: prompt },
          ]
        : [
            { role: 'user', content: prompt },
          ];

      const basePayload = {
        model: config.model,
        messages,
        stream: false,
      };

      const requestPayload = deepThinking
        ? {
            ...basePayload,
            reasoning_effort: 'high',
          }
        : basePayload;

      let response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok && deepThinking && response.status === 400) {
        const errorText = await response.text();
        console.warn('Deep thinking payload rejected, retrying without reasoning_effort:', errorText);
        response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(basePayload),
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', response.status, errorText);
        throw new Error(`API 请求失败: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('API Response:', data);

      // 兼容不同的响应格式
      let result = '';
      if (data.choices?.[0]?.message?.content) {
        result = data.choices[0].message.content;
      } else if (data.content) {
        result = data.content;
      } else if (data.result) {
        result = data.result;
      } else {
        result = JSON.stringify(data, null, 2);
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '未知错误';
      setError(errorMessage);
      console.error('Call LLM error:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    error,
    callLLM,
  };
}
