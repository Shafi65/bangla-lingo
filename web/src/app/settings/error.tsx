"use client";

import Link from "next/link";
import { useEffect } from "react";
import { StatusScreen } from "@/components/ui/StatusScreen";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <StatusScreen
      bn="ভুল"
      bnGloss="bhul: wrong"
      title="This screen didn’t load"
      actions={
        <>
          <button type="button" autoFocus className="btn btn-primary w-full" onClick={() => retry()}>
            Try again
          </button>
          <Link href="/" className="btn btn-ghost w-full">
            Back to the course
          </Link>
        </>
      }
    >
      Your progress is saved on this device. Trying again usually fixes it; if not, reload the page.
    </StatusScreen>
  );
}
