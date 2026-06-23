import { useState, useCallback, useRef, useEffect } from 'react'
import { IMG_PROVIDERS } from '../providers/imageProviders'
import { VID_PROVIDERS } from '../providers/videoProviders'
import { resolveProviderId } from '../providers/aliases'
import { t } from '../i18n'

let _msgIdCounter = 0
function nextId() { return Date.now() * 1000 + (++_msgIdCounter % 1000) }

function parseDurationSeconds(value, fallback = 5) {
  const match = String(value ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*s?$/i)
  const parsed = match ? Number(match[1]) : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback
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

function findProviderDef(track, providerLists = {}, id) {
  const providers = providerLists?.[track] || []
  const canonicalId = resolveProviderId(track, id)
  return providers.find(p => p.id === id || p.id === canonicalId)
}

function precheckGeneration(track, providerDef, task, extra = {}) {
  if (!providerDef) return
  if (providerDef.executable === false || providerDef.integrationStatus === 'metadata') {
    throw new Error(`${providerDef.name} 当前只提供官网/购买/文档入口，请选择可执行 provider 或 Custom API。`)
  }
  const constraints = providerDef.constraints?.[track] || providerDef.meta?.constraints?.[track] || {}
  const prompt = String(task.prompt || '')
  const maxPrompt = constraints.prompt?.maxLength
  if (maxPrompt && Array.from(prompt).length > maxPrompt) {
    throw new Error(`Prompt 过长：当前 ${Array.from(prompt).length} 字符，${providerDef.name} 上限 ${maxPrompt} 字符。`)
  }
  const negativePrompt = task.negative_prompt || task.negativePrompt || ''
  const negRule = constraints.negativePrompt
  if (negativePrompt && negRule && negRule.supported === false && negRule.strategy === 'unsupported') {
    throw new Error(`${providerDef.name} 不支持 Negative Prompt，请清空负面提示词或换用支持的 provider。`)
  }
  if (track === 'video') {
    const durationRule = constraints.duration
    const duration = Number(task.duration)
    if (durationRule?.allowed?.length && Number.isFinite(duration) && !durationRule.allowed.includes(duration)) {
      throw new Error(`${providerDef.name} 不支持 ${duration}s，请使用 ${durationRule.allowed.join('/')}s。`)
    }
    if (durationRule?.min && duration < durationRule.min) throw new Error(`${providerDef.name} 最小时长为 ${durationRule.min}s。`)
    if (durationRule?.max && duration > durationRule.max) throw new Error(`${providerDef.name} 最大时长为 ${durationRule.max}s。`)
    const sourceRule = constraints.sourceImage || {}
    const requiresSource = sourceRule.required || sourceRule.requiredForModes?.includes(task.intent || extra.mode)
    if (requiresSource && !extra.sourceImageUrl) {
      throw new Error(`${providerDef.name} 需要先选择一张源图才能提交图生视频任务。`)
    }
  }
}

function hasProviderCredential(provider = {}) {
  return provider.customAuth?.type === 'session' ? Boolean(provider.sessionToken) : Boolean(provider.apiKey)
}

export default function useChat(config, canvas, onVideoTaskCreated, activeConversationId, isActiveConversation, conversationBridge, providerLists) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [thinking, setThinking] = useState(false)
  const lastImageContext = useRef(null)
  const loadingRef = useRef(false)
  const messagesRef = useRef([])
  const mountedRef = useRef(true)
  const activeConversationIdRef = useRef(activeConversationId)

  // Keep ref in sync with state
  useEffect(() => { loadingRef.current = loading }, [loading])
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { activeConversationIdRef.current = activeConversationId }, [activeConversationId])
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const canWriteToCurrentConversation = useCallback((conversationId) => {
    return Boolean(mountedRef.current && conversationId && isActiveConversation?.(conversationId))
  }, [isActiveConversation])

  const canWriteToConversation = useCallback((conversationId) => {
    if (!mountedRef.current) return false
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
    if (!hasProviderCredential(provider)) {
      appendMessage(originConversationId, { role: 'assistant', content: t('configApiFirst', lang), id: nextId() })
      setLoading(false)
      loadingRef.current = false
      return
    }

    try {
      const history = [...messagesRef.current, userMsg].map(m => ({ role: m.role, content: m.content }))

      const storedImageContext = lastImageContext.current
      const latestImageAsset = canvas?.allAssets?.find(asset => asset.type === 'image' && asset.url)
      const modifyContext = storedImageContext?.conversationId === originConversationId
        ? storedImageContext
        : latestImageAsset
          ? {
              conversationId: originConversationId,
              prompt: latestImageAsset.prompt,
              ratio: latestImageAsset.ratio || '1:1',
              assetId: latestImageAsset.id
            }
          : null
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
      const defaultNegPrompt = config?.providers?.image?.defaultNegPrompt?.trim() || ''
      const defaultDuration = parseDurationSeconds(config?.general?.defaultDuration, 5)
      const customSystemPrompt = provider?.customSystemPrompt?.trim() || ''
      const styleHint = defaultStyle ? `\n用户当前选择的风格预设：${defaultStyle}。生成图片时，prompt 必须融入这个风格的视觉特征。` : ''

      const baseSystem = `你是 Gravuresse，专业 AI 创意设计工作流 Agent。你主要是一个对话助手，只在用户明确要求时才触发图片/视频生成。

## 当前画布
${canvas ? canvas.allAssets?.slice(0, 10).map(a => `  [${a.id}] "${a.label}" | ${a.type} | ${a.prompt?.slice(0, 80)}`).join('\n') || '（空）' : '（空）'}
${modifyHint}${refHint}${styleHint}

## 响应格式（只输出纯JSON，不要markdown代码块）
{"understanding":"一句话理解用户意图","intent":"chat|generate_image|modify_image|generate_video|image_to_video","tasks":[{"id":"t1","type":"image|video","label":"中文短标签","prompt":"高质量英文prompt，80词以上，含主体/场景/镜头/构图/光线/色彩/材质/情绪/细节","negative_prompt":${JSON.stringify(defaultNegPrompt || 'low quality, blurry, deformed, watermark, text')},"source_image_id":null,"duration":${defaultDuration},"ratio":"${defaultRatio}"}],"reply":"中文友好回复"}

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

      const system = customSystemPrompt ? `${baseSystem}\n\n## Custom System Prompt\n${customSystemPrompt}` : baseSystem
      const result = await callProvider({
        action: 'chat',
        providerId: resolveProviderId('chat', provider.id),
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
          negative_prompt: task.negative_prompt || defaultNegPrompt,
          ratio: task.ratio || defaultRatio,
          duration: parseDurationSeconds(task.duration, defaultDuration),
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
      loadingRef.current = false
      if (mountedRef.current) setLoading(false)
    }
  }, [config, canvas, appendMessage, thinking])

  const doGenerate = useCallback(async (msgId, task, lang, placeholderId, taskIndex, originConversationId) => {
    const startTime = Date.now()
    const idx = taskIndex ?? 0
    const updateTask = (patch) => patchTask(originConversationId, msgId, idx, patch)

    if (task.type === 'image') {
      const imgProvider = config?.providers?.image
      if (!imgProvider?.id || !hasProviderCredential(imgProvider)) throw new Error(t('configImageApi', lang))
      const providerDef = findProviderDef('image', providerLists, imgProvider.id) || IMG_PROVIDERS.find(p => p.id === imgProvider.id)
      const protocol = imgProvider.protocol || providerDef?.protocol || 'openai_image'
      const negativePrompt = task.negative_prompt || imgProvider.defaultNegPrompt || ''
      precheckGeneration('image', providerDef, { ...task, negative_prompt: negativePrompt })
      const imageParams = {
        prompt: task.prompt, ratio: task.ratio || '1:1', resolution: task.resolution || '1024',
        negative_prompt: negativePrompt,
        ...imgProvider, protocol
      }
      const url = await callProvider({
        action: 'generate',
        providerId: resolveProviderId('image', imgProvider.id),
        prompt: imageParams.prompt,
        ratio: imageParams.ratio,
        resolution: imageParams.resolution,
        negative_prompt: imageParams.negative_prompt,
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
        lastImageContext.current = {
          conversationId: originConversationId,
          prompt: task.prompt,
          ratio: task.ratio || '1:1',
          assetId
        }
      }
      updateTask({ status: 'done', assetId, elapsed })
      if (config?.general?.autoSaveImage === true) {
        try { await window.electronAPI.saveAssetToDisk?.({ url, label: task.label, type: 'image' }) } catch {}
      }
    } else if (task.type === 'video') {
      const vidProvider = config?.providers?.video
      if (!vidProvider?.id || !hasProviderCredential(vidProvider)) throw new Error(t('configVideoApi', lang))
      const providerDef = findProviderDef('video', providerLists, vidProvider.id) || VID_PROVIDERS.find(p => p.id === vidProvider.id)
      const protocol = vidProvider.protocol || providerDef?.protocol || 'ark_video_task'
      const provider = { ...vidProvider, protocol }
      const sourceAsset = task.source_image_id ? canvas.getAssetById(task.source_image_id) : null
      const sourceImageUrl = task.sourceImageUrl || sourceAsset?.url || ''
      const duration = parseDurationSeconds(task.duration, parseDurationSeconds(config?.general?.defaultDuration, 5))
      precheckGeneration('video', providerDef, { ...task, duration }, { sourceImageUrl, mode: task.intent })
      const videoParams = {
        prompt: task.prompt, ratio: task.ratio || '1:1', duration,
        sourceImageUrl,
        ...provider
      }
      const result = await callProvider({
        action: 'submit',
        providerId: resolveProviderId('video', provider.id),
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
  }, [config, canvas, onVideoTaskCreated, canWriteToConversation, canWriteToCurrentConversation, addAssetToConversation, updateAssetInConversation, patchTask, providerLists])

  const confirmGenerate = useCallback(async (msgId, task, taskIndex) => {
    const originConversationId = activeConversationIdRef.current
    if (!originConversationId) return
    const lang = config?.general?.language || 'zh'
    const idx = taskIndex ?? 0
    const startTime = Date.now()
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m
      const tasks = [...(m.tasks || [m.task])]
      tasks[idx] = { ...tasks[idx], status: 'generating', startTime }
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
    const startTime = Date.now()
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m
      const tasks = [...(m.tasks || [m.task])]
      tasks[idx] = { ...tasks[idx], status: 'generating', startTime, batchTotal: count, batchDone: 0 }
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
        // Delegate every iteration to doGenerate (single image-gen path) rather
        // than duplicating provider lookup / callProvider / autosave here. The
        // per-item task clone just adjusts the asset label to "#N".
        const itemTask = count > 1 ? { ...task, label: `${task.label} #${i + 1}` } : task
        await doGenerate(msgId, itemTask, lang, placeholderIds[i], idx, originConversationId)
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
  }, [config, canvas, doGenerate, canWriteToConversation, removeAssetFromConversation, patchTask])

  const setMessagesDirectly = useCallback((update) => {
    // No side effects inside the updater (CLAUDE.md red line) — the messagesRef
    // is kept in sync by the dedicated useEffect on [messages] below.
    setMessages(prev => (typeof update === 'function' ? update(prev) : update))
  }, [])

  const clear = useCallback(() => {
    messagesRef.current = []
    setMessages([])
    lastImageContext.current = null
  }, [])

  return { messages, loading, send, clear, confirmGenerate, batchGenerate, setMessages: setMessagesDirectly, lastImageContext, thinking, setThinking }
}
