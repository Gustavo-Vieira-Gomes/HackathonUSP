import type { Metadata } from "next";
import { Suspense } from "react";
import { examName } from "@/lib/catalog";
import { ScreenLoading } from "@/components/paciente/Screen";
import { examsHref, readSearch, type SearchParams } from "@/components/paciente/helpers";
import { WaitlistSheet } from "./WaitlistSheet";
import "./aviso.css";

export const metadata: Metadata = { title: "Aviso de vaga · remark" };

export default function AvisoPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <Aviso searchParams={searchParams} />
    </Suspense>
  );
}

async function Aviso({ searchParams }: { searchParams: SearchParams }) {
  const search = readSearch(await searchParams);
  return (
    <WaitlistSheet
      regionKey={search.regionKey}
      side={search.side}
      examLabel={examName(search.regionKey, search.side)}
      closeHref={examsHref(search)}
      doneHref={examsHref(search, { aviso: "ok" })}
    />
  );
}
