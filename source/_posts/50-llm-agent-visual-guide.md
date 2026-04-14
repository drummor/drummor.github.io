---
title: LLM Agent 视觉指南：一文读懂智能体的核心概念与架构
date: '2026-01-19'
author: Maarten Grootendorst
original_url: https://newsletter.maartengrootendorst.com/p/a-visual-guide-to-llm-agents
tags:
  - AI
  - Agent
  - LLM
category: Agent
seo_description: 50张图解 LLM Agent 核心概念：记忆（短/长期记忆、工作/程序/语义/情景记忆）、工具（MCP协议）、规划（思维链/ReAct）与多智能体协同框架全解析。
description: 60+图解LLM Agent核心概念：记忆、工具、规划三大组件，多智能体协同框架，以及设计模式全解析。
---

> **导读精华**
>
> 1. **Agent 是下一个技术范式** — AI Agent 突破大模型静态局限，完成感知→规划→决策→执行的完整闭环，被认为是继 LLM 之后的下一个技术拐点
> 2. **记忆、工具、规划是 Agent 三大组件** — 记忆分短/长期，工具通过 MCP 标准化，规划靠思维链和 ReAct 实现自主推理
> 3. **多智能体协同是趋势** — 单 Agent 受限，多个专业化 Agent 由 Supervisor 协调，是未来复杂任务处理的方向

<!-- more -->

LLM Agent正在广泛普及，似乎正在取代我们熟悉的"常规"对话式LLM。但这些令人惊叹的能力并非轻易能够实现，需要多个组件协同工作。

本文通过60多张定制插图，带你深入了解LLM Agent的领域、主要组件，以及多智能体框架。

要理解什么是LLM Agent，首先需要了解LLM的基本能力。传统上，LLM的核心不过是**下一个 token 的预测**。

![next-token prediction](/images/articles/50-llm-agent-visual-guide/img-0001.png)

通过依次采样大量token，我们可以模拟对话，并利用LLM对我们的查询给出更详尽的回答。

![token采样模拟对话](/images/articles/50-llm-agent-visual-guide/img-0002.png)

然而，当我们继续"对话"时，任何LLM都会暴露出一个主要缺陷：**它不记得对话内容！**

![LLM不记得对话](/images/articles/50-llm-agent-visual-guide/img-0003.png)

LLM经常失败的任务还有很多，包括像乘法和除法这样的基础数学运算。

![LLM做不好数学](/images/articles/50-llm-agent-visual-guide/img-0004.png)

这是否意味着LLM很糟糕？绝对不是！LLM无需具备所有能力，我们可以通过外部工具、记忆和检索系统来弥补它们的缺陷。

通过外部系统，LLM的能力可以得到增强。Anthropic将这种方式称为"增强型 LLM"（The Augmented LLM）。

例如，当遇到数学问题时，LLM可能会决定使用适当的工具（计算器）。

![增强型LLM](/images/articles/50-llm-agent-visual-guide/img-0005.png)

那么，这种"增强型 LLM"就是Agent了吗？不一定……

让我们从Agent的定义开始：

> **一个 agent 是任何可以被视为通过传感器感知环境，并通过执行器作用于该环境的实体。**
> — Russell & Norvig，《人工智能：一种现代方法》（2016）

Agent与环境交互，通常包括以下几个重要组件：

- **环境（Environments）** — Agent交互的世界
- **传感器（Sensors）** — 用于观察环境
- **执行器（Actuators）** — 用于与环境交互的工具
- **效应器（Effectors）** — 决定如何将观察转化为行动的"大脑"或规则

![Agent与环境](/images/articles/50-llm-agent-visual-guide/img-0006.png)

这个框架适用于所有与各种环境交互的Agent类型，比如与物理环境交互的机器人，或与软件交互的AI Agent。

我们可以稍微泛化这个框架，使其适用于"增强型 LLM"。

借助"增强型"LLM，Agent可以通过文本输入来观察环境（因为LLM通常是文本模型），并通过使用工具（如网络搜索）来执行特定操作。

为了选择要采取的行动，LLM Agent拥有一个关键组件：**规划能力**。这意味着LLM需要能够通过思维链等方法进行"推理"和"思考"。

![LLM Agent架构](/images/articles/50-llm-agent-visual-guide/img-0007.png)

利用这种推理行为，LLM Agent会规划出必要的行动步骤。

