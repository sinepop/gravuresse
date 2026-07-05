import { useEffect, useState } from 'react'
import Ic from './icons'
import useSafeMediaUrl from '../hooks/useSafeMediaUrl'

export default function AssetCard({ asset, selected, onClick, onContextMenu }) {
  const [mediaError, setMediaError] = useState(false)
  const isVideo = asset.type === 'video'
  const model = asset.generation?.model || asset.model || ''
  const { src } = useSafeMediaUrl(asset.url, asset.type)

  useEffect(() => {
    setMediaError(false)
  }, [asset.id, src])

  return (
    <div onClick={() => onClick(asset.id)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, asset) }}
      className={`asset-card ${selected ? 'selected' : ''}`}
    >
      <div className="asset-card-media">
        {src && !mediaError ? (
          isVideo ? (
            <video src={src} muted playsInline preload="metadata" className="asset-card-image" onError={() => setMediaError(true)} />
          ) : (
            <img src={src} alt={asset.label} className="asset-card-image" onError={() => setMediaError(true)} />
          )
        ) : (
          <div className="asset-card-fallback">
            <Ic n={asset.type === 'video' ? 'film' : 'image'} size={20} />
          </div>
        )}
        {selected && (
          <div className="asset-card-selected-badge">
            <Ic n="check" size={10} color="var(--text-white)" sw={3} />
          </div>
        )}
        {asset.isMaterial && (
          <div style={{
            position: 'absolute', top: 6, left: 6, width: 20, height: 20,
            borderRadius: '50%', background: 'var(--overlay-dark)',
            border: '1px solid var(--border-white-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(8px)'
          }}>
            <Ic n="star" size={11} color="var(--accent)" sw={2.2} />
          </div>
        )}
      </div>
      <div className="asset-card-info">
        <div className="asset-card-label">{asset.label}</div>
        <div className="asset-card-model">{model}</div>
      </div>
    </div>
  )
}
