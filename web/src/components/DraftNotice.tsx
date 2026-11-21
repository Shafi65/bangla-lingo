/** Quiet, static reminder that the course has not had a native-speaker review yet. */
export function DraftNotice({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs font-semibold text-muted ${className}`}>
      Draft course: lessons are not yet checked by a native speaker.
    </p>
  );
}