这种规划行为使Agent能够理解情况（LLM）、规划下一步（规划）、采取行动（工具），并跟踪所采取的行动（记忆）。

![Agent行动循环](/images/articles/50-llm-agent-visual-guide/img-0008.png)

根据系统的不同，可以构建具有不同自主程度LLM Agent。

取决于你问谁，系统的"Agent性"越强，就意味着LLM对系统行为的决定权越大。

![自主程度光谱](/images/articles/50-llm-agent-visual-guide/img-0009.png)

在接下来的部分中，我们将通过LLM Agent的三个主要组件——**记忆**、**工具**和**规划**——来探讨自主行为的各种方法。

## 01 记忆 — Memory

LLM是"健忘"的系统，或者更准确地说，在与其交互时根本不执行任何记忆功能。

例如，当你向LLM提问，然后紧接着提出另一个问题时，它不会记得前一个问题。

我们通常称之为**短期记忆**，也称为工作记忆，它充当（即时）上下文的缓冲区，包括LLM Agent最近采取的行动。

然而，LLM Agent还需要跟踪可能数十个步骤，而不仅仅是最近的行动。

这被称为**长期记忆**，因为LLM Agent理论上可能需要执行数十甚至数百个需要记忆的步骤。

![短期vs长期记忆](/images/articles/50-llm-agent-visual-guide/img-0010.png)

让我们探索几种为这些模型赋予记忆的技巧。

### 1. 短期记忆

实现短期记忆最直接的方法是使用模型的上下文窗口，即LLM可以处理的token数量。

上下文窗口通常至少为8192个token，有时甚至可以扩展到数十万个token！

![上下文窗口](/images/articles/50-llm-agent-visual-guide/img-0011.png)

大型上下文窗口可用于将完整对话历史作为输入prompt的一部分进行跟踪。

只要对话历史适合LLM的上下文窗口，这种方法就能有效模拟记忆。然而，这并非真正记住对话，而只是在"告诉"LLM这个对话是什么。

对于上下文窗口较小的模型，或者当对话历史较大时，我们可以使用另一个LLM来总结迄今为止发生的对话。

![对话总结](/images/articles/50-llm-agent-visual-guide/img-0012.png)

通过持续总结对话，我们可以保持较小的对话规模。这将减少token数量，同时只跟踪最重要的信息。

### 2. 长期记忆

LLM Agent的长期记忆包括需要长期保留的Agent过去的行动空间。

实现长期记忆的常见技术是将所有先前的交互、行动和对话存储在外部向量数据库中。

![向量数据库存储](/images/articles/50-llm-agent-visual-guide/img-0013.png)

要构建这样的数据库，首先将对话嵌入到能够捕捉其含义的数值表示中。

构建数据库后，我们可以嵌入任何给定的提示，并通过比较提示嵌入与数据库嵌入来找到向量数据库中最相关的信息。这种方法就是**检索增强生成**（Retrieval-Augmented Generation，RAG）。

长期记忆还可以涉及保留来自不同会话的信息。例如，你可能希望LLM Agent记住它在以前会话中所做的任何研究。

不同类型的信息也可以与不同类型的存储记忆相关联。在心理学中，有许多类型的记忆可以区分，在《Cognitive Architectures for Language Agents》论文中，将其中四种与LLM Agent相关联。

这种区分有助于构建Agent框架。语义记忆（关于世界的事实）可能存储在与工作记忆（当前和最近情况）不同的数据库中。

### 3. 四种记忆类型

**工作记忆（Working Memory）**

人类示例：购物清单。人类大脑用工作记忆来暂时存放、操作当前需要使用的信息，比如在逛超市时，脑海里记着要买的东西。

Agent示例：Context（上下文）。在LLM Agent中，工作记忆可以理解为模型在一次对话或推理过程中，需要临时"装载"的上下文信息，用于实时生成回复或执行操作。

![工作记忆](/images/articles/50-llm-agent-visual-guide/img-0014.png)

**程序性记忆（Procedural Memory）**

人类示例：系鞋带。人类的程序性记忆是对"如何做一件事"的技能或步骤的记忆，例如骑自行车、打字等，这些行为一旦学会，就可以相对自动地执行。

Agent示例：System Prompt（系统提示）。对于LLM Agent而言，"程序性记忆"可以视作模型在执行任务时所依据的固定指令或规则。

