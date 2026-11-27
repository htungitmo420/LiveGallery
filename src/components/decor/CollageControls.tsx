import { type ChangeEvent, useRef } from 'react'
import {
  COLLAGE_COLORS,
  COLLAGE_FORMATS,
  MAX_COLLAGE_ITEMS,
  collageSize,
  type CollageItem,
  type CollageSettings,
} from '../../decor'
import { useLocale } from '../../i18n/useLocale'
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
  const { messages } = useLocale()
  const backgroundInputRef = useRef<HTMLInputElement>(null)
  const output = collageSize(collage.format)

  return (
    <>
      {selectedItem && (
        <div className="decor-sliders decor-sliders--top">
          <div className="decor-sliders__header">
            <strong>{messages.decor.selectedStripTitle}</strong>
            <div className="decor-quick-actions">
              <button
                onClick={() => onUpdateItem(selectedItem.id, { zIndex: Math.max(0, ...collage.items.map((item) => item.zIndex)) + 1 })}
                type="button"
              >
                {messages.decor.bringFront}
              </button>
              <button disabled={collage.items.length >= MAX_COLLAGE_ITEMS} onClick={onAddCopy} type="button">{messages.decor.duplicate}</button>
              <button onClick={() => onUpdateItem(selectedItem.id, { rotation: 0 })} type="button">0°</button>
              <button
                className="danger"
                disabled={collage.items.length <= 1}
                onClick={() => onDeleteSelectedItem(selectedItem.id)}
                type="button"
              >
                {messages.decor.delete}
              </button>
            </div>
          </div>
          <label>
            <span>{messages.decor.sizeLabel} <b>{Math.round(selectedItem.width * 100)}%</b></span>
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
            <span>{messages.decor.rotateLabel} <b>{selectedItem.rotation}°</b></span>
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
        <h2>{messages.decor.canvasFormatTitle}</h2>
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
        <h2>{messages.decor.colorAndPatternTitle}</h2>
        <input
          aria-label={messages.decor.customBgColorAria}
          onChange={(event) => onPatchCollage({ background: event.target.value })}
          type="color"
          value={collage.background}
        />
      </div>
      <div className="decor-colors">
        {COLLAGE_COLORS.map((color) => (
          <button
            aria-label={messages.decor.chooseBgColorAria(color)}
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
            {messages.decor.patterns[pattern]}
          </button>
        ))}
      </div>

      <div className="decor-section-title">
        <h2>{messages.decor.backgroundImageTitle}</h2>
        <button onClick={() => backgroundInputRef.current?.click()} type="button">{messages.decor.addFromDevice}</button>
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
          {messages.decor.colorOnly}
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
              aria-label={messages.decor.deleteBgAria(item.name)}
              onClick={() => onRemoveLocalBackground(item)}
              type="button"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="decor-section-title">
        <h2>{messages.decor.arrangeTitle}</h2>
        <span className="decor-mono">{collage.items.length}/{MAX_COLLAGE_ITEMS}</span>
      </div>
      <div className="decor-format-grid decor-format-grid--three">
        <button onClick={onChooseSingle} type="button">{messages.decor.singleStrip}</button>
        <button onClick={onChooseTwo} type="button">{messages.decor.twoStrips}</button>
        <button disabled={collage.items.length >= MAX_COLLAGE_ITEMS} onClick={onAddCopy} type="button">{messages.decor.addCopy}</button>
      </div>

      <div className="decor-message-input">
        <label>
          {messages.decor.messageLabel}
          <input
            maxLength={80}
            onChange={(event) => onPatchCollage({ message: event.target.value })}
            placeholder={messages.decor.messagePlaceholder}
            value={collage.message}
          />
        </label>
        <input
          aria-label={messages.decor.messageColorAria}
          onChange={(event) => onPatchCollage({ messageColor: event.target.value })}
          type="color"
          value={collage.messageColor}
        />
      </div>

      <div aria-label={messages.decor.messagePositionAria} className="decor-format-grid decor-format-grid--two" role="group">
        {([['top', messages.decor.positionTop], ['bottom', messages.decor.positionBottom]] as const).map(([position, label]) => (
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
