// Fallback provider list for chat — sourced from electron/providers/registry.js.
// Used when IPC to the main process fails. Keep in sync with registry.js.
export const CHAT_PROVIDERS = [
  { id: 'claude', name: 'Claude', defaultUrl: 'https://api.anthropic.com', format: 'anthropic', defaultModel: 'claude-sonnet-4-6' },
  { id: 'openai', name: 'OpenAI GPT', defaultUrl: 'https://api.openai.com', format: 'openai', defaultModel: 'gpt-5.1' },
  { id: 'gemini', name: 'Gemini', defaultUrl: 'https://generativelanguage.googleapis.com', format: 'gemini', defaultModel: 'gemini-2.5-pro' },
  { id: 'deepseek', name: 'DeepSeek', defaultUrl: 'https://api.deepseek.com', format: 'openai', defaultModel: 'deepseek-chat' },
  { id: 'groq', name: 'Groq', defaultUrl: 'https://api.groq.com/openai', format: 'openai', defaultModel: 'llama-3.3-70b-versatile' },
  { id: 'together', name: 'Together AI', defaultUrl: 'https://api.together.xyz', format: 'openai', defaultModel: 'meta-llama/Llama-4-17B-128E-Instruct-FP8' },
  { id: 'openrouter', name: 'OpenRouter', defaultUrl: 'https://openrouter.ai/api', format: 'openai', defaultModel: 'openai/gpt-5.1' },
  { id: 'xai', name: 'xAI Grok', defaultUrl: 'https://api.x.ai', format: 'openai', defaultModel: 'grok-3' },
  { id: 'perplexity', name: 'Perplexity', defaultUrl: 'https://api.perplexity.ai', format: 'openai', defaultModel: 'sonar-pro' },
  { id: 'qwen', name: 'Qwen / 通义千问', defaultUrl: 'https://dashscope.aliyuncs.com/compatible-mode', format: 'openai', defaultModel: 'qwen-plus' },
  { id: 'kimi', name: 'Kimi / Moonshot', defaultUrl: 'https://api.moonshot.cn', format: 'openai', defaultModel: 'kimi-k2-0711-preview' },
  { id: 'doubao', name: 'Doubao / 火山方舟', defaultUrl: 'https://ark.cn-beijing.volces.com/api/v3', format: 'openai', defaultModel: 'doubao-pro-32k' },
  { id: 'zhipu', name: 'GLM / 智谱', defaultUrl: 'https://open.bigmodel.cn/api/paas/v4', format: 'openai', defaultModel: 'glm-4-plus' },
  { id: 'siliconflow', name: 'SiliconFlow', defaultUrl: 'https://api.siliconflow.cn', format: 'openai', defaultModel: 'Qwen/Qwen2.5-72B-Instruct' },
  { id: 'lingyi', name: '01.AI / 零一万物', defaultUrl: 'https://api.lingyiwanwu.com', format: 'openai', defaultModel: 'yi-lightning' }
]
