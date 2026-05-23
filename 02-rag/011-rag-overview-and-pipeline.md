# RAG 概念、Pipeline 与组件总览

> 难度：基础
> 分类：RAG

## 简短回答

RAG（Retrieval-Augmented Generation，检索增强生成）是一种在 LLM 生成回答之前，先从外部知识库中检索相关文档并注入到 Prompt 中的技术。它主要解决 LLM 的三大核心局限：**知识截止**（训练数据过时）、**幻觉**（编造看似合理的错误信息）、以及**缺乏领域专有知识**。生产级 RAG 系统由三条流水线组成：**Indexing Pipeline**（离线——数据清洗、分块、Embedding、存储到向量数据库）、**Retrieval Pipeline**（在线——查询理解、向量检索、后检索优化如重排序和压缩）、**Generation Pipeline**（在线——上下文组装、Prompt 构建、LLM 生成、输出验证）。RAG 经历了 Naive→Advanced→Modular 三个演进阶段：Naive RAG 是简单的索引-检索-生成链；Advanced RAG 加入预检索（查询改写）与后检索（重排序、压缩）优化；Modular RAG 让每个组件独立可替换、可组合。理解三条流水线的交互方式与 RAG 的演进脉络，是构建高质量 RAG 系统的基础。

## 详细解析

### LLM 的三大核心局限

#### 1. 知识截止（Knowledge Cutoff）

LLM 的知识在训练完成后就被"冻结"了。当用户询问训练数据截止日期之后的信息时，模型要么承认不知道，要么自信地给出错误答案。LLM 的训练数据往往严重过时，而且当知识出现空白时，它们会进行外推，自信地说出听起来合理但实际错误的陈述。

#### 2. 幻觉（Hallucination）

由于依赖固定参数，LLM 在面对超出训练范围的任务时，经常产生与任务无关的输出或事实不一致的回答。这种现象被称为幻觉（hallucination）或虚构（confabulation），严重损害了 LLM 的可靠性和可信度。

#### 3. 缺乏私有/领域知识

LLM 无法访问企业内部文档、私有数据库或最新的领域知识。即使是最强大的通用模型，也无法回答关于公司内部流程、客户数据或专有技术的问题。

### RAG 如何解决三大局限

| 局限 | RAG 的解决方式 |
|------|--------------|
| 知识截止 | 外部知识库可以随时更新，无需重新训练模型 |
| 幻觉 | 提供"事实锚点"，让 LLM 基于检索到的真实文档生成回答 |
| 缺乏领域知识 | 接入企业私有数据、行业文档、实时数据源 |

额外优势：
- **成本效益**：无需对 LLM 进行昂贵的微调或重新训练
- **来源可溯**：可以在回答中附带引用来源，用户可以验证
- **权限控制**：可以根据用户权限控制可检索的文档范围

### RAG 整体架构

```
离线阶段                          在线阶段
┌──────────────────┐   ┌───────────────────────────────────────┐
│  Indexing        │   │  Retrieval          Generation        │
│  Pipeline        │   │  Pipeline           Pipeline          │
│                  │   │                                       │
│ 数据源 → 清洗    │   │ 用户查询 → 查询理解  → 检索 + 重排序  │
│   → 分块         │   │                        ↓              │
│   → Embedding    │   │               上下文组装 + Prompt 构建 │
│   → 向量数据库   │   │                        ↓              │
│                  │   │                  LLM 生成 → 输出验证   │
└──────────────────┘   └───────────────────────────────────────┘
```

核心流程：
1. **索引（Indexing）**：离线阶段——将文档分块、生成 Embedding、存入向量数据库
2. **检索（Retrieval）**：在线阶段——将用户查询转为向量，从向量库中找到最相关的文档块
3. **生成（Generation）**：将检索到的文档块与原始问题拼接为 Prompt，送入 LLM 生成回答

### 1. Indexing Pipeline（索引流水线）

索引流水线是离线阶段，负责将原始数据转化为可检索的向量索引。

#### 数据摄取与清洗

```python
# 原始数据通常来自多种格式
sources = [
    PDFLoader("report.pdf"),
    WebLoader("https://docs.example.com"),
    DatabaseLoader("postgresql://..."),
    MarkdownLoader("docs/*.md"),
]

# 清洗：去除 HTML 标签、修正编码、标准化格式
for doc in documents:
    doc.content = remove_html_tags(doc.content)
    doc.content = normalize_whitespace(doc.content)
    doc.metadata = extract_metadata(doc)  # 保留元数据（来源、日期、作者）
```

#### 分块（Chunking）

