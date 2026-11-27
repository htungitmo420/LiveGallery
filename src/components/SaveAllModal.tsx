import { useEffect, useState } from 'react'
import { useLocale } from '../i18n/useLocale'
import { shareMediaFilesImmediately, triggerStaggeredBrowserDownloads } from '../lib/gallery'
import { Icon, ViewfinderCorners } from './Chrome'

export interface SaveAllModalState {
  mode: 'ready-to-share' | 'manual'
  files: File[]
  skippedCount: number
}

interface Props {
  state: SaveAllModalState
  previews: readonly string[]
  shareUrl: string
  onClose: () => void
  onCompleted: (notice: string) => void
}

export function SaveAllModal({ state, previews, shareUrl, onClose, onCompleted }: Props) {
  const { messages } = useLocale()
  const [fallbackToManual, setFallbackToManual] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const mode = state.mode === 'manual' || fallbackToManual ? 'manual' : 'ready-to-share'

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const fileCount = state.files.length
  const visiblePreviews = previews.slice(0, 6)
  const extraCount = Math.max(0, fileCount - visiblePreviews.length)

  const handleShareNow = () => {
    if (busy) return
    setBusy(true)
    void shareMediaFilesImmediately(state.files).then((result) => {
      setBusy(false)
      if (result === 'shared') {
        const notice = state.skippedCount > 0
          ? messages.viewer.saveAllSharedPartialNotice(fileCount, state.skippedCount)
          : messages.viewer.saveAllSharedNotice(fileCount)
        onCompleted(notice)
        onClose()
      } else if (result === 'failed') {
        setFallbackToManual(true)
      }
    })
  }

  const handleDownloadFallback = async () => {
    if (busy) return
    setBusy(true)
    try {
      await triggerStaggeredBrowserDownloads(state.files)
      onCompleted(messages.viewer.saveAllDownloadedNotice(fileCount))
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopiedLink(true)
      window.setTimeout(() => setCopiedLink(false), 1800)
    } catch {
      setCopiedLink(false)
    }
  }

  return (
    <div
      className="save-photo-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="presentation"
    >
      <div
        aria-labelledby="save-all-title"
        aria-modal="true"
        className="save-photo-modal save-all-modal"
        role="dialog"
      >
        <div className="save-photo-modal__header">
          <div>
            <p className="save-photo-modal__tag">{messages.saveAllModal.tag}</p>
            <h2 id="save-all-title">
              {mode === 'ready-to-share'
                ? messages.saveAllModal.readyTitle(fileCount)
                : messages.saveAllModal.manualTitle}
            </h2>
          </div>
          <button
            aria-label={messages.saveAllModal.closeAria}
            className="save-photo-modal__icon-close"
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {visiblePreviews.length > 0 && (
          <div className="save-photo-modal__frame save-all-modal__strip">
            <ViewfinderCorners />
            <div className="save-all-modal__grid" aria-hidden="true">
              {visiblePreviews.map((url, index) => (
                <div className="save-all-modal__thumb" key={`${url}-${index}`}>
                  <img alt="" crossOrigin="anonymous" decoding="async" src={url} />
                </div>
              ))}
              {extraCount > 0 && (
                <div className="save-all-modal__more">+{extraCount}</div>
              )}
            </div>
          </div>
        )}

        <p className="save-photo-modal__hint">
          {mode === 'ready-to-share'
            ? messages.saveAllModal.readyHint(fileCount)
            : messages.saveAllModal.manualHint}
        </p>

        {state.skippedCount > 0 && mode === 'ready-to-share' && (
          <p className="save-all-modal__note">
            {messages.saveAllModal.skippedNote(state.skippedCount)}
          </p>
        )}

        <div className="save-photo-modal__actions save-all-modal__actions">
          {mode === 'ready-to-share' ? (
            <button
              className="save-photo-modal__primary qr-modal__action"
              disabled={busy}
              onClick={handleShareNow}
              type="button"
            >
              <Icon name="download-all" size={17} />
              <span>{messages.saveAllModal.shareNowAction(fileCount)}</span>
            </button>
          ) : (
            <>
              <button
                className="save-photo-modal__primary qr-modal__action"
                onClick={() => void handleCopyLink()}
                type="button"
              >
                <Icon name={copiedLink ? 'check' : 'copy'} size={16} />
                <span>
                  {copiedLink ? messages.saveAllModal.linkCopied : messages.saveAllModal.copyLinkHintAction}
                </span>
              </button>
              <button
                className="save-photo-modal__secondary qr-modal__action"
                disabled={busy}
                onClick={() => void handleDownloadFallback()}
                type="button"
              >
                <Icon name="download-all" size={16} />
                <span>{messages.saveAllModal.downloadFallbackAction(fileCount)}</span>
              </button>
            </>
          )}
          <button
            className="save-photo-modal__secondary"
            onClick={onClose}
            type="button"
          >
            {messages.saveAllModal.close}
          </button>
        </div>
      </div>
    </div>
  )
}
