// Fallback provider list for image generation — sourced from registry.js.
// Used when IPC to the main process fails. Keep in sync with registry.js.
export const IMG_PROVIDERS = [
  { id: 'dalle', name: 'OpenAI Image', defaultUrl: 'https://api.openai.com', defaultModel: 'gpt-image-2', protocol: 'openai_image' },
  { id: 'gemini_img', name: 'Gemini Image', defaultUrl: 'https://generativelanguage.googleapis.com', defaultModel: 'gemini-2.5-flash-image', protocol: 'gemini_image' },
  { id: 'jimeng_img', name: '即梦 / Seedream', defaultUrl: 'https://ark.cn-beijing.volces.com/api/v3', defaultModel: 'doubao-seedream-4-0-250828', protocol: 'ark_image' },
  { id: 'alibaba-wan', name: '阿里万相 / Wan', defaultUrl: 'https://dashscope.aliyuncs.com/api/v1', defaultModel: 'wan2.6-t2i', protocol: 'wan_image_task' },
  { id: 'baidu-qianfan', name: '百度千帆', defaultUrl: 'https://qianfan.baidubce.com', defaultModel: 'qwen-image', protocol: 'baidu_qianfan_image' },
  { id: 'siliconflow', name: 'SiliconFlow Image', defaultUrl: 'https://api.siliconflow.cn', defaultModel: 'black-forest-labs/FLUX.1-dev', protocol: 'openai_image' }
]
