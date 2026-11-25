"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    // Phones get the native share sheet (WhatsApp, Messages…); desktops copy.
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Nancy", text: "Come and read with me on Nancy:", url: link });
        return;
      } catch {
        // Cancelled or unsupported: fall through to copy.
      }
    }
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex gap-2">
      <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Your invite link" />
      <Button type="button" onClick={share}>
        {copied ? "Copied" : "Share"}
      </Button>
    </div>
  );
}
