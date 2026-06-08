# 项目文件组织结构

## 目录结构

```
JustGamble/
├── docs/                    # 文档目录
│   └── debug/              # 调试文档（联机模式开发记录）
│       ├── README.md       # 调试文档索引
│       ├── RACE_CONDITION_FIX.md
│       ├── TIMING_FIXED.md
│       ├── FIX_SUMMARY.md
│       └── ... (其他调试文档)
│
├── scripts/                 # 脚本目录
│   ├── test/               # 测试脚本
│   │   ├── README.md       # 测试脚本说明
│   │   ├── test-all-issues.mjs
│   │   ├── diagnose.cjs
│   │   └── ... (其他测试脚本)
│   └── test-results/       # 测试结果（.gitignore）
│
├── src/                     # 源代码
│   ├── ai/                 # AI 决策逻辑
│   ├── auth/               # 用户认证和存储
│   ├── game/               # 游戏引擎核心
│   ├── pages/              # 页面组件
│   ├── services/           # 服务层（Firebase等）
│   ├── styles/             # 样式文件
│   ├── ui/                 # UI 组件
│   └── utils/              # 工具函数
│
├── public/                  # 静态资源
│   └── audio/              # 音频文件
│
├── CLAUDE.md               # 项目说明（给 Claude Code 的）
├── README.md               # 项目自述
├── .gitignore              # Git 忽略配置
└── package.json            # 依赖配置
```

## 文件整理说明

### 已清理的文件

所有临时生成的文档和测试脚本已整理到相应目录：

- **调试文档** → `docs/debug/`
  - 包含所有问题诊断、修复记录、测试指南
  
- **测试脚本** → `scripts/test/`
  - 包含所有自动化测试工具
  - 测试结果存储在 `scripts/test-results/`（已加入 .gitignore）

### 保留在根目录的文件

- `CLAUDE.md` - 项目配置和说明（Claude Code 需要）
- `README.md` - 项目介绍
- `.gitignore` - 版本控制配置
- `package.json` - NPM 配置

## 使用指南

### 查看调试文档
```bash
cd docs/debug/
cat README.md
```

### 运行测试脚本
```bash
npm run dev  # 启动开发服务器
node scripts/test/test-all-issues.mjs  # 运行测试
```

### 清理测试结果
```bash
rm -rf scripts/test-results/
```
