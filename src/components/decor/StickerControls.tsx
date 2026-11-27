import {
  MAX_STICKERS,
  STICKER_CATEGORIES,
  type DecorStickerAsset,
  type PlacedSticker,
  type StickerCategory,
} from '../../decor'
import { useLocale } from '../../i18n/useLocale'

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
  const { messages } = useLocale()

  return (
    <>
      {selectedSticker && (
        <div className="decor-sliders decor-sliders--top">
          <div className="decor-sliders__header">
            <strong>{messages.decor.editingSticker(selectedSticker.name)}</strong>
            <div className="decor-quick-actions">
              <button onClick={() => onUpdateSticker(selectedSticker.placementId, { flipX: !selectedSticker.flipX })} type="button">{messages.decor.flip}</button>
              <button onClick={() => onDuplicateSticker(selectedSticker)} type="button">{messages.decor.duplicate}</button>
              <button onClick={() => onUpdateSticker(selectedSticker.placementId, { rotation: 0 })} type="button">0°</button>
              <button
                className="danger"
                onClick={() => onDeleteSticker(selectedSticker.placementId)}
                type="button"
              >
                {messages.decor.delete}
              </button>
              <button onClick={onClearSelection} type="button">{messages.decor.done}</button>
            </div>
          </div>
          <label>
            <span>{messages.decor.sizeLabel} <b>{Math.round(selectedSticker.size * 100)}%</b></span>
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
            <span>{messages.decor.rotateLabel} <b>{selectedSticker.rotation}°</b></span>
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
        <h2>{messages.decor.chooseStickerTitle}</h2>
        <div className="decor-section-meta">
          <span className="decor-mono">
            {stickersCount}/{MAX_STICKERS} · {hasRemoteStickers ? messages.decor.remoteAndBuiltIn : messages.decor.builtInOnly}
          </span>
          {stickersCount > 0 && (
            <button
              className="decor-clear-button"
              onClick={onClearAll}
              type="button"
            >
              {messages.decor.clearAll}
            </button>
          )}
        </div>
      </div>

      <div aria-label={messages.decor.stickerCategoriesAria} className="decor-categories" role="tablist">
        {STICKER_CATEGORIES.map((category) => (
          <button
            aria-selected={stickerCategory === category.id}
            className={stickerCategory === category.id ? 'selected' : ''}
            key={category.id}
            onClick={() => onSelectCategory(category.id)}
            role="tab"
            type="button"
          >
            {messages.decor.categories[category.id]}
          </button>
        ))}
      </div>

      <div className={selectedSticker ? 'decor-sticker-library decor-sticker-library--compact' : 'decor-sticker-library'}>
        {visibleAssets.map((asset) => (
          <button
            aria-label={messages.decor.addStickerAria(asset.name)}
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
        {messages.decor.stickerHelpMobile}
        <span className="desktop-only">{messages.decor.stickerHelpDesktop}</span>
      </p>
    </>
  )
}
