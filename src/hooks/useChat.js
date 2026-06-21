import { useState, useCallback, useRef, useEffect } from 'react'
import { IMG_PROVIDERS } from '../providers/imageProviders'
import { VID_PROVIDERS } from '../providers/videoProviders'
import { t } from '../i18n'

let _msgIdCounter = 0
function nextId() { return Date.now() * 1000 + (++_msgIdCounter % 1000) }

const PROVIDER_ID_ALIASES = {
  chat: { claude: 'anthropic', gemini: 'google', qwen: 'alibaba', kimi: 'moonshot', doubao: 'volcengine' },
  image: { dalle: 'openai', gemini_img: 'google', jimeng_img: 'volcengine' },
  video: { jimeng_vid: 'volcengine' }
}

function getProviderId(track, id) {
  return PROVIDER_ID_ALIASES[track]?.[id] || id
}

async function callProvider(params, fallback) {
  if (!window.electronAPI?.providerAPI?.call) return fallback()
  const result = await window.electronAPI.providerAPI.call(params)
  if (!result?.ok) {
    if (['UNKNOWN_PROVIDER', 'UNSUPPORTED_ACTION', 'NO_HANDLER'].includes(result?.error?.code)) return fallback()
    throw new Error(result?.error?.message || 'Provider call failed')
  }
  return result.data
}

