# 1024 Blog

基于 Hexo 的技术博客，部署在 GitHub Pages。

## 分支结构

| 分支 | 用途 | 说明 |
|------|------|------|
| `develop` | 源码分支 | 你写文章、改主题、改配置都在这里 |
| `master` | 部署分支 | 由 GitHub Actions 自动生成，不要手动修改 |

**日常操作只在 `develop` 分支。**

## 写文章流程

```bash
# 1. 确保在 develop 分支
git checkout develop

# 2. 写文章
vim source/_posts/你的文章.md

# 3. 提交并推送
git add source/_posts/你的文章.md
git commit -m "feat: 添加文章"
git push origin develop

# 4. 等待 ~30 秒，GitHub Actions 自动构建并部署到 drummor.github.io
```

## 本地预览

```bash
# 初始化 submodule（首次运行）
git submodule update --init themes/ZenMind

# 安装依赖
npm install

# 本地预览（http://localhost:4000）
hexo server
# 或生成静态文件
hexo generate
```

## 目录结构

```
.
├── source/_posts/     # 博客文章（markdown）
├── source/audio/      # 播客音频文件
├── source/images/     # 文章配图
├── themes/ZenMind/    # 主题（submodule）
├── .github/workflows/ # GitHub Actions 构建脚本
├── _config.yml        # Hexo 配置
└── public/            # 生成的静态文件（自动生成，不要提交）
```

## 注意事项

### ⚠️ 不要跑 git clean
`git clean -fd` 会删除未跟踪的文件，包括 `source/_posts/` 里还没 commit 的文章。

### ⚠️ 不要在 master 分支操作
master 是 GitHub Actions 的部署目标，不要在这个分支上修改源文件。

### ⚠️ 换分支前先 commit
切换分支前确保 develop 的修改已 commit，否则未跟踪的文件会丢失。

### submodule 更新
主题 `themes/ZenMind` 是 submodule，更新主题：
```bash
git submodule update --remote themes/ZenMind
git add themes/ZenMind
git commit -m "chore: update theme"
git push origin develop
```

## CI/CD 流程

```
push to develop → GitHub Actions 触发
  → npm install
  → hexo generate
  → deploy to GitHub Pages
  → drummor.github.io 更新
```

## 常见问题

**Q: 网页打不开或显示 404**
→ 检查 GitHub Actions 是否失败，确认 develop 分支在 Settings → Environments → github-pages 的允许列表中。

**Q: 本地 hexo server 报错**
→ 确认在 develop 分支，并已运行 `git submodule update --init themes/ZenMind` 和 `npm install`。
