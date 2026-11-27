export function padFrame(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatAlbumDate(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'long',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value))
}
