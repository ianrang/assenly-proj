"use client";

import "client-only";

import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/client/ui/primitives/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/client/ui/primitives/alert-dialog";

type NewChatButtonProps = {
  onReset: () => void;
  hasMessages: boolean;
};

export default function NewChatButton({ onReset, hasMessages }: NewChatButtonProps) {
  const t = useTranslations("chat");
  const [open, setOpen] = useState(false);

  if (!hasMessages) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label={t("newChatLabel")}
      >
        <MessageSquarePlus className="size-5" />
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("newChatTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("newChatDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("newChatCancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setOpen(false);
                onReset();
              }}
            >
              {t("newChatConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
