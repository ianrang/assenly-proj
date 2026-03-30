import * as React from "react"
import { cn } from "@/shared/utils/cn"

/** 페이지 H1 — Hero 타이틀 */
function PageTitle({ className, ...props }: React.ComponentProps<"h1">) {
  return (
    <h1
      className={cn(
        "text-[28px] font-bold leading-tight tracking-tight lg:text-[40px]",
        className
      )}
      {...props}
    />
  );
}

/** 섹션 H2 — How it works, What you get 등 */
function SectionTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn(
        "mb-8 text-center text-xl font-bold lg:text-[26px]",
        className
      )}
      {...props}
    />
  );
}

/** 섹션 Eyebrow 라벨 — SIMPLE, INCLUDED 등 */
function SectionLabel({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "mb-1.5 text-center text-[11px] font-semibold uppercase tracking-widest text-primary",
        className
      )}
      {...props}
    />
  );
}

/** 카드/항목 제목 — Step title, Benefit title, Trust title */
function CardTitle({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn("text-base font-semibold", className)}
      {...props}
    />
  );
}

/** 카드/항목 설명 — Step desc, Benefit desc, Trust desc */
function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn("text-sm leading-snug text-muted-foreground", className)}
      {...props}
    />
  );
}

/** 본문 — Hero subtitle, 모달 설명 등 */
function BodyText({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "text-base leading-relaxed text-muted-foreground lg:text-lg",
        className
      )}
      {...props}
    />
  );
}

/** 모달/카드 제목 — Trust card, ReturnVisit 등 */
function ModalTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn("text-lg font-bold", className)}
      {...props}
    />
  );
}

/** 브랜드 로고 텍스트 */
function BrandLogo({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("text-xl font-bold tracking-tight text-primary", className)}
      {...props}
    >
      Essenly
    </span>
  );
}

export {
  PageTitle,
  SectionTitle,
  SectionLabel,
  CardTitle,
  CardDescription,
  BodyText,
  ModalTitle,
  BrandLogo,
};
