import { useState, useCallback, useRef, useEffect } from 'react'
import { IMG_PROVIDERS } from '../providers/imageProviders'
import { VID_PROVIDERS } from '../providers/videoProviders'
import { resolveProviderId } from '../providers/aliases'
import { t } from '../i18n'
import { callChatProvider, generateImageProvider, submitVideoProvider } from '../utils/providerClient'
import { buildGenerationMeta, idList, parseDurationSeconds, uniqueIds } from '../utils/generationTasks'
import { sanitizeAssetUrl } from '../utils/mediaSecurity.js'

let _msgIdCounter = 0
function nextId() { return Date.now() * 1000 + (++_msgIdCounter % 1000) }

function findProviderDef(track, providerLists = {}, id) {
  const providers = providerLists?.[track] || []
  const canonicalId = resolveProviderId(track, id)
  return providers.find(p => p.id === id || p.id === canonicalId)
}

function precheckGeneration(track, providerDef, task, extra = {}) {
  if (!providerDef) return
  const lang = extra.lang || 'zh'
  const fmt = (key, values = {}) => Object.entries(values).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, value),
    t(key, lang)
  )
  if (providerDef.executable === false || providerDef.integrationStatus === 'metadata') {
    throw new Error(fmt('providerMetadataOnlyError', { provider: providerDef.name }))
  }
  const constraints = providerDef.constraints?.[track] || providerDef.meta?.constraints?.[track] || {}
  const prompt = String(task.prompt || '')
  const maxPrompt = constraints.prompt?.maxLength
  if (maxPrompt && Array.from(prompt).length > maxPrompt) {
    throw new Error(fmt('promptTooLongError', { count: Array.from(prompt).length, provider: providerDef.name, max: maxPrompt }))
  }
  const negativePrompt = task.negative_prompt || task.negativePrompt || ''
  const negRule = constraints.negativePrompt
  if (negativePrompt && negRule && negRule.supported === false && negRule.strategy === 'unsupported') {
    throw new Error(fmt('negativePromptUnsupportedError', { provider: providerDef.name }))
  }
  if (track === 'video') {
    const durationRule = constraints.duration
    const duration = Number(task.duration)
    if (durationRule?.allowed?.length && Number.isFinite(duration) && !durationRule.allowed.includes(duration)) {
      throw new Error(fmt('durationNotAllowedError', { provider: providerDef.name, duration, allowed: durationRule.allowed.join('/') }))
    }
    if (durationRule?.min && duration < durationRule.min) throw new Error(fmt('durationMinError', { provider: providerDef.name, min: durationRule.min }))
    if (durationRule?.max && duration > durationRule.max) throw new Error(fmt('durationMaxError', { provider: providerDef.name, max: durationRule.max }))
    const sourceRule = constraints.sourceImage || {}
    const requiresSource = sourceRule.required || sourceRule.requiredForModes?.includes(task.intent || extra.mode)
    if (requiresSource && !extra.sourceImageUrl) {
      throw new Error(fmt('sourceImageRequiredError', { provider: providerDef.name }))
    }
  }
}

function coerceOption(value, allowed = [], fallback = '') {
  const current = String(value || '')
  if (!Array.isArray(allowed) || allowed.length === 0) return current || fallback
  if (allowed.includes(current)) return current
  return allowed[0] || fallback
}

function coerceTaskForProvider(track, providerDef, task = {}) {
  const constraints = providerDef?.constraints?.[track] || providerDef?.meta?.constraints?.[track] || {}
  return {
    ...task,
    ratio: coerceOption(task.ratio || '1:1', constraints.ratios, '1:1'),
    resolution: coerceOption(task.resolution || '1024', constraints.resolutions, '1024')
  }
}

function normalizeAuthType(type) {
  return String(type || '').toLowerCase().replace(/_/g, '-')
}

function hasProviderCredential(provider = {}, providerDef = {}) {
  if (provider.accountId && provider.accountKind !== 'oauth-placeholder') return true
  const customType = normalizeAuthType(provider.customAuth?.type)
  const type = customType || normalizeAuthType(provider.authType?.type || providerDef?.authType?.type)
  if (type === 'none') return Boolean(provider?.id || providerDef?.id)
  if (type === 'session') return Boolean(provider.sessionToken)
  return Boolean(provider.apiKey)
}

