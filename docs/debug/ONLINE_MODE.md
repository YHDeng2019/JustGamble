# JustGamble - 联机模式配置指南

## 📋 功能特性

### 单机模式（已有）
- ✅ 2-6 人人机对战
- ✅ LLM 驱动的 AI 对手（支持豆包等 OpenAI 兼容 API）
- ✅ 本地多用户账号系统
- ✅ 完整的德州扑克游戏逻辑
- ✅ Balatro 风格霓虹赌场美学
- ✅ 摸鱼模式

### 联机模式（新增）
- ✅ 2-6 人真人在线对战
- ✅ 房间码私密邀请好友
- ✅ 公开房间大厅匹配
- ✅ AI 机器人补位（人不够时）
- ✅ 实时游戏状态同步
- ✅ 超时自动弃牌（30 秒）
- ✅ 心跳检测与掉线处理

---

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，并填入配置：

```bash
cp .env.example .env
```

#### 单机模式配置（可选）

如果需要 LLM AI 对手，配置以下变量：

```env
VITE_DEFAULT_API_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
VITE_DEFAULT_API_KEY=your-doubao-api-key
VITE_DEFAULT_AI_MODEL=doubao-seed-2-0-pro-260215
```

#### 联机模式配置（必需）

按照下面的 Firebase 配置步骤获取配置信息。

---

## 🔥 Firebase 配置步骤

### 1. 创建 Firebase 项目

1. 访问 [Firebase Console](https://console.firebase.google.com/)
2. 点击 "添加项目"
3. 输入项目名称（如 `justgamble`）
4. 选择是否启用 Google Analytics（可选）
5. 创建项目

### 2. 注册 Web 应用

1. 在项目概览页面，点击 **Web 图标** `</>`
2. 输入应用昵称（如 `JustGamble Web`）
3. **不勾选** "同时为此应用设置 Firebase Hosting"
4. 点击 "注册应用"
5. 复制显示的配置代码中的配置对象

### 3. 启用 Realtime Database

1. 在左侧菜单选择 **Realtime Database**
2. 点击 "创建数据库"
3. 选择数据库位置（推荐 `asia-southeast1`，新加坡）
4. 选择 "以测试模式启动"（开发阶段）
5. 点击 "启用"

### 4. 配置安全规则

在 Realtime Database 页面，切换到 "规则" 标签，粘贴以下规则：

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": true
      }
    },
    "users": {
      "$userId": {
        ".read": true,
        ".write": true
      }
    },
    "lobby": {
      ".read": true,
      ".write": true
    }
  }
}
```

⚠️ **注意**：这是开发阶段的规则，生产环境需要更严格的权限控制。

### 5. 填写环境变量

将 Firebase 配置填入 `.env` 文件：

```env
# Firebase 配置
VITE_FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXX
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abc123def456
```

### 6. 测试配置

启动开发服务器：

```bash
npm run dev
```

访问 `http://localhost:5173`，进入联机模式，如果能看到大厅页面说明配置成功。

---

## 🌐 部署到 Vercel

### 1. 推送代码到 GitHub

```bash
git add .
git commit -m "Add online multiplayer mode"
git push
```

### 2. 连接 Vercel

1. 访问 [Vercel](https://vercel.com/)
2. 登录并点击 "Add New Project"
3. 导入你的 GitHub 仓库
4. 配置环境变量：
   - 在 "Environment Variables" 部分添加所有 `.env` 中的变量
   - ⚠️ 确保所有变量都以 `VITE_` 开头

### 3. 部署

点击 "Deploy"，等待构建完成。

部署后你会得到一个公网 URL，如：`https://justgamble.vercel.app`

---

## 🎮 使用指南

### 单机模式

1. 选择或创建用户
2. 主菜单点击 "🎮 单机游戏"
3. 选择游戏人数
4. 开始游戏

### 联机模式

#### 创建房间

1. 主菜单点击 "🌐 联机对战"
2. 点击 "创建房间"
3. 配置游戏参数
4. 选择是否公开房间
5. 分享房间码给好友

#### 加入房间

1. 主菜单点击 "🌐 联机对战"
2. 点击 "加入房间"
3. 输入 6 位房间码
4. 等待房主开始游戏

#### 浏览公开房间

1. 主菜单点击 "🌐 联机对战"
2. 点击 "浏览公开房间"
3. 从列表中选择房间加入

---

## 🤖 AI 机器人补位

房主可以在等待室添加 AI 机器人补位，机器人特点：

- 🎩 **Alex**：保守型，只玩强牌
- 🦊 **Riley**：激进型，频繁加注
- 🌸 **Sam**：平衡型，按赔率决策
- 🎲 **Jordan**：随机型，难以预测
- 🧊 **Morgan**：数学型，严格按胜率行动

---

## ⚠️ 注意事项

### Firebase 免费额度

- Realtime Database 免费 1GB 存储 + 10GB/月下载
- 预计支持约 100 并发房间
- 超出需升级到 Blaze 计划（按量付费）

### 安全性

- 当前配置为快速开发，生产环境需要加强安全规则
- 客户端执行游戏逻辑，易被篡改（适合好友局，不适合竞技）
- 如需高安全性，建议改为服务端验证架构

### 网络延迟

- Firebase 亚太节点延迟约 50-200ms
- 可能出现轻微操作延迟感
- 建议在稳定网络环境下游戏

---

## 📝 开发命令

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview

# 代码检查
npm run lint
```

---

## 🐛 故障排查

### 联机模式无法使用

1. 检查 `.env` 文件是否正确配置
2. 确认 Firebase Realtime Database 已启用
3. 检查浏览器控制台是否有错误信息
4. 确认网络连接正常

### 房间无法创建

1. 检查 Firebase 安全规则是否正确设置
2. 确认 `databaseURL` 格式正确（包含地区信息）
3. 查看浏览器控制台的详细错误

### AI 决策异常

1. 单机模式：检查 LLM API 配置
2. 联机模式：AI 机器人由房主客户端执行，检查房主网络

---

## 📄 许可证

MIT License

---

## 🙏 致谢

- 游戏引擎基于德州扑克规则
- UI 灵感来自 Balatro
- 实时同步基于 Firebase Realtime Database

---

**祝你游戏愉快！🎮**
