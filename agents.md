# Router 架构深度解析

## 概述

Router 是一个免费的 AI 路由器，旨在为开发者提供不间断的编程体验。它通过智能地将 AI 请求路由到免费和廉价的模型，从而避免因超出配额或服务中断而导致的工作流程中断。该项目充当一个本地代理，可以连接到各种 AI 提供商，并管理配额、执行回退策略，甚至在不同的 API 格式（例如 OpenAI 和 Claude）之间进行转换。

## 核心架构

Router 的核心是一个高度模块化的管道系统，旨在处理、转换和转发 AI 请求。每个模块都有明确的职责，共同协作以实现灵活和强大的路由功能。整个核心引擎被设计为与框架无关，主要位于 `open-sse` 目录中，并通过 `src/sse` 目录与 Next.js 框架集成。

```
router/
├── src/ │ ├── app/ # App Router pages & API routes
│ │ ├── (dashboard)/ # Dashboard UI pages
│ │ │ ├── dashboard/ # Provider management, usage, combos
│ │ │ ├── mitm/ # MITM proxy configuration
│ │ │ ├── endpoint/ # API endpoint reference
│ │ │ ├── cli-tools/ # CLI tool integration guides
│ │ │ └── translator/ # Format translation debugger
│ │ ├── api/ # REST API routes
│ │ │ ├── v1/ # OpenAI-compatible API
│ │ │ │ ├── chat/completions/
│ │ │ │ ├── responses/
│ │ │ │ ├── embeddings/
│ │ │ │ └── models/
│ │ │ ├── providers/ # Provider CRUD
│ │ │ ├── oauth/ # OAuth flows per provider
│ │ │ ├── usage/ # Usage history & stats
│ │ │ ├── combos/ # Combo management
│ │ │ └── keys/ # API key management
│ │ ├── landing/ # Public landing page
│ │ └── login/ # Authentication
│ ├── sse/ # Local SSE handler layer
│ │ ├── handlers/ # Chat & embeddings handlers
│ │ └── services/ # Local auth, model, token refresh
│ ├── shared/ # Shared components, hooks, services
│ ├── store/ # Zustand state stores
│ ├── models/ # Database model exports
│ └── mitm/ # MITM proxy (cert, DNS, server)
│
├── open-sse/ # Shared routing engine (also used by cloud/)
│ ├── config/ # Provider configs, model registry, constants
│ ├── executors/ # Provider-specific request executors
│ ├── handlers/ # Core chat handler & streaming
│ ├── services/ # Provider, model, fallback, combo services
│ ├── translator/ # Format translation (request & response)
│ ├── transformer/ # Response transformation utilities
│ └── utils/ # Stream handling, errors, logging
│
├── cloud/ # Cloudflare Worker deployment
│ ├── src/ # Worker handlers, services
│ ├── migrations/ # D1 database schema
│ └── wrangler.toml # Worker config
│
├── public/ # Static assets & provider icons
├── tests/ # Vitest unit tests
└── docs/ # Architecture documentation
```

以下是构成此管道的关键组件：

### 1. 入口层：Next.js API 路由 (`src/app/api`)

这是面向客户端的公共 API 层。所有来自客户端工具（如 IDE 插件、CLI 工具）的请求都首先到达这里。

- **主要端点**: `src/app/api/v1/chat/completions/route.js` 是处理聊天请求最核心的入口文件。
- **职责**: 这一层负责：
  - 处理 CORS 和其他 HTTP 级别的配置。
  - 进行一次性的初始化操作（例如，通过 `initTranslators` 加载所有翻译器）。
  - 将原始的 `request` 对象传递给下一层的 SSE 处理器进行实际的业务逻辑处理。

### 2. 适配与路由层 (`src/sse/handlers`)

这一层是 Next.js 框架与 `open-sse` 核心引擎之间的“适配器”或“桥梁”。它处理特定于此应用程序的业务逻辑，例如用户身份验证和模型路由。

- **核心文件**: `chat.js`
- **职责**:
  - **身份验证**: 验证请求中提供的 API 密钥。
  - **模型解析**: 解析请求的模型字符串。如果模型是一个“组合”（combo），它会获取组合中的模型列表和回退策略。
  - **账户选择与回退**: 从数据库中为特定提供商获取可用的凭据。如果一个账户失败（例如，超出配额），它会标记该账户并在可用的账户中进行轮换和重试。
  - **调用核心逻辑**: 将请求传递给 `open-sse` 中的 `handleChatCore` 进行通用处理。

