---
title: Agent 自我改进的六条路
date: '2026-04-06 13:09:00'
author: J0hn
original_url: https://mp.weixin.qq.com/s/CH4wIRZVcDDZOmRvPFu43Q
tags:
  - AI
  - Agent
  - 自我改进
category: AI资讯
---

> **导读精华**
>
> 1. **六条技术路径**：输出自审、持久记忆、进化搜索、对抗训练、自我修改、编排自优化——都在回答同一个问题：怎么让 AI Agent 不重新训练就能越来越强
> 2. **记忆是关键转折**：从"当次做好"升级到"越用越好"，核心是把状态从"对话级"提升到"Agent级"，跨 session 知识不丢失
> 3. **小模型也能逆袭**：7B 模型经自我进化在特定任务上逼近数倍大的模型，细粒度信用分配（ADCA-GRPO）是关键

当一个 AI Agent 完成任务之后，它能从这次经历中学到什么吗？下次遇到类似问题，它能做得更好吗？

这个问题，正在被越来越多的开源项目认真回答。从 Meta、阿里巴巴到 Nous Research，从 Karpathy 个人项目到斯坦福博士论文等方案，至少有十几个团队在不同的技术方向上探路。

梳理这些项目的技术路线，可以归为六种机制。每一种都在回答同一个问题：**怎么让 Agent 不重新训练，就能越来越强。**

---

## 01 输出自审

最基础的一种：Agent 生成回答后不直接输出，先让另一个 Agent 审一遍。

技术上叫 Reflection，核心结构是一个双 Agent 循环：

```
Generator 接收用户输入，生成初始回答。
Critic 接收这个回答，判断有没有问题。
有问题就把修改建议传回 Generator，Generator 据此重新生成。
循环一直转，直到 Critic 没什么可改的了，返回空消息，循环终止。
```

终止条件的设计算是颇为优雅：**Critic 不返回消息 = 通过。** 不需要额外评分阈值。

LangChain 的 LangGraph Reflection 是这个模式的标准实现，核心就一行 API：

```
create_reflection_graph(assistant_graph, judge_graph)
```

在代码生成场景中，Critic 可以直接跑 Pyright 做静态类型检查，把错误作为 feedback 传回去。每一轮循环都有明确的、可验证的改进标准。

不过 Reflection 有一个硬限制：**改进只发生在单次执行内。** 下次对话开始，Agent 并不会记得上次犯过什么错。它能在当下把事情做好，但没有跨 session 的学习能力。

---

## 02 持久记忆

Reflection 解决了「当次做好」的问题。但「越用越好」需要另一种能力：**跨 session 的记忆持久化。**

核心思路是把 Agent 的状态从「对话级」提升到「Agent 级」。对话可以结束，但 Agent 的知识不清零。

技术上有几种不同的实现路径。

**Letta Code** 采用的是 API 层持久化。Agent 的记忆存在 Letta 后端服务中（云端或自部署 Docker），每次新对话自动加载之前积累的状态。`/remember` 显式写入记忆，`/skill` 把当前操作轨迹抽象成可复用的技能模块。

这里有个关键的架构决策：**记忆绑定在 Agent 上，不绑定在 LLM 上。** 今天用 Claude，明天换 GPT，后天换 Gemini，记忆都在。

**Agent Zero（16,700 星）** 走了另一条路：动态工具生成 + 记忆。Agent 遇到没有现成工具的任务时，当场写代码创建新工具，然后存入记忆，下次直接复用。

**Hermes Agent（25,700 星）** 则是目前机制最完整的。它在记忆之上加了两层：一是自动技能提炼，二是定期回顾（nudging）。

这些方案的共同技术洞见是：**不改权重，改状态。** 在 LLM 参数冻结的情况下，通过外部的持久化状态层来积累知识。

---

## 03 进化搜索