将长文档切分为语义完整的小块，常见策略：
- **固定大小分块**：按 token 数切分，简单但可能破坏语义
- **递归分块**：按段落→句子→词的层次分割，平衡实用性
- **语义分块**：基于 Embedding 相似度在语义断点处分割

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=512,       # 注意：chunk_size 是字符数，不是 token 数
    chunk_overlap=50,     # 相邻块重叠 50 字符，保留上下文连续性
    separators=["\n\n", "\n", "。", " ", ""]
)
chunks = splitter.split_documents(documents)

# 如需按 token 计长，使用 TokenTextSplitter 或 from_tiktoken_encoder：
# from langchain.text_splitter import TokenTextSplitter
# splitter = TokenTextSplitter(chunk_size=512, chunk_overlap=50)
# 或：
# splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
#     chunk_size=512, chunk_overlap=50
# )
```

#### Embedding 与存储

```python
from langchain_openai import OpenAIEmbeddings

embeddings = OpenAIEmbeddings(model="text-embedding-3-large")
vectors = embeddings.embed_documents([chunk.content for chunk in chunks])

# 存入向量数据库（附带元数据，支持后续过滤）
vectorstore.upsert(
    ids=[chunk.id for chunk in chunks],
    embeddings=vectors,
    documents=[chunk.content for chunk in chunks],
    metadatas=[chunk.metadata for chunk in chunks]  # 来源、日期、类别等
)
```

### 2. Retrieval Pipeline（检索流水线）

检索流水线在每次用户查询时实时运行，负责找到最相关的文档块。

#### 预检索优化（Pre-retrieval）

提升检索质量的关键在于优化查询本身：

```python
# 查询改写：让 LLM 重新表述用户问题，提升匹配度
def rewrite_query(original_query: str) -> str:
    return llm.generate(
        f"将以下问题改写为更适合向量检索的形式，"
        f"保持核心语义：\n{original_query}"
    )

# 查询分解：将复杂问题拆分为多个子问题
def decompose_query(query: str) -> list[str]:
    return llm.generate(
        f"将以下复杂问题分解为 2-3 个独立的子问题：\n{query}"
    )

# HyDE：生成假设性回答，用回答而非问题去检索
def hypothetical_document(query: str) -> str:
    return llm.generate(f"为以下问题生成一个假设性回答：\n{query}")
```

#### 向量检索

```python
# 基本语义检索
results = vectorstore.similarity_search(
    query_embedding,
    top_k=20,                              # 先检索较多候选
    filter={"category": "technical_docs"}  # 元数据过滤
)
```

#### 后检索优化（Post-retrieval）

```python
# 重排序：用 Cross-Encoder 对候选结果精排
from sentence_transformers import CrossEncoder

reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
reranked = reranker.rank(query, [r.content for r in results])
top_results = reranked[:5]  # 取 Top 5

# 上下文压缩：去除检索块中不相关的部分
compressed = llm.generate(
    f"从以下文档中提取与问题 '{query}' 直接相关的信息：\n{chunk}"
)
```

### 3. Generation Pipeline（生成流水线）

将检索结果与用户查询组合，送入 LLM 生成最终回答。

#### 上下文组装与 Prompt 构建

```python
def build_rag_prompt(query: str, contexts: list[str]) -> str:
    context_text = "\n\n---\n\n".join(contexts)
    return f"""基于以下参考文档回答用户问题。
如果文档中没有足够信息，请明确说明。
请在回答中引用相关来源。

参考文档：
{context_text}

用户问题：{query}

回答："""
```

#### 上下文窗口管理

当检索到的文档超出 LLM 的上下文窗口时，需要智能截断：
- 按重排序得分排列，优先保留高分文档
- 对低优先级文档进行摘要压缩
- 确保关键信息出现在上下文的开头和结尾（避免 "Lost in the Middle" 问题）

### 三条流水线的优化关系

| 阶段 | 优化方向 | 关键指标 |
|------|---------|---------|
| Indexing | 分块策略、Embedding 质量、元数据丰富度 | 索引覆盖率 |
| Retrieval | 查询改写、混合检索、重排序 | Recall@k, Precision@k |
| Generation | Prompt 工程、上下文窗口管理、输出验证 | 答案正确率、幻觉率 |

### RAG 的三个演进阶段

| 阶段 | 特点 | 局限 |
|------|------|------|
| **Naive RAG** | 简单的"索引-检索-生成"链 | 检索精度低、上下文不足 |
| **Advanced RAG** | 加入预检索优化（查询改写）和后检索优化（重排序、压缩） | 仍是单次检索 |
| **Modular RAG** | 每个组件独立可替换、可组合 | 系统复杂度高 |

### RAG 的局限性

RAG 并非万能。它自身也存在问题：

1. **不能完全消除幻觉**："RAG 不是直接的解决方案，因为 LLM 仍然可能围绕源材料进行幻觉。" LLM 可能从检索到的文档中断章取义，得出错误结论。

2. **检索质量瓶颈**：
   - 低精确率（Precision）：检索到的文档块与问题不匹配
   - 低召回率（Recall）：未能检索到所有相关文档块
   - 过时信息：知识库本身可能包含过时数据

3. **依赖知识库质量**：知识库中的偏见或错误会直接传导到 LLM 的回答中

## 端到端代码示例

```python
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough

