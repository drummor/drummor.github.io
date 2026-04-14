---
title: 三省六部幻觉：为什么"虚拟公司"式多Agent架构在工程上不成立
date: 2026-04-12
author: SagaSu
original_url: https://x.com/sujingshen/status/2043898494818410731
tags:
  - AI
  - Agent
  - 架构
category: AI资讯
permalink: /2026/04/12/three-province-six-ministry-illusion/
---

> **导读精华**
>
> 1. **"三省六部"模式是工程幻觉** — 把 Agent 标注为 PM、Dev、QA 角色，像公司部门一样传递文档，在图示上很好看，但解决的是人类的瓶颈，不是 AI 的瓶颈
> 2. **信息在流转中必然衰减** — 角色间的"文档传递"丢失的是推理过程，累积误差让最终输出"局部正确但整体漂移"，外部状态文件才是正确解法
> 3. **三家厂商均未采用此模式** — Anthropic 用 progress.txt + Git history，OpenAI 用 compaction + Skills，Google 用 1M context + Conductor，没有一家靠"角色分工"

<!-- more -->

一个在AI社区广泛流传的架构思路，正在让大量团队走弯路。

## 先说结论

如果你正在考虑把多个AI Agent分别命名为"产品经理"、"架构师"、"测试工程师"，让它们像公司部门一样传递文档、协作完成任务——请停下来。

这个模式看起来很直觉，逻辑上似乎很合理，但它在工程上有根本性的缺陷。更重要的是，Anthropic、OpenAI、Google三家厂商在构建自己的Agent系统时，没有一家采用这个模式。

这不是巧合。

## 什么是"三省六部"式架构

这个比喻指的是一类在社区里广泛流行的多Agent设计思路，在不同框架和文章里有不同名字：role-based agents、virtual team、CrewAI式分工、MetaGPT式组织——本文统称"三省六部"。

核心模式是：把一个复杂任务拆解成若干职能，每个Agent扮演一个角色——PM负责需求、Tech Lead负责架构、Dev负责实现、QA负责测试。任务在Agent之间流转，像一条流水线。

这个模式在图示上非常好看。它满足了人类对"分工协作"的直觉，也让"AI团队"这个概念变得具象可解释。CrewAI等框架正是因此积累了大量用户。

问题在于，它解决的是人类的瓶颈，不是AI的瓶颈。

