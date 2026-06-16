# 🚀 JustGamble 快速部署指南

## ✅ 准备工作已完成

- [x] 代码已构建测试通过
- [x] 代码已推送到 GitHub: https://github.com/YHDeng2019/JustGamble
- [x] Vercel 配置文件已创建
- [x] 所有文件已整理分类

## 📋 现在你需要做的（5分钟）

### 步骤 1：访问 Vercel 并登录

1. 打开浏览器访问: **https://vercel.com/login**
2. 点击 "Continue with GitHub"
3. 授权 Vercel 访问你的 GitHub 账号

### 步骤 2：导入项目

1. 登录后，点击 **"Add New..." → "Project"**
2. 找到 **`YHDeng2019/JustGamble`** 仓库
3. 点击 **"Import"**

### 步骤 3：配置环境变量（重要！）

在 "Environment Variables" 部分，点击 "Add" 添加以下变量：

#### AI API 配置（单人模式）

| Name | Value |
|------|-------|
| `VITE_DEFAULT_API_BASE_URL` | `https://ark.cn-beijing.volces.com/api/v3` |
| `VITE_DEFAULT_API_KEY` | `c2f50e37-22ff-4afb-aaaa-084d99fd6847` |
| `VITE_DEFAULT_AI_MODEL` | `doubao-seed-2-0-pro-260215` |

#### Firebase 配置（联机模式）

| Name | Value |
|------|-------|
| `VITE_FIREBASE_API_KEY` | `AIzaSyA2rKu58HszXptG9oJR31tdiRcEBkNqg-U` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `justgamble.firebaseapp.com` |
| `VITE_FIREBASE_DATABASE_URL` | `https://justgamble-default-rtdb.asia-southeast1.firebasedatabase.app` |
| `VITE_FIREBASE_PROJECT_ID` | `justgamble` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `justgamble.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `914856087177` |
| `VITE_FIREBASE_APP_ID` | `1:914856087177:web:1a27e4cf79ba0e54f1a2ff` |

**提示**：可以直接复制粘贴上面的表格内容

### 步骤 4：开始部署

1. 确认所有环境变量已添加
2. 点击 **"Deploy"** 按钮
3. 等待 1-2 分钟（进度条会显示构建过程）

### 步骤 5：获取部署网址

部署成功后，你会看到：
```
🎉 Your project is ready!
https://just-gamble-xxxx.vercel.app
```

复制这个网址！

## 🎮 测试联机功能

### 方法 A：手机 + 电脑测试

1. **电脑**打开部署的网址
   - 创建用户（如 "Fiona"）
   - 点击 "联机模式"
   - 创建房间
   - 记下房间码（如 "ABC123"）

2. **手机**打开同一网址
   - 创建用户（如 "小明"）
   - 点击 "联机模式"
   - 输入房间码 "ABC123"
   - 加入房间

3. **添加 AI 补位**
   - 点击 "添加机器人"（可以加1-2个）

4. **开始游戏**
   - 房主点击 "开始游戏"
   - 两个设备都能看到实时同步的游戏画面！

### 方法 B：两个浏览器窗口测试

1. 正常窗口 → 创建房间
2. 隐身窗口（Ctrl+Shift+N） → 加入房间
3. 开始游戏

## ✅ 验证清单

部署成功后，确认以下功能：

- [ ] 单人模式能正常玩（AI 对战）
- [ ] 联机模式能创建房间
- [ ] 能通过房间码加入
- [ ] 两个玩家能看到实时同步
- [ ] AI 机器人能正常决策
- [ ] 手牌每局正确重置为2张
- [ ] 筹码为0的玩家不能操作
- [ ] 音效和动画正常

## 🌐 分享给朋友

部署完成后，把网址发给朋友：

```
来一起玩德州扑克！
https://just-gamble-xxxx.vercel.app

创建房间后告诉我房间码，我来加入！
```

## 🔄 后续更新

以后修改代码后，只需：

```bash
git add .
git commit -m "更新说明"
git push
```

Vercel 会自动检测并重新部署！

## ❓ 遇到问题？

### 问题 1：部署后显示白屏

**解决方法**：
1. 按 F12 打开开发者工具
2. 查看 Console 是否有错误
3. 确认环境变量是否都添加了

### 问题 2：联机模式无法连接

**解决方法**：
1. 确认 Firebase 环境变量正确
2. 检查 Firebase Console → Realtime Database → Rules 是否设置为：
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

### 问题 3：构建失败

**解决方法**：
1. 查看 Vercel 构建日志
2. 本地运行 `npm run build` 确认能构建
3. 检查 `package.json` 是否正确

## 📞 需要帮助

如果遇到问题，可以：
1. 查看构建日志
2. 检查浏览器控制台错误
3. 确认环境变量配置

---

**祝你部署顺利！马上就能和朋友联机对战了！🎉**
