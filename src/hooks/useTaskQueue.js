import { useState, useCallback, useRef, useEffect } from 'react'

export default function useTaskQueue(canvas) {
  const [tasks, setTasks] = useState([])
  const pollingRef = useRef({})
  const canvasRef = useRef(canvas)
  canvasRef.current = canvas

  // Cleanup all polling timers on unmount
  useEffect(() => {
    return () => {
      Object.values(pollingRef.current).forEach(clearTimeout)
      pollingRef.current = {}
    }
  }, [])

  const startPolling = useCallback((task) => {
    const poll = async () => {
      try {
        const result = await window.electronAPI.pollVideoTask(task.taskId, task.provider)
        setTasks(prev => prev.map(t => t.id === task.id ? {
          ...t, status: result.status === 'succeeded' ? 'completed' : result.status === 'failed' ? 'failed' : 'running',
          progress: result.progress || 0, videoUrl: result.videoUrl || t.videoUrl, error: result.error || t.error
        } : t))
        if (result.status === 'succeeded' && result.videoUrl) {
          canvasRef.current.addAsset({ type: 'video', url: result.videoUrl, prompt: task.prompt, label: task.label, model: task.provider.model })
          return
        }
        if (result.status === 'failed') return
        pollingRef.current[task.id] = setTimeout(poll, 3000)
      } catch (e) {
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'failed', error: e.message } : t))
      }
    }
    pollingRef.current[task.id] = setTimeout(poll, 2000)
  }, [])

  const add = useCallback((task) => {
    const item = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      taskId: task.taskId, prompt: task.prompt, label: task.label || '视频生成',
      provider: task.provider, status: 'pending', progress: 0, videoUrl: '', error: '',
      createdAt: new Date().toISOString()
    }
    setTasks(prev => [item, ...prev])
    startPolling(item)
    return item
  }, [startPolling])

  const retry = useCallback((task) => {
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'pending', progress: 0, error: '' } : t))
    startPolling(task)
  }, [startPolling])

  const remove = useCallback((id) => {
    clearTimeout(pollingRef.current[id])
    setTasks(prev => prev.filter(t => t.id !== id))
  }, [])

  return { tasks, add, retry, remove }
}
