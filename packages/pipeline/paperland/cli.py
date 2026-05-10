"""PaperLand 파이프라인 CLI.

사용:
    paperland fixtures        # 샘플 픽스처 생성 (GPU 불필요)
    paperland fetch           # arXiv API에서 cs.CL 실데이터 수집 → Parquet
    paperland build           # 실데이터 Parquet → V0 artifact 빌드
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

import polars as pl
import typer
from rich import print as rprint
from rich.progress import Progress

from .arxiv_api import fetch_papers
from .fixtures import generate_fixtures

app = typer.Typer(add_completion=False, no_args_is_help=True)


@app.command()
def fixtures(
    out: Path = typer.Option(
        Path("apps/web/public/data"), "--out", "-o", help="JSON artifact 출력 디렉토리"
    ),
    n_papers: int = typer.Option(800, "--n", help="합성 논문 수"),
    n_clusters: int = typer.Option(8, "--clusters", help="합성 클러스터 수"),
    seed: int = typer.Option(42, "--seed", help="난수 시드"),
) -> None:
    """샘플 픽스처를 생성하여 프론트가 곧바로 렌더할 수 있도록 함."""
    rprint(f"[bold cyan]샘플 픽스처 생성[/] → {out}")
    manifest = generate_fixtures(out, n_papers=n_papers, n_clusters=n_clusters, seed=seed)
    rprint(f"[green]✓[/] 빌드 완료: paper_count={manifest.paper_count}, epoch={manifest.map_epoch}")


@app.command()
def fetch(
    out: Path = typer.Option(
        Path("data/raw/arxiv-cs-cl.parquet"),
        "--out", "-o",
        help="저장 경로 (Parquet)",
    ),
    category: str = typer.Option("cs.CL", "--category", help="arXiv 카테고리"),
    per_year: int = typer.Option(
        400, "--per-year", help="연도별 최대 수집 논문 수 (층화 샘플링)"
    ),
    years: int = typer.Option(
        5, "--years", help="최근 몇 년치를 연도별로 균등 수집"
    ),
) -> None:
    """arXiv API에서 카테고리별 논문을 연도 균등 층화 수집.

    예: --per-year 400 --years 5 → 최근 5년 × 400편 ≈ 2000편 (연도별 균등).
    `paperland build` 의 연도별 흐름이 의미를 가지려면 균등 분포가 필요함.
    """
    today = date.today()
    rprint(
        f"[bold cyan]arXiv stratified fetch[/] {category} "
        f"× {years}년 × {per_year}/년"
    )
    rows: list[dict] = []
    seen_ids: set[str] = set()
    with Progress() as progress:
        task = progress.add_task("[cyan]수집 중", total=per_year * years)
        for offset in range(years):
            year = today.year - offset
            year_range = (year, year)
            rprint(f"  [dim]· {year}년 수집[/] (최대 {per_year}편)")
            for paper in fetch_papers(
                category=category,
                max_results=per_year,
                year_range=year_range,
            ):
                if paper.arxiv_id in seen_ids:
                    continue
                seen_ids.add(paper.arxiv_id)
                rows.append(paper.model_dump())
                progress.update(task, completed=len(rows))
    if not rows:
        rprint("[red]수집된 논문 없음[/]")
        raise typer.Exit(code=1)
    out.parent.mkdir(parents=True, exist_ok=True)
    pl.DataFrame(rows).write_parquet(out)
    # 연도 분포 요약
    by_year: dict[int, int] = {}
    for r in rows:
        y = r["submitted_date"].year
        by_year[y] = by_year.get(y, 0) + 1
    dist = ", ".join(f"{y}: {by_year[y]}" for y in sorted(by_year, reverse=True))
    rprint(f"[green]✓[/] 저장: {out} ({len(rows)}편)")
    rprint(f"  [dim]연도 분포: {dist}[/]")


@app.command()
def build(
    papers_path: Path = typer.Option(..., "--papers", help="정제된 논문 Parquet"),
    out: Path = typer.Option(
        Path("apps/web/public/data"), "--out", "-o", help="카테고리별 데이터 디렉토리"
    ),
    embedding_model: str = typer.Option(
        "allenai/specter2_base", "--model", help="HF 임베딩 모델"
    ),
    h3_resolution: int = typer.Option(3, "--h3", help="h3 격자 해상도"),
    primary_category: str = typer.Option(
        "cs.CL", "--primary", help="primary_category 필터 (예: cs.CL, cs.LG)"
    ),
) -> None:
    """실데이터 Parquet으로 V0 artifact 빌드 (임베딩→UMAP→클러스터링→탐지→배포)."""
    from .ingestion import load_papers_from_parquet, validate_papers
    from .embedding import embed_papers
    from .projection import fit_umap, project_to_2d, coords_to_dataframe
    from .clustering import (
        cluster_kmeans,
        extract_cell_keywords,
        extract_cluster_keywords,
        keywords_per_paper,
    )
    from .gridding import assign_cells, aggregate_cells
    from .detectors import AdjacentGapDetector
    from .build import build_artifacts

    rprint(f"[cyan]논문 로드[/] {papers_path}")
    papers_df = validate_papers(load_papers_from_parquet(papers_path))
    rprint(f"  → 검증 통과: {len(papers_df)}편")
    # primary 필터 — 다른 카테고리(cs.LG/CR/econ 등) 논문 차단
    before = len(papers_df)
    papers_df = papers_df.filter(pl.col("primary_category") == primary_category)
    rprint(
        f"  → primary={primary_category} 필터: {len(papers_df)}편 "
        f"(제외 {before - len(papers_df)})"
    )

    rprint(f"[cyan]임베딩[/] {embedding_model}")
    embeddings, arxiv_ids = embed_papers(papers_df, model_name=embedding_model)

    rprint("[cyan]UMAP 2D 투영[/]")
    reducer = fit_umap(embeddings)
    coords = project_to_2d(reducer, embeddings)
    coords_df = coords_to_dataframe(arxiv_ids, coords)

    rprint("[cyan]KMeans 클러스터링 (embedding 코사인 기반)[/]")
    # 실데이터의 SPECTER2 임베딩 + 2D UMAP 은 한 덩어리로 모이는 경향이 있어
    # HDBSCAN noise 비율이 높음. K개 클러스터를 강제 할당하는 KMeans로 안정화.
    n_papers = len(papers_df)
    n_clusters_target = max(6, min(15, n_papers // 200))  # 2000편 → 10
    cluster_labels_arr = cluster_kmeans(embeddings, n_clusters=n_clusters_target)
    cluster_keywords = extract_cluster_keywords(papers_df, cluster_labels_arr)
    paper_keywords = keywords_per_paper(papers_df, cluster_labels_arr, cluster_keywords)

    rprint(f"[cyan]h3 격자화[/] resolution={h3_resolution}")
    coords_df = assign_cells(coords_df, resolution=h3_resolution)

    # 셀 단위 로컬 키워드 — 클러스터 키워드 상속을 차단하고 그 셀의 abstract만으로
    # 계산. 지도 라벨(클러스터)와 셀 패널(로컬)을 의미 단위로 분리한다.
    cell_keywords = extract_cell_keywords(
        papers_df=papers_df.select(["arxiv_id", "abstract"]),
        coords_with_cells=coords_df.select(["arxiv_id", "cell_id"]),
    )

    cells_df = aggregate_cells(
        papers_df=papers_df.select(["arxiv_id", "primary_category", "submitted_date"]),
        coords_df=coords_df,
        keywords_per_paper=paper_keywords,
        cell_keywords=cell_keywords,
        recent_year_threshold=date.today().year - 2,
    )

    rprint("[cyan]공백 후보 탐지[/]")
    papers_with_coords = papers_df.select(
        ["arxiv_id", "title", "submitted_date"]
    ).join(coords_df, on="arxiv_id", how="inner")
    whitespace = AdjacentGapDetector().detect(
        cells_df=cells_df,
        paper_coords=coords,
        papers_with_coords=papers_with_coords,
    )

    rprint("[cyan]artifact 빌드[/]")
    # 클러스터 centroid — 지도 영역 라벨용. 단순 평균은 KMeans가 2D에서 분리된
    # 섬을 하나로 묶을 때 라벨이 비어 있는 사이공간에 떨어지는 회귀가 있어,
    # 클러스터에 속한 h3 셀 중 paper_count가 가장 많은 셀의 centroid를 앵커로 사용.
    arxiv_to_label = dict(zip(papers_df["arxiv_id"].to_list(), cluster_labels_arr))

    # cell_id → cluster label 빈도 → 셀의 dominant cluster 결정
    cell_cluster_counts: dict[str, Counter[int]] = defaultdict(Counter)
    for row in coords_df.to_dicts():
        label = int(arxiv_to_label.get(row["arxiv_id"], -1))
        if label == -1 or not row.get("cell_id"):
            continue
        cell_cluster_counts[row["cell_id"]][label] += 1

    cells_lookup_by_id = {row["cell_id"]: row for row in cells_df.to_dicts()}

    # cluster → [(cell_id, paper_count_in_cluster, cell_centroid_x, cell_centroid_y, total_paper_count)]
    cluster_to_cells: dict[int, list[tuple[str, int, float, float, int]]] = (
        defaultdict(list)
    )
    for cell_id, counts in cell_cluster_counts.items():
        cell_row = cells_lookup_by_id.get(cell_id)
        if cell_row is None:
            continue
        cx = float(cell_row["centroid_x"])
        cy = float(cell_row["centroid_y"])
        total = int(cell_row.get("paper_count") or 0)
        for cluster_id, n in counts.items():
            cluster_to_cells[cluster_id].append((cell_id, n, cx, cy, total))

    cluster_centroids: dict[int, dict[str, float]] = {}
    for cid, entries in cluster_to_cells.items():
        # density peak: 그 cluster 소속 papers가 가장 많은 셀을 anchor로
        entries.sort(key=lambda e: (-e[1], -e[4]))
        anchor = entries[0]
        total_count = sum(e[1] for e in entries)
        cluster_centroids[cid] = {
            "x": anchor[2],
            "y": anchor[3],
            "count": total_count,
        }

    manifest = build_artifacts(
        out_dir=out,
        cells_df=cells_df,
        coords_df=coords_df,
        papers_df=papers_df,
        cluster_labels=cluster_keywords,
        cluster_centroids=cluster_centroids,
        whitespace_top=whitespace,
        embedding_model=f"{embedding_model}",
        categories=sorted(set(papers_df["primary_category"].to_list())),
        primary_category=primary_category,
    )
    rprint(
        f"[green]✓[/] paper_count={manifest.paper_count} "
        f"epoch={manifest.map_epoch}"
    )


if __name__ == "__main__":
    app()
