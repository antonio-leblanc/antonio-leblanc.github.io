# antonioleblanc.com

Site pessoal do Antonio Leblanc — Co-Founder & CTO @ 1.5°C.

**No ar:** https://antonioleblanc.com

## Como funciona

Estático puro, sem build de deploy. GitHub Pages serve o `main` direto da raiz. A edição oficial é a **ember** (fonte Antonio + Archivo, brasa e fumaça), na raiz e em `/pt/`.

| Arquivo | O quê |
|---|---|
| `index.html`, `pt/index.html` | home em inglês e português, geradas por `_src/i18n/build_home.py` a partir de `home.template.html` + `en.json`/`pt.json` — nunca editar direto |
| `projects/index.html`, `pt/projects/index.html` | stubs de redirect (`meta http-equiv="refresh"`) pra `/` e `/pt/` — sem CSS próprio |
| `projects/{pantera,forefire,agents}/index.html` (e os pares em `pt/projects/`) | as páginas de projeto de fato — carregam `assets/css/ember-project.css`; a de agentes também `ember-agents.css` |
| `agents-hermes/`, `pt/agents-hermes/` | edição Hermes da página de agentes (botão ⚚ no rodapé dela): mesmo texto, estilo próprio inline, `noindex`. Mudou o texto de `projects/agents/`, muda aqui também |
| `hermes-workforce/` | página do plugin `hermes-workforce`, `noindex` e sem link de entrada até o lançamento |
| `hermes-notebook/` | caderno de estudo "How Hermes works": roteiro de 15 capítulos e um resumo por capítulo. Só em inglês, de propósito (é estudo pra conversa técnica em inglês). Estilo da edição Hermes inline, `noindex`, fora do sitemap e sem link de entrada. Fatos com link pro commit fixado do `hermes-agent` |
| `standard/`, `pt/standard/` | edição anterior do site (home + páginas de projeto), `noindex`, fora do sitemap e sem link a partir da ember; home gerada de `home-standard.template.html` + `{en,pt}-standard.json` |
| `alt/`, `pt/alt/` | stubs de redirect dos endereços antigos da edição ember pra raiz |
| `assets/css/ember-project.css`, `ember-agents.css` | CSS da ember nas páginas de projeto (a home tem o CSS dentro do template) |
| `assets/css/projects.css` | CSS das páginas de projeto da edição standard, standalone |
| `assets/js/ember-atmo.js` | fumaça/atmosfera em canvas da ember; respeita `prefers-reduced-motion` |
| `assets/js/lang-redirect.js` | redireciona pro idioma do navegador |
| `assets/fonts/` | Inter e JetBrains Mono (`.woff2`) da edição standard; a ember carrega Antonio, Archivo e JetBrains Mono do Google Fonts |
| `assets/images/` | fotos e imagens de `projects/`, sem base64 no HTML; `og/*.jpg` é a imagem de compartilhamento da ember, `og-image.png` a da standard |
| `CNAME` | domínio custom, gerenciado pelo GitHub Pages |

### Depois de mexer

- **Home:** após alterar template ou JSON, rodar `python _src/i18n/build_home.py` (gera as quatro homes, ember e standard, EN e PT).
- **Imagem de compartilhamento:** `_src/og/og.html` tem uma por página e idioma, na cor de cada projeto; `python _src/og/render.py` gera `assets/images/og/*.jpg`, abaixo de 300 KB.
- **Conferir:** EN e PT, nenhum `@@PLACEHOLDER@@` sobrando, links, metadados (canonical, hreflang, OG, JSON-LD) e `git diff --check`.
- **Mudança visual:** olhar no navegador. Pra mobile, iframe de 390px; no Windows a janela mínima do Edge engana com `--window-size=390`.

### `_lab/` e `_src/` — não fazem parte do site no ar

| Pasta | O quê |
|---|---|
| `_lab/index2.html` + `_lab/style2.css` | direção visual anterior (documental full-bleed por seção, `<link>` pro `style2.css`), superada mas mantida como referência |
| `_lab/index3.html` | variante self-contained, fontes embutidas em base64 no `<style>` |
| `_src/build_index3.py`, `index3.src.html`, `index3.assets.json` | geram o `_lab/index3.html` |
| `_src/og-image.html` | template do `og-image.png` da edição standard (skill `render-html-para-imagem`) |

`avatar.png` e `off-the-clock.jpg` só existem como referência dentro do `_lab/index2.html` — saíram de circulação na versão ao vivo.

## Idioma: o português é a fonte, o inglês é a tradução

**Escrever copy nova primeiro no `pt/index.html`, nunca no `index.html`.** O
Antonio pensa em português e traduz depois; texto composto direto em inglês sai
com voz de business em vez da dele. O inglês é atualizado depois, a partir do
português aprovado.

Traduzir a *ideia*, não a frase: expressão idiomática em inglês vira calque em
português (e vice-versa). Guia de voz e casos reais em
`antoninus/profissional/ativos/ghostwriter.md`.

## Domínio

`antonioleblanc.com`, registrado na **Cloudflare**, apontando pro GitHub Pages.
`antonio-leblanc.github.io` continua funcionando e redireciona pra cá.

Ao mexer no domínio, lembrar que a URL aparece no `<head>` de cada página:
`canonical`, `hreflang`, `og:url`, `og:image` / `twitter:image`, o `url`/`image` do JSON-LD
e o `sitemap.xml`.

## Rodar local

As páginas usam caminho absoluto (`/assets/...`), então precisa de servidor:

```bash
python -m http.server 8000
```

## Publicar

Push na `main`. O Pages faz o deploy sozinho em ~1 min.