![程序性记忆](/images/articles/50-llm-agent-visual-guide/img-0015.png)

**语义记忆（Semantic Memory）**

人类示例：狗的品种。语义记忆是关于世界的通用知识、事实和概念，不依赖个人的具体经历，比如知道"巴黎是法国的首都"。

Agent示例：User Information（用户信息）。对于LLM Agent来说，语义记忆中可以包括用户的偏好、历史对话中的关键信息、外部知识库中的事实等。

![语义记忆](/images/articles/50-llm-agent-visual-guide/img-0016.png)

**情景记忆（Episodic Memory）**

人类示例：7岁生日。情景记忆是对个人经历的记忆，包含时间、地点、人物等具体情境。

Agent示例：Past Actions（过去行为）。在LLM Agent中，这部分对应Agent在与用户或环境交互中所做出的具体操作或决策的历史记录。

![情景记忆](/images/articles/50-llm-agent-visual-guide/img-0017.png)

## 02 工具 — Tools

工具允许LLM与外部环境（如数据库）交互，或使用外部应用程序（如运行自定义代码）。

工具通常有两种用途：**获取数据**以检索最新信息，以及**采取行动**如设定会议或订购食物。

![工具类型](/images/articles/50-llm-agent-visual-guide/img-0018.png)

### 1. 工具的使用方法

要实际使用工具，LLM必须生成符合给定工具API的文本。我们通常期望生成可以格式化为JSON的字符串，以便它能够轻松地被输入到代码解释器中。

![JSON格式化工具调用](/images/articles/50-llm-agent-visual-guide/img-0019.png)

注意，不仅限于JSON，我们也可以直接在代码中调用工具！

你还可以生成LLM能直接使用的自定义函数，比如基本的乘法函数。这通常被称为**函数调用（Function Calling）**。

一些LLM可以在提示足够准确的情况下使用任何工具。工具使用是大多数当前LLM都具备的能力。

访问工具的一种更稳定的方法是对LLM进行微调。

工具可以按照特定顺序使用（如果Agent框架是固定的），或者LLM可以自主选择使用哪种工具以及何时使用。LLM Agent本质上是LLM调用的序列（但具有自主选择行动/工具等的能力）。

中间步骤的输出会被反馈回LLM以继续处理。

### 2. Toolformer

工具使用是增强LLM能力、弥补其缺陷的强大技术。近年来，工具使用和学习的研究发展迅速。

许多这类研究不仅涉及提示LLM使用工具，还包括专门为工具使用训练LLM。

最早的技术之一叫做**Toolformer**，它是一个专门训练来决定调用哪些API以及如何调用的模型。

它通过使用 `[` 和 `]` token来标识工具调用的开始和结束。当给定提示时，例如"What is 5 times 3?"，它开始生成token直到遇到`[` token。

之后，它生成token直到遇到`→` token，这表示LLM停止生成token。

然后，工具将被调用，输出将被添加到迄今为止生成的token中。

`]` 符号表示LLM现在可以继续生成（如有必要）。

![Toolformer token格式](/images/articles/50-llm-agent-visual-guide/img-0020.png)

Toolformer通过精心生成一个包含许多工具使用示例的数据集来创建这种行为。对于每个工具，手动创建一个少样本提示，并用它来采样使用这些工具的输出。

输出根据工具使用的正确性、输出和质量损失下降进行过滤。生成的数据集用于训练LLM遵循这种工具使用格式。

![Toolformer训练流程](/images/articles/50-llm-agent-visual-guide/img-0021.png)

自Toolformer发布以来，还有许多令人兴奋的技术，如能使用数千种工具的LLM（ToolLLM），或能轻松检索最相关工具的LLM（Gorilla）。

![Toolformer后续发展](/images/articles/50-llm-agent-visual-guide/img-0022.png)

无论如何，大多数当前LLM（2025年初）都已训练成能够通过JSON生成轻松调用工具。

### 3. 模型上下文协议（MCP）

工具是Agent框架的重要组成部分，使LLM能够与世界交互并扩展其能力。然而，当存在多种不同API时，启用工具使用变得麻烦，因为任何工具都需要：

- 手动跟踪并输入到LLM中
- 手动描述（包括其预期的JSON schema）
- 每当API发生变化时，手动更新

为了使工具在任何Agent框架中更容易实现，Anthropic开发了**模型上下文协议（Model Context Protocol，MCP）**。

