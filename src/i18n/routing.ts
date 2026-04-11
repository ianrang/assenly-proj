import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "ko"],   // MVP: English + Korean
  defaultLocale: "en",
});