# 1. 索引：分块 + Embedding + 存储
text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
chunks = text_splitter.split_documents(documents)
vectorstore = Chroma.from_documents(chunks, OpenAIEmbeddings())

# 2. 检索器
retriever = vectorstore.as_retriever(search_kwargs={"k": 5})

# 3. 生成：构建 RAG Chain
prompt = ChatPromptTemplate.from_template(
    "基于以下上下文回答问题。如果上下文中没有答案，请说'我不确定'。\n\n"
    "上下文：{context}\n\n问题：{question}"
)
llm = ChatOpenAI(model="gpt-4o")

rag_chain = (
    {"context": retriever, "question": RunnablePassthrough()}
    | prompt
    | llm
)

answer = rag_chain.invoke("公司的退款政策是什么？")
```

## 常见误区 / 面试追问

1. **误区："RAG 完全解决了幻觉问题"** — RAG 降低了幻觉概率，但 LLM 仍可能围绕检索内容进行幻觉，或忽略检索结果而使用自身知识。需要配合 Guardrails 和输出验证。

2. **误区："RAG 可以替代微调（Fine-tuning）"** — RAG 和微调解决不同问题。RAG 解决知识问题（"知道什么"），微调解决能力问题（"怎么做"）。如果需要改变模型的行为风格或推理模式，应该用微调。

3. **误区："RAG 的重点是 Generation"** — 实际上 Retrieval 的质量才是 RAG 效果的决定性因素。检索到的文档不相关，再强的 LLM 也救不回来。优化顺序应该是：Retrieval > Indexing > Generation。

4. **误区："原型能用 = 生产能用"** — 原型和生产系统的差异在于评估和监控能力。生产 RAG 需要 (1) 检索质量监控；(2) 生成质量评估；(3) 成本和延迟追踪。

5. **追问："RAG vs 长上下文窗口——如果模型能处理 100 万 token，还需要 RAG 吗？"** — 需要。(1) 长上下文的"大海捞针"问题——中间的信息容易被忽略；(2) 成本——100 万 token 的推理费用远高于 RAG 检索；(3) 延迟——长上下文增加推理时间。

6. **追问："RAG 的检索精度和 LLM 生成质量哪个更重要？"** — 检索精度。如果检索到的文档不相关，再强的 LLM 也无法生成正确答案。"Garbage in, garbage out" 在 RAG 中尤为适用。

7. **追问："如何评估 RAG Pipeline 的各个环节？"** — Indexing：覆盖率测试（是否所有关键信息都被索引）；Retrieval：Recall@k、MRR、NDCG；Generation：Faithfulness（忠实度）、Relevance（相关性）、Answer Correctness。

8. **追问："向量检索一定比关键词检索好吗？"** — 不一定。精确术语匹配（如产品型号、法律条款编号）时，BM25 等关键词检索可能更好。最佳实践是混合检索（Hybrid Search）。

## 参考资料

- [Retrieval-Augmented Generation (RAG) (Pinecone)](https://www.pinecone.io/learn/retrieval-augmented-generation/)
- [RAG for LLMs (Prompt Engineering Guide)](https://www.promptingguide.ai/research/rag)
- [Retrieval-Augmented Generation for Large Language Models: A Survey (arXiv:2312.10997)](https://arxiv.org/abs/2312.10997)
- [Retrieval Augmented Generation: Keeping LLMs Relevant and Current (Stack Overflow)](https://stackoverflow.blog/2023/10/18/retrieval-augmented-generation-keeping-llms-relevant-and-current/)
- [RAG Hallucination: What Is It and How to Avoid It (K2View)](https://www.k2view.com/blog/rag-hallucination/)
- [RAG 101: Demystifying Retrieval-Augmented Generation Pipelines (NVIDIA)](https://developer.nvidia.com/blog/rag-101-demystifying-retrieval-augmented-generation-pipelines/)
- [Introduction to LLM RAG (Weaviate)](https://weaviate.io/blog/introduction-to-rag)
- [RAG Pipelines Explained (Orq.ai)](https://orq.ai/blog/rag-pipelines)
- [RAG Pipelines in Production (Machine Learning Mastery)](https://machinelearningmastery.com/understanding-rag-part-x-rag-pipelines-in-production/)

---

> 📎 本题由原 #011（什么是 RAG）与 #012（RAG Pipeline 组件）合并而来（2026-05-23 重构）
