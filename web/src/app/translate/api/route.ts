// /translate/api: machine translation for text the course doesn't cover.
//   POST         translate (see lib/translate/machine.ts); never prerendered or cached.
//   GET ?health=1  { configured: boolean }; reads the request URL, so it runs at request time
//                  (under Cache Components a handler that doesn't touch the request is prerendered,
//                  which would freeze the answer at build time).
// Every other GET gets 405. The route is also disallowed in robots.txt and sends X-Robots-Tag: noindex.
import { handleTranslate } from "@/lib/translate/machine";

export async function GET(request: Request): Promise<Response> {
  return handleTranslate(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleTranslate(request);
}
