"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Compass,
  Map as MapIcon,
  MousePointerClick,
} from "lucide-react";

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
    <div className="absolute top-4 right-4 z-20 max-w-[340px]">
      <div className="bg-slate-900/95 backdrop-blur-sm border border-white/15 rounded-lg shadow-xl overflow-hidden">
        <button
          type="button"
          onClick={toggle}
          className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-white/90 hover:bg-white/5 transition"
        >
          <span className="font-bold">시작 가이드</span>
          {collapsed ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4" />
          )}
        </button>
        {!collapsed && (
          <div className="px-4 pb-4 pt-1 text-sm text-white/80 space-y-3 leading-relaxed">
            <Item
              icon={<MapIcon className="w-4 h-4 text-blue-300" />}
              title="중앙: 연구 지형도"
              body="진한 파랑일수록 논문 많음. 영역 라벨로 어떤 분야인지 확인."
            />
            <Item
              icon={<Compass className="w-4 h-4 text-orange-300" />}
              title="좌측: 공백 후보 Top 10"
              body="주변 활발 + 자기 비어있는 영역. 모드 토글로 지도에서 강조."
            />
            <Item
              icon={<MousePointerClick className="w-4 h-4 text-emerald-300" />}
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
