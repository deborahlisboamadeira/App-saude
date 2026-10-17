'use strict';

// ---------- Dados ----------

const CHAVE_DADOS = 'app-saude:v1';
const MODELO = 'claude-opus-5-5';
const ML_COPO = 250;

// MET de cada atividade (Compendium of Physical Activities, valores aproximados)
const ATIVIDADES = [
  ['caminhada', 'Caminhada leve', 3.0],
  ['caminhada-rapida', 'Caminhada rápida', 4.3],
  ['corrida-leve', 'Corrida leve (~8 km/h)', 8.3],
  ['corrida', 'Corrida (~10 km/h)', 9.8],
  ['bike', 'Bicicleta / bike ergométrica', 6.8],
  ['spinning', 'Spinning', 8.5],
  ['eliptico', 'Elíptico', 5.0],
  ['musculacao', 'Musculação', 5.0],
  ['funcional', 'Funcional / HIIT / crossfit', 8.0],
  ['natacao', 'Natação', 6.0],
  ['hidro', 'Hidroginástica', 5.3],
  ['pilates', 'Pilates', 3.0],
  ['yoga', 'Yoga / alongamento', 2.5],
  ['danca', 'Dança', 5.0],
  ['futebol', 'Futebol', 7.0],
  ['tenis', 'Tênis / beach tennis', 7.3],
  ['outro', 'Outra atividade moderada', 4.0],
];

const PERFIL_PADRAO = { altura: null, idade: null, sexo: '', nivel: 1.2, objetivo: 0, protKg: 1.6, aguaMlKg: 35 };

function carregar() {
  let salvo = null;
  try { salvo = JSON.parse(localStorage.getItem(CHAVE_DADOS)); } catch (e) { /* dados corrompidos: começa do zero */ }
  const base = { pesos: [], comidas: [], atividades: [], agua: {}, chave: '', ...(salvo || {}) };
  base.perfil = { ...PERFIL_PADRAO, ...(base.perfil || {}) };
  return base;
}

let dados = carregar();

function salvar() {
  try {
    localStorage.setItem(CHAVE_DADOS, JSON.stringify(dados));
  } catch (e) {
    toast('Não foi possível salvar (armazenamento cheio?)');
  }
}

const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- Utilidades ----------

const $ = (id) => document.getElementById(id);

