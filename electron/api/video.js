const { request } = require('./http')

async function submitArk(params) {
  const { prompt, sourceImageUrl, apiKey, baseUrl, model } = params
  const base = (baseUrl || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '')
  const body = { model: model || 'doubao-seedance-2-0-pro-250528', content: [{ type: 'text', text: prompt }] }
  if (sourceImageUrl) body.content.push({ type: 'image_url', image_url: { url: sourceImageUrl } })
  const url = new URL(`${base}/contents/generations/tasks`)
  const res = await request(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  }, body)
  const json = JSON.parse(res.data)
  if (json.error) throw new Error(json.error.message)
  return { taskId: json.id || json.task_id, status: 'pending' }
}

async function pollArk(taskId, apiKey, baseUrl) {
  const base = (baseUrl || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '')
  const url = new URL(`${base}/contents/generations/tasks/${taskId}`)
  const res = await request(url, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${apiKey}` }
  })
  const json = JSON.parse(res.data)
  return { status: json.status || 'unknown', progress: json.progress || 0, videoUrl: json.content?.[0]?.video_url || json.output?.video_url || '', error: json.error?.message }
}

async function submitRunway(params) {
  const { prompt, sourceImageUrl, apiKey, baseUrl, model, duration } = params
  const base = (baseUrl || 'https://api.dev.runwayml.com').replace(/\/$/, '')
  const body = { model: model || 'gen4_turbo', promptText: prompt }
  if (sourceImageUrl) body.image = sourceImageUrl
  if (duration) body.duration = Math.min(duration, 10)
  const url = new URL(`${base}/v1/image_to_video`)
  const res = await request(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Runway-Version': '2024-11-06' }
  }, body)
  const json = JSON.parse(res.data)
  if (json.error) throw new Error(json.error.message)
  return { taskId: json.id, status: 'pending' }
}

async function pollRunway(taskId, apiKey, baseUrl) {
  const base = (baseUrl || 'https://api.dev.runwayml.com').replace(/\/$/, '')
  const url = new URL(`${base}/v1/tasks/${taskId}`)
  const res = await request(url, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'X-Runway-Version': '2024-11-06' }
  })
  const json = JSON.parse(res.data)
  return { status: json.status || 'unknown', progress: json.progress || 0, videoUrl: json.output?.[0] || '', error: json.error?.message }
}

async function submitHappyHorse(params) {
  const { prompt, sourceImageUrl, apiKey, baseUrl } = params
  const base = (baseUrl || 'https://happyhorse.app').replace(/\/$/, '')
  const body = { prompt }
  if (sourceImageUrl) body.source_image = sourceImageUrl
  const url = new URL(`${base}/v1/generate`)
  const res = await request(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  }, body)
  const json = JSON.parse(res.data)
  if (json.error) throw new Error(json.error.message)
  return { taskId: json.id || json.task_id, status: 'pending' }
}

async function pollHappyHorse(taskId, apiKey, baseUrl) {
  const base = (baseUrl || 'https://happyhorse.app').replace(/\/$/, '')
  const url = new URL(`${base}/v1/task/${taskId}`)
  const res = await request(url, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${apiKey}` }
  })
  const json = JSON.parse(res.data)
  return { status: json.status || 'unknown', progress: json.progress || 0, videoUrl: json.video_url || json.output?.video_url || '', error: json.error?.message }
}

async function submit(params) {
  const proto = params.protocol || 'ark_video_task'
  if (proto === 'runway_task') return submitRunway(params)
  if (proto === 'happyhorse_task') return submitHappyHorse(params)
  return submitArk(params)
}

async function poll(taskId, provider) {
  const proto = provider.protocol || 'ark_video_task'
  if (proto === 'runway_task') return pollRunway(taskId, provider.apiKey, provider.baseUrl)
  if (proto === 'happyhorse_task') return pollHappyHorse(taskId, provider.apiKey, provider.baseUrl)
  return pollArk(taskId, provider.apiKey, provider.baseUrl)
}

module.exports = { submit, poll }