记忆解决了「记住经验」。但如果 Agent 的 prompt 写法、工具配置，工作流拓扑本身就有优化空间呢？

**EvoAgentX（2,700 星）** 的做法是：给一个自然语言目标，它先自动生成多 Agent 工作流，然后用进化算法迭代优化。

它同时优化三个层面：

| 优化层面 | 技术 |
|----------|------|
| Prompt 文本 | TextGrad 调整每个 Agent 的指令措辞 |
| 工作流拓扑 | AFlow 搜索 Agent 间的连接方式 |
| 配置参数 | MIPRO 优化工具选择和参数设定 |

实测 HotPotQA F1 提升 7.44%，MATH 准确率提升 10%，GAIA 综合最高提升 20%。

**阿里巴巴的 AgentEvolver（1,300 星）** 把进化粒度做得更细，分三个阶段：

- **自我提问（Self-Questioning）**：Agent 自主探索环境，给自己生成训练任务，不需要人工准备数据
- **自我导航（Self-Navigating）**：用 ReMe 经验池管理模块，把跨任务的成功经验存储起来
- **自我归因（Self-Attributing）**：用 ADCA-GRPO 算法做轨迹级别的因果信用分配

这种细粒度信用分配让优化效率大幅提升。**7B 模型在 AppWorld 上从 1.8% 跳到 32.4%**，14B 达到 48.7%。

一个 7B 小模型经过自我进化，就能在特定任务上逼近数倍大的模型。这个结论本身，就说明了进化搜索的价值。

---

## 04 对抗训练

进化搜索需要评估环境来打分。但如果……连训练数据和评估基准都没有呢？

**Agent0（1,100 星）** 的方案叫零数据自我进化，核心机制是双 Agent 对抗。

两个 Agent 从同一个基础模型初始化，分配到两个对立角色：

- **Curriculum Agent** 生成越来越难的任务
- **Executor Agent** 用工具集成推理来解题

关键动力学在于：Executor 变强后，简单题目没有训练价值了，Curriculum Agent 就被迫生成更难的任务。更难的任务又倒逼 Executor 进化出更强能力。**竞争本身就是训练信号。**

效果出乎意料：基于 Qwen3-8B-Base 的数学推理提升了 18%（达到 58.2 分），超过了需要人工标注的 R-Zero 和 Socratic-Zero。通用推理提升 24%。视觉版本 Agent0-VL 在开源视觉语言模型中排到了第一。

零标注，胜过有标注。这个结论背后的含义值得琢磨：也许精心策划的「对抗压力」比精心标注的数据集更能激发模型潜力。

---

## 05 自我修改

前面四种方法有一个共同前提：**改进机制本身是人设计的、固定的。**

**Meta 的 HyperAgents（2,100 星）** 打破了这个限制。

它的核心思路：**让负责改进的 Agent，也能被改进。**

系统由 Task Agent（干活）和 Meta Agent（改进）两部分组成，统一写在一个可编辑程序中。Meta Agent 不仅能改 Task Agent 的代码，还能改自己的代码。**改进的策略本身也在进化。改进改进方法的方法……也在进化。**

实验中最让人印象深刻的现象是：**系统自己发明了持久化记忆和性能追踪机制。** 没有人预设这些功能，Agent 自己判断需要它们，就写代码给自己加上了。它记录的内容相当具体：

> "Gen55 的准确率最高但太严格了，Gen64 改善了平衡性。需要结合 Gen55 的批判性推理和 Gen64 的平衡感。"

跨领域迁移的结果更值得关注。把在论文审稿和机器人任务上进化出的 HyperAgent，直接拿去做 IMO 数学评分，原版 DGM 的迁移效果约等于 0，而 DGM-H 的 imp@50 达到了 **0.630**。

原因在于：DGM 学到的是领域特定技巧，换了领域就失效。DGM-H 学到的是通用的「如何改进」策略，这些在新领域照样管用。

---

## 06 编排自优化

