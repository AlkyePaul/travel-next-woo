"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "./ui/button";

export default function BackButton() {
  const router = useRouter();
  const t = useTranslations("Common");

  return (
    <Button variant="outline" size="sm" onClick={() => router.back()}>
      {t("goBack")}
    </Button>
  );
}
