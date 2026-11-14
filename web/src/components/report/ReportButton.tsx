"use client";
// Report-a-problem button for the lesson feedback panel.
// Opens a compact modal <dialog> (native focus trap, Esc to close, focus restored)
// and then a pre-filled GitHub issue in a new tab. No personal data is sent.
import { useEffect, useId, useRef, useState } from "react";

const CATEGORIES = [
  "Wrong Bengali",
  "Wrong English",
  "Audio problem",
  "My answer should be accepted",
  "Other",
] as const;

const ISSUE_URL = "https://github.com/Shafi65/bangla-lingo/issues/new";
const MAX_URL = 6000;
const MAX_NOTE = 600;

/** Build the issue URL; the note is trimmed further if the URL would be too long. */
export function buildIssueUrl(args: {
  lessonId: string;
  exerciseId: string;
  category: string;
  note: string;
  path: string;
  userAgent: string;
}): string {
  const { lessonId, exerciseId, category, path, userAgent } = args;
  let note = args.note.trim().slice(0, MAX_NOTE);
  const make = (n: string) => {
    const body = [
      `**Lesson:** \`${lessonId}\``,
      `**Exercise:** \`${exerciseId}\``,
      `**Problem:** ${category}`,
      `**Note:** ${n || "(none)"}`,
      `**App path:** \`${path}\``,
      `**User agent:** \`${userAgent.slice(0, 250)}\``,
    ].join("\n\n");
    const title = `Content report: ${category} (${lessonId} / ${exerciseId})`;
    return (
      `${ISSUE_URL}?title=${encodeURIComponent(title)}` +
      `&body=${encodeURIComponent(body)}&labels=content-report`
    );
  };
  let url = make(note);
  while (url.length > MAX_URL && note.length > 0) {
    note = note.slice(0, Math.max(0, note.length - Math.ceil((url.length - MAX_URL) / 9) - 1));
    url = make(note);
  }
  return url;
}

export function ReportButton({ lessonId, exerciseId }: { lessonId: string; exerciseId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-enter-native
        onClick={() => setOpen(true)}
        className="rounded-lg px-1 text-sm font-bold text-muted underline hover:text-ink"
      >
        Report a problem
      </button>
      {open && (
        <ReportSheet lessonId={lessonId} exerciseId={exerciseId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function ReportSheet({
  lessonId,
  exerciseId,
  onClose,
}: {
  lessonId: string;
  exerciseId: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const [category, setCategory] = useState<string>("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) return;
    const url = buildIssueUrl({
      lessonId,
      exerciseId,
      category,
      note,
      path: window.location.pathname,
      userAgent: navigator.userAgent,
    });
    window.open(url, "_blank", "noopener,noreferrer");
    ref.current?.close();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${uid}-title`}
      onClose={onClose}
      // Keep lesson keyboard shortcuts (Enter, digits, Esc) from reaching the page behind.
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="m-auto w-[min(92vw,30rem)] max-h-[90dvh] overflow-y-auto rounded-3xl border-2 border-line bg-white p-5 text-ink backdrop:bg-black/40"
    >
      <form onSubmit={submit}>
        <h2 id={`${uid}-title`} className="text-xl font-black">
          Report a problem
        </h2>
        <p className="mt-1 text-sm font-semibold text-muted">
          What is wrong with this exercise? This opens a pre-filled GitHub issue (a free GitHub
          account is needed). Nothing personal is included.
        </p>

        <fieldset className="mt-4">
          <legend className="sr-only">Type of problem</legend>
          <div className="space-y-2">
            {CATEGORIES.map((c) => (
              <label
                key={c}
                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border-2 px-3 font-bold ${
                  category === c ? "border-brand bg-brand-light text-brand-dark" : "border-line bg-white"
                }`}
              >
                <input
                  type="radio"
                  name={`${uid}-cat`}
                  value={c}
                  checked={category === c}
                  onChange={() => setCategory(c)}
                  data-enter-native
                  className="h-5 w-5 accent-brand"
                />
                {c}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="mt-4 block">
          <span className="text-sm font-extrabold">Note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={MAX_NOTE}
            rows={3}
            data-enter-native
            placeholder="What should it say instead?"
            className="mt-1 w-full rounded-2xl border-2 border-line bg-white p-3 text-base font-semibold"
          />
        </label>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            data-enter-native
            className="btn btn-ghost !px-3 !text-base"
            onClick={() => ref.current?.close()}
          >
            Cancel
          </button>
          <button
            type="submit"
            data-enter-native
            disabled={!category}
            className="btn btn-primary !px-3 !text-base"
          >
            Open on GitHub
          </button>
        </div>
      </form>
    </dialog>
  );
}
