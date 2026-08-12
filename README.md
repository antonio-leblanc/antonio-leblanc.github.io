# antonioleblanc.com

Site pessoal do Antonio Leblanc — Co-Founder & CTO @ 1.5°C.

**No ar:** https://antonioleblanc.com

## Como funciona

Estático puro, sem build. GitHub Pages serve o `main` direto da raiz.

| Arquivo | O quê |
|---|---|
| `index.html` | a página inteira em inglês — conteúdo, JSON-LD e o JS inline (reveal, count-up, scroll progress) |
| `pt/index.html` | a mesma página em português |
| `style.css` | todo o estilo; tokens de cor e tipografia no `:root` |
| `avatar.png` | retrato do hero |
| `og-image.png` | preview de social (1200×630) |
| `CNAME` | domínio custom, gerenciado pelo GitHub Pages |

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