function taskAllowedInMode(task, generationMode) {
  if (!generationMode || generationMode === 'chat') return true
  if (generationMode === 'image') return task?.type === 'image'
  if (generationMode === 'video') return task?.type === 'video'
  return true
}

function cleanText(value, max = 50000) {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

function cleanId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const id = String(value)
  return id ? id : null
}

function appendStyleToPrompt(prompt, style) {
  const base = cleanText(prompt)
  const selectedStyle = cleanText(style, 120).trim()
  if (!selectedStyle) return base
  if (base.toLowerCase().includes(selectedStyle.toLowerCase())) return base
  return `${base}\n\nVisual style direction: ${selectedStyle}.`
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
      conversationBridge?.appendMessage?.(conversationId, message)
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
      conversationBridge?.updateTask?.(conversationId, msgId, idx, patch)
      return true
    }
    return Boolean(conversationBridge?.updateTask?.(conversationId, msgId, idx, patch))
  }, [canWriteToCurrentConversation, conversationBridge])

  const addAssetToConversation = useCallback((conversationId, asset) => {
    if (canWriteToCurrentConversation(conversationId)) {
      const item = canvas.addAsset(asset)
      conversationBridge?.addAsset?.(conversationId, item)
      return item
    }
    return conversationBridge?.addAsset?.(conversationId, asset) || null
  }, [canvas, canWriteToCurrentConversation, conversationBridge])

  const addPlaceholderToConversation = useCallback((conversationId, label, asset = {}) => {
    const placeholder = {
      type: 'image',
      label: label || 'Generating...',
      prompt: '',
      url: '',
      model: '',
      ratio: '1:1',
      style: '',
      ...asset,
      _generating: true
    }
    if (canWriteToCurrentConversation(conversationId)) {
      const item = canvas.addAsset(placeholder)
      conversationBridge?.addAsset?.(conversationId, item)
      return item.id
    }
    const item = conversationBridge?.addAsset?.(conversationId, placeholder)
    return item?.id || null
  }, [canvas, canWriteToCurrentConversation, conversationBridge])

  const updateAssetInConversation = useCallback((conversationId, assetId, patch) => {
    if (canWriteToCurrentConversation(conversationId)) {
      canvas.updateAsset(assetId, patch)
      conversationBridge?.updateAsset?.(conversationId, assetId, patch)
      return true
    }
    return Boolean(conversationBridge?.updateAsset?.(conversationId, assetId, patch))
  }, [canvas, canWriteToCurrentConversation, conversationBridge])

  const removeAssetFromConversation = useCallback((conversationId, assetId) => {
    if (canWriteToCurrentConversation(conversationId)) {
      canvas.removeAsset(assetId)
      conversationBridge?.removeAsset?.(conversationId, assetId)
      return true
    }
    return Boolean(conversationBridge?.removeAsset?.(conversationId, assetId))
  }, [canvas, canWriteToCurrentConversation, conversationBridge])

  const getAssetFromConversation = useCallback((conversationId, assetId) => {
    if (!assetId) return null
    if (canWriteToCurrentConversation(conversationId)) {
      return canvas.getAssetById(assetId) || conversationBridge?.getAsset?.(conversationId, assetId) || null
    }
    return conversationBridge?.getAsset?.(conversationId, assetId) || null
  }, [canvas, canWriteToCurrentConversation, conversationBridge])

  const send = useCallback(async (text, references, genSettings) => {
    if (!text.trim() || loadingRef.current) return false
    const originConversationId = genSettings?.conversationId || activeConversationIdRef.current
    if (!originConversationId) return false
    const snapshot = genSettings?.conversationSnapshot
    const sourceMessages = Array.isArray(snapshot?.messages) ? snapshot.messages : messagesRef.current
    const sourceAssets = Array.isArray(snapshot?.assets) ? snapshot.assets : canvas?.allAssets || []
    const userMsg = { role: 'user', content: text, id: nextId() }
    const writesCurrent = canWriteToCurrentConversation(originConversationId)
    if (snapshot && !writesCurrent) {
      setMessages([...sourceMessages, userMsg])
    }
    appendMessage(originConversationId, userMsg)
    setLoading(true)
    loadingRef.current = true

    const provider = config?.providers?.chat
    const lang = config?.general?.language || 'zh'
    const chatProviderDef = findProviderDef('chat', providerLists, provider?.id)
    if (!hasProviderCredential(provider, chatProviderDef)) {
      appendMessage(originConversationId, { role: 'assistant', content: t('configApiFirst', lang), id: nextId() })
      setLoading(false)
      loadingRef.current = false
      return true
    }

    try {
      const history = [...sourceMessages, userMsg].map(m => ({ role: m.role, content: m.content }))

      const storedImageContext = lastImageContext.current
      const latestImageAsset = sourceAssets.find(asset => asset.type === 'image' && asset.url)
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

      const pendingTasks = sourceMessages
        .flatMap(m => Array.isArray(m.tasks) ? m.tasks : m.task ? [m.task] : [])
        .filter(task => task?.status === 'pending' && (task.type === 'image' || task.type === 'video'))
        .slice(-3)
      const pendingTaskHint = pendingTasks.length > 0
        ? `\n\n## 待确认任务
${pendingTasks.map((task, i) => `  [待确认${i + 1}] ${task.type} | "${task.label || ''}" | 中文说明: "${(task.review_text || '').slice(0, 180)}" | prompt: "${(task.prompt || '').slice(0, 220)}" | 画幅: ${task.ratio || ''}`).join('\n')}
如果用户是在修改这些待确认任务（例如“改成水彩风”“不要红色”“换成16:9”），请基于最近的待确认任务输出一个新的待确认 task，不要直接生成，也不要删除旧任务。`
        : ''

      const defaultRatio = genSettings?.ratio || config?.general?.defaultRatio || '1:1'
      const defaultStyle = genSettings?.style || config?.general?.defaultStyle || ''
      const defaultNegPrompt = config?.providers?.image?.defaultNegPrompt?.trim() || ''
      const defaultDuration = parseDurationSeconds(config?.general?.defaultDuration, 5)
      const customSystemPrompt = provider?.customSystemPrompt?.trim() || ''
      const generationMode = genSettings?.generationMode || 'image'
      const modeRule = generationMode === 'video'
        ? `\n## 当前功能区：视频
- 只允许 intent=chat|generate_video|image_to_video。
- 如果用户要求生成图片、画图、出图或修图，不要创建 image task；请用 reply 提醒用户切换到生图区。
- tasks 中只能出现 type="video"。`
        : `\n## 当前功能区：生图
- 只允许 intent=chat|generate_image|modify_image。
- 如果用户要求生成视频、动画或图生视频，不要创建 video task；请用 reply 提醒用户切换到视频区。
- tasks 中只能出现 type="image"。`
      const styleHint = defaultStyle ? `\n用户当前选择的风格预设：${defaultStyle}。生成图片时，prompt 必须融入这个风格的视觉特征。` : ''

      const baseSystem = `你是 Gravuresse，专业 AI 创意设计工作流 Agent。你主要是一个对话助手，只在用户明确要求时才触发图片/视频生成。

## 当前画布
${canvas ? canvas.allAssets?.slice(0, 10).map(a => `  [${a.id}] "${a.label}" | ${a.type} | ${a.prompt?.slice(0, 80)}`).join('\n') || '（空）' : '（空）'}
${modifyHint}${refHint}${pendingTaskHint}${styleHint}
${modeRule}

## 响应格式（只输出纯JSON，不要markdown代码块）
{"understanding":"一句话理解用户意图","intent":"chat|generate_image|modify_image|generate_video|image_to_video","tasks":[{"id":"t1","type":"image|video","label":"中文短标签","review_text":"中文创作说明，供用户确认，描述主体/画面/镜头/构图/风格/光线/色彩/情绪/关键细节；视频还要写运动和时长；如果用户描述不足，明确列出你补足的默认假设","prompt":"高质量英文prompt，80词以上，含主体/场景/镜头/构图/光线/色彩/材质/情绪/细节","negative_prompt":${JSON.stringify(defaultNegPrompt || 'low quality, blurry, deformed, watermark, text')},"source_image_id":null,"duration":${defaultDuration},"ratio":"${defaultRatio}"}],"reply":"中文友好回复，提醒用户先审查中文创作说明，确认后再点击生成"}

## 规则（严格执行）
1. 默认 intent=chat，tasks=[]。绝大多数对话都是纯聊天。
2. 只有用户明确使用了生成/创作类动词时才触发生成。触发词包括："生成图片"、"画一张"、"创建图片"、"做一张图"、"设计一张"、"generate"、"create an image"、"draw"、"make a picture"、"帮我画"、"出图"、"来一张"、"生成一个"。
3. 如果用户只是描述了一个画面、场景、故事，但没有明确要求生成图片/视频，则 intent=chat，不要生成。
4. 如果用户说"生成视频"、"做个动画"、"make a video"，才用 intent=generate_video。
5. 选中资产说修改时：intent=modify_image，source_image_id填资产ID。
6. 选中图片说动起来时：intent=image_to_video，tasks.type=video。
7. prompt必须英文，80词以上，具体描述镜头/光线/材质/色彩。
8. 每个生成 task 必须提供 review_text。review_text 必须中文，写给用户审查，不要混入英文 prompt；用户描述不足时，必须说明你补足的默认假设。
9. reply必须中文，不要声称已经生成完成，只说明这是待确认方案，并提醒用户审查中文创作说明后点击确认生成。
10. 不确定时，默认走 chat，不要猜测用户想生成。
11. modify_image 时，新 prompt 必须基于上次 prompt 做增量修改，保留用户没提到的部分。
12. 如果用户修改上一条待确认任务，输出新的待确认 task，旧任务留在历史中。`

      const system = customSystemPrompt ? `${baseSystem}\n\n## Custom System Prompt\n${customSystemPrompt}` : baseSystem
      const result = await callChatProvider({
        action: 'chat',
        providerId: resolveProviderId('chat', provider.id),
        messages: history,
        system,
        thinking,
        model: provider.model,
        baseUrl: provider.baseUrl,
        accountId: provider.accountId
      }, { history, system, thinking, provider })

      let replyText = result.text
      const thinkingText = result.thinking || ''
      let parsed = null
      try {
        // 非贪婪匹配：找第一个完整的 JSON 对象
        const jsonMatch = result.text.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/)
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
      } catch {}

      const allowedTasks = parsed?.tasks?.filter(task => taskAllowedInMode(task, generationMode)) || []
      if (allowedTasks.length > 0) {
        const referenceIds = references?.map(r => r.id).filter(Boolean) || []
        const forcedSourceImageId = genSettings?.sourceImageId || null
        const tasksData = allowedTasks.map(task => {
          const sourceImageId = cleanId(task.source_image_id) || cleanId(forcedSourceImageId)
          const sourceAsset = sourceImageId
            ? sourceAssets.find(asset => asset.id === sourceImageId) || references?.find(asset => asset.id === sourceImageId)
            : null
          const type = task.type === 'video' ? 'video' : 'image'
          const selectedStyle = type === 'image' ? cleanText(defaultStyle, 120).trim() : ''
          const prompt = selectedStyle ? appendStyleToPrompt(task.prompt, selectedStyle) : cleanText(task.prompt)
          return {
            status: 'pending',
            type,
            label: cleanText(task.label, 120) || (type === 'video' ? t('video', lang) : t('image', lang)),
            review_text: cleanText(task.review_text),
            prompt,
            negative_prompt: cleanText(task.negative_prompt || defaultNegPrompt),
            ratio: cleanText(task.ratio, 50) || defaultRatio,
            duration: parseDurationSeconds(task.duration, defaultDuration),
            source_image_id: sourceImageId,
            sourceImageUrl: sanitizeAssetUrl(task.sourceImageUrl || sourceAsset?.url || '', 'image'),
            intent: cleanText(parsed.intent, 100),
            resolution: genSettings?.resolution || '1024',
            sourceAssetIds: uniqueIds([...idList(task.sourceAssetIds), sourceImageId]),
            promptReferenceAssetIds: referenceIds,
            parentAssetId: cleanId(genSettings?.parentAssetId) || cleanId(task.parentAssetId) || sourceImageId || null,
            createdFrom: cleanText(genSettings?.createdFrom, 100) || 'chat',
            styleDirection: cleanText(genSettings?.styleDirection || selectedStyle, 500)
          }
        })
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
    return true
  }, [config, canvas, appendMessage, canWriteToCurrentConversation, thinking, providerLists])

  const doGenerate = useCallback(async (msgId, task, lang, placeholderId, taskIndex, originConversationId) => {
    const startTime = Date.now()
    const idx = taskIndex ?? 0
    const updateTask = (patch) => patchTask(originConversationId, msgId, idx, patch)

    if (task.type === 'image') {
      const imgProvider = config?.providers?.image
      const providerDef = findProviderDef('image', providerLists, imgProvider.id) || IMG_PROVIDERS.find(p => p.id === imgProvider.id)
      if (!imgProvider?.id || !hasProviderCredential(imgProvider, providerDef)) throw new Error(t('configImageApi', lang))
      const protocol = imgProvider.protocol || providerDef?.protocol || 'openai_image'
      const safeTask = coerceTaskForProvider('image', providerDef, task)
      const negativePrompt = task.negative_prompt || imgProvider.defaultNegPrompt || ''
      const sourceAsset = safeTask.source_image_id ? getAssetFromConversation(originConversationId, safeTask.source_image_id) : null
      const sourceImageUrl = task.sourceImageUrl || sourceAsset?.url || ''
      precheckGeneration('image', providerDef, { ...safeTask, negative_prompt: negativePrompt }, { lang })
      const imageParams = {
        prompt: safeTask.prompt, ratio: safeTask.ratio || '1:1', resolution: safeTask.resolution || '1024',
        negative_prompt: negativePrompt,
        sourceImageUrl,
        ...imgProvider, protocol
      }
      const url = await generateImageProvider({
        action: 'generate',
        providerId: resolveProviderId('image', imgProvider.id),
        prompt: imageParams.prompt,
        ratio: imageParams.ratio,
        resolution: imageParams.resolution,
        negative_prompt: imageParams.negative_prompt,
        sourceImageUrl: imageParams.sourceImageUrl,
        source_image_url: imageParams.sourceImageUrl,
        model: imageParams.model,
        baseUrl: imageParams.baseUrl,
        accountId: imageParams.accountId
      }, imageParams)
      const elapsed = Math.round((Date.now() - startTime) / 1000)
      if (!canWriteToConversation(originConversationId)) return
      const providerForGeneration = { ...imgProvider, id: resolveProviderId('image', imgProvider.id) }
      const generation = buildGenerationMeta({
        task: { ...safeTask, negative_prompt: negativePrompt },
        provider: providerForGeneration,
        mode: 'image'
      })
      let assetId = placeholderId
      if (placeholderId) {
        updateAssetInConversation(originConversationId, placeholderId, {
          url,
          prompt: safeTask.prompt,
          negativePrompt,
          label: safeTask.label,
          model: imgProvider.model,
          ratio: safeTask.ratio,
          resolution: safeTask.resolution || '1024',
          _generating: false,
          generation
        })
      } else {
        const asset = addAssetToConversation(originConversationId, {
          type: 'image',
          url,
          prompt: safeTask.prompt,
          negativePrompt,
          label: safeTask.label,
          model: imgProvider.model,
          ratio: safeTask.ratio,
          resolution: safeTask.resolution || '1024',
          generation
        })
        assetId = asset?.id
      }
      if (canWriteToCurrentConversation(originConversationId) && assetId) {
        lastImageContext.current = {
          conversationId: originConversationId,
          prompt: safeTask.prompt,
          ratio: safeTask.ratio || '1:1',
          assetId
        }
      }
      updateTask({ status: 'done', assetId, elapsed, ratio: safeTask.ratio, resolution: safeTask.resolution })
      if (config?.general?.autoSaveImage === true) {
        try { await window.electronAPI.saveAssetToDisk?.({ url, label: task.label, type: 'image' }) } catch {}
      }
    } else if (task.type === 'video') {
      if (config?.general?.enableVideo !== true) throw new Error(t('videoDisabled', lang))
      const vidProvider = config?.providers?.video
      const providerDef = findProviderDef('video', providerLists, vidProvider.id) || VID_PROVIDERS.find(p => p.id === vidProvider.id)
      if (!vidProvider?.id || !hasProviderCredential(vidProvider, providerDef)) throw new Error(t('configVideoApi', lang))
      const protocol = vidProvider.protocol || providerDef?.protocol || 'ark_video_task'
      const provider = { ...vidProvider, protocol }
      const sourceAsset = task.source_image_id ? getAssetFromConversation(originConversationId, task.source_image_id) : null
      const sourceImageUrl = task.sourceImageUrl || sourceAsset?.url || ''
      const duration = parseDurationSeconds(task.duration, parseDurationSeconds(config?.general?.defaultDuration, 5))
      precheckGeneration('video', providerDef, { ...task, duration }, { sourceImageUrl, mode: task.intent, lang })
      const videoParams = {
        prompt: task.prompt, ratio: task.ratio || '1:1', duration,
        sourceImageUrl,
        ...provider
      }
      const result = await submitVideoProvider({
        action: 'submit',
        providerId: resolveProviderId('video', provider.id),
        prompt: videoParams.prompt,
        ratio: videoParams.ratio,
        duration: videoParams.duration,
        sourceImageUrl: videoParams.sourceImageUrl,
        model: videoParams.model,
        baseUrl: videoParams.baseUrl,
        accountId: videoParams.accountId
      }, videoParams)
      if (!result?.taskId) throw new Error(result?.error || 'Video task was not created')
      if (!canWriteToConversation(originConversationId)) return
      const status = result.status === 'running' ? 'running' : 'queued'
      const submittedTaskId = result.taskId
      const videoTask = {
        ...task,
        duration,
        sourceAssetIds: uniqueIds([...idList(task.sourceAssetIds), task.source_image_id, sourceAsset?.id]),
        parentAssetId: task.parentAssetId || sourceAsset?.id || null,
        taskId: submittedTaskId
      }
      const queuedTask = onVideoTaskCreated?.({
        taskId: result.taskId,
        prompt: task.prompt,
        label: task.label,
        provider,
        autoSave: config?.general?.autoSave !== false,
        onComplete: (result) => {
          if (!canWriteToConversation(originConversationId)) return null
          const generation = buildGenerationMeta({
            task: videoTask,
            provider: { ...provider, id: resolveProviderId('video', provider.id) },
            mode: 'video',
            taskId: submittedTaskId
          })
          const asset = addAssetToConversation(originConversationId, {
            type: 'video',
            url: result.videoUrl,
            prompt: task.prompt,
            label: task.label,
            model: provider.model,
            ratio: task.ratio,
            duration,
            generation
          })
          if (asset) updateTask({ status: 'done', assetId: asset.id })
          return asset
        },
        onFail: (error) => updateTask({ status: 'error', error })
      })
      const elapsed = Math.round((Date.now() - startTime) / 1000)
      updateTask({ status, taskId: result.taskId, queueId: queuedTask?.id, elapsed })
    }
  }, [config, canvas, onVideoTaskCreated, canWriteToConversation, canWriteToCurrentConversation, addAssetToConversation, updateAssetInConversation, patchTask, providerLists, getAssetFromConversation])

  const regenerateDirectly = useCallback(async (asset, lang, options = {}) => {
    const originConversationId = options.conversationId || activeConversationIdRef.current
    if (!originConversationId) return
    if (asset.type && asset.type !== 'image') return

    const task = {
      id: 't1',
      type: asset.type || 'image',
      label: asset.label || t('regenerate', lang),
      prompt: asset.generation?.prompt || asset.prompt || '',
      ratio: asset.generation?.ratio || asset.ratio || config?.general?.defaultRatio || '1:1',
      negative_prompt: asset.generation?.negativePrompt || asset.negativePrompt || '',
      resolution: asset.resolution || asset.generation?.resolution || '1024',
      duration: asset.duration || asset.generation?.duration,
      parentAssetId: asset.id,
      sourceAssetIds: uniqueIds([asset.id, ...idList(asset.generation?.sourceAssetIds)]),
      createdFrom: 'regenerate'
    }

    const userMsg = {
      id: nextId(),
      role: 'user',
      content: t('regenerateMessage', lang).replace('{prompt}', task.prompt),
      createdAt: new Date().toISOString()
    }
    const replyMsg = { id: nextId(), role: 'assistant', content: `${t('regenerate', lang)}「${task.label}」`, tasks: [task], createdAt: new Date().toISOString() }
    const msgId = replyMsg.id

    appendMessage(originConversationId, userMsg)
    appendMessage(originConversationId, replyMsg)

    const placeholderId = task.type === 'image'
      ? addPlaceholderToConversation(originConversationId, task.label, { generation: buildGenerationMeta({ task, provider: {}, mode: 'image' }) })
      : null
    try {
      await doGenerate(msgId, task, lang, placeholderId, 0, originConversationId)
    } catch (e) {
      console.error('Regenerate failed:', e)
      if (!canWriteToConversation(originConversationId)) return
      if (placeholderId) removeAssetFromConversation(originConversationId, placeholderId)
      patchTask(originConversationId, msgId, 0, { status: 'error', error: e.message })
    }
  }, [config, addPlaceholderToConversation, doGenerate, canWriteToConversation, removeAssetFromConversation, patchTask, appendMessage])

  const createDerivedImageDirectly = useCallback(async (asset, lang, options = {}) => {
    const originConversationId = options.conversationId || activeConversationIdRef.current
    if (!originConversationId || asset.type === 'video') return
    const basePrompt = asset.generation?.prompt || asset.prompt || ''
    if (!basePrompt.trim()) return

    const createdFrom = options.createdFrom || 'variation'
    const styleDirection = options.styleDirection?.trim()
    const instruction = createdFrom === 'restyle'
      ? `Restyle the same subject and composition in this visual direction: ${styleDirection}. Keep the core subject, framing, and intent recognizable while changing the visual style, material feel, color palette, lighting, and atmosphere.`
      : 'Create a new image in the same series. Keep the core subject, composition, style language, and quality bar recognizable, while varying details such as pose, lighting, environment accents, surface details, or secondary elements.'
    const task = {
      id: 't1',
      type: 'image',
      label: `${asset.label || t('image', lang)} · ${t(createdFrom === 'restyle' ? 'restyle' : 'variation', lang)}`,
      prompt: `${basePrompt}\n\n${instruction}`,
      ratio: asset.generation?.ratio || asset.ratio || config?.general?.defaultRatio || '1:1',
      negative_prompt: asset.generation?.negativePrompt || asset.negativePrompt || '',
      resolution: asset.resolution || asset.generation?.resolution || '1024',
      parentAssetId: asset.id,
      sourceAssetIds: [],
      promptReferenceAssetIds: uniqueIds([asset.id, ...idList(asset.generation?.promptReferenceAssetIds)]),
      createdFrom,
      styleDirection: styleDirection || ''
    }
    const userMsg = {
      id: nextId(),
      role: 'user',
      content: createdFrom === 'restyle'
        ? `${t('restyle', lang)}：${styleDirection}`
        : t('variation', lang),
      createdAt: new Date().toISOString()
    }
    const replyMsg = {
      id: nextId(),
      role: 'assistant',
      content: `${t(createdFrom === 'restyle' ? 'restyle' : 'variation', lang)}「${asset.label || ''}」`,
      tasks: [task],
      createdAt: new Date().toISOString()
    }
    const msgId = replyMsg.id

    appendMessage(originConversationId, userMsg)
    appendMessage(originConversationId, replyMsg)

    const placeholderId = addPlaceholderToConversation(originConversationId, task.label, { generation: buildGenerationMeta({ task, provider: {}, mode: 'image' }) })
    try {
      await doGenerate(msgId, task, lang, placeholderId, 0, originConversationId)
    } catch (e) {
      console.error('Derived image generation failed:', e)
      if (!canWriteToConversation(originConversationId)) return
      removeAssetFromConversation(originConversationId, placeholderId)
      patchTask(originConversationId, msgId, 0, { status: 'error', error: e.message })
    }
  }, [config, addPlaceholderToConversation, doGenerate, canWriteToConversation, removeAssetFromConversation, patchTask, appendMessage])

  const confirmGenerate = useCallback(async (msgId, task, taskIndex) => {
    const originConversationId = activeConversationIdRef.current
    if (!originConversationId) return
    const lang = config?.general?.language || 'zh'
    const idx = taskIndex ?? 0
    if (task.type === 'video') {
      if (config?.general?.enableVideo !== true) {
        patchTask(originConversationId, msgId, idx, { status: 'error', error: t('videoDisabled', lang) })
        return
      }
      const duration = `${parseDurationSeconds(task.duration, parseDurationSeconds(config?.general?.defaultDuration, 5))}s`
      const model = config?.providers?.video?.model || t('noConfig', lang)
      const ratio = task.ratio || '1:1'
      const message = t('videoCostConfirm', lang)
        .replace('{model}', model)
        .replace('{duration}', duration)
        .replace('{ratio}', ratio)
      if (!window.confirm(message)) return
    }
    const startTime = Date.now()
    patchTask(originConversationId, msgId, idx, { status: 'generating', startTime })
    const placeholderId = task.type === 'image'
      ? addPlaceholderToConversation(originConversationId, task.label || t('generating', lang), { generation: buildGenerationMeta({ task, provider: {}, mode: 'image' }) })
      : null
    try {
      await doGenerate(msgId, task, lang, placeholderId, idx, originConversationId)
    } catch (e) {
      console.error('Generation failed:', e)
      if (!canWriteToConversation(originConversationId)) return
      if (placeholderId) removeAssetFromConversation(originConversationId, placeholderId)
      patchTask(originConversationId, msgId, idx, { status: 'error', error: e.message })
    }
  }, [config, doGenerate, addPlaceholderToConversation, canWriteToConversation, removeAssetFromConversation, patchTask])

  const batchGenerate = useCallback(async (msgId, task, count, taskIndex) => {
    const originConversationId = activeConversationIdRef.current
    if (!originConversationId) return
    const lang = config?.general?.language || 'zh'
    const idx = taskIndex ?? 0
    const startTime = Date.now()
    patchTask(originConversationId, msgId, idx, { status: 'generating', startTime, batchTotal: count, batchDone: 0 })

    const placeholderIds = []
    for (let i = 0; i < count; i++) {
      const itemTask = count > 1 ? { ...task, label: `${task.label} #${i + 1}` } : task
      placeholderIds.push(addPlaceholderToConversation(originConversationId, `${task.label || t('generating', lang)} #${i + 1}`, {
        generation: buildGenerationMeta({ task: itemTask, provider: {}, mode: 'image' })
      }))
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
  }, [config, addPlaceholderToConversation, doGenerate, canWriteToConversation, removeAssetFromConversation, patchTask])

  const retryErroredTask = useCallback(async (msgId, task, taskIndex, lang) => {
    const idx = taskIndex ?? 0
    const conversationId = activeConversationIdRef.current
    patchTask(conversationId, msgId, idx, { status: 'pending', error: undefined })
    await doGenerate(msgId, { ...task, status: 'pending', error: undefined }, lang, undefined, idx, conversationId)
  }, [patchTask, doGenerate])

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

  return { messages, loading, send, clear, confirmGenerate, batchGenerate, regenerateDirectly, createDerivedImageDirectly, retryErroredTask, setMessages: setMessagesDirectly, lastImageContext, thinking, setThinking }
}
