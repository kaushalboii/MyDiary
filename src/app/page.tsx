import { Suspense } from "react";
import { DiaryShelfExperience } from "@/components/DiaryShelfExperience";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-[var(--paper)]" />}>
      <DiaryShelfExperience />
    </Suspense>
  );
}
