"""Monta index.html (EN) e pt/index.html (PT) a partir de home.template.html + en.json/pt.json.
Uso: python build_home.py  ->  escreve os dois arquivos na raiz do repo.
Cada chave do JSON vira um @@CHAVE@@ no template; string literal, exceto
JSONLD_KNOWS_ABOUT que e uma lista (vira array JSON).
"""
import json, os

SP = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(SP))

tpl = open(os.path.join(SP, 'home.template.html'), encoding='utf-8').read()

TARGETS = {
    'en.json': os.path.join(ROOT, 'index.html'),
    'pt.json': os.path.join(ROOT, 'pt', 'index.html'),
}

for data_file, out_path in TARGETS.items():
    data = json.load(open(os.path.join(SP, data_file), encoding='utf-8'))
    out = tpl
    for key, value in data.items():
        token = '@@' + key + '@@'
        if key == 'JSONLD_KNOWS_ABOUT':
            replacement = json.dumps(value, ensure_ascii=False)
        else:
            replacement = value
        if token not in out:
            raise AssertionError(f'{data_file}: token nao usado no template: {token}')
        out = out.replace(token, replacement)
    if '@@' in out:
        import re
        leftover = sorted(set(re.findall(r'@@[A-Z0-9_]+@@', out)))
        raise AssertionError(f'{data_file}: placeholder sem valor no JSON: {leftover}')
    open(out_path, 'w', encoding='utf-8', newline='\n').write(out)
    print('build:', out_path, round(len(out.encode()) / 1024, 1), 'KB')
