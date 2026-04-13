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
}

export function useLLM() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callLLM = async ({ config, prompt }: LLMCallOptions): Promise<string> => {
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

      console.log('Calling API:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'user', content: prompt }
          ],
          stream: false, // 先禁用流式输出，简化调试
        }),
      });

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
