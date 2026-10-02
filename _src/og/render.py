"""Renderiza as imagens de compartilhamento (1200×630) a partir de og.html, uma por página e idioma.

Sai em JPEG abaixo de 300 KB: acima disso o WhatsApp costuma não mostrar a prévia.
Uso: python _src/og/render.py   (precisa do Edge ou Chrome, de Pillow e de rede para as fontes do Google)
"""
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = HERE.parent.parent / "assets" / "images" / "og"
PAGES = ["home", "pantera", "agents", "forefire"]
LANGS = ["en", "pt"]
BROWSERS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
]


def main():
    browser = next((b for b in BROWSERS if Path(b).exists()), None) or shutil.which("chrome") or shutil.which("chromium")
    if not browser:
        raise SystemExit("Edge/Chrome não encontrado")
    OUT.mkdir(parents=True, exist_ok=True)
    src = (HERE / "og.html").as_uri()
    with tempfile.TemporaryDirectory() as tmp:
        for page in PAGES:
            for lang in LANGS:
                shot = Path(tmp) / f"{page}-{lang}.png"
                subprocess.run([
                    browser, "--headless", "--disable-gpu", "--hide-scrollbars",
                    "--allow-file-access-from-files", "--force-prefers-reduced-motion",
                    "--virtual-time-budget=5000", "--window-size=1200,630",
                    f"--screenshot={shot}", f"{src}?p={page}&lang={lang}",
                ], check=True, capture_output=True)
                out = OUT / f"{page}-{lang}.jpg"
                Image.open(shot).convert("RGB").save(out, quality=88, optimize=True, progressive=True)
                print(out, f"{out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