### 3. 核心编排层 (`open-sse/handlers`)

这是整个请求处理流程的“大脑”，负责编排翻译和执行的每一步。

- **核心文件**: `chatCore.js`
- **职责**:
  - **格式检测**: 检测传入请求的源 API 格式（例如 `openai`, `claude`, `gemini`）。
  - **确定目标格式**: 根据提供商确定请求需要被转换成的目标格式。
  - **调用翻译器**: 调用 `translator` 将请求从源格式转换为目标格式。
  - **调用执行器**: 获取与提供商匹配的 `executor`，并将转换后的请求交由其发送。
  - **响应处理**: 接收来自执行器的响应，并使用 `chatCore/` 子目录中的处理器（如 `streamingHandler.js` 或 `nonStreamingHandler.js`）来处理流式或非流式响应。

### 4. 语义翻译层 (`open-sse/translator`)

该层负责在不同 AI 提供商的 **API 语义** 之间进行转换，确保数据结构和字段名符合每个提供商的要求。

- **核心文件**: `index.js`
- **职责**:
  - **两步翻译**: 采用 `源格式 -> OpenAI 格式 -> 目标格式` 的标准化流程。这使得添加新提供商变得更容易，因为只需要实现与 OpenAI 格式之间的相互转换。
  - **请求/响应翻译**: `request/` 子目录包含将请求转换为目标格式的逻辑，而 `response/` 子目录则负责将提供商的响应转换回客户端期望的格式。

### 5. 执行层 (`open-sse/executors`)

这是与上游 AI 提供商进行实际 **HTTP 通信**的层。

- **核心文件**: `default.js` (一个适用于多种提供商的通用执行器), `base.js` (所有执行器的基类)。
- **职责**:
  - **构建请求**: 根据提供商的规范构建最终的 URL、HTTP 方法和请求头。
  - **发送请求**: 使用 `fetch` API 将请求发送到 AI 提供商的服务器。
  - **处理认证**: 注入 API 密钥或 `Bearer` 令牌，并包含处理 OAuth 令牌刷新的逻辑。
  - **代理支持**: 支持通过出站代理发送请求。

### 6. 结构转换层 (`open-sse/transformer`)

这一层提供底层的、关于 **数据流结构** 的转换工具，主要在处理流式响应时使用。

- **核心文件**: `streamToJsonConverter.js`, `responsesTransformer.js`
- **职责**:
  - **流转JSON**: `streamToJsonConverter.js` 能够消费一个完整的 Server-Sent Events (SSE) 流，并将其聚合成一个单一的 JSON 对象。这在客户端不支持流式响应时非常有用。
  - **特定格式转换**: `responsesTransformer.js` 用于将标准的流式块转换为特定的、更复杂的流式格式（如 `openai-responses`）。

### 7. 中间人代理层 (`src/mitm`)

这是一个可选但功能强大的高级集成层，用于拦截和重定向那些不直接支持自定义端点配置的桌面应用程序的 AI 请求。

- **核心文件**: `server.js`, `manager.js`
- **工作原理**: 它通过创建一个本地 HTTPS 代理服务器，并动态生成自签名 TLS 证书来实现。
  1.  **证书生成与安装**: `cert/` 目录下的脚本负责生成一个本地的根证书颁发机构 (Root CA)，并帮助用户将其安装到系统信任库中。这是解密和重新加密 HTTPS 流量的关键步骤。
  2.  **DNS 劫持**: `dns/dnsConfig.js` 配置代理，使其能够劫持特定域名（例如 `api.cursor.ai`）的 DNS 查询，将它们指向本地运行的代理服务器。
  3.  **流量拦截与处理**: `server.js` 启动代理服务器。当一个被配置的应用程序（如 Cursor）尝试连接其后端服务时，流量会被这个本地代理拦截。`handlers/` 目录下的特定处理器（例如 `cursor.js`）会检查请求，如果匹配 AI 请求的模式，就会将其重定向到 9Router 的核心路由引擎（即 `/api/v1/chat/completions`），而不是让它访问原始的互联网地址。所有其他不相关的流量则会被直接放行。
