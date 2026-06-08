#!/bin/bash

echo "🚀 JustGamble 自动部署到 Vercel"
echo "================================"
echo ""

# 检查是否已登录
if ! vercel whoami &> /dev/null; then
    echo "📝 请先登录 Vercel..."
    echo "执行: vercel login"
    echo ""
    echo "登录后再运行此脚本"
    exit 1
fi

echo "✓ 已登录 Vercel"
echo ""

# 设置环境变量
echo "🔧 配置环境变量..."

# AI API 配置
vercel env add VITE_DEFAULT_API_BASE_URL production << EOF
https://ark.cn-beijing.volces.com/api/v3
EOF

vercel env add VITE_DEFAULT_API_KEY production << EOF
c2f50e37-22ff-4afb-aaaa-084d99fd6847
EOF

vercel env add VITE_DEFAULT_AI_MODEL production << EOF
doubao-seed-2-0-pro-260215
EOF

# Firebase 配置
vercel env add VITE_FIREBASE_API_KEY production << EOF
AIzaSyA2rKu58HszXptG9oJR31tdiRcEBkNqg-U
EOF

vercel env add VITE_FIREBASE_AUTH_DOMAIN production << EOF
justgamble.firebaseapp.com
EOF

vercel env add VITE_FIREBASE_DATABASE_URL production << EOF
https://justgamble-default-rtdb.asia-southeast1.firebasedatabase.app
EOF

vercel env add VITE_FIREBASE_PROJECT_ID production << EOF
justgamble
EOF

vercel env add VITE_FIREBASE_STORAGE_BUCKET production << EOF
justgamble.firebasestorage.app
EOF

vercel env add VITE_FIREBASE_MESSAGING_SENDER_ID production << EOF
914856087177
EOF

vercel env add VITE_FIREBASE_APP_ID production << EOF
1:914856087177:web:1a27e4cf79ba0e54f1a2ff
EOF

echo ""
echo "🚀 开始部署..."
vercel --prod

echo ""
echo "✅ 部署完成！"
echo ""
echo "🌐 访问你的网站并测试联机功能"
