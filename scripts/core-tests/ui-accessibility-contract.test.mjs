import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const read = relativePath => readFileSync(join(ROOT, relativePath), 'utf8')

const settingsSource = read('src/components/Settings.jsx')
const assetCardSource = read('src/components/AssetCard.jsx')
const chatPanelSource = read('src/components/ChatPanel.jsx')
const cssSource = read('src/styles/global.css')

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => Number.parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = luminance(foreground)
  const backgroundLuminance = luminance(background)
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
}

test('settings dialog owns initial focus, traps Tab, and restores the opener', () => {
  assert.match(settingsSource, /const FOCUSABLE_SELECTOR =/)
  assert.match(settingsSource, /previousFocusRef/)
  assert.match(settingsSource, /dialogTitleRef\.current\?\.focus/)
  assert.match(settingsSource, /event\.key !== 'Tab'/)
  assert.match(settingsSource, /document\.addEventListener\('focusin'/)
  assert.match(settingsSource, /previousFocus\.focus\(\{ preventScroll: true \}\)/)
  assert.match(settingsSource, /aria-labelledby="settings-dialog-title"/)
})

test('active general settings expose media auto-save toggles', () => {
  assert.match(settingsSource, /label=\{t\('autoSaveImages', lang\)\}/)
  assert.match(settingsSource, /autoSaveImage: value/)
  assert.match(settingsSource, /label=\{t\('autoSaveVideos', lang\)\}/)
  assert.match(settingsSource, /autoSaveVideo: value/)
})

test('asset and conversation selection expose native keyboard controls', () => {
  assert.match(assetCardSource, /<button[\s\S]{0,300}type="button"[\s\S]{0,300}className=\{`asset-card/)
  assert.match(assetCardSource, /aria-pressed=\{selected\}/)
  assert.match(chatPanelSource, /<button[\s\S]{0,250}className="conversation-select-button"/)
  assert.match(chatPanelSource, /aria-current=\{conv\.id === activeConvId \? 'true' : undefined\}/)
  assert.match(chatPanelSource, /aria-label=\{t\('renameConversation', lang\)\}/)
  assert.match(chatPanelSource, /aria-label=\{t\('deleteConversation', lang\)\}/)
})

test('reference thumbnails and icon-only composer controls have accessible names', () => {
  assert.match(chatPanelSource, /<button[\s\S]{0,250}className="reference-asset-button"/)
  assert.match(chatPanelSource, /aria-pressed=\{references\.some\(reference => reference\.id === asset\.id\)\}/)
  assert.match(chatPanelSource, /aria-label=\{lang === 'en' \? 'Remove reference image' : '移除参考图'\}/)
  assert.match(chatPanelSource, /aria-label=\{lang === 'en' \? 'Send message' : '发送消息'\}/)
})

test('muted and ghost text remain readable on every light and dark theme surface', () => {
  const muted = [...cssSource.matchAll(/--text-muted:\s*(#[0-9A-F]{6})/gi)].map(match => match[1])
  const ghost = [...cssSource.matchAll(/--text-ghost:\s*(#[0-9A-F]{6})/gi)].map(match => match[1])
  assert.equal(muted.length, 4, 'root, explicit dark, system dark, and system light must define muted text')
  assert.equal(ghost.length, 4, 'root, explicit dark, system dark, and system light must define ghost text')

  const surfaces = ['#E9EDF2', '#20252C', '#20252C', '#E9EDF2']
  for (let index = 0; index < surfaces.length; index += 1) {
    assert.ok(contrastRatio(muted[index], surfaces[index]) >= 4.5, `muted token ${index} must reach 4.5:1`)
    assert.ok(contrastRatio(ghost[index], surfaces[index]) >= 4.5, `ghost token ${index} must reach 4.5:1`)
  }
})

test('minimum-width navigation wraps labels and exposes horizontal toolbar scrolling', () => {
  const navLabelBlock = /\.module-nav-button span\s*\{([^}]*)\}/.exec(cssSource)?.[1] || ''
  assert.doesNotMatch(navLabelBlock, /white-space:\s*nowrap/)
  assert.match(navLabelBlock, /overflow-wrap:\s*anywhere/)

  const toolbarScrollbarBlock = /\.canvas-toolbar::\-webkit-scrollbar\s*\{([^}]*)\}/.exec(cssSource)?.[1] || ''
  assert.doesNotMatch(toolbarScrollbarBlock, /display:\s*none/)
  assert.match(toolbarScrollbarBlock, /height:\s*[4-9]px/)
})
