---
title: "5个Agent Skill设计模式：每个ADK开发者都应该知道"
date: '2026-04-13'
author: Google Cloud Tech
categories:
  - Agent
  - AI工程
tags:
  - ADK
  - Agent Skills
  - Google Cloud
  - AI编程
original_url: https://x.com/GoogleCloudTech/status/2033953579824758855
---

> **转载来源**：[5 Agent Skill design patterns every ADK developer should know](https://x.com/GoogleCloudTech/status/2033953579824758855)
>
> 作者：Google Cloud Tech [@GoogleCloudTech](https://x.com/GoogleCloudTech)
>
> 当涉及到 **𝚂𝙺𝙸𝙻𝙻.𝚖𝚍** 时，开发者往往执着于格式——写好 YAML、整理目录、遵循规范。但随着 30+  agent 工具（如 Claude Code、Gemini CLI、Cursor）标准化了相同的布局，格式问题实际上已经过时了。
>
> 真正的挑战是**内容设计**：规范解释了如何打包一个 skill，却没有给出如何组织其内部逻辑的任何指导。

## 背景

当涉及到 **SKILL.md** 时，开发者往往执着于格式——写好 YAML、整理目录、遵循规范。但随着 30+ agent 工具（如 Claude Code、Gemini CLI、Cursor）标准化了相同的布局，格式问题实际上已经过时了。

真正的挑战是**内容设计**：规范解释了如何打包一个 skill，却没有给出如何组织其内部逻辑的任何指导。例如，一个包装 FastAPI 约定的 skill 与一个四步文档流水线的 skill，即使它们的 SKILL.md 文件外观完全相同，内部运作方式却完全不同。

通过研究整个生态系统中 skill 的构建方式——从 Anthropic 的仓库到 Vercel 和 Google 的内部指南——发现了**五个可重复的设计模式**，可以帮助开发者构建 agent。

---

## 模式一：Tool Wrapper（工具包装器）

**核心理念**：让 agent 成为任意库的即时专家。

Tool Wrapper 让你的 agent 可以按需获取特定库的上下文。与其将 API 约定硬编码到系统提示词中，不如将它们打包成一个 skill。Agent 只在真正使用该技术时才加载这个上下文。

这是最简单的实现模式。SKILL.md 文件监听用户提示词中的特定库关键字，从 `references/` 目录动态加载内部文档，并将这些规则作为绝对真理应用。

### 示例：FastAPI 专家 Skill

```markdown
# skills/api-expert/SKILL.md
---
name: api-expert
description: FastAPI development best practices and conventions. Use when building, reviewing, or debugging FastAPI applications, REST APIs, or Pydantic models.
metadata:
  pattern: tool-wrapper
  domain: fastapi
---

You are an expert in FastAPI development. Apply these conventions to the user's code or question.

## Core Conventions
Load 'references/conventions.md' for the complete list of FastAPI best practices.

## When Reviewing Code
1. Load the conventions reference
2. Check the user's code against each convention
3. For each violation, cite the specific rule and suggest the fix

## When Writing Code
1. Load the conventions reference
2. Follow every convention exactly
3. Add type annotations to all function signatures
4. Use Annotated style for dependency injection
```

---

## 模式二：Generator（生成器）

**核心理念**：从可重用模板生成结构化文档。

Generator 强制一致的输出。如果你苦于 agent 每次运行生成不同的文档结构，Generator 通过编排"填空"过程来解决这个问题。

它利用两个可选目录：`assets/` 保存输出模板，`references/` 保存样式指南。指令充当项目经理，告诉 agent 加载模板、读取样式指南、询问用户缺失的变量，然后填充文档。

### 示例：技术报告生成器

```markdown
# skills/report-generator/SKILL.md
---
name: report-generator
description: Generates structured technical reports in Markdown. Use when the user asks to write, create, or draft a report, summary, or analysis document.
metadata:
  pattern: generator
  output-format: markdown
---

You are a technical report generator. Follow these steps exactly:

Step 1: Load 'references/style-guide.md' for tone and formatting rules.
Step 2: Load 'assets/report-template.md' for the required output structure.
Step 3: Ask the user for any missing information needed to fill the template:
  - Topic or subject
  - Key findings or data points
  - Target audience (technical, executive, general)
Step 4: Fill the template following the style guide rules. Every section in the template must be present in the output.
Step 5: Return the completed report as a single Markdown document.
```

---

## 模式三：Reviewer（审查器）

**核心理念**：将检查内容与检查方式分离。

Reviewer 模式将"检查什么"与"如何检查"分离。与其编写冗长的系统提示词详述每种代码味道，不如将模块化评分表存储在 `references/review-checklist.md` 文件中。

当用户提交代码时，agent 加载这个清单，系统性地对提交进行评分，按严重程度分组发现。如果你将 Python 样式清单换成 OWASP 安全清单，你就得到了一个完全不同的专业化审计，使用完全相同的 skill 基础设施。

### 示例：代码审查器

```markdown
# skills/code-reviewer/SKILL.md
---
name: code-reviewer
description: Reviews Python code for quality, style, and common bugs. Use when the user submits code for review, asks for feedback on their code, or wants a code audit.
metadata:
  pattern: reviewer
  severity-levels: error,warning,info
---

You are a Python code reviewer. Follow this review protocol exactly:

Step 1: Load 'references/review-checklist.md' for the complete review criteria.
Step 2: Read the user's code carefully. Understand its purpose before critiquing.
Step 3: Apply each rule from the checklist to the code. For every violation found:
  - Note the line number (or approximate location)
  - Classify severity: error (must fix), warning (should fix), info (consider)
  - Explain WHY it's a problem, not just WHAT is wrong
  - Suggest a specific fix with corrected code

Step 4: Produce a structured review with these sections:
- **Summary**: What the code does, overall quality assessment
- **Findings**: Grouped by severity (errors first, then warnings, then info)
- **Score**: Rate 1-10 with brief justification
- **Top 3 Recommendations**: The most impactful improvements
```

---

## 模式四：Inversion（反转）

**核心理念**：Agent 在行动之前先采访你。

Agent 天生想要猜测并立即生成。Inversion 模式翻转了这个动态——不是用户驱动提示词、agent 执行，而是 agent 充当面试官。

Inversion 依靠明确的、不可协商的门控指令（如"在所有阶段完成之前不要开始构建"）来强制 agent 先收集上下文。它按顺序提出结构化问题，并等待你的答案，然后再进入下一阶段。

### 示例：项目规划器

```markdown
# skills/project-planner/SKILL.md
---
name: project-planner
description: Plans a new software project by gathering requirements through structured questions before producing a plan. Use when the user says "I want to build", "help me plan", "design a system", or "start a new project".
metadata:
  pattern: inversion
  interaction: multi-turn
---

You are conducting a structured requirements interview. DO NOT start building or designing until all phases are complete.

## Phase 1 — Problem Discovery (一次问一个问题，等待每个答案)
Ask these questions in order. Do not skip any.
- Q1: "这个项目为用户解决什么问题？"
- Q2: "谁是主要用户？他们的技术水平如何？"
- Q3: "预期规模是多少？（每日用户数、数据量、请求速率）"

## Phase 2 — Technical Constraints（仅在 Phase 1 完全回答后）
- Q4: "你将使用什么部署环境？"
- Q5: "你有技术栈要求或偏好么？"
- Q6: "有哪些不可协商的要求？（延迟、正常运行时间、合规性、预算）"

## Phase 3 — Synthesis（仅在所有问题回答后）
1. Load 'assets/plan-template.md' 获取输出格式
2. 使用收集到的需求填写模板的每个部分
3. 向用户展示完成的计划
4. 询问："这个计划是否准确捕捉到你的需求？有什么想改变的？"
5. 迭代反馈，直到用户确认
```

---

## 模式五：Pipeline（流水线）

**核心理念**：通过检查点强制执行严格的多步工作流。

对于复杂任务，你不能承受跳过步骤或忽略指令。Pipeline 模式通过硬检查点强制执行严格的顺序工作流。

指令本身充当工作流定义。通过实现明确的菱形门条件（如"在从 docstring 生成转到最终装配之前需要用户批准"），Pipeline 确保 agent 无法绕过复杂任务并呈现未经验证的最终结果。

### 示例：文档流水线

```markdown
# skills/doc-pipeline/SKILL.md
---
name: doc-pipeline
description: Generates API documentation from Python source code through a multi-step pipeline. Use when the user asks to document a module, generate API docs, or create documentation from code.
metadata:
  pattern: pipeline
  steps: "4"
---

You are running a documentation generation pipeline. Execute each step in order. Do NOT skip steps or proceed if a step fails.

## Step 1 — Parse & Inventory
分析用户的 Python 代码，提取所有公共类、函数和常量。将清单呈现为 checklist。询问："这是你想记录的完整公共 API 吗？"

## Step 2 — Generate Docstrings
对于每个缺少 docstring 的函数：
- Load 'references/docstring-style.md' 获取所需格式
- 严格按照样式指南生成 docstring
- 呈现每个生成的 docstring 供用户批准

**在用户确认之前不要进入 Step 3。**

## Step 3 — Assemble Documentation
Load 'assets/api-doc-template.md' 获取输出结构。将所有类、函数和 docstring 编译成单个 API 参考文档。

## Step 4 — Quality Check
对照 'references/quality-checklist.md' 进行审查：
- 每个公共符号都已记录
- 每个参数都有类型和描述
- 每个函数至少有一个使用示例

报告结果。在呈现最终文档之前修复问题。
```

---

## 如何选择正确的模式

每个模式回答不同的问题。用这个决策树找到适合你的用例：

| 你的需求 | 对应模式 |
|---------|---------|
| 让 agent 学习某个库或框架 | Tool Wrapper |
| 生成格式一致的文档 | Generator |
| 代码审查/质量检查 | Reviewer |
| 行动前先收集需求 | Inversion |
| 多步骤复杂任务带检查点 | Pipeline |

---

## 模式可以组合

这些模式不是互斥的——它们可以组合。

- Pipeline skill 可以在末尾包含一个 Reviewer 步骤来双重检查自己的工作
- Generator 可以在最开头依赖 Inversion 来收集填写模板所需的变量

感谢 ADK 的 `SkillToolset` 和渐进式披露，你的 agent 只在运行时将上下文 token 花在它实际需要的模式上。

---

> 不要再试图将复杂而脆弱的指令塞进单一的系统提示词了。分解你的工作流，应用正确的结构模式，构建可靠的 agent。
>
> Agent Skills 规范是开源的，并在 ADK 中原生支持。你已经知道如何打包格式了。现在你知道了如何设计内容。去构建更智能的 agent 吧。
>
> ——Google Cloud Tech [@GoogleCloudTech](https://x.com/GoogleCloudTech)
