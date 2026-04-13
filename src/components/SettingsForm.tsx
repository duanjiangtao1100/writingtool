// LLM 配置表单组件

import { useState, useEffect } from 'react';
import { saveLLMConfig, loadLLMConfig } from '../storage/localStorage';

interface LLMConfig {
  apiUrl: string;
  apiToken: string;
  model: string;
}

interface SettingsFormProps {
  onConfigSaved?: (config: LLMConfig) => void;
}

export function SettingsForm({ onConfigSaved }: SettingsFormProps) {
  const [config, setConfig] = useState<LLMConfig>({
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    apiToken: '',
    model: 'gpt-4',
  });

  useEffect(() => {
    const saved = loadLLMConfig();
    if (saved) {
      setConfig(saved);
    }
  }, []);

  const handleSave = () => {
    saveLLMConfig(config);
    onConfigSaved?.(config);
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>LLM 设置</h2>
      <div style={{ marginBottom: '10px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>
          API 地址:
        </label>
        <input
          type="text"
          value={config.apiUrl}
          onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
          style={{ width: '100%', padding: '8px' }}
        />
      </div>
      <div style={{ marginBottom: '10px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>
          API Token:
        </label>
        <input
          type="password"
          value={config.apiToken}
          onChange={(e) => setConfig({ ...config, apiToken: e.target.value })}
          style={{ width: '100%', padding: '8px' }}
        />
      </div>
      <div style={{ marginBottom: '10px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>
          Model:
        </label>
        <input
          type="text"
          value={config.model}
          onChange={(e) => setConfig({ ...config, model: e.target.value })}
          style={{ width: '100%', padding: '8px' }}
        />
      </div>
      <button onClick={handleSave} style={{ padding: '10px 20px' }}>
        保存设置
      </button>
    </div>
  );
}
