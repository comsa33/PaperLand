"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Compass,
  Map as MapIcon,
  MousePointerClick,
} from "lucide-react";
import { useUIStore } from "@/lib/store";

const STORAGE_KEY = "paperland.onboarding.collapsed";

export function Onboarding() {
  const locale = useUIStore((s) => s.locale);
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    setHydrated(true);
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    }
  };

  if (!hydrated) return null;

  return (
    <div className="absolute top-4 right-4 z-20 max-w-[340px]">
      <div className="bg-slate-900/95 backdrop-blur-sm border border-white/15 rounded-lg shadow-xl overflow-hidden">
        <button
          type="button"
          onClick={toggle}
          className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-white/90 hover:bg-white/5 transition"
        >
          <span className="font-bold">
            {locale === "ko" ? "이 화면 가이드" : "About this view"}
          </span>
          {collapsed ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4" />
          )}
        </button>
        {!collapsed && (
          <div className="px-4 pb-4 pt-1 text-sm text-white/80 space-y-3 leading-relaxed">
            <Item
              icon={<MapIcon className="w-4 h-4 text-emerald-300" />}
              title={locale === "ko" ? "이 지도는 의미 지도" : "This is a semantic map"}
              body={
                locale === "ko"
                  ? "점 1개 = 논문 1편. 제목·초록 임베딩(SPECTER2)을 UMAP으로 2D 투영해 가까운 점일수록 의미가 비슷합니다. 인용 그래프나 학회 분류가 아닙니다."
                  : "Each dot = 1 paper. We embed titles/abstracts with SPECTER2 and project to 2D via UMAP — closer = more semantically similar. Not a citation graph or venue layout."
              }
            />
            <Item
              icon={<Compass className="w-4 h-4 text-orange-300" />}
              title={locale === "ko" ? "선택한 후보의 위치" : "Position of this candidate"}
              body={
                locale === "ko"
                  ? "주황 강조가 후보 셀입니다. 셀 색이 진한 파랑일수록 그 영역의 논문 수가 많고, 주변이 진한데 자기 셀이 비어있을 때 공백 후보가 됩니다."
                  : "Orange highlight is the candidate cell. Darker blue = more papers in that hex; whitespace is a sparse cell surrounded by dense neighbors."
              }
            />
            <Item
              icon={<MapIcon className="w-4 h-4 text-blue-300" />}
              title={locale === "ko" ? "지도에서 클릭" : "Click on the map"}
              body={
                locale === "ko"
                  ? "다른 셀을 클릭하면 우측 패널에 그 셀의 키워드와 논문이 보입니다."
                  : "Click any cell to inspect its keywords and papers in the right panel."
              }
            />
            <Item
              icon={<MousePointerClick className="w-4 h-4 text-emerald-300" />}
              title={locale === "ko" ? "흐름 탭으로 전환" : "Switch to the flow tab"}
              body={
                locale === "ko"
                  ? "상단 「연도별 흐름 보기」를 누르면 인접 연구의 시간축 흐름이 펼쳐집니다."
                  : 'Click "Year-by-year flow" at the top to expand the time-axis view of neighbors.'
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Item({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-2.5">
      <div className="shrink-0 w-7 h-7 rounded-md bg-white/8 border border-white/15 flex items-center justify-center mt-0.5">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="font-bold text-white/95 text-sm">{title}</p>
        <p className="text-white/70 text-sm">{body}</p>
      </div>
    </div>
  );
}
