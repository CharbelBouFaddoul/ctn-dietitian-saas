#!/usr/bin/env python3
"""Render Feature Overview markdown to a simple print-ready PDF."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent
MD = ROOT / "CTN-Solution-Dietitian-System-Feature-Overview.md"
PDF = ROOT / "CTN-Solution-Dietitian-System-Feature-Overview.pdf"


def escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def md_to_html(markdown: str) -> str:
    lines = markdown.splitlines()
    html: list[str] = []
    in_list = False
    in_table = False
    for raw in lines:
        line = raw.rstrip()
        if line.startswith("|") and "---" not in line:
            if not in_table:
                html.append("<table>")
                in_table = True
            cells = [escape(c.strip()) for c in line.strip("|").split("|")]
            html.append("<tr>" + "".join(f"<td>{c}</td>" for c in cells) + "</tr>")
            continue
        if in_table:
            html.append("</table>")
            in_table = False
        if line.startswith("- "):
            if not in_list:
                html.append("<ul>")
                in_list = True
            html.append(f"<li>{escape(line[2:])}</li>")
            continue
        if in_list:
            html.append("</ul>")
            in_list = False
        if line.startswith("# "):
            html.append(f"<h1>{escape(line[2:])}</h1>")
        elif line.startswith("## "):
            html.append(f"<h2>{escape(line[3:])}</h2>")
        elif line.startswith("### "):
            html.append(f"<h3>{escape(line[4:])}</h3>")
        elif line.startswith("**") and line.endswith("**") and line.count("**") == 2:
            html.append(f"<p class='lead'>{escape(line.strip('*'))}</p>")
        elif line.startswith("---"):
            html.append("<hr/>")
        elif line:
            html.append(f"<p>{escape(line)}</p>")
    if in_list:
        html.append("</ul>")
    if in_table:
        html.append("</table>")
    return "\n".join(html)


HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>CTN Solution Dietitian System — Feature Overview</title>
  <style>
    @page {{ size: A4; margin: 16mm 14mm 18mm; }}
    body {{ font: 10.5pt/1.45 "Helvetica Neue", Helvetica, Arial, sans-serif; color: #0f172a; }}
    h1 {{ font-size: 22pt; letter-spacing: -0.03em; margin: 0 0 6px; }}
    h2 {{ font-size: 14pt; margin: 22px 0 8px; color: #0f766e; }}
    h3 {{ font-size: 11.5pt; margin: 16px 0 6px; }}
    p {{ margin: 0 0 8px; }}
    .lead {{ font-weight: 700; }}
    ul {{ margin: 0 0 10px 1.1rem; padding: 0; }}
    li {{ margin: 0 0 3px; }}
    table {{ border-collapse: collapse; margin: 0 0 14px; }}
    td {{ padding: 2px 14px 2px 0; vertical-align: top; }}
    hr {{ border: 0; border-top: 1px solid #cbd5e1; margin: 16px 0; }}
  </style>
</head>
<body>
{body}
</body>
</html>
"""


def main() -> None:
    html = HTML.format(body=md_to_html(MD.read_text()))
    html_path = ROOT / "CTN-Solution-Dietitian-System-Feature-Overview.html"
    html_path.write_text(html)
    print(f"Wrote {html_path}")
    print(f"Print or export that HTML to replace {PDF.name}")


if __name__ == "__main__":
    main()
