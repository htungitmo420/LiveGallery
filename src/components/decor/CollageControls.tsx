import { type ChangeEvent, useRef } from 'react'
import {
  COLLAGE_COLORS,
  COLLAGE_FORMATS,
  MAX_COLLAGE_ITEMS,
  collageSize,
  type CollageItem,
  type CollageSettings,
} from '../../decor'
import type { GalleryBackgroundAsset } from '../../lib/gallery'
import type { LocalBackground } from '../../lib/localBackgrounds'

interface CollageControlsProps {
  collage: CollageSettings
  selectedItem: CollageItem | null
  remoteBackgrounds: GalleryBackgroundAsset[]
  localBackgrounds: LocalBackground[]
  onPatchCollage: (changes: Partial<CollageSettings>) => void
  onUpdateItem: (id: string, changes: Partial<CollageItem>) => void
  onDeleteSelectedItem: (id: string) => void
  onChooseSingle: () => void
  onChooseTwo: () => void
  onAddCopy: () => void
  onAddLocalBackground: (event: ChangeEvent<HTMLInputElement>) => void
  onRemoveLocalBackground: (item: LocalBackground) => void
}

export function CollageControls({
  collage,
  selectedItem,
  remoteBackgrounds,
  localBackgrounds,
  onPatchCollage,
  onUpdateItem,
  onDeleteSelectedItem,
  onChooseSingle,
  onChooseTwo,
  onAddCopy,
  onAddLocalBackground,
  onRemoveLocalBackground,
}: CollageControlsProps) {
  const backgroundInputRef = useRef<HTMLInputElement>(null)
  const output = collageSize(collage.format)

  return (
    <>
      {selectedItem && (
        <div className="decor-sliders decor-sliders--top">
          <div className="decor-sliders__header">
            <strong>Dải ảnh đang chọn</strong>
            <div className="decor-quick-actions">
              <button
                onClick={() => onUpdateItem(selectedItem.id, { zIndex: Math.max(0, ...collage.items.map((item) => item.zIndex)) + 1 })}
                type="button"
              >
                Lên trước
              </button>
              <button disabled={collage.items.length >= MAX_COLLAGE_ITEMS} onClick={onAddCopy} type="button">Nhân bản</button>
              <button onClick={() => onUpdateItem(selectedItem.id, { rotation: 0 })} type="button">0°</button>
              <button
                className="danger"
                disabled={collage.items.length <= 1}
                onClick={() => onDeleteSelectedItem(selectedItem.id)}
                type="button"
              >
                Xóa
              </button>
            </div>
          </div>
          <label>
            <span>Kích thước <b>{Math.round(selectedItem.width * 100)}%</b></span>
            <input
              max={0.95}
              min={0.12}
              onChange={(event) => onUpdateItem(selectedItem.id, { width: Number(event.target.value) })}
              step={0.01}
              type="range"
              value={selectedItem.width}
            />
          </label>
          <label>
            <span>Xoay <b>{selectedItem.rotation}°</b></span>
            <input
              max={180}
              min={-180}
              onChange={(event) => onUpdateItem(selectedItem.id, { rotation: Number(event.target.value) })}
              type="range"
              value={selectedItem.rotation}
            />
          </label>
        </div>
      )}

      <div className="decor-section-title">
        <h2>Khổ nền</h2>
        <span className="decor-mono">{output.width} × {output.height} PX</span>
      </div>
      <div className="decor-format-grid">
        {COLLAGE_FORMATS.map((item) => (
          <button
            className={collage.format === item.id ? 'selected' : ''}
            key={item.id}
            onClick={() => onPatchCollage({ format: item.id })}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="decor-section-title">
        <h2>Màu & họa tiết</h2>
        <input
          aria-label="Màu nền tùy chỉnh"
          onChange={(event) => onPatchCollage({ background: event.target.value })}
          type="color"
          value={collage.background}
        />
      </div>
      <div className="decor-colors">
        {COLLAGE_COLORS.map((color) => (
          <button
            aria-label={`Chọn màu nền ${color}`}
            className={collage.background === color ? 'selected' : ''}
            key={color}
            onClick={() => onPatchCollage({ background: color })}
            style={{ background: color }}
            type="button"
          />
        ))}
      </div>
      <div className="decor-format-grid decor-format-grid--three">
        {(['solid', 'dots', 'grid'] as const).map((pattern) => (
          <button
            className={collage.pattern === pattern ? 'selected' : ''}
            key={pattern}
            onClick={() => onPatchCollage({ pattern })}
            type="button"
          >
            {pattern === 'solid' ? 'Trơn' : pattern === 'dots' ? 'Chấm' : 'Ô lưới'}
          </button>
        ))}
      </div>

      <div className="decor-section-title">
        <h2>Nền ảnh</h2>
        <button onClick={() => backgroundInputRef.current?.click()} type="button">+ Thêm từ máy</button>
      </div>
      <input
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={onAddLocalBackground}
        ref={backgroundInputRef}
        type="file"
      />
      <div className="decor-backgrounds">
        <button
          className={!collage.backgroundImageUrl ? 'selected' : ''}
          onClick={() => onPatchCollage({ backgroundImageUrl: undefined })}
          type="button"
        >
          <span style={{ background: collage.background }} />
          Chỉ màu
        </button>
        {remoteBackgrounds.map((item) => (
          <button
            className={collage.backgroundImageUrl === item.url ? 'selected' : ''}
            key={item.id}
            onClick={() => onPatchCollage({ backgroundImageUrl: item.url })}
            type="button"
          >
            <img alt="" crossOrigin="anonymous" src={item.url} />
            {item.name}
          </button>
        ))}
        {localBackgrounds.map((item) => (
          <div className="decor-local-background" key={item.id}>
            <button
              className={collage.backgroundImageUrl === item.url ? 'selected' : ''}
              onClick={() => onPatchCollage({ backgroundImageUrl: item.url })}
              type="button"
            >
              <img alt="" src={item.url} />
              {item.name}
            </button>
            <button
              aria-label={`Xóa nền ${item.name}`}
              onClick={() => onRemoveLocalBackground(item)}
              type="button"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="decor-section-title">
        <h2>Xếp photobooth</h2>
        <span className="decor-mono">{collage.items.length}/{MAX_COLLAGE_ITEMS}</span>
      </div>
      <div className="decor-format-grid decor-format-grid--three">
        <button onClick={onChooseSingle} type="button">Một dải giữa</button>
        <button onClick={onChooseTwo} type="button">Hai dải chéo</button>
        <button disabled={collage.items.length >= MAX_COLLAGE_ITEMS} onClick={onAddCopy} type="button">Lặp thêm</button>
      </div>

      <div className="decor-message-input">
        <label>
          Lời nhắn
          <input
            maxLength={80}
            onChange={(event) => onPatchCollage({ message: event.target.value })}
            placeholder="Nhập lời nhắn..."
            value={collage.message}
          />
        </label>
        <input
          aria-label="Màu chữ lời nhắn"
          onChange={(event) => onPatchCollage({ messageColor: event.target.value })}
          type="color"
          value={collage.messageColor}
        />
      </div>

      <div aria-label="Vị trí lời nhắn" className="decor-format-grid decor-format-grid--two" role="group">
        {([['top', 'Phía trên'], ['bottom', 'Phía dưới']] as const).map(([position, label]) => (
          <button
            className={(collage.messagePosition ?? 'bottom') === position ? 'selected' : ''}
            key={position}
            onClick={() => onPatchCollage({ messagePosition: position })}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
    </>
  )
}