![三省六部式架构示意](https://pbs.twimg.com/media/HF1iMQEb0AA8tnX?format=jpg&name=large)

## 为什么这个类比从根本上是错的

人类需要分工，是因为：

- 单个人的注意力有限，无法同时处理所有信息
- 人有专业壁垒，学习切换成本高
- 人与人之间需要接口来协调

但LLM的特性完全不同：

- 同一个模型既能写PRD又能写代码，没有"职业边界"
- 模型的瓶颈不是注意力广度，而是推理深度和信息完整性
- 模型之间没有"文化"和"默契"来补偿信息损耗

给Agent贴上"产品经理"的标签，不会让它更专业——但会让它拒绝越界。一个被框死在"测试工程师"角色里的Agent，看到架构层的问题可能直接跳过，因为"不在我职责范围内"。

最有价值的推理往往发生在边界上，而三省六部模式在系统层面封死了这个可能性。

**角色扮演制造了假边界。这是第一个问题。**

## 第二个问题：信息在流转中死亡

三省六部模式里，Agent A产出一个文档，传给Agent B。

这个过程传递的是结论，不是推理过程。B拿到文档，重新理解，重新建立上下文。原始意图在衰减，隐含假设在丢失，每次传递都在累积误差。

![信息在流转中死亡](https://pbs.twimg.com/media/HF1iOwBasAENF4s?format=jpg&name=large)

工作流越长，最终输出越"局部正确但整体漂移"——每个节点看起来合理，但整体已经偏离了最初的目标。

人类组织靠会议、文化、非正式沟通来补偿这个信息损耗。Agent之间没有这些机制。

这里有一个常见的反驳：三家厂商的解法（progress.txt、spec文件、runbook）不也是"传文件"吗？区别在哪？

**区别在于谁在写、写给谁、怎么更新。**

三省六部的信息流转是角色间的单向交接：A写完交给B，B不再回头，A也不知道B怎么用了这份文档。信息被压缩成结论，推理过程丢失，接棒就是断点。

外部状态文件是同一任务的增量日志：执行主体在每个checkpoint时往同一份记录里追加，下一个session读取的是任务的完整历史，不是上一个"同事"的输出结论。写状态的人和读状态的人是同一个角色，只是时间不同。信息不是被"压缩传递"的，是被"连续积累"的。

这个区别决定了推理链能不能跨session保持连续。

大量token被浪费在Agent之间的"交接文件"上，而不是用于实际推理。你得到的是一个模拟公司行为的系统，而不是一个解决问题的系统。

## 三家厂商实际怎么做的

值得注意的是，当Anthropic、OpenAI、Google真正构建自己的生产级Agent系统时，他们的工程文档里几乎找不到"角色扮演"或"部门分工"的字眼。

### Anthropic：Context Engineering + 显式状态文件

Anthropic内部把"Prompt Engineering"升级成了"Context Engineering"：问题不是怎么写好一个prompt，而是什么样的token配置最能产生想要的行为。

在构建Claude Code和Research系统时，他们面对的核心挑战是：Agent必须在离散的session里工作，每个新session对之前发生的事情没有任何记忆。他们的比喻是"轮班工程师"——每个新班次的工程师到岗时对上一班的工作一无所知。

解法不是让Agent扮演不同角色，而是：

- **claude-progress.txt**：一个跨session的工作日志，Agent在每个session结束时更新，下一个session开始时读取
- **Git history**：作为状态锚点，记录每一个增量变化
- **Initializer Agent**：只在第一个session运行，建立环境、展开feature list、写好runbook，供后续所有session使用

![Anthropic 的 orchestrator-worker 架构](https://pbs.twimg.com/media/HF1iUAObcAAeRKG?format=jpg&name=large)

关键洞察：推理链的连续性不靠模型"记住"，靠显式的外部状态来锚定。

他们同时发现，把"model能力假设"硬编码进harness是危险的。Sonnet 4.5有"context anxiety"——快到context limit时会提前收尾，于是harness里加了context reset。但Opus 4.5这个行为消失了，reset变成了死重量。这说明：harness需要随模型迭代而演化，任何"永久解法"都只是当前阶段的工程妥协。

在多Agent的Research系统里，Anthropic的架构是orchestrator-worker：一个lead agent分解任务、协调subagent，subagent并行探索不同方向，结果回流给lead agent综合。他们发现token消耗量本身就解释了80%的性能差异——多Agent的价值不是"分工"，而是用更多token覆盖更大的搜索空间。

这里有一个容易混淆的地方：Anthropic的subagent看起来也像"分工"，但本质完全不同。三省六部是**职能性分工**——不同角色承担不同工种，PM做完传给Dev，Dev做完传给QA，每个角色只处理流水线的一段。Anthropic的subagent是**功能性并行**——多个相同性质的agent同时搜索不同方向，没有"下一棒"，结果全部汇聚回同一个orchestrator综合。前者是接力赛，后者是同时撒网捞鱼。

### OpenAI：Compaction + Skills + 结构化Spec文件

OpenAI给出的长任务原则更直接：在任务开始时就为continuity做规划。

他们的Codex实验里，工程师给agent一个spec文件（冻结目标，防止agent"做出了很impressive但方向错误的东西"），让它生成milestone-based plan，然后用一个runbook文件告诉agent如何操作。这个runbook同时也是共享记忆和审计日志。

结果：GPT-5.3-Codex跑了约25小时不间断，完成了一个完整的设计工具，保持了全程的连贯性。

Server-side compaction作为默认primitive，不是紧急fallback。多步骤任务里，previous_response_id让model能在同一个thread里继续工作，而不是每次重建上下文。

他们还引入了Skills概念——可复用的、版本化的指令集，挂载进container，让agent执行特定任务时有稳定的操作规范。**这不是"角色"，是工具和操作规程，是本质上不同的东西。**

![OpenAI 的 Codex 长任务架构](https://pbs.twimg.com/media/HF1igOQa0AAm-6J?format=jpg&name=large)

### Google：1M上下文 + Context-driven Development

Google的方向是硬扩窗口：Gemini的1M token context是明确的差异化策略。他们的逻辑是：之前被迫使用的RAG切片、丢弃旧消息等技术，在足够大的窗口下可以被"直接放进去"所取代。

但他们自己也承认这不够用。Google在Gemini CLI推出了Conductor扩展，核心思路和Anthropic如出一辙：把项目意图从聊天窗口里移出来，放进代码库里的持久化Markdown文件。哲学是："不依赖不稳定的聊天记录，依赖正式的spec和plan文件。"

Gemini 3还引入了Thought Signatures机制：在长session里保存推理链的关键节点，防止"reasoning drift"——长context里逻辑前后不一致的问题。

## 真正的架构原则是什么

从三家的工程实践中，可以提炼出几个共同的原则：

**推理链不能断，只能分叉再合并。** 多Agent的正确用法不是流水线，而是一个主agent持有完整意图，子调用是为了深挖某个子问题，结果回流给主agent，不是传给下一个agent。

**显式外部状态，不靠模型记住。** progress.txt、git history、spec文件、数据库——形式不重要，原则是：推理链的关键节点必须外化到持久存储里，而不依赖模型在context window里"记住"。

**多Agent的价值是并行覆盖，不是分工。** Anthropic Research系统的结论很清楚：性能提升主要来自于"花了更多token"，而不是来自"分工更合理"。多Agent适合breadth-first类任务——需要同时探索多个独立方向的场景。不适合需要连续推理、深度依赖上下文的场景。

**验证Agent是否定者，不是接棒者。** 如果要用多Agent做质量控制，正确的设计是让一个Agent专门找另一个Agent的问题，而不是"传递工作成果"。对抗性检验，不是流水线传递。

![真正的架构原则](https://pbs.twimg.com/media/HF1iccrbEAAzvIp?format=jpg&name=large)

**工具是工具，不是角色。** 给Agent配什么工具（bash、文件读写、搜索、代码执行）远比给它贴什么标签重要。工具决定了Agent能做什么；角色标签只是约束它愿意做什么。

## 那三省六部为什么会流行？

因为它好解释。

"这个Agent是PM，那个是QA"——这句话任何人都能理解。它满足了人类对AI系统可解释性的渴望，也满足了管理层对"AI像团队一样工作"的想象。

![三省六部流行原因](https://pbs.twimg.com/media/HF1ipNobAAAXyyr?format=jpg&name=large)

它还好展示。用流程图画出来，有部门、有箭头、有交接，非常直观。

但好解释和好展示，和工程上是否成立是两件事。

更深层的原因是：大多数采用这个模式的团队，并没有真正面对过"上下文在多Agent间传递时的损耗"这个问题。他们的任务可能不够复杂，或者问题被其他因素掩盖了。等到任务复杂度上来，系统开始出现诡异的"局部正确整体错误"时，问题才会暴露。

## 实践建议

最好的多Agent系统，不像公司。它更像一个思考者的多次草稿——同一个大脑，在不同维度上展开推理，最终合并成一个连贯的结论。

从这个原则出发：

不要问"我需要几个Agent"，要问"这个任务的信息依赖结构是什么"。

**如果任务需要连续推理、上下文高度依赖**（比如写一个复杂功能的设计文档），单Agent + 好的context engineering通常优于多Agent。

**如果任务需要同时探索多个独立方向**（比如同时研究10个竞品的不同模块），多Agent并行是合理的——每个subagent的任务相互独立，信息损耗代价最小。这正是Anthropic Research系统token量解释80%性能差异背后的原因：不是分工让它更好，是更大的搜索覆盖让它更好。

**如果任务跨越多个session，外部状态文件是必须的。** 一份有效的状态文件应该包含四类信息：

- 任务目标（不变，session开始时读取，防止漂移）
- 已完成的步骤（追加，不覆盖，保留完整历史）
- 当前状态（覆盖，反映最新进展）
- 已知的坑（追加，避免下一个session重复踩）

这四类信息分开维护，合在一起就是"下一个自己"需要的上下文。

---

来源：[SagaSu @X](https://x.com/sujingshen/status/2043898494818410731)
