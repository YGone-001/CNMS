#!/bin/bash
# xCloud-CNMS 一键构建脚本
# 流程: 前端构建 -> 拷贝产物 -> Go 编译（嵌入前端资源的单二进制）
set -e

# 设置 Go 环境变量
export PATH=$PATH:/usr/local/go/bin
export GOPROXY=https://goproxy.cn,direct

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
BACKEND_DIR="$SCRIPT_DIR/backend"
DIST_SRC="$FRONTEND_DIR/dist"
DIST_DST="$BACKEND_DIR/public/dist"
OUTPUT="$BACKEND_DIR/xcloud-cnms"

echo "=== xCloud-CNMS Build ==="

echo "[1/3] Building frontend..."
cd "$FRONTEND_DIR"
npm ci
npm run build
echo "Frontend build complete."

echo "[2/3] Copying dist to backend/public/dist..."
rm -rf "$DIST_DST"
mkdir -p "$DIST_DST"
cp -r "$DIST_SRC"/* "$DIST_DST"/
touch "$DIST_DST/.gitkeep"
echo "Copied $(find "$DIST_DST" -type f | wc -l) files."

echo "[3/3] Building Go binary..."
cd "$BACKEND_DIR"
go build -ldflags="-s -w" -o "$OUTPUT" .
echo "Go binary: $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"

echo ""
echo "=== Build Complete ==="
echo "Binary:  $OUTPUT"
echo ""
echo "Run directly:"
echo "  cd backend && ./xcloud-cnms -config config/config.json"
echo ""
echo "Run with Docker:"
echo "  docker-compose up -d"
