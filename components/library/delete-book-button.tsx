"use client";

import { useState } from "react";
import { useStrings } from "@/lib/i18n/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function DeleteBookButton({ bookId, title }: { bookId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const t = useStrings();

  async function onDelete() {
    setDeleting(true);
    const res = await fetch(`/api/books/${bookId}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      toast.error(t.deleteFailed);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" />}
      >
        {t.delete}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.deleteBookTitle(title)}</DialogTitle>
          <DialogDescription>{t.deleteBookBody}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{t.cancel}</DialogClose>
          <Button variant="destructive" onClick={onDelete} disabled={deleting}>
            {deleting ? t.deleting : t.delete}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
