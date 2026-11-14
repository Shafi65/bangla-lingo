import Link from "next/link";
import { StatusScreen } from "@/components/ui/StatusScreen";

export default function NotFound() {
  return (
    <StatusScreen
      bn="কোথায়?"
      bnGloss="kothay: where?"
      title="This page isn't on the map"
      actions={
        <>
          <Link href="/" className="btn btn-primary w-full">
            Back to the course
          </Link>
          <Link href="/practice" className="btn btn-ghost w-full">
            Practice instead
          </Link>
        </>
      }
    >
      The link may be old, or the lesson may have moved. Every lesson is on the course map.
    </StatusScreen>
  );
}
