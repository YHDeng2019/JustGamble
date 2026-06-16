# 环境变量配置（复制到 Vercel）

在 Vercel 部署页面的 "Environment Variables" 部分，逐个添加以下变量：

## 方法 1：逐个添加

### AI API 配置（单人模式）

**变量 1：**
- Name: `VITE_DEFAULT_API_BASE_URL`
- Value: `https://ark.cn-beijing.volces.com/api/v3`

**变量 2：**
- Name: `VITE_DEFAULT_API_KEY`
- Value: `c2f50e37-22ff-4afb-aaaa-084d99fd6847`

**变量 3：**
- Name: `VITE_DEFAULT_AI_MODEL`
- Value: `doubao-seed-2-0-pro-260215`

### Firebase 配置（联机模式）

**变量 4：**
- Name: `VITE_FIREBASE_API_KEY`
- Value: `AIzaSyA2rKu58HszXptG9oJR31tdiRcEBkNqg-U`

**变量 5：**
- Name: `VITE_FIREBASE_AUTH_DOMAIN`
- Value: `justgamble.firebaseapp.com`

**变量 6：**
- Name: `VITE_FIREBASE_DATABASE_URL`
- Value: `https://justgamble-default-rtdb.asia-southeast1.firebasedatabase.app`

**变量 7：**
- Name: `VITE_FIREBASE_PROJECT_ID`
- Value: `justgamble`

**变量 8：**
- Name: `VITE_FIREBASE_STORAGE_BUCKET`
- Value: `justgamble.firebasestorage.app`

**变量 9：**
- Name: `VITE_FIREBASE_MESSAGING_SENDER_ID`
- Value: `914856087177`

**变量 10：**
- Name: `VITE_FIREBASE_APP_ID`
- Value: `1:914856087177:web:1a27e4cf79ba0e54f1a2ff`

---

## 方法 2：批量导入（如果 Vercel 支持）

如果 Vercel 有 "Import from .env" 功能，可以复制以下内容：

```
VITE_DEFAULT_API_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
VITE_DEFAULT_API_KEY=c2f50e37-22ff-4afb-aaaa-084d99fd6847
VITE_DEFAULT_AI_MODEL=doubao-seed-2-0-pro-260215
VITE_FIREBASE_API_KEY=AIzaSyA2rKu58HszXptG9oJR31tdiRcEBkNqg-U
VITE_FIREBASE_AUTH_DOMAIN=justgamble.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://justgamble-default-rtdb.asia-southeast1.firebasedatabase.app
VITE_FIREBASE_PROJECT_ID=justgamble
VITE_FIREBASE_STORAGE_BUCKET=justgamble.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=914856087177
VITE_FIREBASE_APP_ID=1:914856087177:web:1a27e4cf79ba0e54f1a2ff
```

---

## 注意事项

1. 所有变量的 Environment 类型选择：**Production, Preview, Development**（全选）
2. 添加完所有变量后，点击 "Deploy"
3. 部署需要 1-2 分钟

## 部署后测试

部署成功后，你会得到一个网址，例如：
```
https://just-gamble-abc123.vercel.app
```

立即测试：
1. 打开网址
2. 创建用户
3. 测试单人模式（AI 对战）
4. 测试联机模式（创建房间）
5. 用手机打开同一网址，输入房间码加入

## 常见问题

**Q: 添加环境变量时选择哪个环境？**
A: 全选（Production, Preview, Development）

**Q: 变量值要加引号吗？**
A: 不需要，直接粘贴原始值即可

**Q: 部署后显示白屏？**
A: 按 F12 查看控制台错误，确认环境变量是否都添加了
