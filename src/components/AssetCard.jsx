import { useState } from 'react'
import Ic from './icons'

export default function AssetCard({ asset, selected, onClick, onContextMenu }) {
  const [mediaError, setMediaError] = useState(false)
  const isVideo = asset.type === 'video'
  return (
    <div onClick={() => onClick(asset.id)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, asset) }}
      className={`asset-card ${selected ? 'selected' : ''}`}
    >
      <div className="asset-card-media">
        {asset.url && !mediaError ? (
          isVideo ? (
            <video src={asset.url} muted playsInline preload="metadata" className="asset-card-image" onError={() => setMediaError(true)} />
          ) : (
            <img src={asset.url} alt={asset.label} className="asset-card-image" onError={() => setMediaError(true)} />
          )
        ) : (
          <div className="asset-card-fallback">{asset.type === 'video' ? '🎬' : '🖼️'}</div>
        )}
        {selected && (
          <div className="asset-card-selected-badge">
            <Ic n="check" size={10} color="var(--text-white)" sw={3} />
          </div>
        )}
      </div>
      <div className="asset-card-info">
        <div className="asset-card-label">{asset.label}</div>
        <div className="asset-card-model">{asset.model}</div>
      </div>
    </div>
  )
}
