"use client";

import "client-only";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Subsection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <h3 className="mb-1.5 text-[15px] font-semibold text-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

export { Section, Subsection };
