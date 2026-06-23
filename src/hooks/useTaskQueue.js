import { useState, useCallback, useRef, useEffect } from 'react'

function getVideoProviderId(id) {
  return id === 'jimeng_vid' ? 'volcengine' : id
}

async function pollVideoTask(task) {
  if (!window.electronAPI?.providerAPI?.call) {
    return window.electronAPI.pollVideoTask(task.taskId, task.provider)
  }
  const result = await window.electronAPI.providerAPI.call({
    action: 'poll',
    providerId: getVideoProviderId(task.provider?.id),
    taskId: task.taskId,
    model: task.provider?.model,
    baseUrl: task.provider?.baseUrl
  })
  if (!result?.ok) {
    if (['UNKNOWN_PROVIDER', 'UNSUPPORTED_ACTION', 'NO_HANDLER'].includes(result?.error?.code)) {
      return window.electronAPI.pollVideoTask(task.taskId, task.provider)
    }
    throw new Error(result?.error?.message || 'Video polling failed')
  }
  return result.data
}

export default function useTaskQueue(canvas) {
  const [tasks, setTasks] = useState([])
  const pollingRef = useRef({})
  const cancelledRef = useRef(new Set())
  const inFlightRef = useRef(new Set())
  const runTokenRef = useRef({})
  const canvasRef = useRef(canvas)
  canvasRef.current = canvas

  const clearPolling = useCallback((id) => {
    if (pollingRef.current[id]) {
      clearTimeout(pollingRef.current[id])
      delete pollingRef.current[id]
    }
  }, [])

  const cleanupTaskRefs = useCallback((id) => {
    clearPolling(id)
    cancelledRef.current.delete(id)
    delete runTokenRef.current[id]
  }, [clearPolling])

  const hasInFlight = useCallback((id) => {
    for (const key of inFlightRef.current) {
      if (key.startsWith(`${id}:`)) return true
    }
    return false
  }, [])

  // Cleanup all polling timers on unmount
  useEffect(() => {
    return () => {
      Object.values(pollingRef.current).forEach(clearTimeout)
      pollingRef.current = {}
      cancelledRef.current = new Set()
      inFlightRef.current = new Set()
      runTokenRef.current = {}
    }
  }, [])

  const startPolling = useCallback((task) => {
    clearPolling(task.id)
    const runToken = (runTokenRef.current[task.id] || 0) + 1
    runTokenRef.current[task.id] = runToken
    const poll = async () => {
      if (cancelledRef.current.has(task.id) || runTokenRef.current[task.id] !== runToken) return
      clearPolling(task.id)
      const inFlightKey = `${task.id}:${runToken}`
      inFlightRef.current.add(inFlightKey)
      try {
        const result = await pollVideoTask(task)
        if (cancelledRef.current.has(task.id) || runTokenRef.current[task.id] !== runToken) return
        const status = String(result.status || '').toLowerCase()
        const progressValue = Number(result.progress) || 0
        const progress = progressValue > 0 && progressValue <= 1 ? Math.round(progressValue * 100) : progressValue
        const succeeded = status === 'succeeded'
        const hasVideoUrl = Boolean(result.videoUrl)
        const failed = status === 'failed'
        setTasks(prev => prev.map(t => t.id === task.id ? {
          ...t, status: succeeded && hasVideoUrl ? 'completed' : failed ? 'failed' : 'running',
          progress, videoUrl: result.videoUrl || t.videoUrl, error: result.error || t.error
        } : t))
        if (succeeded && hasVideoUrl) {
          const asset = await task.onComplete?.(result)
          if (asset && task.autoSave !== false) {
            try { await window.electronAPI.saveAssetToDisk?.({ url: result.videoUrl, label: task.label, type: 'video' }) } catch {}
          }
          cleanupTaskRefs(task.id)
          return
        }
        if (failed) {
          task.onFail?.(result.error || 'Video task failed')
          cleanupTaskRefs(task.id)
          return
        }
        const interval = Number(task.provider?.pollInterval)
        pollingRef.current[task.id] = setTimeout(poll, Number.isFinite(interval) && interval > 0 ? interval : 3000)
      } catch (e) {
        if (cancelledRef.current.has(task.id) || runTokenRef.current[task.id] !== runToken) return
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'failed', error: e.message } : t))
        task.onFail?.(e.message)
        cleanupTaskRefs(task.id)
      } finally {
        inFlightRef.current.delete(inFlightKey)
        if (cancelledRef.current.has(task.id) && !hasInFlight(task.id)) cleanupTaskRefs(task.id)
      }
    }
    const initialInterval = Number(task.provider?.pollInterval)
    pollingRef.current[task.id] = setTimeout(poll, Number.isFinite(initialInterval) && initialInterval > 0 ? initialInterval : 2000)
  }, [cleanupTaskRefs, clearPolling, hasInFlight])

  const add = useCallback((task) => {
    const item = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      taskId: task.taskId, prompt: task.prompt, label: task.label || '视频生成',
      provider: task.provider, status: 'pending', progress: 0, videoUrl: '', error: '',
      onComplete: task.onComplete, onFail: task.onFail, autoSave: task.autoSave,
      createdAt: new Date().toISOString()
    }
    setTasks(prev => [item, ...prev])
    startPolling(item)
    return item
  }, [startPolling])

  const retry = useCallback((task) => {
    clearPolling(task.id)
    cancelledRef.current.delete(task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'pending', progress: 0, error: '' } : t))
    startPolling(task)
  }, [clearPolling, startPolling])

  const remove = useCallback((id) => {
    const hadInFlight = hasInFlight(id)
    if (hadInFlight) cancelledRef.current.add(id)
    clearPolling(id)
    delete runTokenRef.current[id]
    setTasks(prev => prev.filter(t => t.id !== id))
    if (!hadInFlight) cancelledRef.current.delete(id)
  }, [clearPolling, hasInFlight])

  return { tasks, add, retry, remove }
}
