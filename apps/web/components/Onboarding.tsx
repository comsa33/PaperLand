"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Compass, Map as MapIcon, MousePointerClick } from "lucide-react";

const STORAGE_KEY = "paperland.onboarding.collapsed";

export function Onboarding() {
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
    <div className="absolute top-3 right-3 z-20 max-w-[280px]">
      <div className="bg-slate-900/90 backdrop-blur-sm border border-white/10 rounded-md shadow-lg overflow-hidden">
        <button
          type="button"
          onClick={toggle}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[11px] text-white/85 hover:bg-white/5 transition"
        >
          <span className="font-semibold">시작 가이드</span>
          {collapsed ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5" />
          )}
        </button>
        {!collapsed && (
          <div className="px-3 pb-3 pt-1 text-[11px] text-white/75 space-y-2.5 leading-relaxed">
            <Item
              icon={<MapIcon className="w-3 h-3 text-blue-300" />}
              title="중앙: 연구 지형도"
              body="진한 파랑일수록 논문 많음. hex 셀에 비슷한 논문이 모여 있음."
            />
            <Item
              icon={<Compass className="w-3 h-3 text-orange-300" />}
              title="좌측: 공백 후보"
              body="주변 활발 + 자기 비어있는 영역. '공백 후보 모드' 토글로 강조."
            />
            <Item
              icon={<MousePointerClick className="w-3 h-3 text-emerald-300" />}
              title="우측: 상세 + 다음 행동"
              body="셀/후보 클릭 → 인접 대표 논문 + Scholar 검색 링크."
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
    <div className="flex gap-2">
      <div className="shrink-0 w-5 h-5 rounded-sm bg-white/5 border border-white/10 flex items-center justify-center mt-0.5">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-white/90">{title}</p>
        <p className="text-white/65">{body}</p>
      </div>
    </div>
  );
}
