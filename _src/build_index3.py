"""Monta index3.html (self-contained) a partir do template + assets.json.
Uso: python build.py  ->  escreve C:\\gitrepos\\antonio-leblanc.github.io\\index3.html
                          e uma copia de QA (estados finais forcados) no scratchpad.
"""
import json, os

SP = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(SP), 'index3.html')

a = json.load(open(os.path.join(SP, 'index3.assets.json'), encoding='utf-8'))
tpl = open(os.path.join(SP, 'index3.src.html'), encoding='utf-8').read()
box = a['field_box']

rep = {
    '@@INTER@@': a['inter'], '@@MONO@@': a['mono'], '@@NOISE@@': a['noise'],
    '@@PHOTO@@': a['photo'], '@@FIELD@@': a['field'],
    '@@BOXL@@': f"{box['left']:.3f}", '@@BOXT@@': f"{box['top']:.3f}",
    '@@BOXW@@': f"{box['w']:.3f}", '@@BOXH@@': f"{box['h']:.3f}",
    '@@FRW@@': str(box['W']), '@@FRH@@': str(box['H']),
}
for k, v in rep.items():
    tpl = tpl.replace(k, v)
assert '@@' not in tpl, 'placeholder nao substituido'

open(OUT, 'w', encoding='utf-8').write(tpl)
print('build:', OUT, round(len(tpl.encode()) / 1024), 'KB')

# copia de QA: headless nao completa IntersectionObserver + transitions
qa = """
<style id="qa">*,*::before,*::after{transition-duration:0s!important;transition-delay:0s!important;animation:none!important}</style>
<script>
document.querySelectorAll('.rv,#hero,#frame,#gauges').forEach(function(e){e.classList.add('in')});
document.querySelectorAll('[data-count]').forEach(function(e){e.dataset.ran='1';e.textContent=parseFloat(e.dataset.count).toFixed(parseInt(e.dataset.dec||0,10))});
document.querySelectorAll('.gauges .bar b').forEach(function(e){e.style.width='95%'});
</script>
</body>"""
open(os.path.join(SP, 'verify.html'), 'w', encoding='utf-8').write(tpl.replace('</body>', qa))
print('qa: verify.html')
