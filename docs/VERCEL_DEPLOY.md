# JustGamble 部署到 Vercel 的步骤

## 自动化部署说明

项目已推送到 GitHub: https://github.com/YHDeng2019/JustGamble

## Vercel 部署步骤

### 1. 访问 Vercel
打开浏览器访问: https://vercel.com/new

### 2. 使用 GitHub 登录
- 点击 "Continue with GitHub"
- 授权 Vercel 访问你的 GitHub 账号

### 3. 导入项目
- 在 "Import Git Repository" 中找到 `YHDeng2019/JustGamble`
- 点击 "Import"

### 4. 配置项目
保持默认设置：
```
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

### 5. 添加环境变量（重要！）

在 "Environment Variables" 部分添加以下变量：

**AI API 配置（单人模式）**：
```
VITE_DEFAULT_API_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
VITE_DEFAULT_API_KEY=c2f50e37-22ff-4afb-aaaa-084d99fd6847
VITE_DEFAULT_AI_MODEL=doubao-seed-2-0-pro-260215
```

**Firebase 配置（联机模式）**：
```
VITE_FIREBASE_API_KEY=AIzaSyA2rKu58HszXptG9oJR31tdiRcEBkNqg-U
VITE_FIREBASE_AUTH_DOMAIN=justgamble.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://justgamble-default-rtdb.asia-southeast1.firebasedatabase.app
VITE_FIREBASE_PROJECT_ID=justgamble
VITE_FIREBASE_STORAGE_BUCKET=justgamble.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=914856087177
VITE_FIREBASE_APP_ID=1:914856087177:web:1a27e4cf79ba0e54f1a2ff
```

⚠️ **注意**：将上述变量逐一添加到 Vercel 的环境变量配置中

### 6. 部署
点击 "Deploy" 按钮，等待 1-2 分钟

### 7. 获取部署网址
部署完成后，Vercel 会提供一个网址，例如：
```
https://just-gamble-xxx.vercel.app
```

### 8. 测试联机功能
1. 打开部署的网址
2. 创建用户 → 点击"联机模式" → 创建房间
3. 用手机或另一个浏览器访问同一网址
4. 输入房间码加入 → 开始游戏

## 快速访问链接

- GitHub 仓库: https://github.com/YHDeng2019/JustGamble
- Vercel 部署: https://vercel.com/new/clone?repository-url=https://github.com/YHDeng2019/JustGamble

## 部署后自动更新

每次推送代码到 GitHub：
```bash
git add .
git commit -m "更新说明"
git push
```

Vercel 会自动检测并重新部署！
