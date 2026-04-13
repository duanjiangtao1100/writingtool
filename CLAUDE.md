# 网络小说风格仿写工具 - Claude 项目指南

## 项目概述

这是一个基于 React + TypeScript + Vite 构建的网络小说风格 AI 仿写工具，帮助用户模仿特定小说风格创作新作品。

## 技术栈

- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite 5
- **依赖管理**: npm
- **数据存储**: localStorage
- **外部集成**: OpenAI 兼容 LLM API（支持火山引擎/豆包等）

## 项目结构

```
writingtool/
├── src/
│   ├── components/          # React 组件
│   │   ├── SettingsForm.tsx      # LLM 配置表单
│   │   ├── NovelUploader.tsx     # 小说上传组件
│   │   ├── OutlineEditor.tsx     # 大纲编辑器
│   │   └── ChapterViewer.tsx     # 章节查看器
│   ├── hooks/               # 自定义 hooks
│   │   ├── useLLM.ts             # LLM 调用
│   │   ├── useOutline.ts         # 大纲状态管理
│   │   └── useChapters.ts        # 章节状态管理
│   ├── storage/             # 存储层
│   │   └── localStorage.ts       # localStorage 封装
│   ├── App.tsx              # 主应用组件（包含 prompt 模板和核心逻辑）
│   ├── main.tsx             # 应用入口
│   ├── App.css              # 应用样式
│   └── index.css            # 全局样式
├── public/                  # 静态资源
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## 开发命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器（默认端口 5173） |
| `npm run build` | 构建生产版本 |
| `npm run lint` | 运行 ESLint 检查 |
| `npm run preview` | 预览生产构建 |

## 核心工作流

1. **配置 LLM** → 用户设置 API 地址、Token 和模型
2. **上传样章** → 用户上传或粘贴参考小说内容
3. **风格分析** → LLM 分析小说风格（使用 `ANALYSIS_PROMPT`）
4. **生成大纲** → LLM 生成 50 章的新小说大纲（使用 `OUTLINE_PROMPT`）
5. **编辑大纲** → 用户可手动调整各章节剧情
6. **生成章节** → 逐章生成内容（使用 `CHAPTER_PROMPT`），每章生成后自动创建摘要

## 关键代码位置

| 功能 | 文件 | 说明 |
|------|------|------|
| Prompt 模板 | `src/App.tsx:124-221` | `ANALYSIS_PROMPT`、`OUTLINE_PROMPT`、`CHAPTER_PROMPT`、`SUMMARY_PROMPT` |
| JSON 解析 | `src/App.tsx:50-122` | `extractAndParseJSON()` 处理 LLM 返回的 JSON |
| LLM 调用 | `src/hooks/useLLM.ts` | 支持 OpenAI 兼容接口，含火山引擎特殊处理 |
| 状态管理 | `src/hooks/useOutline.ts` / `useChapters.ts` | 大纲和章节数据管理 |
| 存储 | `src/storage/localStorage.ts` | 配置和数据持久化 |

## 注意事项

- **Prompt 管理**: 所有 prompt 模板集中在 `App.tsx` 中，便于维护
- **JSON 健壮性**: `extractAndParseJSON()` 能处理各种不规范的 LLM JSON 输出
- **API 兼容性**: `useLLM.ts` 中对火山引擎/豆包 API 有特殊 URL 处理逻辑
- **无后端**: 纯前端应用，所有数据存储在浏览器 localStorage 中
