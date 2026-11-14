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
      title="This lesson didn’t load"
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
      Nothing is lost: progress only changes when you finish a lesson. Try again, or pick another lesson from the map.
    </StatusScreen>
  );
}
