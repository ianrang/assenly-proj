"use client";

import "client-only";

import { useTranslations } from "next-intl";
import { Button } from "@/client/ui/primitives/button";

type SuggestedQuestionsProps = {
  onSelect: (question: string) => void;
};

const QUESTION_KEYS = ["suggestedQ1", "suggestedQ2", "suggestedQ3"] as const;

export default function SuggestedQuestions({ onSelect }: SuggestedQuestionsProps) {
  const t = useTranslations("chat");

  return (
    <div className="flex flex-col gap-2">
      {QUESTION_KEYS.map((key) => {
        const text = t(key);
        return (
          <Button
            key={key}
            variant="outline"
            size="sm"
            onClick={() => onSelect(text)}
            className="justify-start whitespace-normal text-left"
          >
            {text}
          </Button>
        );
      })}
    </div>
  );
}
