"""PaperLand 파이프라인 CLI.

사용:
    paperland fixtures        # 샘플 픽스처 생성 (GPU 불필요)
    paperland fetch           # arXiv API에서 cs.CL 실데이터 수집 → Parquet
    paperland build           # 실데이터 Parquet → V0 artifact 빌드
"""

from __future__ import annotations

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
    max_papers: int = typer.Option(2000, "--n", help="수집 최대 논문 수"),
    days_back: int = typer.Option(
        365 * 2, "--days", help="이 일수 이내 제출된 논문만 (0이면 전부)"
    ),
) -> None:
    """arXiv API에서 카테고리별 최신 논문을 수집해 Parquet으로 저장."""
    since = (date.today() - timedelta(days=days_back)) if days_back > 0 else None
    rprint(
        f"[bold cyan]arXiv fetch[/] {category} "
        f"max={max_papers}{f' since={since}' if since else ''}"
    )
    rows: list[dict] = []
    with Progress() as progress:
        task = progress.add_task("[cyan]수집 중", total=max_papers)
        for paper in fetch_papers(category=category, max_results=max_papers, since=since):
            rows.append(paper.model_dump())
            progress.update(task, completed=len(rows))
    if not rows:
        rprint("[red]수집된 논문 없음[/]")
        raise typer.Exit(code=1)
    out.parent.mkdir(parents=True, exist_ok=True)
    pl.DataFrame(rows).write_parquet(out)
    rprint(f"[green]✓[/] 저장: {out} ({len(rows)}편)")


@app.command()
def build(
    papers_path: Path = typer.Option(..., "--papers", help="정제된 논문 Parquet"),
    out: Path = typer.Option(
        Path("apps/web/public/data"), "--out", "-o", help="JSON artifact 출력"
    ),
    embedding_model: str = typer.Option(
        "allenai/specter2_base", "--model", help="HF 임베딩 모델"
    ),
    h3_resolution: int = typer.Option(3, "--h3", help="h3 격자 해상도"),
) -> None:
    """실데이터 Parquet으로 V0 artifact 빌드 (임베딩→UMAP→클러스터링→탐지→배포)."""
    from .ingestion import load_papers_from_parquet, validate_papers
    from .embedding import embed_papers
    from .projection import fit_umap, project_to_2d, coords_to_dataframe
    from .clustering import (
        cluster_hdbscan,
        extract_cluster_keywords,
        keywords_per_paper,
    )
    from .gridding import assign_cells, aggregate_cells
    from .detectors import AdjacentGapDetector
    from .build import build_artifacts

    rprint(f"[cyan]논문 로드[/] {papers_path}")
    papers_df = validate_papers(load_papers_from_parquet(papers_path))
    rprint(f"  → {len(papers_df)}편 통과")

    rprint(f"[cyan]임베딩[/] {embedding_model}")
    embeddings, arxiv_ids = embed_papers(papers_df, model_name=embedding_model)

    rprint("[cyan]UMAP 2D 투영[/]")
    reducer = fit_umap(embeddings)
    coords = project_to_2d(reducer, embeddings)
    coords_df = coords_to_dataframe(arxiv_ids, coords)

    rprint("[cyan]HDBSCAN 클러스터링[/]")
    cluster_labels_arr = cluster_hdbscan(embeddings)
    cluster_keywords = extract_cluster_keywords(papers_df, cluster_labels_arr)
    paper_keywords = keywords_per_paper(papers_df, cluster_labels_arr, cluster_keywords)

    rprint(f"[cyan]h3 격자화[/] resolution={h3_resolution}")
    coords_df = assign_cells(coords_df, resolution=h3_resolution)
    cells_df = aggregate_cells(
        papers_df=papers_df.select(["arxiv_id", "primary_category", "submitted_date"]),
        coords_df=coords_df,
        keywords_per_paper=paper_keywords,
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
    manifest = build_artifacts(
        out_dir=out,
        cells_df=cells_df,
        coords_df=coords_df,
        papers_df=papers_df,
        cluster_labels=cluster_keywords,
        whitespace_top=whitespace,
        embedding_model=f"{embedding_model}",
        categories=sorted(set(papers_df["primary_category"].to_list())),
    )
    rprint(
        f"[green]✓[/] paper_count={manifest.paper_count} "
        f"epoch={manifest.map_epoch}"
    )


if __name__ == "__main__":
    app()