function isoDe(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const hoje = () => isoDe(new Date());

function diasAtras(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDe(d);
}

function dataCurta(iso) {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}${a !== String(new Date().getFullYear()) ? '/' + a.slice(2) : ''}`;
}

const fmt = (n, casas = 0) => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: casas });

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let timerToast;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(timerToast);
  timerToast = setTimeout(() => { el.hidden = true; }, 2600);
}

// ---------- Cálculos ----------

const pesosOrdenados = () => [...dados.pesos].sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));

function pesoAtual() {
  const l = pesosOrdenados();
  return l.length ? l.at(-1).kg : null;
}

function imc(kg, cm) {
  if (!kg || !cm) return null;
  const m = cm / 100;
  return kg / (m * m);
}

function categoriaImc(v) {
  if (v == null) return '';
  if (v < 18.5) return 'abaixo do peso';
  if (v < 25) return 'peso normal';
  if (v < 30) return 'sobrepeso';
  if (v < 35) return 'obesidade I';
  if (v < 40) return 'obesidade II';
  return 'obesidade III';
}

// Gasto diário sem exercícios: Mifflin-St Jeor × nível de atividade da rotina
function metaCalorias() {
  const p = dados.perfil;
  const kg = pesoAtual();
  if (!kg || !p.altura || !p.idade || !p.sexo) return null;
  const tmb = 10 * kg + 6.25 * p.altura - 5 * p.idade + (p.sexo === 'm' ? 5 : -161);
  return { tmb, meta: Math.round(tmb * Number(p.nivel) + Number(p.objetivo)) };
}

function metaProteina() {
  const kg = pesoAtual();
  return kg ? Math.round(kg * Number(dados.perfil.protKg || 1.6)) : null;
}

function metaCopos() {
  const kg = pesoAtual();
  return kg ? Math.max(1, Math.round((kg * Number(dados.perfil.aguaMlKg || 35)) / ML_COPO)) : 8;
}

// Calorias líquidas do exercício (desconta o gasto de repouso, que já está na meta)
function estimarKcal(tipo, minutos) {
  const kg = pesoAtual() || 70;
  const met = (ATIVIDADES.find((a) => a[0] === tipo) || ATIVIDADES.at(-1))[2];
  return Math.round(Math.max(met - 1, 0) * kg * (minutos / 60));
}

function totaisDoDia(dia) {
  const comidas = dados.comidas.filter((c) => c.data === dia);
  const ativs = dados.atividades.filter((a) => a.data === dia);
  return {
    comidas,
    ativs,
    comi: comidas.reduce((s, c) => s + Number(c.kcal), 0),
    prot: comidas.reduce((s, c) => s + Number(c.prot), 0),
    queimei: ativs.reduce((s, a) => s + Number(a.kcal), 0),
    minutos: ativs.reduce((s, a) => s + Number(a.min || 0), 0),
    copos: Number(dados.agua[dia] || 0),
  };
}

// Dias seguidos com pelo menos uma refeição lançada (conta a partir de ontem se hoje ainda está vazio)
function sequenciaDias() {
  const dias = new Set(dados.comidas.map((c) => c.data));
  let n = 0;
  let i = dias.has(hoje()) ? 0 : 1;
  while (dias.has(diasAtras(i))) { n++; i++; }
  return n;
}

// ---------- Telas ----------

const TITULOS = { inicio: 'Resumo', peso: 'Peso', comida: 'Comida', atividade: 'Atividade', ajustes: 'Ajustes' };

function irPara(tela) {
  document.querySelectorAll('.tela').forEach((s) => s.classList.toggle('ativa', s.id === 'tela-' + tela));
  document.querySelectorAll('.abas button').forEach((b) => b.classList.toggle('ativa', b.dataset.ir === tela));
  $('titulo').textContent = TITULOS[tela];
  for (const id of ['peso-data', 'comida-data', 'ativ-data']) if (!$(id).value) $(id).value = hoje();
  if (tela === 'peso') renderPeso();
  if (tela === 'inicio') renderInicio();
  if (tela === 'comida') renderRecentes();
  if (tela === 'ajustes') preencherPerfil();
  esconderDica();
  window.scrollTo(0, 0);
}

document.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => irPara(b.dataset.ir)));

// ---------- Início ----------

const ANEIS = [
  { cor: 'var(--cal)', r: 88 },
  { cor: 'var(--prot)', r: 65 },
  { cor: 'var(--agua)', r: 42 },
];

function desenharAneis(progressos) {
  $('aneis').innerHTML = ANEIS.map(({ cor, r }, i) => {
    const p = Math.max(0, progressos[i] || 0);
    const c = 2 * Math.PI * r;
    const primeira = Math.min(p, 1);
    const extra = Math.min(Math.max(p - 1, 0), 1);
    return `<circle class="trilha" cx="100" cy="100" r="${r}" stroke="${cor}" stroke-opacity=".22"/>
      <circle class="arco" cx="100" cy="100" r="${r}" stroke="${cor}"
        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - primeira)}" ${primeira === 0 ? 'stroke-opacity="0"' : ''}/>
      ${extra > 0 ? `<circle class="volta" cx="100" cy="100" r="${r}" stroke="${cor}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - extra)}"/>` : ''}`;
  }).join('');
}

function renderInicio() {
  const dia = hoje();
  $('data-hoje').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  const kg = pesoAtual();
  const p = dados.perfil;
  const perfilOk = Boolean(p.altura && p.idade && p.sexo);
  const aviso = $('aviso-perfil');
  aviso.hidden = perfilOk && Boolean(kg);
  aviso.innerHTML = !perfilOk
    ? 'Complete seu perfil em <b>Ajustes</b> (altura, idade e sexo) para calcular suas metas.'
    : 'Lance seu peso na aba <b>Peso</b> para calcular IMC e metas.';

  const t = totaisDoDia(dia);
  const m = metaCalorias();
  const totalCal = m ? m.meta + t.queimei : null;
  const mp = metaProteina();
  const mc = metaCopos();

  desenharAneis([totalCal ? t.comi / totalCal : 0, mp ? t.prot / mp : 0, t.copos / mc]);
  $('l-cal').innerHTML = `${fmt(t.comi)}<small>/${totalCal ? fmt(totalCal) : '–'} kcal</small>`;
  $('l-prot').innerHTML = `${fmt(t.prot)}<small>/${mp ? fmt(mp) : '–'} g</small>`;
  $('l-agua').innerHTML = `${fmt((t.copos * ML_COPO) / 1000, 1)}<small>/${fmt((mc * ML_COPO) / 1000, 1)} L</small>`;

  const resta = totalCal != null ? totalCal - t.comi : null;
  $('h-cal-resta').textContent = resta != null ? fmt(Math.abs(resta)) : '–';
  $('h-cal-resta').classList.toggle('negativo', resta != null && resta < 0);
  $('h-cal-resta-txt').textContent = resta != null && resta < 0 ? 'kcal acima da meta' : 'kcal restantes';
  $('h-cal-meta').textContent = m ? fmt(m.meta) : '–';
  $('h-cal-queimei').textContent = fmt(t.queimei);
  $('h-cal-comi').textContent = fmt(t.comi);

  renderWidgets(t, kg, mc);
  renderSemana();

  const seq = sequenciaDias();
  $('sequencia').hidden = seq < 2;
  $('sequencia').textContent = `🔥 ${seq} dias`;
  $('sequencia').title = `${seq} dias seguidos registrando refeições`;

  const itens = [
    ...t.comidas.map((c) => ({ ...c, tipoItem: 'comida' })),
    ...t.ativs.map((a) => ({ ...a, tipoItem: 'atividade' })),
  ].sort((a, b) => b.id.localeCompare(a.id));

  $('lista-hoje-vazia').hidden = itens.length > 0;
  $('lista-hoje').innerHTML = itens.map((i) => i.tipoItem === 'comida'
    ? `<li><span class="icone">🍽️</span><span class="info"><b>${esc(i.nome)}</b><small>${fmt(i.prot)} g proteína</small></span>
        <span class="num">${fmt(i.kcal)} kcal</span><button class="apagar" data-apagar="comidas:${i.id}" aria-label="Apagar">✕</button></li>`
    : `<li><span class="icone ativ">🏃</span><span class="info"><b>${esc(i.nome)}</b><small>${fmt(i.min)} min · ${i.fonte === 'relogio' ? 'relógio' : 'estimado'}</small></span>
        <span class="num ganho">+${fmt(i.kcal)} kcal</span><button class="apagar" data-apagar="atividades:${i.id}" aria-label="Apagar">✕</button></li>`
  ).join('');
}

function renderWidgets(t, kg, mc) {
  // Peso: valor, variação em 7 dias e minigráfico
  const lista = pesosOrdenados();
  $('w-peso').textContent = kg ? fmt(kg, 1) : '–';
  const difEl = $('w-peso-dif');
  difEl.className = 'w-sub';
  if (lista.length >= 2) {
    const limite = diasAtras(7);
    const ref = [...lista].reverse().find((x) => x.data <= limite) || lista[0];
    const dif = kg - ref.kg;
    const dias = Math.round((new Date(lista.at(-1).data) - new Date(ref.data)) / 86400000);
    difEl.textContent = `${dif > 0 ? '+' : dif < 0 ? '−' : ''}${fmt(Math.abs(dif), 1)} kg em ${dias} dias`;
    const objetivo = Number(dados.perfil.objetivo);
    if (Math.abs(dif) >= 0.1 && objetivo !== 0) difEl.classList.add(Math.sign(dif) === Math.sign(objetivo) ? 'bom' : 'ruim');
  } else {
    difEl.textContent = kg ? 'lance mais pesos' : 'toque para lançar';
  }
  const pts = lista.slice(-10);
  if (pts.length >= 2) {
    const vals = pts.map((x) => x.kg);
    const min = Math.min(...vals), max = Math.max(...vals), amp = max - min || 1;
    const x = (i) => (i / (pts.length - 1)) * 100;
    const y = (v) => 24 - ((v - min) / amp) * 20;
    $('w-peso-linha').innerHTML = `<path d="${pts.map((pt, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(pt.kg).toFixed(1)}`).join(' ')}"/>`;
  } else {
    $('w-peso-linha').innerHTML = '';
  }

  // IMC com escala colorida
  const vImc = imc(kg, dados.perfil.altura);
  $('w-imc').textContent = vImc ? fmt(vImc, 1) : '–';
  $('w-imc-cat').textContent = vImc ? categoriaImc(vImc) : 'precisa de peso e altura';
  const marca = $('w-imc-marca');
  if (vImc) {
    const faixas = [[15, 18.5], [18.5, 25], [25, 30], [30, 40]];
    const idx = Math.min(faixas.findIndex(([, fim]) => vImc < fim) >>> 0, 3);
    const [ini, fim] = faixas[idx];
    const frac = Math.min(Math.max((vImc - ini) / (fim - ini), 0), 1);
    marca.style.left = `${((idx + frac) / 4) * 100}%`;
    marca.hidden = false;
  } else {
    marca.hidden = true;
  }

  // Água
  $('w-agua').textContent = t.copos;
  $('w-agua-meta').textContent = `de ${mc} copos`;

  // Exercício
  $('w-exerc').textContent = fmt(t.queimei);
  $('w-exerc-min').textContent = `${fmt(t.minutos)} min hoje`;
}

function mudarAgua(delta) {
  const dia = hoje();
  dados.agua[dia] = Math.max(0, Number(dados.agua[dia] || 0) + delta);
  salvar();
  renderInicio();
}
$('agua-mais').addEventListener('click', () => mudarAgua(1));
$('agua-menos').addEventListener('click', () => mudarAgua(-1));

// Barras de calorias dos últimos 7 dias, com a meta de cada dia marcada
function renderSemana() {
  const m = metaCalorias();
  const dias = Array.from({ length: 7 }, (_, i) => {
    const iso = diasAtras(6 - i);
    const t = totaisDoDia(iso);
    return { iso, comi: t.comi, meta: m ? m.meta + t.queimei : null };
  });
  const comDados = dias.filter((d) => d.comi > 0);
  $('semana-media').textContent = comDados.length
    ? `média ${fmt(comDados.reduce((s, d) => s + d.comi, 0) / comDados.length)} kcal`
    : '';

  const W = 320, H = 150, mt = 8, mb = 22;
  const topo = Math.max(...dias.map((d) => Math.max(d.comi, d.meta || 0)), 500) * 1.08;
  const larg = W / 7;
  const bw = 22;
  const y = (v) => mt + (1 - v / topo) * (H - mt - mb);
  const nomes = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  $('grafico-semana').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Calorias consumidas nos últimos 7 dias">
    ${dias.map((d, i) => {
      const cx = larg * i + larg / 2;
      const ehHoje = i === 6;
      const h = d.comi > 0 ? Math.max(H - mb - y(d.comi), 4) : 0;
      const top = H - mb - h;
      // barra com topo arredondado e base reta
      const barra = h > 0
        ? `<path class="barra-dia ${ehHoje ? 'hoje' : 'passado'}" d="M${cx - bw / 2},${H - mb} V${top + 4} q0,-4 4,-4 h${bw - 8} q4,0 4,4 V${H - mb} Z"/>`
        : '';
      const meta = d.meta ? `<line class="meta-dia" x1="${cx - bw / 2 - 4}" x2="${cx + bw / 2 + 4}" y1="${y(d.meta)}" y2="${y(d.meta)}"/>` : '';
      const dow = nomes[new Date(d.iso + 'T12:00').getDay()];
      const dica = `${dow} ${dataCurta(d.iso)}: ${fmt(d.comi)} kcal${d.meta ? ` de ${fmt(d.meta)}` : ''}`;
      return `${barra}${meta}
        <text x="${cx}" y="${H - 6}" text-anchor="middle" class="${ehHoje ? 'hoje' : ''}">${ehHoje ? 'hoje' : dow}</text>
        <rect class="alvo" x="${larg * i}" y="0" width="${larg}" height="${H}" data-dica="${esc(dica)}"/>`;
    }).join('')}
  </svg>`;
}

