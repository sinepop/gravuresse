export const IMG_PROVIDERS = [
  { id: 'dalle', name: 'OpenAI Image', defaultUrl: 'https://api.openai.com', defaultModel: 'gpt-image-2', protocol: 'openai_image' },
  { id: 'gemini_img', name: 'Gemini Image', defaultUrl: 'https://generativelanguage.googleapis.com', defaultModel: 'gemini-2.5-flash-image', protocol: 'gemini_image' },
  { id: 'jimeng_img', name: '即梦 / Seedream', defaultUrl: 'https://ark.cn-beijing.volces.com/api/v3', defaultModel: 'doubao-seedream-4-0-250828', protocol: 'ark_image' },
]
