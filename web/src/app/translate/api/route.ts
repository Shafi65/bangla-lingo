// POST /translate/api: machine translation for text the course doesn't cover.
// POST handlers are never prerendered or cached; other methods get 405 from Next.
import { handleTranslate } from "@/lib/translate/machine";

export async function POST(request: Request): Promise<Response> {
  return handleTranslate(request);
}
