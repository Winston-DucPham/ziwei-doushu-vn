export default function ReadingPending() {
  return (
    <div role="status" className="flex items-center gap-2 py-2 text-xs" style={{ color: 'var(--t-text2)' }}>
      <span aria-hidden="true" className="reading-pending-dots"><i /><i /><i /></span>
      Đang chuẩn bị câu trả lời…
    </div>
  );
}
