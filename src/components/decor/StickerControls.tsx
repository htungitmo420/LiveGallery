import {
  MAX_STICKERS,
  STICKER_CATEGORIES,
  type DecorStickerAsset,
  type PlacedSticker,
  type StickerCategory,
} from '../../decor'

interface StickerControlsProps {
  stickersCount: number
  hasRemoteStickers: boolean
  selectedSticker: PlacedSticker | null
  stickerCategory: 'all' | StickerCategory
  visibleAssets: DecorStickerAsset[]
  onSelectCategory: (category: 'all' | StickerCategory) => void
  onAddSticker: (asset: DecorStickerAsset) => void
  onUpdateSticker: (id: string, changes: Partial<PlacedSticker>) => void
  onDuplicateSticker: (sticker: PlacedSticker) => void
  onDeleteSticker: (id: string) => void
  onClearSelection: () => void
  onClearAll: () => void
}

export function StickerControls({
  stickersCount,
  hasRemoteStickers,
  selectedSticker,
  stickerCategory,
  visibleAssets,
  onSelectCategory,
  onAddSticker,
  onUpdateSticker,
  onDuplicateSticker,
  onDeleteSticker,
  onClearSelection,
  onClearAll,
}: StickerControlsProps) {
  return (
    <>
      {selectedSticker && (
        <div className="decor-sliders decor-sliders--top">
          <div className="decor-sliders__header">
            <strong>Đang chỉnh: {selectedSticker.name}</strong>
            <div className="decor-quick-actions">
              <button onClick={() => onUpdateSticker(selectedSticker.placementId, { flipX: !selectedSticker.flipX })} type="button">Lật</button>
              <button onClick={() => onDuplicateSticker(selectedSticker)} type="button">Nhân bản</button>
              <button onClick={() => onUpdateSticker(selectedSticker.placementId, { rotation: 0 })} type="button">0°</button>
              <button
                className="danger"
                onClick={() => onDeleteSticker(selectedSticker.placementId)}
                type="button"
              >
                Xóa
              </button>
              <button onClick={onClearSelection} type="button">Xong</button>
            </div>
          </div>
          <label>
            <span>Kích thước <b>{Math.round(selectedSticker.size * 100)}%</b></span>
            <input
              max={0.4}
              min={0.05}
              onChange={(event) => onUpdateSticker(selectedSticker.placementId, { size: Number(event.target.value) })}
              step={0.01}
              type="range"
              value={selectedSticker.size}
            />
          </label>
          <label>
            <span>Xoay <b>{selectedSticker.rotation}°</b></span>
            <input
              max={180}
              min={-180}
              onChange={(event) => onUpdateSticker(selectedSticker.placementId, { rotation: Number(event.target.value) })}
              type="range"
              value={selectedSticker.rotation}
            />
          </label>
        </div>
      )}

      <div className="decor-section-title">
        <h2>Chọn sticker</h2>
        <div className="decor-section-meta">
          <span className="decor-mono">{stickersCount}/{MAX_STICKERS} · {hasRemoteStickers ? 'Kho + có sẵn' : 'Có sẵn'}</span>
          {stickersCount > 0 && (
            <button
              className="decor-clear-button"
              onClick={onClearAll}
              type="button"
            >
              Xóa tất cả
            </button>
          )}
        </div>
      </div>

      <div aria-label="Danh mục sticker" className="decor-categories" role="tablist">
        {STICKER_CATEGORIES.map((category) => (
          <button
            aria-selected={stickerCategory === category.id}
            className={stickerCategory === category.id ? 'selected' : ''}
            key={category.id}
            onClick={() => onSelectCategory(category.id)}
            role="tab"
            type="button"
          >
            {category.name}
          </button>
        ))}
      </div>

      <div className={selectedSticker ? 'decor-sticker-library decor-sticker-library--compact' : 'decor-sticker-library'}>
        {visibleAssets.map((asset) => (
          <button
            aria-label={`Thêm sticker ${asset.name}`}
            key={asset.id}
            onClick={() => onAddSticker(asset)}
            title={asset.name}
            type="button"
          >
            {asset.kind === 'image' ? <img alt={asset.name} crossOrigin="anonymous" src={asset.content} /> : <span>{asset.content}</span>}
          </button>
        ))}
      </div>

      <p className={selectedSticker ? 'decor-help decor-help--selected' : 'decor-help'}>
        Kéo để di chuyển, dùng 2 ngón tay để phóng to / xoay, hoặc chạm nền để bỏ chọn.
        <span className="desktop-only"> Trên máy tính: Delete để xóa, Ctrl+C/Ctrl+V để sao chép.</span>
      </p>
    </>
  )
}