MCP为天气应用和GitHub等服务标准化了API访问。

它由三个组件组成：

- **MCP Host（宿主）** — LLM应用程序（如Cursor）负责管理连接
- **MCP Client（客户端）** — 维护与MCP服务器的1:1连接
- **MCP Server（服务器）** — 向LLM提供上下文、工具和功能

![MCP架构](/images/articles/50-llm-agent-visual-guide/img-0023.png)

例如，假设你希望某个LLM应用程序总结你的代码仓库中最新的5个提交，MCP Host（与MCP Client一起）会首先调用MCP Server询问哪些工具可用。

![MCP工作流程](/images/articles/50-llm-agent-visual-guide/img-0024.png)

LLM接收这些信息后，可能会选择使用某个工具。它通过Host向MCP Server发送请求，然后接收结果，包括所使用的工具。

最后，LLM接收结果并能够解析出回答给用户。

这个框架通过连接到任何LLM应用程序都可以使用的MCP Server，使创建工具变得更加简单。因此，当你创建一个与Github交互的MCP Server时，任何支持MCP的LLM应用程序都可以使用它。

## 03 规划 — Planning

工具使用允许LLM增强其能力，它们通常通过类JSON的请求来调用。

但是在Agent系统中，LLM如何决定使用哪个工具以及何时使用？

这就是**规划**。LLM Agent中的规划涉及将给定任务分解为可执行的步骤。

这种规划使模型能够迭代地反思过去的行为，并在必要时更新当前计划。

![规划能力](/images/articles/50-llm-agent-visual-guide/img-0025.png)

### 1. 推理（Reasoning）

规划可执行步骤需要复杂的推理行为。因此，LLM必须能够展示这种行为，然后才能进行任务规划的下一步。

"推理型"LLM是那些倾向于在回答问题前先"思考"的模型。

我在使用"推理"和"思考"这两个术语时有些随意，因为我们可以争论这是否是类人的思考，还是仅仅将答案分解为结构化的步骤。

这种推理行为大致可以通过两种选择来实现：特定的提示工程或者微调LLM。

通过提示工程，我们可以创建LLM应遵循的推理过程示例。提供示例（也称为少样本提示，few-shot prompting）是引导LLM行为的一种优秀方法。

![少样本提示示例](/images/articles/50-llm-agent-visual-guide/img-0026.png)

这种提供思考过程示例的方法被称为**思维链（Chain-of-Thought）**，它能够实现更复杂的推理行为。

思维链也可以在没有任何示例（零样本提示，zero-shot prompting）的情况下实现，只需简单地说明"让我们一步步思考"。

![思维链示意](/images/articles/50-llm-agent-visual-guide/img-0027.png)

在训练LLM时，我们可以给它提供足够数量包含思考类示例的数据集，或者LLM可以发现自己的思考过程，比如使用强化学习。

DeepSeek-R1是一个很好的例子，它使用奖励机制来引导思考过程的使用。

![DeepSeek-R1](/images/articles/50-llm-agent-visual-guide/img-0028.png)

### 2. ReAct（Reason and Act）

在LLM中启用推理行为很棒，但并不一定能使其具备规划可执行步骤的能力。

我们之前关注的技术要么展示推理行为，要么通过工具与环境交互。

例如，思维链纯粹专注于推理。

将这两个过程结合起来的技术之一，被称为**ReAct（Reason and Act）**。

ReAct通过精心设计的提示工程来实现这一点。ReAct提示描述了三个步骤：

- **思考（Thought）** — 关于当前情况的推理步骤
- **行动（Action）** — 要执行的一系列行动（例如，使用工具）
- **观察（Observation）** — 关于行动结果的推理步骤

![ReAct提示工程](/images/articles/50-llm-agent-visual-guide/img-0029.png)

LLM使用这个提示（可作为系统提示使用）来引导其行为，在思考、行动和观察的循环中工作。

它会一直保持这种行为，直到某个行动指示返回结果。通过对思考和观察的迭代，LLM可以规划行动，观察其输出，并相应地进行调整。

因此，与那些预定义固定步骤的Agent相比，这个框架使LLM能够展示更加自主的Agent行为。

![ReAct循环](/images/articles/50-llm-agent-visual-guide/img-0030.png)

### 3. 反思（Reflecting）

