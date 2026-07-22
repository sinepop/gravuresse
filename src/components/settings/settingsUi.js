// @ts-check

/** @param {string} lang @param {string} zh @param {string} en */
export function localText(lang, zh, en) {
  return lang === 'en' ? en : zh
}

/** @returns {React.CSSProperties} */
export const labelS = () => ({
  display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13,
  color: 'var(--text-secondary)', fontFamily: 'var(--font-body)',
  fontWeight: 400, letterSpacing: '0.2px'
})

/** @returns {React.CSSProperties} */
export const inputS = () => ({
  background: 'var(--bg-input)', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', padding: '9px 12px', color: 'var(--text-primary)',
  fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none',
  transition: 'all 0.2s ease', lineHeight: 1.5
})

/** @returns {React.CSSProperties} */
export const selectS = () => ({
  ...inputS(), appearance: 'auto', cursor: 'pointer', fontFamily: 'var(--font-body)'
})

/** @param {boolean} primary @returns {React.CSSProperties} */
export const btnS = (primary) => ({
  padding: '8px 22px',
  background: primary ? 'var(--accent-gradient)' : 'var(--bg-surface)',
  border: primary ? 'none' : '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  color: primary ? 'var(--text-white)' : 'var(--text-secondary)',
  fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)',
  fontWeight: primary ? 600 : 400, transition: 'all 0.2s ease',
  boxShadow: primary ? 'var(--shadow-accent), inset 0 1px 0 rgba(255,255,255,0.12)' : 'none'
})
