"use client";

import "client-only";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { authFetch } from "@/client/core/auth-fetch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
  SheetFooter,
} from "@/client/ui/primitives/sheet";
import { Button } from "@/client/ui/primitives/button";
import { Input } from "@/client/ui/primitives/input";
import { Checkbox } from "@/client/ui/primitives/checkbox";
import { Label } from "@/client/ui/primitives/label";

type KitCtaSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

interface KitClaimForm {
  email: string;
  marketingConsent: boolean;
}

export default function KitCtaSheet({ open, onOpenChange }: KitCtaSheetProps) {
  const [claimed, setClaimed] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
  } = useForm<KitClaimForm>({
    defaultValues: { email: "", marketingConsent: false },
  });

  const marketingConsent = watch("marketingConsent");

  async function onSubmit(data: KitClaimForm) {
    try {
      const res = await authFetch("/api/kit/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email,
          marketing_consent: data.marketingConsent,
        }),
      });

      if (res.status === 409) {
        // Q-12: idempotent — already claimed is success
        setClaimed(true);
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          (body as { error?: { message?: string } } | null)?.error?.message ??
            "Failed to claim kit",
        );
      }

      setClaimed(true);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Something went wrong. Please try again.",
      );
    }
  }

  function handleClose() {
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent showCloseButton={false}>
        {claimed ? (
          /* Success State */
          <SheetBody>
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-success/10">
                <span className="text-xl text-success" aria-hidden="true">&#10003;</span>
              </div>
              <p className="text-base font-semibold text-foreground">Thank you!</p>
              <p className="text-sm text-muted-foreground">
                We&apos;ll contact you soon with your personalized K-Beauty kit details.
              </p>
            </div>
          </SheetBody>
        ) : (
          /* Input State */
          <>
            <SheetHeader>
              <SheetTitle>Get your personalized K-Beauty Starter Kit</SheetTitle>
              <SheetDescription>
                Matched to your skin &amp; hair type. Delivered to your hotel in Seoul.
              </SheetDescription>
            </SheetHeader>

            <SheetBody>
              <form
                id="kit-claim-form"
                onSubmit={handleSubmit(onSubmit)}
                className="flex flex-col gap-4"
              >
                {/* Email */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="kit-email">Email</Label>
                  <Input
                    id="kit-email"
                    type="email"
                    autoComplete="email"
                    placeholder="your@email.com"
                    aria-invalid={!!errors.email}
                    {...register("email", {
                      required: "Email is required",
                      pattern: {
                        value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                        message: "Please enter a valid email",
                      },
                    })}
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive">{errors.email.message}</p>
                  )}
                </div>

                {/* Marketing consent */}
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="kit-marketing"
                    checked={marketingConsent}
                    onCheckedChange={(checked) => setValue("marketingConsent", checked)}
                  />
                  <Label
                    htmlFor="kit-marketing"
                    className="text-xs font-normal leading-relaxed text-muted-foreground"
                  >
                    I agree to receive marketing communications about K-Beauty products
                    and offers.
                  </Label>
                </div>
              </form>
            </SheetBody>
          </>
        )}

        <SheetFooter>
          {claimed ? (
            <Button variant="outline" onClick={handleClose} className="w-full">
              Back to chat
            </Button>
          ) : (
            <>
              <Button
                type="submit"
                form="kit-claim-form"
                size="cta"
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Claiming..." : "Claim my free kit"}
              </Button>
              <Button variant="ghost" onClick={handleClose} className="w-full">
                Back to chat
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
