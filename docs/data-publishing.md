# 데이터 publishing 순서와 캐시 정책

PaperLand의 정적 artifact를 정적 호스팅(또는 R2/S3/Vercel Blob)에 배포할 때 따라야
할 순서와 권장 캐시 헤더입니다. `apps/web/public/data/`의 구조와 그대로 매핑됩니다.

## 디렉토리 구조

```
{DATA_BASE_URL}/                            ← /data 또는 R2 origin 등
├── catalog.json                            ← 사용 가능한 데이터셋 인벤토리
├── cs-cl/
│   ├── latest.json                         ← {"epoch": "2026-W19", "manifest": "2026-W19/manifest.json"}
│   └── 2026-W19/                           ← epoch별 immutable
│       ├── manifest.json
│       ├── cells.json
│       ├── papers_index.json
│       ├── cluster_labels.json
│       └── whitespace_top10.json
├── cs-lg/
│   ├── latest.json
│   └── 2026-W19/...
└── …
```

`NEXT_PUBLIC_DATA_BASE_URL` 환경변수로 frontend가 가리키는 base를 변경할 수 있습니다.
값이 비면 동일 origin의 `/data`를 사용합니다.

## 업로드 순서 (반드시 이 순서)

1. **epoch 디렉토리 파일들 먼저 업로드**
   `{slug}/{epoch}/manifest.json`, `cells.json`, `papers_index.json`,
   `cluster_labels.json`, `whitespace_top10.json` 5종.

   이들이 모두 올라가 있어야 그 다음 단계에서 latest.json이 가리킬 수 있습니다.

2. **`{slug}/latest.json` 갱신**
   클라이언트가 새 epoch을 인식하기 시작하는 시점. 1단계가 완전히 끝난 뒤에만
   바뀌어야 합니다 (그 전에 갱신하면 클라이언트가 일부 파일이 없는 상태에서
   읽으려다 실패).

3. **마지막에 `catalog.json` 갱신**
   드롭다운/사용자 노출용. 새 카테고리 추가/스냅샷 정보 갱신은 catalog가 마지막.

순서가 뒤집히면 사용자에게 짧지만 확실한 깨진 상태가 보입니다.

## 권장 Cache-Control

| 파일 | Cache-Control | 이유 |
|------|---------------|------|
| `{slug}/{epoch}/*.json` | `public, max-age=31536000, immutable` | epoch은 한 번 만들어지면 절대 안 바뀜. CDN 무한 캐싱 가능. |
| `{slug}/latest.json` | `public, max-age=60` 또는 `no-cache` | 사용자에게 새 epoch을 빨리 노출. 캐싱이 길면 새 빌드 후에도 옛 데이터를 본다. |
| `catalog.json` | `public, max-age=60` 또는 `no-cache` | 새 분야 추가 시 즉시 반영. |

R2/S3에서는 객체별 메타데이터로, Vercel/Netlify는 `_headers` 또는 `vercel.json`/
`next.config` rewrite/headers로 설정합니다.

## Atomicity (옵션)

대규모 배포에서 latest.json 깨진 한 컷이 보이는 게 싫다면:

- 새 epoch 업로드 후 `latest.json`을 conditional PUT (S3 SSE 지원 또는 R2)
- 또는 일시적 staging key (`latest.next.json`)에 먼저 쓴 뒤 atomic rename

V0.7 기준으로는 1→2→3 순서만 지키면 충분합니다.
