# 网络小说风格仿写工具

一个帮助你仿写网络小说风格的 AI 工具。

## 功能特点

- **风格分析**：上传样章，AI 分析其写作风格
- **大纲生成**：基于分析的风格，生成全新的小说大纲（支持 1-150 章）
- **同人创作**：改变人物名称、场景、故事走向，避免雷同
- **章节生成**：按大纲一章一章生成内容，保持风格连贯
- **爽文模式**：专为网络爽文优化

## 技术栈

- React 18 + TypeScript
- Vite
- IndexedDB（本地数据存储）
- 可配置的 LLM API（支持 OpenAI 兼容接口）

## 快速开始

### 安装依赖

```bash
npm install
# 或者
bun install
```

### 启动开发服务器

```bash
npm run dev
# 或者
bun dev
```

### 构建生产版本

```bash
npm run build
# 或者
bun build
```

## 使用说明

1. **配置 LLM**：第一次使用时，先配置你的 API 地址和 Token
2. **上传样章**：上传你想模仿的小说样章（或直接粘贴内容）
3. **调整大纲**：AI 生成大纲后，你可以手动调整每章的剧情
4. **生成章节**：按顺序生成章节内容，AI 会参考前面的章节保持连贯

## 项目结构

```
src/
├── components/       # React 组件
│   ├── SettingsForm.tsx      # LLM 配置表单
│   ├── NovelUploader.tsx     # 小说上传组件
│   ├── OutlineEditor.tsx     # 大纲编辑器
│   └── ChapterViewer.tsx     # 章节查看器
├── hooks/            # 自定义 hooks
│   ├── useLLM.ts            # LLM 调用
│   ├── useOutline.ts        # 大纲状态管理
│   └── useChapters.ts       # 章节状态管理
├── prompts/          # Prompt 模板
│   ├── analysis.ts          # 风格分析 prompt
│   ├── outline.ts           # 大纲生成 prompt
│   └── chapter.ts           # 章节生成 prompt
├── storage/          # 存储层
│   ├── localStorage.ts      # localStorage 封装
│   └── indexedDB.ts         # IndexedDB 封装
├── types/            # TypeScript 类型定义
├── App.tsx           # 主应用组件
└── main.tsx          # 应用入口
```

## License

MIT
