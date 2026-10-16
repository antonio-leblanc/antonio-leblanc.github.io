// Núcleo da simulação ao vivo da página do ForeFire. Sem DOM, pra rodar igual
// no worker do navegador e no Node (teste de calibração).
//
// O motor é o ForeFire de verdade (forefireAPI/forefire, branch dev + o port
// pro navegador do Hugo Fara), compilado pra WebAssembly. O lugar é real:
// Ostriconi, na ponta oeste do Désert des Agriates, Córsega. Combustível do
// ESA WorldCover 2021 e relevo do AWS Terrain Tiles, assados por
// _src/forefire-bake.py em ostriconi.bin. As propriedades do combustível são
// linhas de tests/runff/fuels.csv do próprio repositório, então quem decide o
// fogo é o Rothermel, não um efeito visual.

// Domínio de 3,2 × 1,8 km (16:9), células de ~13 m.
export const W = 3200;
export const H = 1800;
export const NX = 240;
export const NY = 135;
// Cantos do domínio em graus, pra alinhar a imagem de satélite.
export const BBOX = { w: 9.050452725402764, s: 42.65991519942508, e: 9.089547274597237, n: 42.67608480057492 };

const FUEL_HEADER =
	"Index;Rhod;Rhol;Md;Ml;sd;sl;e;Sigmad;Sigmal;stoch;RhoA;Ta;Tau0;Deltah;DeltaH;Cp;Cpa;Ti;X0;r00;Blai;me";
const FUEL_ROWS = [
	// 5: arbusto / maquis, leito de 0.6 m
	"5;626.0;600.0;0.1;1.0;4325.0;5844.0;0.6;1.393;0.201;8.3;1.0;300;70000;18802000.0;18802000.0;1800;1000;600;0.3;2.5e-05;4.0;0.3",
	// 4: capim / esparso, leito de 0.19 m
	"4;613.0;538.0;0.1;1.0;4357.0;6524.0;0.19;1.286;0.085;8.3;1.0;300;70000;18677000.0;18677000.0;1800;1000;600;0.3;2.5e-05;4.0;0.3",
	// 0: sem leito de combustível (rocha, água, estrada): barreira
	"0;563.0;522.0;0.1;1.0;6099.0;7273.0;0;0.764;0.352;8.3;1.0;300;70000;18169000.0;18167000.0;1800;1000;600;0.3;2.5e-05;4.0;0.3",
];
const FUELS_TABLE = [FUEL_HEADER, ...FUEL_ROWS].join("\n");

// Parâmetros de tests/runff/params.ff, os mesmos da demo do Hugo.
const SOLVER = {
	spatialIncrement: 3,
	minimalPropagativeFrontDepth: 20,
	perimeterResolution: 10,
	initialFrontDepth: 0.1,
	relax: 0.5,
	smoothing: 0,
	minSpeed: 0.009,
	bmapLayer: 1,
	windReductionFactor: 0.4,
	propagationSpeedAdjustmentFactor: 0.6,
};

