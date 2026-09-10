type EmptyStateProps = {
  message: string;
  className?: string;
};

export function EmptyState({ message, className }: EmptyStateProps) {
  return (
    <p className={className ?? "text-sm text-zinc-500"}>{message}</p>
  );
}