没有人，甚至使用ReAct的LLM，能完美完成每项任务。失败是过程的一部分，只要你能够对该过程进行反思。

ReAct缺少这个过程，这就是**Reflexion**的用武之地。Reflexion是一种使用语言强化来帮助Agent从先前失败中学习的技术。

该方法假设三个LLM角色：

- **执行者（Actor）** — 根据状态观察选择并执行行动。我们可以使用思维链或ReAct等方法。
- **评估者（Evaluator）** — 对执行者产生的输出进行评分。
- **自我反思（Self-reflection）** — 反思执行者采取的行动和评估者生成的评分。

![Reflexion架构](/images/articles/50-llm-agent-visual-guide/img-0031.png)

添加了内存模块来跟踪行动（短期）和自我反思（长期），帮助Agent从错误中学习并识别改进的行动。

一种类似但更优雅的技术被称为**Self-Refine**，其中反复执行精炼输出和生成反馈的行动。

同一个LLM负责生成初始输出、精炼后的输出和反馈。

有趣的是，这种自我反思行为，无论是Reflexion还是Self-Refine，都与强化学习非常相似（强化学习中，基于输出质量给予奖励）。

## 04 多智能体协同

本文前面提到的单一Agent存在一些问题：工具太多可能导致选择困难，上下文变得过于复杂，并且某些任务可能需要更专业化的处理。

因此，我们可以考虑使用**多智能体（Multi-Agent）**框架，这类框架由多个Agent组成，每个Agent都有自己的工具、记忆与规划能力，它们之间能够相互交互，并与环境产生互动。

这些多智能体系统通常由专门的智能体组成，每个智能体拥有自己的工具集，并由一个主管（Supervisor）来进行管理。主管负责协调智能体之间的通信，并将特定任务分配给专业化的智能体。

每个Agent可能配备不同类型的工具，并可能拥有不同的记忆系统。

![多智能体系统](/images/articles/50-llm-agent-visual-guide/img-0032.png)

实际上，已有数十种多智能体架构，它们的核心通常包括以下两个组件：

- **智能体初始化（Agent Initialization）** — 如何创建个体（专门的）智能体？
- **智能体编排（Agent Orchestration）** — 如何协调所有智能体？

### 1. 人类行为的交互模拟

最有影响力、也非常酷的多智能体论文之一叫做**"生成式Agent：人类行为的交互模拟"（Generative Agents: Interactive Simulacra of Human Behavior）**。

在这篇论文中，他们创建了模拟可信人类行为的计算软件Agent，称为生成式Agent（Generative Agents）。

每个生成式Agent都被赋予了画像，这使它们以独特的方式行事，并有助于创造更有趣和动态的行为。

每个Agent都初始化了三个模块（记忆、规划和反思），与我们在ReAct和Reflexion中看到的核心组件非常相似。

![Generative Agents架构](/images/articles/50-llm-agent-visual-guide/img-0033.png)

记忆模块是这个框架中最关键的组件之一。它存储规划和反思行为，以及迄今为止的所有事件。

对于任何给定的下一步或问题，记忆会被检索并根据时效性、重要性和相关性进行评分。得分最高的记忆会被共享给Agent。

![记忆评分机制](/images/articles/50-llm-agent-visual-guide/img-0034.png)

它们共同使Agent能够自由地进行行为并相互互动。因此，几乎不需要Agent编排，因为它们没有特定的目标要去实现。

这篇论文中有太多精彩的信息片段，但我想特别强调它们的评估指标。它们以Agent行为的可信度为主要评估指标，由人类评估者进行评分。

这展示了观察、规划和反思在生成式Agent的表现中是多么重要。如前所述，没有反思行为的规划是不完整的。

### 2. 模块化框架

无论你选择哪种框架创建多智能体系统，这些框架通常由多个要素组成，包括智能体的画像、对环境的感知、记忆、规划以及可用的行动。

用于实现这些组件的热门框架包括AutoGen、MetaGPT和CAMEL。然而，每个框架处理智能体间通信的方式略有不同。

例如，在CAMEL中，用户首先提出问题，并定义AI用户（AI User）和AI助理（AI Assistant）的角色。AI用户角色代表人类用户，并引导整个过程。

随后，AI用户与AI助理相互协作，通过交互来解决问题。

![CAMEL协作](/images/articles/50-llm-agent-visual-guide/img-0035.png)