- **职责**:
  - 为闭源或难以配置的客户端提供无缝集成。
  - 动态解密、检查、修改和重新加密 HTTPS 流量。
  - 将目标应用的 AI 请求透明地重定向到 9Router 的处理管道中。

## 请求生命周期（端到端流程）

一个典型的聊天请求会经过以下步骤：

1.  **客户端请求**: 客户端（如 IDE 插件）向 Router 的 `/api/v1/chat/completions` 端点发送一个 OpenAI 格式的 POST 请求。
2.  **入口处理**: `src/app/api/.../route.js` 接收请求，并将其传递给 `src/sse/handlers/chat.js`。
3.  **路由与认证**: `chat.js` 验证 API 密钥，解析出模型和提供商，并选择一个可用的账户凭据。
4.  **核心编排**: 请求被传递到 `open-sse/handlers/chatCore.js`。它检测到源格式是 `openai`，并根据目标提供商（例如 `claude`）确定目标格式。
5.  **请求翻译**: `chatCore.js` 调用 `open-sse/translator`，后者使用 `request/openai-to-claude.js` 将请求体从 OpenAI 格式转换为 Claude 格式。
6.  **执行请求**: `chatCore.js` 获取 `claude` 的 `executor`。该执行器构建最终的请求（URL, headers），并通过 `fetch` 将其发送到 Anthropic 的 API 服务器。
7.  **接收响应**: `executor` 接收到来自 Claude 的流式响应。
8.  **响应处理**: `open-sse/handlers/chatCore/streamingHandler.js` 开始处理响应流。
9.  **响应翻译**: 对于从流中接收到的每一个数据块，`streamingHandler` 都会调用 `translator`，使用 `response/claude-to-openai.js` 将其从 Claude 格式翻译回 OpenAI 格式。
10. **返回客户端**: 经过翻译的数据块被实时地流式传输回原始客户端。

## 代码库关键目录指南

- `src/app/api/v1`: **[API 入口]** 面向客户端的公共 API 端点。
- `src/sse`: **[适配层]** 连接 Next.js 框架和核心引擎的桥梁，处理应用特有的逻辑。
- `open-sse`: **[核心引擎]** 项目的核心，包含所有与框架无关的路由、翻译和执行逻辑。
  - `handlers`: **[编排]** 核心业务逻辑和请求流程的“大脑”。
  - `translator`: **[语义翻译]** 在不同 AI 提供商的 API 格式之间进行翻译。
  - `executors`: **[HTTP通信]** 负责与外部 AI 提供商进行网络通信。
  - `transformer`: **[结构转换]** 提供流式数据的底层结构转换工具。
- `src/lib`: **[应用工具库]** 应用级别的工具函数，如数据库访问 (`localDb.js`, `usageDb.js`) 和云同步逻辑。
- `src/dashboardGuard.js` & `src/proxy.js`: **[安全中间件]** 用于保护仪表盘 UI 和管理 API 的 Next.js 中间件。
- `src/mitm`: **[中间人代理]** 可选的高级集成模块，用于通过拦截 HTTPS 流量来重定向来自闭源客户端的请求。

## 主要功能

- **智能回退**: 自动在订阅、廉价和免费的 AI 提供商之间切换，确保开发者可以持续编码，而不会遇到速率限制或高昂的成本。
- **配额追踪**: 跟踪您在不同平台上的使用情况，以最大化您订阅的价值。
- **格式转换**: 在不同的 AI 模型 API 格式（例如，OpenAI 到 Claude）之间无缝转换。
- **多账户支持**: 允许您为同一提供商使用多个帐户，以实现负载均衡和冗余。
- **广泛的提供商支持**: 支持大量的 AI 提供商，包括 Claude、OpenAI、Gemini 等。
- **仪表盘**: 提供一个基于 Web 的仪表盘，用于管理提供商、查看使用情况分析和配置路由器。
- **灵活部署**: 可以在本地、VPS 或使用 Docker 运行。

## 技术栈

- **前端**: Next.js (React) 与 Tailwind CSS
- **后端**: Node.js 与 Express
- **数据库**: LowDB (一个简单的基于 JSON 文件的数据库)
- **实时通信**: Server-Sent Events (SSE)

```

```
