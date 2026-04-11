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

## 添加播客音频

### 文件结构

```
source/audio/你的文章slug/audio.m4a
source/_posts/你的文章slug.md
```

### 操作步骤

**1. 准备音频文件**

将 `.m4a` 格式的音频文件放到对应文章 slug 目录下：

```bash
source/audio/你的文章slug/audio.m4a
```

**2. 修改文章 frontmatter**

在 markdown 文件顶部 frontmatter 中添加 `audio` 字段：

```yaml
---
title: 你的文章标题
date: 2026-04-11
tags:
  - AI
categories:
  - # AI资讯
audio: /audio/你的文章slug/audio.m4a
---
```

### 注意事项

- **格式**：仅支持 `.m4a`（AAC 编码）
- **文件名**：统一用 `audio.m4a`
- **目录名**：建议与文章 slug 同名，便于管理
- **前端展示**：音频播放器自动出现在文章标题和正文之间
- **部署后生效**：本地 `hexo generate` 后即可预览

### 常见问题

**Q: 音频播放器显示"您的浏览器不支持音频播放"**
→ 确认 `preload="metadata"` 已加到 `themes/ZenMind/layout/post.ejs` 的 `<audio>` 标签中。

**Q: 音频控件宽度为 0**
→ 确保 `.post-audio` 有 CSS `flex: 0 0 100%`（已在主题中配置）。

**Q: 网页打不开或显示 404**
→ 检查 GitHub Actions 是否失败，确认 develop 分支在 Settings → Environments → github-pages 的允许列表中。

**Q: 本地 hexo server 报错**
→ 确认在 develop 分支，并已运行 `git submodule update --init themes/ZenMind` 和 `npm install`。
