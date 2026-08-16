# antonioleblanc.com

Site pessoal do Antonio Leblanc — Co-Founder & CTO @ 1.5°C.

**No ar:** https://antonioleblanc.com

## Como funciona

Estático puro, sem build. GitHub Pages serve o `main` direto da raiz.

| Arquivo | O quê |
|---|---|
| `index.html` | a página inteira em inglês — conteúdo, JSON-LD, `<style>` inline (tokens no `:root`) e o JS inline (reveal, count-up, scroll progress) |
| `pt/index.html` | a mesma página em português |
| `projects/index.html`, `pt/projects/index.html` | página de projetos (en/pt), mesmo padrão de `<style>` inline |
| `assets/fonts/` | Inter e JetBrains Mono (`.woff2`), carregadas via `@font-face` no `<style>` inline |
| `assets/images/` | `antonio-headshot.jpg` (retrato real, hero atual), `og-image.png` (preview social 1200×630), imagens de `projects/` |
| `CNAME` | domínio custom, gerenciado pelo GitHub Pages |

Não tem `style.css` na raiz — cada página carrega seu próprio `<style>` inline, sem link externo.

### `_lab/` e `_src/` — não fazem parte do site no ar

| Pasta | O quê |
|---|---|
| `_lab/index2.html` + `_lab/style2.css` | direção visual anterior (documental full-bleed por seção, `<link>` pro `style2.css`), superada mas mantida como referência |
| `_lab/index3.html` | variante self-contained, fontes embutidas em base64 no `<style>` |
| `_src/build_index3.py`, `index3.src.html`, `index3.assets.json` | geram o `_lab/index3.html` |
| `_src/og-image.html` | template pra renderizar o `og-image.png` (skill `render-html-para-imagem`) |

`avatar.png` e `off-the-clock.jpg` só existem como referência dentro do `_lab/index2.html` — saíram de circulação na versão ao vivo.

## Idioma: o português é a fonte, o inglês é a tradução

**Escrever copy nova primeiro no `pt/index.html`, nunca no `index.html`.** O
Antonio pensa em português e traduz depois; texto composto direto em inglês sai
com voz de business em vez da dele. O inglês é atualizado depois, a partir do
português aprovado.

Traduzir a *ideia*, não a frase: expressão idiomática em inglês vira calque em
português (e vice-versa). Guia de voz e casos reais em
`antoninus/profissional/ghostwriter.md`.

## Domínio

`antonioleblanc.com`, registrado na **Cloudflare**, apontando pro GitHub Pages.
`antonio-leblanc.github.io` continua funcionando e redireciona pra cá.

Ao mexer no domínio, lembrar que a URL aparece em quatro lugares no `index.html`:
`canonical`, `og:url`, `og:image` / `twitter:image`, e o `url`/`image` do JSON-LD.

## Rodar local

Abrir o `index.html` no navegador resolve. Se precisar de servidor (pra testar
caminhos absolutos ou o JSON-LD):

```bash
python -m http.server 8000
```

## Publicar

Push na `main`. O Pages faz o deploy sozinho em ~1 min.
