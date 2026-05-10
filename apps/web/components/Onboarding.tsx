"use client";

import { useEffect, useState } from "react";
import { Compass, Map as MapIcon, MousePointerClick, X } from "lucide-react";

const STORAGE_KEY = "paperland.onboarding.dismissed";

export function Onboarding() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = window.localStorage.getItem(STORAGE_KEY);
    if (!dismissed) setOpen(true);
  }, []);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute top-3 right-3 z-20 text-[11px] text-white/70 hover:text-white bg-slate-900/85 border border-white/10 rounded-md px-2.5 py-1 backdrop-blur"
      >
        ? 사용법
      </button>
    );
  }

  return (
    <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative max-w-xl w-full bg-slate-900 border border-white/10 rounded-lg p-6 text-white/90 shadow-2xl">
        <button
          type="button"
          aria-label="닫기"
          onClick={() => {
            setOpen(false);
            window.localStorage.setItem(STORAGE_KEY, "1");
          }}
          className="absolute top-3 right-3 text-white/50 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-bold mb-1">PaperLand에 오신 걸 환영합니다</h2>
        <p className="text-xs text-white/60 mb-5">
          이 도구는 <b>논문 검색기가 아닙니다</b>. cs.CL 분야의{" "}
          <b>"이미 점유된 영토"</b>와 <b>"탐색 가치 높은 공백 후보"</b>를
          한눈에 보여주는 지형도입니다.
        </p>

        <ol className="space-y-3 text-sm">
          <li className="flex gap-3">
            <div className="shrink-0 w-7 h-7 rounded-full bg-blue-500/20 border border-blue-400/40 flex items-center justify-center">
              <MapIcon className="w-3.5 h-3.5 text-blue-300" />
            </div>
            <div>
              <p className="font-semibold">중앙: 연구 지형도</p>
              <p className="text-xs text-white/65 leading-relaxed">
                각 hex 셀은 의미적으로 비슷한 논문들이 모인 영역.
                <span className="text-blue-300"> 진한 파랑</span>일수록 논문이 많이 쌓인 곳.
              </p>
            </div>
          </li>

          <li className="flex gap-3">
            <div className="shrink-0 w-7 h-7 rounded-full bg-orange-500/20 border border-orange-400/40 flex items-center justify-center">
              <Compass className="w-3.5 h-3.5 text-orange-300" />
            </div>
            <div>
              <p className="font-semibold">좌측: 공백 후보 Top 10</p>
              <p className="text-xs text-white/65 leading-relaxed">
                주변은 활발한데 자기 셀만 비어있는 영역.{" "}
                <span className="text-orange-300">"공백 후보 모드"</span> 토글을 켜면
                후보가 강조됩니다.
              </p>
            </div>
          </li>

          <li className="flex gap-3">
            <div className="shrink-0 w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">
              <MousePointerClick className="w-3.5 h-3.5 text-emerald-300" />
            </div>
            <div>
              <p className="font-semibold">우측: 셀 상세</p>
              <p className="text-xs text-white/65 leading-relaxed">
                지도의 셀이나 좌측 후보를 클릭하면 대표 논문, 인접 키워드,
                추가 검색 쿼리 링크를 보여줍니다.
              </p>
            </div>
          </li>
        </ol>

        <div className="mt-5 p-3 rounded-md bg-amber-500/10 border border-amber-400/20 text-[11px] text-amber-100/90 leading-relaxed">
          ⚠️ 표시된 후보는 <b>수집 데이터 기준 저밀도 영역</b>이며 단정이 아닙니다.
          실제 연구 가치는 외부 검색·문헌 검토로 확인하세요.
        </div>

        <button
          type="button"
          onClick={() => {
            setOpen(false);
            window.localStorage.setItem(STORAGE_KEY, "1");
          }}
          className="mt-5 w-full py-2 rounded-md bg-blue-500 hover:bg-blue-400 text-white text-sm font-medium transition"
        >
          시작하기
        </button>
      </div>
    </div>
  );
}
