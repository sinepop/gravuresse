// @ts-check

import { useState, useCallback, useRef, useEffect } from 'react'
import { pollVideoTaskProvider } from '../utils/providerClient'

/** @typedef {import('../types/domain').VideoPollResult} VideoPollResult */
/** @typedef {import('../types/domain').VideoQueueTask} VideoQueueTask */
/** @typedef {import('../types/domain').VideoQueueTaskInput} VideoQueueTaskInput */
/** @typedef {Record<string, unknown>} UnknownRecord */

/** @param {unknown} value @returns {value is UnknownRecord} */
function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

/** @param {unknown} value @returns {string} */
function text(value) {
  return typeof value === 'string' ? value : ''
}

/** @param {unknown} value @returns {VideoPollResult} */
function normalizePollResult(value) {
  const record = isRecord(value) ? value : {}
  const progress = Number(record.progress)
  return {
    ...record,
    status: text(record.status).toLowerCase(),
    progress: Number.isFinite(progress) ? progress : 0,
    videoUrl: text(record.videoUrl),
    error: text(record.error)
  }
}

/** @param {unknown} error */
function errorMessage(error) {
  return isRecord(error) ? text(error.message) || 'Video task failed' : text(error) || 'Video task failed'
}

/** @param {unknown} canvas */
export default function useTaskQueue(canvas) {
  const [tasks, setTasks] = useState(/** @type {VideoQueueTask[]} */ ([]))
  const pollingRef = useRef(/** @type {Record<string, ReturnType<typeof setTimeout>>} */ ({}))
  const cancelledRef = useRef(/** @type {Set<string>} */ (new Set()))
  const inFlightRef = useRef(/** @type {Set<string>} */ (new Set()))
  const runTokenRef = useRef(/** @type {Record<string, number>} */ ({}))

  const clearPolling = useCallback(/** @param {string} id */ (id) => {
    if (pollingRef.current[id]) {
      clearTimeout(pollingRef.current[id])
      delete pollingRef.current[id]
    }
  }, [])

  const cleanupTaskRefs = useCallback(/** @param {string} id */ (id) => {
    clearPolling(id)
    cancelledRef.current.delete(id)
    delete runTokenRef.current[id]
  }, [clearPolling])

  const hasInFlight = useCallback(/** @param {string} id */ (id) => {
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

  const startPolling = useCallback(/** @param {VideoQueueTask} task */ (task) => {
    clearPolling(task.id)
    const runToken = (runTokenRef.current[task.id] || 0) + 1
    runTokenRef.current[task.id] = runToken
    const poll = async () => {
      if (cancelledRef.current.has(task.id) || runTokenRef.current[task.id] !== runToken) return
      clearPolling(task.id)
      const inFlightKey = `${task.id}:${runToken}`
      inFlightRef.current.add(inFlightKey)
      try {
        const result = normalizePollResult(await pollVideoTaskProvider(task))
        if (cancelledRef.current.has(task.id) || runTokenRef.current[task.id] !== runToken) return
        const status = result.status
        const progressValue = result.progress
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
            try { await window.electronAPI?.saveAssetToDisk?.({ url: result.videoUrl, label: task.label, type: 'video' }) } catch {}
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
        const message = errorMessage(e)
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'failed', error: message } : t))
        task.onFail?.(message)
        cleanupTaskRefs(task.id)
      } finally {
        inFlightRef.current.delete(inFlightKey)
        if (cancelledRef.current.has(task.id) && !hasInFlight(task.id)) cleanupTaskRefs(task.id)
      }
    }
    const initialInterval = Number(task.provider?.pollInterval)
    pollingRef.current[task.id] = setTimeout(poll, Number.isFinite(initialInterval) && initialInterval > 0 ? initialInterval : 2000)
  }, [cleanupTaskRefs, clearPolling, hasInFlight])

  const add = useCallback(/** @param {VideoQueueTaskInput} task */ (task) => {
    /** @type {VideoQueueTask} */
    const item = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      taskId: task.taskId, prompt: task.prompt || '', label: task.label || '视频生成',
      provider: task.provider, status: 'pending', progress: 0, videoUrl: '', error: '',
      onComplete: task.onComplete, onFail: task.onFail, autoSave: task.autoSave,
      createdAt: new Date().toISOString()
    }
    setTasks(prev => [item, ...prev])
    startPolling(item)
    return item
  }, [startPolling])

  const retry = useCallback(/** @param {VideoQueueTask} task */ (task) => {
    clearPolling(task.id)
    cancelledRef.current.delete(task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'pending', progress: 0, error: '' } : t))
    startPolling(task)
  }, [clearPolling, startPolling])

  const remove = useCallback(/** @param {string} id */ (id) => {
    const hadInFlight = hasInFlight(id)
    if (hadInFlight) cancelledRef.current.add(id)
    clearPolling(id)
    delete runTokenRef.current[id]
    setTasks(prev => prev.filter(t => t.id !== id))
    if (!hadInFlight) cancelledRef.current.delete(id)
  }, [clearPolling, hasInFlight])

  return { tasks, add, retry, remove }
}
