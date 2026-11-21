"use client";

import { Suspense, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { SkeletonScreen } from "@/components/ui/StatusScreen";
import { canTestOut, type TestOutInfo } from "@/lib/checkpoint";
import { progressStore } from "@/lib/progress";
import type { Lesson } from "@/lib/types";
import type { TranslitMap } from "@/lib/translit";
import { LessonPlayer } from "./LessonPlayer";

const noop = () => () => {};

/**
 * A checkpoint lesson page. `?mode=testout` starts the test-out run, but only while this is the next
 * checkpoint ahead (see canTestOut); otherwise it is the ordinary lesson. The mode is decided once, on
 * the client after hydration, so passing (which finishes the covered lessons) never flips it mid-run.
 */
export function CheckpointLesson({
  lesson,
  translit,
  testOut,
}: {
  lesson: Lesson;
  translit?: TranslitMap;
  testOut: TestOutInfo;
}) {
  return (
    <Suspense fallback={<SkeletonScreen variant="lesson" />}>
      <Gate lesson={lesson} translit={translit} testOut={testOut} />
    </Suspense>
  );
}

function Gate(props: { lesson: Lesson; translit?: TranslitMap; testOut: TestOutInfo }) {
  // false while prerendering and hydrating: stored progress is only readable on the client.
  const ready = useSyncExternalStore(noop, () => true, () => false);
  return ready ? <Decided {...props} /> : <SkeletonScreen variant="lesson" />;
}

function Decided({ lesson, translit, testOut }: { lesson: Lesson; translit?: TranslitMap; testOut: TestOutInfo }) {
  const asked = useSearchParams().get("mode") === "testout";
  const [active] = useState(() => asked && canTestOut(testOut.order, progressStore.get().completed, lesson.id));
  return <LessonPlayer lesson={lesson} translit={translit} testOut={active ? testOut : undefined} />;
}
