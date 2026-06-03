import AssetCard from './AssetCard'
import AssetDetail from './AssetDetail'
import Ic from './icons'

export default function CanvasPanel({ canvas, lang }) {
  const { assets, selectedAsset, selectedId, setSelectedId, viewMode, setViewMode, filter, setFilter } = canvas

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
          <button onClick={() => setViewMode('grid')} style={{ background: viewMode === 'grid' ? 'var(--accent-soft)' : 'transparent', border: '1px solid ' + (viewMode === 'grid' ? 'var(--border-accent)' : 'var(--border-subtle)'), borderRadius: 4, padding: '3px 8px', color: 'var(--text-secondary)', fontSize: 10, cursor: 'pointer' }}><Ic n="grid" size={12} /> 网格</button>
          <button onClick={() => setViewMode('free')} style={{ background: viewMode === 'free' ? 'var(--accent-soft)' : 'transparent', border: '1px solid ' + (viewMode === 'free' ? 'var(--border-accent)' : 'var(--border-subtle)'), borderRadius: 4, padding: '3px 8px', color: 'var(--text-secondary)', fontSize: 10, cursor: 'pointer' }}>自由</button>
          <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 4px' }} />
          {['all', 'image', 'video'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ background: filter === f ? 'var(--accent-soft)' : 'transparent', border: '1px solid ' + (filter === f ? 'var(--border-accent)' : 'var(--border-subtle)'), borderRadius: 4, padding: '3px 8px', color: 'var(--text-secondary)', fontSize: 10, cursor: 'pointer' }}>{f === 'all' ? '全部' : f === 'image' ? '图片' : '视频'}</button>
          ))}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{assets.length} 个资产</span>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {assets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <Ic n="image" size={32} color="var(--text-ghost)" />
              <div style={{ marginTop: 8, fontSize: 11 }}>画布为空</div>
              <div style={{ fontSize: 10, marginTop: 4 }}>在对话中描述你想创作的内容</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
              {assets.map(a => (
                <AssetCard key={a.id} asset={a} selected={a.id === selectedId} onClick={setSelectedId}
                  onContextMenu={(e, asset) => {}} />
              ))}
            </div>
          )}
        </div>
      </div>
      {selectedAsset && (
        <AssetDetail asset={selectedAsset} onClose={() => setSelectedId(null)}
          onDelete={() => canvas.removeAsset(selectedAsset.id)} onRegenerate={() => {}} lang={lang} />
      )}
    </div>
  )
}
