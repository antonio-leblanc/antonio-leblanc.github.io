// Worker da simulação ao vivo. Calcula um incêndio inteiro (menos de um
// segundo de CPU) e manda a linha do tempo pra página, que anima enquanto o
// próximo já está sendo calculado aqui.
//
// Uma instância WebAssembly nova por incêndio: o ForeFire guarda a sessão em
// estado estático (forefireAPI/forefire#175), então reaproveitar a instância
// faz o fogo anterior continuar queimando no domínio novo. O .wasm é compilado
// uma vez só; instanciar de novo custa uns poucos milissegundos.

import createForeFire from "./forefire.js";
import { parseLandscape, makeScenario, startRun, W, H } from "./live-core.js";

const compiled = WebAssembly.compileStreaming
	? WebAssembly.compileStreaming(fetch(new URL("./forefire.wasm", import.meta.url)))
	: fetch(new URL("./forefire.wasm", import.meta.url))
			.then((r) => r.arrayBuffer())
			.then((b) => WebAssembly.compile(b));

// A paisagem é uma só (Ostriconi); muda o vento e o ponto de ignição.
const land = fetch(new URL("./ostriconi.bin", import.meta.url))
	.then((r) => r.arrayBuffer())
	.then(parseLandscape);

async function freshModule() {
	const wasm = await compiled;
	return createForeFire({
		print: () => {},
		printErr: () => {},
		instantiateWasm(imports, ok) {
			WebAssembly.instantiate(wasm, imports).then((inst) => ok(inst, wasm));
			return {};
		},
	});
}

const MAX_STEPS = 200;
const MARGIN = 25;

function touchesEdge(fronts) {
	for (const f of fronts)
		for (let i = 0; i < f.length; i += 2)
			if (f[i] < MARGIN || f[i] > W - MARGIN || f[i + 1] < MARGIN || f[i + 1] > H - MARGIN) return true;
	return false;
}

async function simulate(seed) {
	const Module = await freshModule();
	const sc = makeScenario(seed, await land);
	const run = startRun(Module, await land, sc);
	const frames = [];
	let end = "limit";
	const t0 = performance.now();
	try {
		for (let i = 0; i < MAX_STEPS; i++) {
			const f = run.step();
			if (f.fronts.length === 0) { end = "out"; break; }
			frames.push(f);
			if (touchesEdge(f.fronts)) { end = "edge"; break; }
			// Parou de crescer: menos de 0,3% de área nova em 15 passos.
			if (frames.length > 15) {
				const then = frames[frames.length - 16].area;
				if (f.area - then < Math.max(400, 0.003 * then)) { end = "stalled"; break; }
			}
		}
	} finally {
		run.dispose();
	}
	const peak = frames.reduce((m, f) => Math.max(m, f.area), 0);
	return { seed, sc, frames, end, peak, ms: performance.now() - t0 };
}

// Um fogo que mal pegou (ignição numa ponta cercada de água, por exemplo) não rende
// nada pra ver: tenta a próxima semente.
async function interesting(seed) {
	let best = null;
	for (let k = 0; k < 6; k++) {
		const r = await simulate(seed + k * 7919);
		if (!best || r.peak > best.peak) best = r;
		if (r.peak > 40e4 && r.frames.length > 60) return r;
	}
	return best;
}

self.onmessage = async ({ data }) => {
	if (data.type !== "run") return;
	try {
		const r = await interesting(data.seed);
		const transfer = [];
		for (const f of r.frames) for (const p of f.fronts) transfer.push(p.buffer);
		self.postMessage({ type: "run", ...r, W, H }, transfer);
	} catch (err) {
		self.postMessage({ type: "error", message: String((err && err.message) || err) });
	}
};

Promise.all([compiled, land]).then(
	() => self.postMessage({ type: "ready" }),
	(err) => self.postMessage({ type: "error", message: String((err && err.message) || err) })
);
