export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface/50 px-6 py-10 text-center">
      <div className="text-3xl">📭</div>
      <div className="text-sm font-medium text-text">{title}</div>
      {body && <div className="max-w-[260px] text-xs text-muted">{body}</div>}
      {action}
    </div>
  );
}