前五种方法都在改 Agent 自身。但 Agent 的表现还取决于另一个东西：**围绕它的编排层（Harness）。**

Harness 指的是模型之外的那一层编排逻辑：prompt 结构、检索策略、工具调用顺序、状态管理。同一个模型换一套 Harness，性能可能翻倍。

**斯坦福的 Meta-Harness（629 星）** 回答了这个问题。

方案本身倒是颇为简洁：用一个 Coding Agent（Claude Code + Opus 4.6）来迭代优化 Harness。每一轮，Agent 读取文件系统中所有的历史记录，提出新的 Harness 方案，跑评估，把结果写回文件系统。

设计上有一个关键选择：**给 Agent 完整的文件系统访问权限，取代压缩摘要。**

消融实验显示，只给分数和摘要时中位数准确率 34%，给完整文件系统直接跳到 50%。**摘要版最高准确率（38.7%）甚至不如完整版的中位数（50.0%）。** 压缩不只是丢了边角细节，而是丢掉了做正确决策所需的关键线索。

结果在文本分类上比人工最优方案 ACE 高 7.7 个百分点，context 用量只有 ACE 的四分之一。在 TerminalBench-2 上拿到 76.4% 通过率，超过人工精调的方案。

---

## 两层天花板

**Big Model 和 Big Harness，两层天花板，缺一不可。**

模型能力决定了理论上限，Harness 决定了实际达到的高度。Meta-Harness 做的事情，是把 Harness 这一层的天花板尽量往模型天花板靠近。

---

## 回到同一个问题

六条路，每条都从不同角度回答了同一个问题：怎么让 Agent 在不重新训练的情况下变强。

| 机制 | 核心思路 | 代表项目 | Stars |
|------|----------|----------|-------|
| 输出自审 | 生成后审查，循环修正 | LangGraph Reflection | 173 |
| 持久记忆 | 跨 session 积累知识和技能 | Letta Code · Agent Zero · Hermes Agent | 2.1k · 16.7k · 25.7k |
| 进化搜索 | 用算法优化 prompt、工具和工作流 | EvoAgentX · AgentEvolver | 2.7k · 1.3k |
| 对抗训练 | 双 Agent 竞争产生训练信号 | Agent0 | 1.1k |
| 自我修改 | 改写自己的代码和改进机制 | HyperAgents | 2.1k |
| 编排自优化 | 自动优化 Agent 的编排层 | Meta-Harness | 629 |

六种机制并非互斥。Hermes Agent 同时用了反思、记忆和技能进化。AgentEvolver 同时做了自我提问和进化搜索。Meta-Harness 的内部循环本身也包含反思和进化。

它们共同指向的核心命题：**AI 的学习，正在从训练阶段溢出到部署阶段。**

过去十年，模型变强的唯一方式是改权重。这些项目展示了另一种可能：权重冻结的情况下，通过外部记忆、行为搜索、对抗训练、代码自修改、编排自优化来持续积累能力。

如果说，训练是「上学」

那这些机制，就是毕业之后的……

**自学能力。**

---

**相关链接：**

- [HyperAgents (Meta)](https://github.com/facebookresearch/Hyperagents)
- [Agent0](https://github.com/aiming-lab/Agent0)
- [EvoAgentX](https://github.com/EvoAgentX/EvoAgentX)
- [AgentEvolver](https://github.com/modelscope/AgentEvolver)
- [Agent Zero](https://github.com/frdel/agent-zero)
- [Letta Code](https://github.com/letta-ai/letta-code)
- [Hermes Agent](https://github.com/NousResearch/hermes-agent)
- [autoresearch (Karpathy)](https://github.com/karpathy/autoresearch)
- [Meta-Harness (Stanford)](https://github.com/stanford-iris-lab/meta-harness-tbench2-artifact)
- [LangGraph Reflection](https://github.com/langchain-ai/langgraph-reflection)
