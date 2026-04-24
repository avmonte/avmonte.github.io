import argparse
import markdown
from datetime import date
from pathlib import Path


def parse_front_matter(text):
    """Return (metadata_dict, body) from a markdown string with optional --- front matter."""
    if not text.startswith("---"):
        return {}, text
    end = text.index("---", 3)
    front = text[3:end].strip()
    body = text[end + 3:].strip()
    meta = {}
    for line in front.splitlines():
        if ":" in line:
            key, _, value = line.partition(":")
            meta[key.strip()] = value.strip()
    return meta, body


def post_html(content_html, title):
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>{title}</title>
    <link rel="stylesheet" href="styles.css"/>
    <script src="theme.js"></script>
</head>
<body>
<nav>
    <a href="index.html">Home</a>
    <a href="blog.html">Blog</a>
    <a href="contact.html">Contact</a>
    <button id="theme-toggle"></button>
</nav>

<div class="container">
    <div class="blog-list">
        {content_html}
        <br/>
        <br/>
        <br/>
        <p>
            <a href="blog.html">[back]</a>
        </p>
    </div>
</div>

<div class="neon-stripe"></div>
<script src="random_glow_color.js"></script>
</body>
</html>
"""


def blog_index_html(posts):
    """posts: list of (title, date_str, stem) sorted newest first."""
    items = ""
    for title, date_str, stem in posts:
        parsed = date.fromisoformat(date_str)
        display = parsed.strftime("%B %-d, %Y")
        items += f"""        <a class="blog-link" href="{stem}.html">
            [{title}]
            <span class="date">{display}</span>
        </a>
"""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Blog</title>
    <link rel="stylesheet" href="styles.css"/>
    <script src="theme.js"></script>
</head>
<body>
<nav>
    <a href="index.html">Home</a>
    <a href="blog.html">Blog</a>
    <a href="contact.html">Contact</a>
    <button id="theme-toggle"></button>
</nav>

<div class="container">
    <div class="blog-list">
{items}    </div>
</div>

<div class="neon-stripe"></div>
<script src="random_glow_color.js"></script>
</body>
</html>
"""


def compile_posts(force=False):
    posts_dir = Path("posts")
    output_dir = Path("docs")

    post_meta = []

    for md_file in sorted(posts_dir.glob("*.md")):
        text = md_file.read_text(encoding="utf-8")
        meta, body = parse_front_matter(text)

        title = meta.get("title", md_file.stem)
        date_str = meta.get("date", "1970-01-01")
        html_file = output_dir / (md_file.stem + ".html")

        needs_update = force or not html_file.exists() or md_file.stat().st_mtime > html_file.stat().st_mtime
        if needs_update:
            content_html = markdown.markdown(body)
            html_file.write_text(post_html(content_html, title), encoding="utf-8")
            print(f"  compiled: {html_file.name}")
        else:
            print(f"  skipped:  {html_file.name} (up to date)")

        post_meta.append((title, date_str, md_file.stem))

    post_meta.sort(key=lambda x: x[1], reverse=True)
    blog_path = output_dir / "blog.html"
    blog_path.write_text(blog_index_html(post_meta), encoding="utf-8")
    print(f"  rebuilt:  blog.html ({len(post_meta)} posts)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="regenerate all posts even if up to date")
    args = parser.parse_args()
    compile_posts(force=args.force)