export function rng(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// ostriconi.bin: NX*NY uint8 de combustível (5 maquis, 4 capim, 0 nada) e
// depois NX*NY int16 de altitude em metros; linha 0 é a do sul.
export function parseLandscape(buffer) {
	const n = NX * NY;
	const fuel = Int32Array.from(new Uint8Array(buffer, 0, n));
	const altitude = Float64Array.from(new Int16Array(buffer.slice(n, n * 3)));
	return { fuel, altitude };
}

// Distância do ponto até a borda do domínio andando na direção (dx, dy).
function runToEdge(x, y, dx, dy) {
	const tx = dx > 0 ? (W - x) / dx : dx < 0 ? -x / dx : Infinity;
	const ty = dy > 0 ? (H - y) / dy : dy < 0 ? -y / dy : Infinity;
	return Math.min(tx, ty);
}

// Cenário: vento sorteado e uma ignição em vegetação com bastante chão pela
// frente, a favor do vento, pra o fogo ter pra onde correr.
export function makeScenario(seed, land) {
	const rand = rng(seed);
	const angleDeg = 360 * rand();
	const speed = 6 + 6 * rand();
	const veer = (rand() - 0.5) * 0.5; // graus por passo
	const rad = (angleDeg * Math.PI) / 180;
	const dx = Math.cos(rad), dy = Math.sin(rad);
	let best = null;
	for (let k = 0; k < 40; k++) {
		const x = W * (0.1 + 0.8 * rand()), y = H * (0.12 + 0.76 * rand());
		const c = Math.floor((y / H) * NY) * NX + Math.floor((x / W) * NX);
		if (land.fuel[c] === 0) continue;
		const score = runToEdge(x, y, dx, dy) * (0.6 + 0.4 * rand());
		if (!best || score > best.score) best = { x, y, score };
	}
	const ignition = best ? [best.x, best.y] : [W / 2, H / 2];
	return { angleDeg, speed, veer, ignition, dt: 30 };
}

export function windAt(sc, step) {
	const deg = sc.angleDeg + sc.veer * step;
	const rad = (deg * Math.PI) / 180;
	return { deg, vx: sc.speed * Math.cos(rad), vy: sc.speed * Math.sin(rad) };
}

// Cada FireFront do print[] vira um polígono; frentes aninhadas (ilhas) vêm
// indentadas dentro do pai e ficam como polígonos separados.
export function parseFronts(text) {
	const fronts = [];
	let current = null;
	for (const line of text.split("\n")) {
		if (line.includes("FireFront[")) {
			current = [];
			fronts.push(current);
		} else if (current && line.includes("FireNode[")) {
			const m = /loc=\(([-\d.eE+]+),([-\d.eE+]+),/.exec(line);
			if (m) current.push(parseFloat(m[1]), parseFloat(m[2]));
		}
	}
	return fronts.filter((f) => f.length >= 6).map((f) => Float32Array.from(f));
}

export function burntArea(fronts) {
	let total = 0;
	for (const f of fronts) {
		let a = 0;
		for (let i = 0, n = f.length; i < n; i += 2) {
			const j = (i + 2) % n;
			a += f[i] * f[j + 1] - f[j] * f[i + 1];
		}
		total += a / 2;
	}
	return Math.abs(total);
}

// Monta o domínio e acende o fogo. Devolve um objeto com step().
export function startRun(Module, land, sc) {
	const ff = new Module.ForeFire();
	ff.setString("fuelsTable", FUELS_TABLE);
	ff.setDouble("defaultFuelType", 4);
	for (const [k, v] of Object.entries(SOLVER)) ff.setDouble(k, v);
	ff.setString("propagationModel", "Rothermel");
	ff.execute(`FireDomain[sw=(0,0,0);ne=(${W},${H},0);t=0]`);

	const windU = new Float64Array(2 * NX * NY);
	windU.fill(1, 0, NX * NY);
	const windV = new Float64Array(2 * NX * NY);
	windV.fill(1, NX * NY);

	// altitude antes da camada de propagação: é o registro de "altitude" que
	// faz o DataBroker derivar a declividade que o Rothermel lê.
	const ok = [
		ff.addScalarLayer("data", "altitude", 0, 0, 0, W, H, 0, NX, NY, 1, 1, land.altitude),
		ff.addLayer("propagation", "Rothermel", "propagationModel"),
		ff.addIndexLayer("table", "fuel", 0, 0, 0, W, H, 0, NX, NY, 1, 1, land.fuel),
		ff.addScalarLayer("windScalDir", "windU", 0, 0, 0, W, H, 0, NX, NY, 2, 1, windU),
		ff.addScalarLayer("windScalDir", "windV", 0, 0, 0, W, H, 0, NX, NY, 2, 1, windV),
	];
	if (ok.some((v) => !v)) throw new Error("camada não registrada: " + ok.join(","));

	const [ix, iy] = sc.ignition;
	ff.execute(`startFire[loc=(${ix.toFixed(1)},${iy.toFixed(1)},0.);t=0]`);

	let step = 0;
	return {
		step() {
			step++;
			const w = windAt(sc, step);
			ff.execute(`trigger[wind;loc=(0.,0.,0.);vel=(${w.vx.toFixed(4)},${w.vy.toFixed(4)},0)]`);
			ff.execute(`step[dt=${sc.dt}]`);
			const fronts = parseFronts(ff.execute("print[]"));
			return { step, t: ff.getTime(), fronts, area: burntArea(fronts), windDeg: w.deg, speed: sc.speed };
		},
		dispose() {
			ff.delete();
		},
	};
}
