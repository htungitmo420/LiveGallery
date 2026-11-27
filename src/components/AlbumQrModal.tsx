import { useEffect, useMemo, useState } from 'react'
import { useLocale } from '../i18n/useLocale'
import type { GalleryAlbum } from '../lib/gallery'
import { encodeQrCode, qrMatrixToSvgPath } from '../lib/qrCode'
import { Icon, ViewfinderCorners } from './Chrome'

interface Props {
  album: Pick<GalleryAlbum, 'shareCode' | 'title'>
  shareUrl: string
  onClose: () => void
}

export function AlbumQrModal({ album, shareUrl, onClose }: Props) {
  const { messages } = useLocale()
  const [copiedTarget, setCopiedTarget] = useState<'link' | 'code' | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const qrSvg = useMemo(() => {
    try {
      return qrMatrixToSvgPath(encodeQrCode(shareUrl), 4)
    } catch {
      return null
    }
  }, [shareUrl])

  const copyText = async (value: string, target: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedTarget(target)
      window.setTimeout(() => {
        setCopiedTarget((current) => (current === target ? null : current))
      }, 1800)
    } catch {
      setCopiedTarget(null)
    }
  }

  const displayCode = album.shareCode.toUpperCase()

  return (
    <div
      className="save-photo-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="presentation"
    >
      <div
        aria-labelledby="album-qr-title"
        aria-modal="true"
        className="save-photo-modal qr-modal"
        role="dialog"
      >
        <div className="save-photo-modal__header">
          <div>
            <p className="save-photo-modal__tag">{messages.qrModal.tag}</p>
            <h2 id="album-qr-title">{messages.qrModal.title}</h2>
          </div>
          <button
            aria-label={messages.qrModal.closeAria}
            className="save-photo-modal__icon-close"
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="save-photo-modal__frame qr-modal__stage">
          <ViewfinderCorners />
          <div className="qr-modal__card">
            {qrSvg ? (
              <svg
                aria-label={messages.qrModal.qrAlt(album.title)}
                className="qr-modal__svg"
                role="img"
                shapeRendering="crispEdges"
                viewBox={`0 0 ${qrSvg.viewBoxSize} ${qrSvg.viewBoxSize}`}
              >
                <rect fill="#ffffff" height={qrSvg.viewBoxSize} width={qrSvg.viewBoxSize} x="0" y="0" />
                <path d={qrSvg.pathData} fill="#11100f" />
              </svg>
            ) : null}
            <div className="qr-modal__stamp">
              <strong>#{displayCode}</strong>
              <span>{album.title}</span>
            </div>
          </div>
        </div>

        <p className="save-photo-modal__hint">{messages.qrModal.hint}</p>

        <div className="save-photo-modal__actions">
          <button
            className="save-photo-modal__primary qr-modal__action"
            onClick={() => void copyText(shareUrl, 'link')}
            type="button"
          >
            <Icon name={copiedTarget === 'link' ? 'check' : 'copy'} size={16} />
            <span>{copiedTarget === 'link' ? messages.qrModal.copiedLink : messages.qrModal.copyLink}</span>
          </button>
          <button
            className="save-photo-modal__secondary qr-modal__action"
            onClick={() => void copyText(displayCode, 'code')}
            type="button"
          >
            <Icon name={copiedTarget === 'code' ? 'check' : 'copy'} size={16} />
            <span>{copiedTarget === 'code' ? messages.qrModal.copiedCode : messages.qrModal.copyCode}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
