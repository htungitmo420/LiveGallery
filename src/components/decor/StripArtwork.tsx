import type { PlacedSticker } from '../../decor'

export function StripArtwork({ source, stickers }: { source: string; stickers: PlacedSticker[] }) {
  return (
    <div className="decor-strip-artwork">
      <img alt="" crossOrigin="anonymous" draggable={false} src={source} />
      {stickers.slice().sort((a, b) => a.zIndex - b.zIndex).map((sticker) => (
        <span
          className="decor-sticker-render"
          key={sticker.placementId}
          style={{
            left: `${sticker.x * 100}%`,
            top: `${sticker.y * 100}%`,
            width: `${sticker.size * 100}%`,
            transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg)${sticker.flipX ? ' scaleX(-1)' : ''}`,
            zIndex: sticker.zIndex,
          }}
        >
          {sticker.kind === 'image' ? (
            <img alt="" crossOrigin="anonymous" draggable={false} src={sticker.content} />
          ) : (
            <span>{sticker.content}</span>
          )}
        </span>
      ))}
    </div>
  )
}