// Dica ao tocar/passar o dedo nas barras
function mostrarDica(alvo) {
  const r = alvo.getBoundingClientRect();
  const d = $('dica');
  d.textContent = alvo.dataset.dica;
  d.style.left = `${Math.min(Math.max(r.left + r.width / 2, 90), window.innerWidth - 90)}px`;
  d.style.top = `${r.top + 4}px`;
  d.hidden = false;
}
function esconderDica() { $('dica').hidden = true; }
$('grafico-semana').addEventListener('pointerover', (e) => { if (e.target.dataset.dica) mostrarDica(e.target); });
$('grafico-semana').addEventListener('pointerdown', (e) => { if (e.target.dataset.dica) mostrarDica(e.target); });
$('grafico-semana').addEventListener('pointerleave', esconderDica);
window.addEventListener('scroll', esconderDica, { passive: true });

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-apagar]');
  if (!b) return;
  const [lista, id] = b.dataset.apagar.split(':');
  if (!confirm('Apagar este lançamento?')) return;
  dados[lista] = dados[lista].filter((x) => x.id !== id);
  salvar();
  renderInicio();
  renderPeso();
});

// ---------- Peso ----------

$('form-peso').addEventListener('submit', (e) => {
  e.preventDefault();
  const kg = parseFloat($('peso-valor').value);
  const data = $('peso-data').value;
  dados.pesos = dados.pesos.filter((p) => p.data !== data); // um peso por dia
  dados.pesos.push({ id: novoId(), data, kg });
  salvar();
  $('peso-valor').value = '';
  toast('Peso salvo');
  renderPeso();
});

