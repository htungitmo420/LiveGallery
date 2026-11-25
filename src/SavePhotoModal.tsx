import { useEffect } from 'react'
import { shareMediaFileImmediately } from './lib/gallery'

export interface ManualSaveState {
  file: File
  previewUrl: string
  canRetryShare?: boolean
}

interface Props {
  item: ManualSaveState | null
  onClose: () => void
  onShared?: () => void
}

export function SavePhotoModal({ item, onClose, onShared }: Props) {
  useEffect(() => {
    if (!item) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [item, onClose])

  if (!item) return null

  const handleShareClick = () => {
    void shareMediaFileImmediately(item.file).then((shared) => {
      if (shared) {
        onShared?.()
        onClose()
      }
    })
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
        aria-labelledby="save-photo-title"
        aria-modal="true"
        className="save-photo-modal"
        role="dialog"
      >
        <div className="save-photo-modal__header">
          <div>
            <p className="save-photo-modal__tag">LƯU VỀ ĐIỆN THOẠI</p>
            <h2 id="save-photo-title">Lưu vào mục Ảnh</h2>
          </div>
          <button
            aria-label="Đóng hộp thoại lưu ảnh"
            className="save-photo-modal__icon-close"
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="save-photo-modal__frame">
          <span className="vf-corner vf-corner--tl" aria-hidden="true" />
          <span className="vf-corner vf-corner--tr" aria-hidden="true" />
          <span className="vf-corner vf-corner--bl" aria-hidden="true" />
          <span className="vf-corner vf-corner--br" aria-hidden="true" />
          <img
            alt={item.file.name}
            className="save-photo-modal__image"
            src={item.previewUrl}
          />
        </div>

        <p className="save-photo-modal__hint">
          Nhấn giữ trực tiếp vào ảnh (khoảng 2 giây) rồi chọn{' '}
          <strong>“Lưu vào Ảnh”</strong> (iOS) hoặc{' '}
          <strong>“Tải hình ảnh”</strong> (Android) để lưu vào ứng dụng{' '}
          <strong>Ảnh</strong>.
        </p>

        <div className="save-photo-modal__actions">
          {item.canRetryShare && (
            <button
              className="save-photo-modal__primary"
              onClick={handleShareClick}
              type="button"
            >
              Mở menu Lưu vào Ảnh
            </button>
          )}
          <button
            className="save-photo-modal__secondary"
            onClick={onClose}
            type="button"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}
