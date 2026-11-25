"use client";

import { useState } from "react";

/**
 * Share a word page: the phone's share sheet where there is one (WhatsApp, Messenger, IMO…),
 * otherwise copy the link. A WhatsApp link is offered alongside for desktop browsers.
 */
export function ShareButton({ url, text }: { url: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className="btn btn-primary !px-5 !text-base"
        onClick={async () => {
          try {
            if (navigator.share) {
              await navigator.share({ title: text, text, url });
              return;
            }
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // Cancelled share sheet or blocked clipboard: nothing to do.
          }
        }}
      >
        {copied ? "Link copied" : "Share"}
      </button>
      <a
        className="btn btn-ghost !px-5 !text-base"
        href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Send on WhatsApp
      </a>
    </div>
  );
}
