import { useState, useCallback, useRef } from 'react'
import { IMG_PROVIDERS } from '../providers/imageProviders'
import { VID_PROVIDERS } from '../providers/videoProviders'
import { t } from '../i18n'

export default function useChat(config, canvas) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [thinking, setThinking] = useState(false)
  const lastImageContext = useRef(null)

  const send = useCallback(async (text, references, genSettings) => {
    if (!text.trim() || loading) return
    const userMsg = { role: 'user', content: text, id: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    const provider = config?.providers?.chat
    const lang = config?.general?.language || 'zh'
    if (!provider?.apiKey) {
      setMessages(prev => [...prev, { role: 'assistant', content: t('configApiFirst', lang), id: Date.now() + 1 }])
      setLoading(false)
      return
    }

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))

      const modifyContext = lastImageContext.current
      const modifyHint = modifyContext
        ? `\n\n## 最近一次生成的图片
- 上次 prompt: "${modifyContext.prompt}"
- 上次画幅: ${modifyContext.ratio}
- 上次资产ID: ${modifyContext.assetId}
如果用户要修改图片，必须基于上次 prompt 做增量修改（保留用户满意的部分，只改用户提到的点），intent=modify_image，source_image_id 填 ${modifyContext.assetId}。`
        : ''

      const refHint = references?.length > 0
        ? `\n\n## 用户提供的参考素材
${references.map((r, i) => `  [参考${i + 1}] ${r.type}: "${r.label}" | URL: ${r.url}`).join('\n')}
用户提供了以上参考图片/视频，请结合这些参考素材来理解用户意图。如果是生成图片，参考其风格、构图、色彩。`
        : ''

      const defaultRatio = genSettings?.ratio || config?.general?.defaultRatio || '1:1'
      const defaultStyle = genSettings?.style || config?.general?.defaultStyle || ''
      const styleHint = defaultStyle ? `\n用户当前选择的风格预设：${defaultStyle}。生成图片时，prompt 必须融入这个风格的视觉特征。` : ''

      const system = `你是 Gravuresse，专业 AI 创意设计工作流 Agent。你主要是一个对话助手，只在用户明确要求时才触发图片/视频生成。

## 当前画布
${canvas ? canvas.allAssets?.slice(0, 10).map(a => `  [${a.id}] "${a.label}" | ${a.type} | ${a.prompt?.slice(0, 80)}`).join('\n') || '（空）' : '（空）'}
${modifyHint}${refHint}${styleHint}

## 响应格式（只输出纯JSON，不要markdown代码块）
{"understanding":"一句话理解用户意图","intent":"chat|generate_image|modify_image|generate_video|image_to_video","tasks":[{"id":"t1","type":"image|video","label":"中文短标签","prompt":"高质量英文prompt，80词以上，含主体/场景/镜头/构图/光线/色彩/材质/情绪/细节","negative_prompt":"low quality, blurry, deformed, watermark, text","source_image_id":null,"duration":5,"ratio":"${defaultRatio}"}],"reply":"中文友好回复"}

## 规则（严格执行）
1. 默认 intent=chat，tasks=[]。绝大多数对话都是纯聊天。
2. 只有用户明确使用了生成/创作类动词时才触发生成。触发词包括："生成图片"、"画一张"、"创建图片"、"做一张图"、"设计一张"、"generate"、"create an image"、"draw"、"make a picture"、"帮我画"、"出图"、"来一张"、"生成一个"。
3. 如果用户只是描述了一个画面、场景、故事，但没有明确要求生成图片/视频，则 intent=chat，不要生成。
4. 如果用户说"生成视频"、"做个动画"、"make a video"，才用 intent=generate_video。
5. 选中资产说修改时：intent=modify_image，source_image_id填资产ID。
6. 选中图片说动起来时：intent=image_to_video，tasks.type=video。
7. prompt必须英文，80词以上，具体描述镜头/光线/材质/色彩。
8. reply必须中文，不要声称已经生成完成，只说明你的创作计划。
9. 不确定时，默认走 chat，不要猜测用户想生成。
10. modify_image 时，新 prompt 必须基于上次 prompt 做增量修改，保留用户没提到的部分。`

      const result = await window.electronAPI.chat({ history, system, thinking }, provider)

      let replyText = result.text
      const thinkingText = result.thinking || ''
      let parsed = null
      try {
        const jsonMatch = result.text.match(/\{[\s\S]*\}/)
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
      } catch {}

      if (parsed?.tasks?.length > 0) {
        const task = parsed.tasks[0]
        const taskData = {
          status: 'pending',
          type: task.type,
          label: task.label,
          prompt: task.prompt,
          negative_prompt: task.negative_prompt,
          ratio: task.ratio || defaultRatio,
          duration: task.duration || 5,
          source_image_id: task.source_image_id,
          intent: parsed.intent,
          resolution: genSettings?.resolution || '1024',
        }
        const replyMsg = {
          role: 'assistant',
          content: parsed.reply || replyText,
          id: Date.now() + 1,
          model: result.model,
          task: taskData,
          thinking: thinkingText || undefined,
        }
        setMessages(prev => [...prev, replyMsg])
      } else {
        replyText = parsed?.reply || replyText
        const replyMsg = { role: 'assistant', content: replyText, id: Date.now() + 1, model: result.model, thinking: thinkingText || undefined }
        setMessages(prev => [...prev, replyMsg])
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}`, id: Date.now() + 1, error: true }])
    } finally {
      setLoading(false)
    }
  }, [config, messages, loading, canvas])

  const doGenerate = useCallback(async (msgId, task, lang) => {
    const startTime = Date.now()
    const updateTask = (patch) => {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, task: { ...m.task, ...patch } } : m))
    }

    if (task.type === 'image') {
      const imgProvider = config?.providers?.image
      if (!imgProvider?.id || !imgProvider?.apiKey) throw new Error(t('configImageApi', lang))
      const providerDef = IMG_PROVIDERS.find(p => p.id === imgProvider.id)
      const protocol = imgProvider.protocol || providerDef?.protocol || 'openai_image'
      const url = await window.electronAPI.generateImage({
        prompt: task.prompt, ratio: task.ratio || '1:1',
        ...imgProvider, protocol
      })
      const elapsed = Math.round((Date.now() - startTime) / 1000)
      const asset = canvas.addAsset({ type: 'image', url, prompt: task.prompt, label: task.label, model: imgProvider.model, ratio: task.ratio })
      lastImageContext.current = { prompt: task.prompt, ratio: task.ratio || '1:1', assetId: asset.id }
      updateTask({ status: 'done', assetId: asset.id, elapsed })
      if (config?.general?.autoSave !== false) {
        try { await window.electronAPI.saveAssetToDisk?.({ url, label: task.label, type: 'image' }) } catch {}
      }
      return asset
    } else if (task.type === 'video') {
      const vidProvider = config?.providers?.video
      if (!vidProvider?.id || !vidProvider?.apiKey) throw new Error(t('configVideoApi', lang))
      const providerDef = VID_PROVIDERS.find(p => p.id === vidProvider.id)
      const protocol = vidProvider.protocol || providerDef?.protocol || 'ark_video_task'
      await window.electronAPI.generateVideo({
        prompt: task.prompt, ratio: task.ratio || '1:1', duration: task.duration || 5,
        ...vidProvider, protocol
      })
      const elapsed = Math.round((Date.now() - startTime) / 1000)
      updateTask({ status: 'done', elapsed })
    }
  }, [config, canvas])

  const confirmGenerate = useCallback(async (msgId, task) => {
    const lang = config?.general?.language || 'zh'
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, task: { ...m.task, status: 'generating', startTime: Date.now() } } : m))
    try {
      await doGenerate(msgId, task, lang)
    } catch (e) {
      console.error('Generation failed:', e)
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, task: { ...m.task, status: 'error', error: e.message } } : m))
    }
  }, [config, doGenerate])

  const batchGenerate = useCallback(async (msgId, task, count) => {
    const lang = config?.general?.language || 'zh'
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, task: { ...m.task, status: 'generating', startTime: Date.now(), batchTotal: count, batchDone: 0 } } : m))
    let done = 0
    for (let i = 0; i < count; i++) {
      try {
        const batchMsgId = i === 0 ? msgId : null
        if (i > 0) {
          const imgProvider = config?.providers?.image
          if (!imgProvider?.id || !imgProvider?.apiKey) throw new Error(t('configImageApi', lang))
          const providerDef = IMG_PROVIDERS.find(p => p.id === imgProvider.id)
          const protocol = imgProvider.protocol || providerDef?.protocol || 'openai_image'
          const url = await window.electronAPI.generateImage({
            prompt: task.prompt, ratio: task.ratio || '1:1',
            ...imgProvider, protocol
          })
          canvas.addAsset({ type: 'image', url, prompt: task.prompt, label: `${task.label} #${i + 1}`, model: imgProvider.model, ratio: task.ratio })
          if (config?.general?.autoSave !== false) {
            try { await window.electronAPI.saveAssetToDisk?.({ url, label: `${task.label}_${i + 1}`, type: 'image' }) } catch {}
          }
        } else {
          await doGenerate(msgId, task, lang)
        }
        done++
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, task: { ...m.task, batchDone: done } } : m))
      } catch (e) {
        console.error(`Batch item ${i + 1} failed:`, e)
      }
    }
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, task: { ...m.task, status: done > 0 ? 'done' : 'error', batchDone: done, error: done === 0 ? 'All batch items failed' : undefined } } : m))
  }, [config, canvas, doGenerate])

  const setMessagesDirectly = useCallback((fn) => {
    setMessages(fn)
  }, [])

  const clear = useCallback(() => {
    setMessages([])
    lastImageContext.current = null
  }, [])

  return { messages, loading, send, clear, confirmGenerate, batchGenerate, setMessages: setMessagesDirectly, lastImageContext, thinking, setThinking }
}