这种角色扮演的方法实现了智能体之间的协作交流。

AutoGen和MetaGPT的通信方法虽然有所不同，但本质上都是基于这种协作性质的通信。智能体可以相互交流，以更新自身状态、目标以及下一步行动。

过去一年，这些框架呈现出爆发式的增长。

![多智能体框架对比](/images/articles/50-llm-agent-visual-guide/img-0036.png)

2025年将是令人兴奋的一年，因为这些框架将继续成熟和发展！

## 05 附录：Agent 设计模式

在实际的 Agent 开发中，还有一些重要的设计模式和最佳实践值得了解。

### 1. Agent 循环类型

Agent 的执行循环主要有两种类型：**主动循环（Proactive Loop）**和**反应循环（Reactive Loop）**。

主动循环是指 Agent 主动规划并执行一系列步骤，直到达成目标。反应循环则是 Agent 根据外部输入或事件触发相应的行动。

![Agent循环类型](/images/articles/50-llm-agent-visual-guide/img-0037.png)

### 2. 状态管理

在复杂任务中，Agent 需要有效地管理其内部状态。这包括：

- **任务状态** — 当前任务的进度和目标
- **上下文状态** — 对话历史和相关信息
- **执行状态** — 已执行的步骤和结果

良好的状态管理可以避免 Agent 重复工作或忘记关键信息。

![状态管理](/images/articles/50-llm-agent-visual-guide/img-0038.png)

### 3. 错误处理与恢复

在实际应用中，Agent 经常会遇到各种错误，包括工具调用失败、网络超时或无效响应等。

一个健壮的 Agent 系统需要具备错误处理和恢复能力：

- **重试机制** — 失败后自动重试
- **降级策略** — 主方案失败时使用备用方案
- **错误传播** — 及时向用户报告无法处理的错误

![错误处理](/images/articles/50-llm-agent-visual-guide/img-0039.png)

### 4. 提示工程与 Agent 优化

优化 Agent 性能的关键在于：

- **清晰的指令** — 提供具体、明确的行动指引
- **结构化输出** — 使用 JSON 或其他格式确保响应可解析
- **示例引导** — 通过少样本提示展示期望的行为

![提示优化](/images/articles/50-llm-agent-visual-guide/img-0040.png)

### 5. 评估与监控

评估 Agent 性能的主要指标包括：

- **任务完成率** — 成功完成的任务比例
- **响应时间** — 从接收请求到返回结果的时间
- **工具使用效率** — 是否高效地使用工具达成目标

![Agent评估](/images/articles/50-llm-agent-visual-guide/img-0041.png)

### 6. 安全与隐私

Agent 系统需要考虑的安全问题：

- **数据隔离** — 确保敏感信息不被泄露
- **权限控制** — 对工具调用进行权限验证
- **审计日志** — 记录所有关键操作便于追溯

![安全与隐私](/images/articles/50-llm-agent-visual-guide/img-0042.png)

这些核心概念构成了现代 LLM Agent 的基础。随着技术的快速发展，Agent 正在成为 AI 应用的新范式。掌握这些核心概念，将帮助你更好地理解和应用这一前沿技术。

![技术演进](/images/articles/50-llm-agent-visual-guide/img-0044.png)

- **Agent 的定义** — 通过传感器感知环境、通过执行器作用于环境
- **三大核心组件** — 记忆（短/长期）、工具（MCP 协议）、规划（思维链/ReAct）
- **多智能体协同** — 多个专业 Agent 协作完成复杂任务

随着技术的快速发展，Agent 正在成为 AI 应用的新范式。掌握这些核心概念，将帮助你更好地理解和应用这一前沿技术。

![总结](/images/articles/50-llm-agent-visual-guide/img-0043.png)

---

![Hands-On Large Language Models](/images/articles/50-llm-agent-visual-guide/img-0000.png)

> 本书由本文作者 Maarten Grootendorst 所著，欲了解更多LLM可视化内容，可阅读《Hands-On Large Language Models》！

---

**参考资料：**

- [A Visual Guide to LLM Agents](https://newsletter.maartengrootendorst.com/p/a-visual-guide-to-llm-agents)

> **原文**：[50张简图，理解智能体（Agent）——下一代人工智能技术范式](https://mp.weixin.qq.com/s/EZpiOGmgKFUUopPa0iFByQ) | 作者：雪岭飞花
