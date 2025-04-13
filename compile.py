import markdown
from pathlib import Path


def convert_markdown_to_html(md_path, html_path):
    md_text = Path(md_path).read_text(encoding='utf-8')
    html = markdown.markdown(md_text)

    # Optional: Wrap in basic HTML template
    full_html = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Blog</title>
        <link rel="stylesheet" href="../docs/styles.css"/>
    </head>
    <body>
    <nav>
        <a href="../docs/index.html">Home</a>
        <a href="../docs/blog.html">Blog</a>
        <a href="../docs/contact.html">Contact</a>
    </nav>
    
    <div class="container">
        <div class="blog-list">
            {html}
            <br/>
            <br/>
            <br/>
            <p>
                <a href="../docs/blog.html">[back]</a>
            </p>
    
        </div>
    </div>
    
    <div class="neon-stripe"></div>
    <script src="../docs/random_glow_color.js"></script>
    </body>
    </html>
    """

    Path(html_path).write_text(full_html, encoding='utf-8')
    print(f"✅ Generated: {html_path}")


# Example usage
if __name__ == "__main__":
    posts_dir = Path("posts/")
    output_dir = Path("docs")
    output_dir.mkdir(exist_ok=True)
    print("Generating HTML files from Markdown...")

    for md_file in posts_dir.glob("*.md"):
        if f"{md_file.name}.html" not in output_dir.iterdir():
            html_file = output_dir / (md_file.stem + ".html")
            convert_markdown_to_html(md_file, html_file)
