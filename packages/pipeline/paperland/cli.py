"""PaperLand 파이프라인 CLI.

사용:
    paperland fixtures        # 샘플 픽스처 생성 (GPU 불필요, V0 빠른 검증용)
    paperland build           # 실데이터로 V0 artifact 빌드
"""

from __future__ import annotations

from pathlib import Path

import typer
from rich import print as rprint

from .fixtures import generate_fixtures

app = typer.Typer(add_completion=False, no_args_is_help=True)


@app.command()
def fixtures(
    out: Path = typer.Option(
        Path("apps/web/public/data"),
        "--out",
        "-o",
        help="JSON artifact 출력 디렉토리",
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
def build(
    papers_path: Path = typer.Option(..., "--papers", help="정제된 논문 Parquet"),
    out: Path = typer.Option(Path("apps/web/public/data"), "--out", "-o"),
) -> None:
    """실데이터로 V0 artifact 빌드 (전체 파이프라인 실행)."""
    rprint("[yellow]TODO[/]: 실데이터 빌드 — 임베딩/UMAP/클러스터링/격자화/탐지/빌드 통합 스크립트.")
    rprint(f"  입력: {papers_path}")
    rprint(f"  출력: {out}")
    rprint("  현 단계에선 픽스처로 프론트 검증 후 실제 데이터 연결을 다음 스토리에서 처리합니다.")


if __name__ == "__main__":
    app()
