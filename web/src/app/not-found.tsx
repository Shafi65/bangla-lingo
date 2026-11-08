import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
      <p lang="bn" className="text-6xl font-bold text-brand">হায়!</p>
      <h1 className="text-2xl font-black">We couldn&apos;t find that page</h1>
      <Link href="/" className="btn btn-primary">Back to the course</Link>
    </main>
  );
}
