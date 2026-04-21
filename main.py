"""
Obsidian Web Crawler — Main orchestrator.

Usage:
  python main.py                  # uses URLs from config.yaml
  python main.py https://url.com  # crawl a single URL from CLI
  python main.py --check          # test all connections before crawling
"""

import asyncio
import os
import sys

import anthropic
import httpx
import yaml
from dotenv import load_dotenv
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table

from crawler import crawl_urls
from llm_processor import process_content
from obsidian_client import Note, ObsidianClient

load_dotenv()
console = Console()


def load_config(path: str = "config.yaml") -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def run_checks(config: dict):
    """Test all connections and print a health report."""
    console.rule("[bold cyan]🔍  Connection Check[/bold cyan]")
    all_ok = True

    # ── 1. .env file ────────────────────────────────────────────────────────
    console.print("\n[bold]Checking environment variables...[/bold]")
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
    obsidian_key  = os.environ.get("OBSIDIAN_API_KEY", "")

    if anthropic_key and anthropic_key != "your-anthropic-api-key":
        console.print(f"  [green]✓[/green] ANTHROPIC_API_KEY found ({anthropic_key[:8]}...)")
    else:
        console.print("  [red]✗[/red] ANTHROPIC_API_KEY missing or not set in .env")
        all_ok = False

    if obsidian_key and obsidian_key != "your-obsidian-api-key":
        console.print(f"  [green]✓[/green] OBSIDIAN_API_KEY found ({obsidian_key[:8]}...)")
    else:
        console.print("  [red]✗[/red] OBSIDIAN_API_KEY missing or not set in .env")
        console.print("        [dim]→ Open Obsidian → Settings → Local REST API → copy key → paste in .env[/dim]")
        all_ok = False

    # ── 2. Obsidian REST API ─────────────────────────────────────────────────
    console.print("\n[bold]Checking Obsidian connection...[/bold]")
    base_url = config["obsidian"]["base_url"]
    try:
        resp = httpx.get(f"{base_url}/", headers={"Authorization": f"Bearer {obsidian_key}"}, verify=False, timeout=5)
        if resp.status_code in (200, 401):
            if resp.status_code == 401:
                console.print(f"  [yellow]⚠[/yellow]  Obsidian is running at {base_url} but API key is wrong")
                console.print("        [dim]→ Re-copy the key from Obsidian → Settings → Local REST API[/dim]")
                all_ok = False
            else:
                console.print(f"  [green]✓[/green] Obsidian API reachable at {base_url}")
        else:
            console.print(f"  [yellow]⚠[/yellow]  Unexpected status {resp.status_code} from Obsidian")
    except httpx.ConnectError:
        console.print(f"  [red]✗[/red] Cannot reach Obsidian at {base_url}")
        console.print("        [dim]→ Make sure Obsidian is open and the Local REST API plugin is enabled[/dim]")
        all_ok = False
    except Exception as e:
        console.print(f"  [red]✗[/red] Obsidian error: {e}")
        all_ok = False

    # ── 3. Anthropic API ─────────────────────────────────────────────────────
    console.print("\n[bold]Checking Anthropic API...[/bold]")
    try:
        client = anthropic.Anthropic(api_key=anthropic_key)
        msg = client.messages.create(
            model=config["llm"]["model"],
            max_tokens=10,
            messages=[{"role": "user", "content": "ping"}],
        )
        console.print(f"  [green]✓[/green] Anthropic API working (model: {config['llm']['model']})")
    except anthropic.AuthenticationError:
        console.print("  [red]✗[/red] Anthropic API key is invalid")
        console.print("        [dim]→ Check your key at console.anthropic.com[/dim]")
        all_ok = False
    except Exception as e:
        console.print(f"  [red]✗[/red] Anthropic error: {e}")
        all_ok = False

    # ── 4. Config sanity ─────────────────────────────────────────────────────
    console.print("\n[bold]Checking config.yaml...[/bold]")
    urls = config.get("urls", [])
    folder = config["obsidian"].get("vault_folder", "")
    if urls:
        console.print(f"  [green]✓[/green] {len(urls)} URL(s) ready to crawl")
    else:
        console.print("  [yellow]⚠[/yellow]  No URLs in config.yaml — add some under the 'urls:' key")
    if folder:
        console.print(f"  [green]✓[/green] Notes will be saved to: {folder}/")

    # ── Summary ──────────────────────────────────────────────────────────────
    console.print()
    if all_ok:
        console.rule("[bold green]✓  Everything looks good! Run python main.py to start crawling.[/bold green]")
    else:
        console.rule("[bold red]✗  Fix the issues above, then run --check again.[/bold red]")
    console.print()


async def run(urls: list[str], config: dict):
    obsidian = ObsidianClient(
        base_url=config["obsidian"]["base_url"],
        api_key=os.environ.get("OBSIDIAN_API_KEY", config["obsidian"]["api_key"]),
    )
    folder = config["obsidian"]["vault_folder"]
    llm_cfg = config["llm"]

    console.rule("[bold cyan]🕸  Obsidian Web Crawler[/bold cyan]")
    console.print(f"Crawling [bold]{len(urls)}[/bold] URL(s) → saving to [bold]{folder}[/bold]\n")

    # 1. Crawl
    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), console=console) as progress:
        task = progress.add_task("Crawling pages...", total=None)
        results = await crawl_urls(urls)
        progress.update(task, completed=True)

    # 2. Process + Save
    table = Table(title="Results", show_lines=True)
    table.add_column("URL", style="dim", max_width=40)
    table.add_column("Title")
    table.add_column("Tags")
    table.add_column("Status")

    for crawl_result in results:
        if not crawl_result.success:
            console.print(f"[red]✗ Crawl failed:[/red] {crawl_result.url} — {crawl_result.error}")
            table.add_row(crawl_result.url, "-", "-", "[red]Crawl failed[/red]")
            continue

        console.print(f"[dim]Processing:[/dim] {crawl_result.url}")
        processed = process_content(
            raw_markdown=crawl_result.markdown,
            source_url=crawl_result.url,
            prompt_template=llm_cfg["prompt"],
            model=llm_cfg["model"],
        )

        if not processed.success:
            table.add_row(crawl_result.url, "-", "-", f"[red]LLM error: {processed.error}[/red]")
            continue

        note = Note(
            title=processed.title,
            content=processed.content,
            folder=folder,
            tags=processed.tags,
            links=processed.links,
            source_url=crawl_result.url,
            summary=processed.summary,
        )

        try:
            result = obsidian.create_note(note)
            table.add_row(
                crawl_result.url,
                processed.title,
                ", ".join(processed.tags),
                f"[green]✓ {result['path']}[/green]",
            )
        except Exception as e:
            table.add_row(crawl_result.url, processed.title, ", ".join(processed.tags), f"[red]Save failed: {e}[/red]")

    console.print(table)


if __name__ == "__main__":
    cfg = load_config()
    args = sys.argv[1:]

    if "--check" in args:
        run_checks(cfg)
        sys.exit(0)

    urls_to_crawl = args if args else cfg.get("urls", [])

    if not urls_to_crawl:
        console.print("[red]No URLs provided. Add them to config.yaml or pass as arguments.[/red]")
        console.print("[dim]Tip: run 'python main.py --check' to verify your setup first.[/dim]")
        sys.exit(1)

    asyncio.run(run(urls_to_crawl, cfg))