function renderPeso() {
  const lista = pesosOrdenados();
  const el = $('grafico-peso');

  if (lista.length >= 2) {
    const pts = lista.slice(-30);
    const W = 320, H = 160, ml = 34, mr = 8, mt = 10, mb = 22;
    const vals = pts.map((p) => p.kg);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (max - min < 1) { min -= 0.5; max += 0.5; }
    const x = (i) => ml + (i / (pts.length - 1)) * (W - ml - mr);
    const y = (v) => mt + (1 - (v - min) / (max - min)) * (H - mt - mb);
    const caminho = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Gráfico de peso">
      <line class="grade" x1="${ml}" x2="${W - mr}" y1="${y(max)}" y2="${y(max)}"/>
      <line class="grade" x1="${ml}" x2="${W - mr}" y1="${y(min)}" y2="${y(min)}"/>
      <text x="0" y="${y(max) + 4}">${fmt(max, 1)}</text>
      <text x="0" y="${y(min) + 4}">${fmt(min, 1)}</text>
      <text x="${ml}" y="${H - 4}">${dataCurta(pts[0].data)}</text>
      <text x="${W - mr}" y="${H - 4}" text-anchor="end">${dataCurta(pts.at(-1).data)}</text>
      <path class="linha" d="${caminho}" vector-effect="non-scaling-stroke"/>
    </svg>`;
  } else {
    el.innerHTML = '<p class="muted">Lance pelo menos dois pesos para ver o gráfico.</p>';
  }

  const altura = dados.perfil.altura;
  $('lista-peso').innerHTML = lista.slice().reverse().map((p, i, arr) => {
    const ant = arr[i + 1];
    const dif = ant ? p.kg - ant.kg : null;
    const vImc = imc(p.kg, altura);
    return `<li><span class="info"><b>${fmt(p.kg, 1)} kg</b><small>${dataCurta(p.data)}${vImc ? ' · IMC ' + fmt(vImc, 1) : ''}</small></span>
      <span class="num muted">${dif == null ? '' : (dif > 0 ? '+' : '') + fmt(dif, 1)}</span>
      <button class="apagar" data-apagar="pesos:${p.id}" aria-label="Apagar">✕</button></li>`;
  }).join('');
}

// ---------- Comida ----------

let fotoBase64 = null;

$('comida-foto').addEventListener('change', async (e) => {
  const arq = e.target.files[0];
  if (!arq) return;
  try {
    fotoBase64 = await reduzirImagem(arq, 1280);
    $('comida-preview').src = 'data:image/jpeg;base64,' + fotoBase64;
    $('comida-preview').hidden = false;
    $('comida-foto-texto').hidden = true;
  } catch (err) {
    toast('Não consegui ler a foto');
  }
});

// Reduz a foto para economizar dados e deixar a análise mais rápida
function reduzirImagem(arquivo, maxLado) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(arquivo);
    img.onload = () => {
      const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * escala);
      c.height = Math.round(img.height * escala);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82).split(',')[1]);
    };
    img.onerror = reject;
    img.src = url;
  });
}

const ESQUEMA_REFEICAO = {
  type: 'object',
  properties: {
    nome: { type: 'string', description: 'Nome curto da refeição, ex.: "Arroz, feijão e frango"' },
    itens: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          alimento: { type: 'string' },
          porcao: { type: 'string', description: 'Quantidade estimada, ex.: "120 g" ou "1 concha"' },
          kcal: { type: 'number' },
          proteinas_g: { type: 'number' },
        },
        required: ['alimento', 'porcao', 'kcal', 'proteinas_g'],
        additionalProperties: false,
      },
    },
    kcal_total: { type: 'number' },
    proteinas_total_g: { type: 'number' },
    observacao: { type: 'string', description: 'Suposições feitas ou dúvidas, em uma frase. Vazio se não houver.' },
  },
  required: ['nome', 'itens', 'kcal_total', 'proteinas_total_g', 'observacao'],
  additionalProperties: false,
};

const SISTEMA_REFEICAO = `Você é uma nutricionista brasileira estimando calorias e proteínas de uma refeição a partir de uma foto e/ou descrição.
Considere porções e preparos típicos do Brasil (ex.: óleo no arroz e no feijão, molhos, açúcar no café quando mencionado).
Quando a descrição informar quantidades, use-as; quando não, estime pelo tamanho visível no prato.
Use valores de tabelas como TACO/TBCA. Prefira estimativas realistas a otimistas.
Responda em português.`;

// Traduz os erros da API para mensagens que a pessoa consegue resolver
function mensagemDeErro(status, msg) {
  const m = String(msg || '').toLowerCase();
  if (status === 401) return 'Chave inválida. Copie a chave de novo em platform.claude.com → API Keys (ela começa com sk-ant-).';
  if (status === 400 && m.includes('credit')) return 'Sua conta da API está sem créditos. Adicione em platform.claude.com → Billing.';
  if (status === 403) return 'Esta chave não tem permissão para usar o modelo. Confira a chave e o workspace em platform.claude.com.';
  if (status === 429) return 'Limite de uso atingido. Espere um minuto e tente de novo.';
  if (status === 529 || status >= 500) return 'O serviço está ocupado agora. Tente de novo em instantes.';
  return `Erro ${status}: ${msg || 'falha ao chamar a API.'}`;
}

async function chamarClaude(corpo) {
  const enviar = (comFallback) => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': dados.chave,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      ...(comFallback ? { 'anthropic-beta': 'server-side-fallback-2026-07-01' } : {}),
    },
    body: JSON.stringify(comFallback ? { ...corpo, fallbacks: 'default' } : corpo),
  });

  let resp;
  try {
    resp = await enviar(true);
  } catch {
    throw new Error('Sem conexão com a API. Verifique a internet e tente de novo.');
  }
  let json = await resp.json().catch(() => ({}));
  // Se a conta não aceitar o recurso de fallback, tenta de novo sem ele
  if (resp.status === 400 && /fallback|beta/i.test(json?.error?.message || '')) {
    resp = await enviar(false);
    json = await resp.json().catch(() => ({}));
  }
  if (!resp.ok) throw new Error(mensagemDeErro(resp.status, json?.error?.message));
  if (json.stop_reason === 'refusal') throw new Error('Não foi possível analisar. Lance os valores manualmente.');
  if (json.stop_reason === 'max_tokens') throw new Error('A resposta veio incompleta. Tente de novo.');
  return json;
}

async function analisarRefeicao(descricao, imagem) {
  const conteudo = [];
  if (imagem) conteudo.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imagem } });
  conteudo.push({ type: 'text', text: descricao ? `Descrição: ${descricao}` : 'Estime a refeição da foto.' });

  const resp = await chamarClaude({
    model: MODELO,
    max_tokens: 16000,
    system: SISTEMA_REFEICAO,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA_REFEICAO } },
    messages: [{ role: 'user', content: conteudo }],
  });
  const texto = (resp.content || []).find((b) => b.type === 'text')?.text;
  if (!texto) throw new Error('Resposta vazia. Tente de novo.');
  return JSON.parse(texto);
}

$('form-comida-ia').addEventListener('submit', async (e) => {
  e.preventDefault();
  const desc = $('comida-desc').value.trim();
  if (!desc && !fotoBase64) return toast('Tire uma foto ou descreva a comida');
  if (!dados.chave) {
    toast('Cadastre a chave da API em Ajustes');
    return irPara('ajustes');
  }

  const btn = $('btn-calcular');
  btn.disabled = true;
  $('comida-status').textContent = 'Calculando… isso pode levar alguns segundos.';
  try {
    const r = await analisarRefeicao(desc, fotoBase64);
    $('comida-nome').value = r.nome;
    $('comida-kcal').value = Math.round(r.kcal_total);
    $('comida-prot').value = Math.round(r.proteinas_total_g * 10) / 10;
    $('comida-itens').innerHTML = `<div class="itens-ia">${r.itens.map((i) =>
      `<div><span>${esc(i.alimento)} <span class="muted">(${esc(i.porcao)})</span></span><span>${fmt(i.kcal)} kcal · ${fmt(i.proteinas_g)} g</span></div>`
    ).join('')}${r.observacao ? `<span class="obs">${esc(r.observacao)}</span>` : ''}</div>`;
    $('comida-form-titulo').textContent = 'Confira e salve';
    $('comida-status').textContent = 'Pronto! Ajuste os valores se quiser e toque em “Salvar refeição”.';
    $('form-comida').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    $('comida-status').textContent = err.message || 'Erro ao calcular.';
  } finally {
    btn.disabled = false;
  }
});

// Refeições recentes (sem repetir o nome) para lançar de novo com um toque
function renderRecentes() {
  const vistos = new Set();
  const recentes = [...dados.comidas].sort((a, b) => b.id.localeCompare(a.id)).filter((c) => {
    const k = c.nome.toLowerCase();
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  }).slice(0, 6);
  $('card-recentes').hidden = recentes.length === 0;
  $('recentes').innerHTML = recentes.map((c) =>
    `<button type="button" class="chip" data-repetir="${c.id}">${esc(c.nome)}<small>${fmt(c.kcal)} kcal · ${fmt(c.prot)} g</small></button>`
  ).join('');
}

$('recentes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-repetir]');
  if (!b) return;
  const c = dados.comidas.find((x) => x.id === b.dataset.repetir);
  if (!c) return;
  $('comida-nome').value = c.nome;
  $('comida-kcal').value = c.kcal;
  $('comida-prot').value = c.prot;
  $('comida-data').value = hoje();
  $('comida-form-titulo').textContent = 'Confira e salve';
  $('form-comida').scrollIntoView({ behavior: 'smooth' });
});

$('form-comida').addEventListener('submit', (e) => {
  e.preventDefault();
  dados.comidas.push({
    id: novoId(),
    data: $('comida-data').value,
    nome: $('comida-nome').value.trim(),
    kcal: Math.round(parseFloat($('comida-kcal').value)),
    prot: parseFloat($('comida-prot').value),
    descricao: $('comida-desc').value.trim(),
  });
  salvar();
  limparComida();
  toast('Refeição salva');
  irPara('inicio');
});

function limparComida() {
  for (const id of ['comida-nome', 'comida-kcal', 'comida-prot', 'comida-desc', 'comida-foto']) $(id).value = '';
  $('comida-itens').innerHTML = '';
  $('comida-status').textContent = '';
  $('comida-form-titulo').textContent = 'Lançar refeição';
  $('comida-preview').hidden = true;
  $('comida-foto-texto').hidden = false;
  fotoBase64 = null;
}

// ---------- Atividade ----------

$('ativ-tipo').innerHTML = ATIVIDADES.map(([id, nome]) => `<option value="${id}">${nome}</option>`).join('');

function atualizarEstimativa() {
  const min = parseFloat($('ativ-min').value);
  $('ativ-estimativa').textContent = min > 0 ? `${fmt(estimarKcal($('ativ-tipo').value, min))} kcal` : '–';
}
$('ativ-tipo').addEventListener('change', atualizarEstimativa);
$('ativ-min').addEventListener('input', atualizarEstimativa);

$('form-atividade').addEventListener('submit', (e) => {
  e.preventDefault();
  const tipo = $('ativ-tipo').value;
  const min = parseFloat($('ativ-min').value);
  const relogio = parseFloat($('ativ-relogio').value);
  const usaRelogio = relogio > 0;
  dados.atividades.push({
    id: novoId(),
    data: $('ativ-data').value,
    tipo,
    nome: ATIVIDADES.find((a) => a[0] === tipo)[1],
    min,
    kcal: usaRelogio ? Math.round(relogio) : estimarKcal(tipo, min),
    fonte: usaRelogio ? 'relogio' : 'estimado',
  });
  salvar();
  $('ativ-min').value = '';
  $('ativ-relogio').value = '';
  atualizarEstimativa();
  toast('Atividade salva');
  irPara('inicio');
});

// ---------- Ajustes ----------

function preencherPerfil() {
  const p = dados.perfil;
  $('perf-altura').value = p.altura ?? '';
  $('perf-idade').value = p.idade ?? '';
  $('perf-sexo').value = p.sexo || '';
  $('perf-nivel').value = String(p.nivel ?? 1.2);
  $('perf-objetivo').value = String(p.objetivo ?? 0);
  $('perf-prot').value = p.protKg ?? 1.6;
  $('perf-agua').value = p.aguaMlKg ?? 35;
  $('ia-chave').value = dados.chave || '';
  const m = metaCalorias();
  $('perf-calculo').textContent = m
    ? `Metabolismo basal ≈ ${fmt(m.tmb)} kcal. Meta diária (sem exercícios) = ${fmt(m.meta)} kcal. Água: ${metaCopos()} copos.`
    : '';
}

$('form-perfil').addEventListener('submit', (e) => {
  e.preventDefault();
  dados.perfil = {
    altura: parseFloat($('perf-altura').value),
    idade: parseInt($('perf-idade').value, 10),
    sexo: $('perf-sexo').value,
    nivel: parseFloat($('perf-nivel').value),
    objetivo: parseInt($('perf-objetivo').value, 10),
    protKg: parseFloat($('perf-prot').value),
    aguaMlKg: parseFloat($('perf-agua').value),
  };
  salvar();
  preencherPerfil();
  toast('Perfil salvo');
});

$('form-ia').addEventListener('submit', async (e) => {
  e.preventDefault();
  const chave = $('ia-chave').value.trim().replace(/\s+/g, '');
  const status = $('ia-status');
  if (!chave) {
    dados.chave = '';
    salvar();
    status.textContent = 'Chave removida.';
    return;
  }
  if (!chave.startsWith('sk-ant-')) {
    status.textContent = 'A chave deve começar com “sk-ant-”. Confira se copiou inteira.';
    return;
  }
  const antiga = dados.chave;
  dados.chave = chave;
  $('btn-chave').disabled = true;
  status.textContent = 'Testando a conexão…';
  try {
    await chamarClaude({
      model: MODELO,
      max_tokens: 1024,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: 'Responda apenas: ok' }],
    });
    salvar();
    status.textContent = '✅ Conectado! Já pode calcular refeições por foto.';
  } catch (err) {
    dados.chave = antiga;
    status.textContent = '❌ ' + err.message;
  } finally {
    $('btn-chave').disabled = false;
  }
});

$('btn-exportar').addEventListener('click', () => {
  const { chave, ...semChave } = dados;
  const blob = new Blob([JSON.stringify(semChave, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `saude-backup-${hoje()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('arq-importar').addEventListener('change', async (e) => {
  const arq = e.target.files[0];
  if (!arq) return;
  try {
    const lido = JSON.parse(await arq.text());
    if (!Array.isArray(lido.pesos) || !Array.isArray(lido.comidas)) throw new Error();
    if (!confirm('Substituir os dados atuais pelos do backup?')) return;
    const chave = dados.chave;
    localStorage.setItem(CHAVE_DADOS, JSON.stringify({ ...lido, chave }));
    dados = carregar();
    preencherPerfil();
    toast('Backup importado');
    irPara('inicio');
  } catch {
    toast('Arquivo de backup inválido');
  } finally {
    e.target.value = '';
  }
});

// ---------- Início ----------

preencherPerfil();
irPara(dados.perfil.altura ? 'inicio' : 'ajustes');
renderInicio();

// Atualiza quando volta para o app (ex.: virou o dia)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') renderInicio();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
