"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MemoryComposer } from "@/components/MemoryComposer";

function ComposeInner() {
  const params = useSearchParams();
  const bookId = params.get("bookId") || undefined;
  const edit = params.get("edit") || undefined;
  return <MemoryComposer initialBookId={bookId} editMemoryId={edit} />;
}

export default function ComposePage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-[var(--paper)]" />}>
      <ComposeInner />
    </Suspense>
  );
}

