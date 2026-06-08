# JustGamble 联机部署指南

## 部署方案：Vercel（推荐）

Vercel 是最适合此项目的部署平台：
- ✅ **完全免费**（个人项目）
- ✅ **自动部署** - 推送到 GitHub 自动更新
- ✅ **全球 CDN** - 访问速度快
- ✅ **支持环境变量** - 安全配置 Firebase
- ✅ **HTTPS 自动** - 自带 SSL 证书

---

## 部署步骤

### 第一步：准备代码

#### 1. 确认 `.gitignore` 配置正确

```bash
# 检查是否已包含
cat .gitignore
```

应该包含：
```
node_modules/
dist/
.env
.env.local
```

#### 2. 提交到 Git（如果还没有）

```bash
# 初始化 Git（如果还没有）
git init

# 添加所有文件
git add .

# 提交
git commit -m "准备部署：联机模式完成"
```

---

### 第二步：推送到 GitHub

#### 1. 创建 GitHub 仓库

访问 https://github.com/new
- 仓库名：`justgamble` 或任意名称
- 可见性：Public（公开）或 Private（私有）
- ⚠️ **不要**勾选"Initialize with README"

#### 2. 推送代码

```bash
# 添加远程仓库（替换成你的 GitHub 用户名和仓库名）
git remote add origin https://github.com/你的用户名/justgamble.git

# 推送
git branch -M main
git push -u origin main
```

---

### 第三步：在 Vercel 部署

#### 1. 注册 Vercel

访问 https://vercel.com
- 点击 "Sign Up"
- 选择 "Continue with GitHub"（用 GitHub 账号登录最方便）

#### 2. 导入项目

1. 点击 "Add New..." → "Project"
2. 找到你的 `justgamble` 仓库
3. 点击 "Import"

#### 3. 配置构建设置

Vercel 会自动检测到 Vite 项目，使用默认配置即可：

```
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

#### 4. 配置环境变量（重要！）

在 "Environment Variables" 部分添加你的 Firebase 配置：

| Name | Value |
|------|-------|
| `VITE_FIREBASE_API_KEY` | `你的 Firebase API Key` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `你的项目.firebaseapp.com` |
| `VITE_FIREBASE_DATABASE_URL` | `https://你的项目.firebaseio.com` |
| `VITE_FIREBASE_PROJECT_ID` | `你的项目ID` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `你的项目.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `你的 Sender ID` |
| `VITE_FIREBASE_APP_ID` | `你的 App ID` |

**从哪里找到这些值？**
```bash
# 查看本地 .env 文件
cat .env
```

#### 5. 部署

点击 "Deploy" 按钮！

等待 1-2 分钟，部署完成后会显示：
```
✅ Ready! https://justgamble-你的随机域名.vercel.app
```

---

### 第四步：测试联机功能

#### 1. 访问部署的网址

打开 Vercel 给你的网址，例如：
```
https://justgamble-abc123.vercel.app
```

#### 2. 测试联机模式

**测试方法 A：两个浏览器窗口**
1. 打开网址（正常窗口）
2. 创建用户 A → 点击"联机模式" → 创建房间 → 记下房间码
3. 打开隐身窗口（Ctrl+Shift+N）
4. 创建用户 B → 点击"联机模式" → 输入房间码加入
5. 添加 AI 补位 → 开始游戏

**测试方法 B：手机 + 电脑**
1. 电脑打开网址 → 创建房间
2. 手机打开同一网址 → 输入房间码加入
3. 开始游戏

#### 3. 验证功能

- ✅ 两个玩家能看到相同的牌桌
- ✅ 轮到自己时能操作
- ✅ 对方操作后实时同步
- ✅ AI 能正常决策

---

## 后续更新流程

部署后，每次代码修改都会自动更新：

```bash
# 修改代码后
git add .
git commit -m "修复某个问题"
git push

# Vercel 会自动检测推送 → 自动重新构建 → 自动部署
# 1-2 分钟后，网址就更新了
```

---

## 自定义域名（可选）

如果你有自己的域名（如 `justgamble.com`）：

1. 在 Vercel 项目页面 → "Settings" → "Domains"
2. 添加你的域名
3. 按照提示在域名注册商那里添加 DNS 记录
4. 等待 DNS 生效（几分钟到几小时）

---

## 常见问题

### Q1: 部署后显示白屏？

**检查步骤**：
1. 打开浏览器开发者工具（F12） → Console 标签
2. 查看是否有 Firebase 配置错误
3. 确认 Vercel 的环境变量配置正确

### Q2: 联机模式无法连接？

**可能原因**：
- Firebase 环境变量未配置
- Firebase Realtime Database 规则未设置

**检查 Firebase 规则**：
访问 Firebase Console → Realtime Database → Rules

应该设置为（开发测试用）：
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

⚠️ 这是开放规则，生产环境需要改为更安全的规则。

### Q3: 构建失败？

**查看构建日志**：
在 Vercel 项目页面 → "Deployments" → 点击失败的部署 → 查看日志

**常见问题**：
- `npm install` 失败 → 检查 `package.json`
- `npm run build` 失败 → 本地运行 `npm run build` 确认没问题

---

## 其他部署方案（备选）

### 方案 B：Netlify（类似 Vercel）

1. 访问 https://netlify.com
2. 用 GitHub 登录
3. "Add new site" → "Import an existing project"
4. 选择仓库 → 配置环境变量 → Deploy

### 方案 C：GitHub Pages（不推荐）

GitHub Pages 不支持环境变量，需要将 Firebase 配置写死在代码中（不安全）。

---

## 部署清单

部署前检查：

- [ ] 代码已提交到 Git
- [ ] `.gitignore` 已配置（不包含 `.env`）
- [ ] 推送到 GitHub
- [ ] Firebase 配置信息准备好
- [ ] Vercel 账号已注册

部署后测试：

- [ ] 单人模式能正常玩
- [ ] 联机模式能创建房间
- [ ] 两个设备能通过房间码连接
- [ ] 游戏状态实时同步
- [ ] AI 能正常决策

---

## 成本估算

| 服务 | 免费额度 | 预计费用 |
|------|---------|---------|
| Vercel | 100GB 带宽/月，无限构建 | **$0/月** |
| Firebase | 1GB 存储 + 10GB/月下载 | **$0/月** |
| GitHub | 无限公开仓库 | **$0/月** |
| **总计** | | **$0/月** |

小规模使用（< 100 并发用户）完全免费！

---

## 下一步

部署完成后，你可以：

1. 分享网址给朋友一起玩
2. 添加自定义域名
3. 配置 Firebase 安全规则
4. 添加游戏统计和排行榜
5. 优化移动端体验

祝你部署顺利！🎮