export default function useChat(config, canvas, onVideoTaskCreated, activeConversationId, isActiveConversation, conversationBridge) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [thinking, setThinking] = useState(false)
  const lastImageContext = useRef(null)
  const loadingRef = useRef(false)
  const activeConversationIdRef = useRef(activeConversationId)

  // Keep ref in sync with state
  useEffect(() => { loadingRef.current = loading }, [loading])
  useEffect(() => { activeConversationIdRef.current = activeConversationId }, [activeConversationId])

  const canWriteToCurrentConversation = useCallback((conversationId) => {
    return Boolean(conversationId && isActiveConversation?.(conversationId))
  }, [isActiveConversation])

  const canWriteToConversation = useCallback((conversationId) => {
    return canWriteToCurrentConversation(conversationId) || Boolean(conversationBridge?.canWrite?.(conversationId))
  }, [canWriteToCurrentConversation, conversationBridge])

  const appendMessage = useCallback((conversationId, message) => {
    if (canWriteToCurrentConversation(conversationId)) {
      setMessages(prev => [...prev, message])
      return true
    }
    return Boolean(conversationBridge?.appendMessage?.(conversationId, message))
  }, [canWriteToCurrentConversation, conversationBridge])

  const patchTask = useCallback((conversationId, msgId, taskIndex, patch) => {
    const idx = taskIndex ?? 0
    if (canWriteToCurrentConversation(conversationId)) {
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId) return m
        const tasks = [...(m.tasks || [m.task])]
        tasks[idx] = { ...tasks[idx], ...patch }
        return { ...m, tasks }
      }))
      return true
    }
    return Boolean(conversationBridge?.updateTask?.(conversationId, msgId, idx, patch))
  }, [canWriteToCurrentConversation, conversationBridge])

  const addAssetToConversation = useCallback((conversationId, asset) => {
    if (canWriteToCurrentConversation(conversationId)) return canvas.addAsset(asset)
    return conversationBridge?.addAsset?.(conversationId, asset) || null
  }, [canvas, canWriteToCurrentConversation, conversationBridge])

  const updateAssetInConversation = useCallback((conversationId, assetId, patch) => {
    if (canWriteToCurrentConversation(conversationId)) {
      canvas.updateAsset(assetId, patch)
      return true
    }
    return Boolean(conversationBridge?.updateAsset?.(conversationId, assetId, patch))
  }, [canvas, canWriteToCurrentConversation, conversationBridge])

  const removeAssetFromConversation = useCallback((conversationId, assetId) => {
    if (canWriteToCurrentConversation(conversationId)) {
      canvas.removeAsset(assetId)
      return true
    }
    return Boolean(conversationBridge?.removeAsset?.(conversationId, assetId))
  }, [canvas, canWriteToCurrentConversation, conversationBridge])

  const send = useCallback(async (text, references, genSettings) => {
    if (!text.trim() || loadingRef.current) return
    const originConversationId = activeConversationIdRef.current
    if (!originConversationId) return
    const userMsg = { role: 'user', content: text, id: nextId() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    loadingRef.current = true

    const provider = config?.providers?.chat
    const lang = config?.general?.language || 'zh'
    if (!provider?.apiKey) {
      appendMessage(originConversationId, { role: 'assistant', content: t('configApiFirst', lang), id: nextId() })
      setLoading(false)
      loadingRef.current = false
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

      const result = await callProvider({
        action: 'chat',
        providerId: getProviderId('chat', provider.id),
        messages: history,
        system,
        thinking,
        model: provider.model,
        baseUrl: provider.baseUrl
      }, () => window.electronAPI.chat({ history, system, thinking }, provider))

      let replyText = result.text
      const thinkingText = result.thinking || ''
      let parsed = null
      try {
        // 非贪婪匹配：找第一个完整的 JSON 对象
        const jsonMatch = result.text.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/)
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
      } catch {}

      if (parsed?.tasks?.length > 0) {
        const tasksData = parsed.tasks.map(task => ({
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
        }))
        const replyMsg = {
          role: 'assistant',
          content: parsed.reply || replyText,
          id: nextId(),
          model: result.model,
          tasks: tasksData,
          thinking: thinkingText || undefined,
        }
        appendMessage(originConversationId, replyMsg)
      } else {
        replyText = parsed?.reply || replyText
        const replyMsg = { role: 'assistant', content: replyText, id: nextId(), model: result.model, thinking: thinkingText || undefined }
        appendMessage(originConversationId, replyMsg)
      }
    } catch (err) {
      appendMessage(originConversationId, { role: 'assistant', content: `Error: ${err.message}`, id: nextId(), error: true })
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }, [config, messages, canvas, appendMessage])

  const doGenerate = useCallback(async (msgId, task, lang, placeholderId, taskIndex, originConversationId) => {
    const startTime = Date.now()
    const idx = taskIndex ?? 0
    const updateTask = (patch) => patchTask(originConversationId, msgId, idx, patch)

    if (task.type === 'image') {
      const imgProvider = config?.providers?.image
      if (!imgProvider?.id || !imgProvider?.apiKey) throw new Error(t('configImageApi', lang))
      const providerDef = IMG_PROVIDERS.find(p => p.id === imgProvider.id)
      const protocol = imgProvider.protocol || providerDef?.protocol || 'openai_image'
      const imageParams = {
        prompt: task.prompt, ratio: task.ratio || '1:1', resolution: task.resolution || '1024',
        ...imgProvider, protocol
      }
      const url = await callProvider({
        action: 'generate',
        providerId: getProviderId('image', imgProvider.id),
        prompt: imageParams.prompt,
        ratio: imageParams.ratio,
        resolution: imageParams.resolution,
        model: imageParams.model,
        baseUrl: imageParams.baseUrl
      }, () => window.electronAPI.generateImage(imageParams))
      const elapsed = Math.round((Date.now() - startTime) / 1000)
      if (!canWriteToConversation(originConversationId)) return
      let assetId = placeholderId
      if (placeholderId) {
        updateAssetInConversation(originConversationId, placeholderId, { url, prompt: task.prompt, label: task.label, model: imgProvider.model, ratio: task.ratio, _generating: false })
      } else {
        const asset = addAssetToConversation(originConversationId, { type: 'image', url, prompt: task.prompt, label: task.label, model: imgProvider.model, ratio: task.ratio })
        assetId = asset?.id
      }
      if (canWriteToCurrentConversation(originConversationId) && assetId) {
        lastImageContext.current = { prompt: task.prompt, ratio: task.ratio || '1:1', assetId }
      }
      updateTask({ status: 'done', assetId, elapsed })
      if (config?.general?.autoSave !== false) {
        try { await window.electronAPI.saveAssetToDisk?.({ url, label: task.label, type: 'image' }) } catch {}
      }
    } else if (task.type === 'video') {
      const vidProvider = config?.providers?.video
      if (!vidProvider?.id || !vidProvider?.apiKey) throw new Error(t('configVideoApi', lang))
      const providerDef = VID_PROVIDERS.find(p => p.id === vidProvider.id)
      const protocol = vidProvider.protocol || providerDef?.protocol || 'ark_video_task'
      const provider = { ...vidProvider, protocol }
      const sourceAsset = task.source_image_id ? canvas.getAssetById(task.source_image_id) : null
      const sourceImageUrl = task.sourceImageUrl || sourceAsset?.url || ''
      const videoParams = {
        prompt: task.prompt, ratio: task.ratio || '1:1', duration: task.duration || 5,
        sourceImageUrl,
        ...provider
      }
      const result = await callProvider({
        action: 'submit',
        providerId: getProviderId('video', provider.id),
        prompt: videoParams.prompt,
        ratio: videoParams.ratio,
        duration: videoParams.duration,
        sourceImageUrl: videoParams.sourceImageUrl,
        model: videoParams.model,
        baseUrl: videoParams.baseUrl
      }, () => window.electronAPI.generateVideo(videoParams))
      if (!result?.taskId) throw new Error(result?.error || 'Video task was not created')
      if (!canWriteToConversation(originConversationId)) return
      const status = result.status === 'running' ? 'running' : 'queued'
      const queuedTask = onVideoTaskCreated?.({
        taskId: result.taskId,
        prompt: task.prompt,
        label: task.label,
        provider,
        autoSave: config?.general?.autoSave !== false,
        onComplete: (result) => {
          if (!canWriteToConversation(originConversationId)) return null
          const asset = addAssetToConversation(originConversationId, { type: 'video', url: result.videoUrl, prompt: task.prompt, label: task.label, model: provider.model })
          if (asset) updateTask({ status: 'done', assetId: asset.id })
          return asset
        },
        onFail: (error) => updateTask({ status: 'error', error })
      })
      const elapsed = Math.round((Date.now() - startTime) / 1000)
      updateTask({ status, taskId: result.taskId, queueId: queuedTask?.id, elapsed })
    }
  }, [config, canvas, onVideoTaskCreated, canWriteToConversation, canWriteToCurrentConversation, addAssetToConversation, updateAssetInConversation, patchTask])

  const confirmGenerate = useCallback(async (msgId, task, taskIndex) => {
    const originConversationId = activeConversationIdRef.current
    if (!originConversationId) return
    const lang = config?.general?.language || 'zh'
    const idx = taskIndex ?? 0
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m
      const tasks = [...(m.tasks || [m.task])]
      tasks[idx] = { ...tasks[idx], status: 'generating', startTime: Date.now() }
      return { ...m, tasks }
    }))
    const placeholderId = task.type === 'image' ? canvas.addPlaceholder(task.label || '生成中...') : null
    try {
      await doGenerate(msgId, task, lang, placeholderId, idx, originConversationId)
    } catch (e) {
      console.error('Generation failed:', e)
      if (!canWriteToConversation(originConversationId)) return
      if (placeholderId) removeAssetFromConversation(originConversationId, placeholderId)
      patchTask(originConversationId, msgId, idx, { status: 'error', error: e.message })
    }
  }, [config, doGenerate, canvas, canWriteToConversation, removeAssetFromConversation, patchTask])

  const batchGenerate = useCallback(async (msgId, task, count, taskIndex) => {
    const originConversationId = activeConversationIdRef.current
    if (!originConversationId) return
    const lang = config?.general?.language || 'zh'
    const idx = taskIndex ?? 0
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m
      const tasks = [...(m.tasks || [m.task])]
      tasks[idx] = { ...tasks[idx], status: 'generating', startTime: Date.now(), batchTotal: count, batchDone: 0 }
      return { ...m, tasks }
    }))

    const placeholderIds = []
    for (let i = 0; i < count; i++) {
      placeholderIds.push(canvas.addPlaceholder(`${task.label || '生成中'} #${i + 1}`))
    }

    let done = 0
    let hasFailure = false
    const failedIds = []
    for (let i = 0; i < count; i++) {
      try {
        if (i === 0) {
          await doGenerate(msgId, task, lang, placeholderIds[i], idx, originConversationId)
        } else {
          const imgProvider = config?.providers?.image
          if (!imgProvider?.id || !imgProvider?.apiKey) throw new Error(t('configImageApi', lang))
          const providerDef = IMG_PROVIDERS.find(p => p.id === imgProvider.id)
          const protocol = imgProvider.protocol || providerDef?.protocol || 'openai_image'
          const imageParams = {
            prompt: task.prompt, ratio: task.ratio || '1:1', resolution: task.resolution || '1024',
            ...imgProvider, protocol
          }
          const url = await callProvider({
            action: 'generate',
            providerId: getProviderId('image', imgProvider.id),
            prompt: imageParams.prompt,
            ratio: imageParams.ratio,
            resolution: imageParams.resolution,
            model: imageParams.model,
            baseUrl: imageParams.baseUrl
          }, () => window.electronAPI.generateImage(imageParams))
          if (!canWriteToConversation(originConversationId)) return
          updateAssetInConversation(originConversationId, placeholderIds[i], { url, prompt: task.prompt, label: `${task.label} #${i + 1}`, model: imgProvider.model, ratio: task.ratio, _generating: false })
          if (config?.general?.autoSave !== false) {
            try { await window.electronAPI.saveAssetToDisk?.({ url, label: `${task.label}_${i + 1}`, type: 'image' }) } catch {}
          }
        }
        done++
        if (!canWriteToConversation(originConversationId)) return
        patchTask(originConversationId, msgId, idx, { batchDone: done })
      } catch (e) {
        console.error(`Batch item ${i + 1} failed:`, e)
        hasFailure = true
        failedIds.push(placeholderIds[i])
      }
    }

    if (!canWriteToConversation(originConversationId)) return
    failedIds.forEach(id => removeAssetFromConversation(originConversationId, id))
    patchTask(originConversationId, msgId, idx, { status: done > 0 && !hasFailure ? 'done' : done > 0 ? 'partial' : 'error', batchDone: done, error: done === 0 ? 'All batch items failed' : hasFailure ? `${count - done} of ${count} failed` : undefined })
  }, [config, canvas, doGenerate, canWriteToConversation, updateAssetInConversation, removeAssetFromConversation, patchTask])

  const setMessagesDirectly = useCallback((fn) => {
    setMessages(fn)
  }, [])

  const clear = useCallback(() => {
    setMessages([])
    lastImageContext.current = null
  }, [])

  return { messages, loading, send, clear, confirmGenerate, batchGenerate, setMessages: setMessagesDirectly, lastImageContext, thinking, setThinking }
}
