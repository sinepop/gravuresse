// @ts-check

import { t } from '../../i18n'
import { labelS, localText, selectS } from './settingsUi.js'

/** @typedef {import('../../types/domain').ConfigPayload} ConfigPayload */
/** @typedef {Record<string, unknown>} UnknownRecord */
/** @typedef {(section: string, patch: unknown) => void} SettingsChange */

/** @param {unknown} value @returns {value is UnknownRecord} */
function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

/** @param {unknown} value @returns {UnknownRecord} */
function recordOf(value) {
  return isRecord(value) ? value : {}
}

/** @param {unknown} value @returns {string} */
function text(value) {
  return typeof value === 'string' ? value : ''
}

/** @param {{ config: ConfigPayload, onChange: SettingsChange, lang: string }} props */
export function AppearancePage({ config, onChange, lang }) {
  const general = recordOf(config.general)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label style={labelS()}>
        {t('theme', lang)}
        <select value={text(general.theme) || 'light'} onChange={event => onChange('general', { theme: event.target.value })} style={selectS()}>
          <option value="dark">{t('dark', lang)}</option>
          <option value="light">{t('light', lang)}</option>
          <option value="system">{t('system', lang)}</option>
        </select>
      </label>
      <label style={labelS()}>
        {t('fontSize', lang)}
        <select value={text(general.fontSize) || 'medium'} onChange={event => onChange('general', { fontSize: event.target.value })} style={selectS()}>
          <option value="small">{t('small', lang)}</option>
          <option value="medium">{t('medium', lang)}</option>
          <option value="large">{t('large', lang)}</option>
        </select>
      </label>
    </div>
  )
}

/** @param {{ config: ConfigPayload, onChange: SettingsChange, lang: string }} props */
export function LangPage({ config, onChange, lang }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label style={labelS()}>
        {t('language', lang)}
        <select value={text(recordOf(config.general).language) || 'zh'} onChange={event => onChange('general', { language: event.target.value })} style={selectS()}>
          <option value="zh">中文</option>
          <option value="en">English</option>
        </select>
      </label>
    </div>
  )
}

const STYLE_OPTIONS = [
  { value: 'flat illustration', zh: '扁平插画', en: 'Flat illustration' },
  { value: '3D render', zh: '3D 渲染', en: '3D render' },
  { value: 'realistic photography', zh: '写实摄影', en: 'Realistic photography' },
  { value: 'watercolor painting', zh: '水彩画', en: 'Watercolor' },
  { value: 'anime style', zh: '动漫风', en: 'Anime' },
  { value: 'pixel art', zh: '像素艺术', en: 'Pixel art' },
  { value: 'oil painting', zh: '油画', en: 'Oil painting' },
  { value: 'minimalism', zh: '极简主义', en: 'Minimalism' },
  { value: 'cyberpunk', zh: '赛博朋克', en: 'Cyberpunk' },
  { value: 'paper cutout', zh: '剪纸', en: 'Paper cutout' }
]

/** @param {{ config: ConfigPayload, onChange: SettingsChange, lang: string }} props */
export function OtherPage({ config, onChange, lang }) {
  const general = recordOf(config.general)
  const locale = lang === 'en' ? 'en' : 'zh'
  const timeout = typeof general.apiTimeout === 'number' || typeof general.apiTimeout === 'string' ? general.apiTimeout : 60000
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>{localText(lang, '生成默认设置', 'Generation Defaults')}</div>
      <label style={labelS()}>
        {t('defaultRatio', lang)}
        <select value={text(general.defaultRatio) || '1:1'} onChange={event => onChange('general', { defaultRatio: event.target.value })} style={selectS()}>
          {['1:1', '4:3', '3:4', '16:9', '9:16', '3:2'].map(ratio => <option key={ratio} value={ratio}>{ratio}</option>)}
        </select>
      </label>
      <label style={labelS()}>
        {t('defaultStyle', lang)}
        <select value={text(general.defaultStyle)} onChange={event => onChange('general', { defaultStyle: event.target.value })} style={selectS()}>
          <option value="">{localText(lang, '无风格', 'No style')}</option>
          {STYLE_OPTIONS.map(style => <option key={style.value} value={style.value}>{style[locale]}</option>)}
        </select>
      </label>
      <label style={labelS()}>
        {localText(lang, '默认分辨率', 'Default Resolution')}
        <select value={text(general.defaultResolution) || '1024'} onChange={event => onChange('general', { defaultResolution: event.target.value })} style={selectS()}>
          <option value="1024">{localText(lang, '标准', 'Standard')}</option>
          <option value="1536">{localText(lang, '高清', 'High')}</option>
          <option value="2048">{localText(lang, '超清', 'Ultra HD')}</option>
          <option value="2560">2K</option>
          <option value="3840">4K</option>
        </select>
      </label>
      <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '4px 0' }} />
      <Toggle checked={general.autoSave !== false} onChange={checked => onChange('general', { autoSave: checked })} label={t('autoSave', lang)} />
      <Toggle checked={general.autoSaveImage === true} onChange={checked => onChange('general', { autoSaveImage: checked })} label={t('autoSaveImages', lang)} />
      <Toggle checked={general.enableReference === true} onChange={checked => onChange('general', { enableReference: checked })} label={t('enableReference', lang)} detail={t('enableReferenceDesc', lang)} />
      <Toggle checked={general.enableVideo === true} onChange={checked => onChange('general', { enableVideo: checked })} label={t('enableVideo', lang)} detail={t('enableVideoDesc', lang)} />
      <label style={labelS()}>
        {t('apiTimeout', lang)}
        <select value={timeout} onChange={event => onChange('general', { apiTimeout: Number(event.target.value) })} style={selectS()}>
          <option value={30000}>{t('sec30', lang)}</option>
          <option value={60000}>{t('sec60', lang)}</option>
          <option value={120000}>{t('sec120', lang)}</option>
        </select>
      </label>
    </div>
  )
}

/** @param {{ checked: boolean, onChange: (checked: boolean) => void, label: string, detail?: string }} props */
function Toggle({ checked, onChange, label, detail }) {
  return (
    <label style={{ ...labelS(), flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      <div>
        <div>{label}</div>
        {detail && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{detail}</div>}
      </div>
    </label>
  )
}
