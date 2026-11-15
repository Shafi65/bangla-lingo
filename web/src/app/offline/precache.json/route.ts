import { connection } from "next/server";
import { getBuildId, getShellRoutes, listStaticAssets } from "@/lib/offline/server";

// What the service worker precaches. Read at request time because the build id and the
// hashed asset list only exist once `next build` has finished.
export async function GET() {
  await connection();
  return Response.json(
    {
      buildId: getBuildId(),
      routes: getShellRoutes(),
      assets: [...listStaticAssets(), "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
