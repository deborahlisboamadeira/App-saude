'use strict';

// ---------- Dados ----------

const CHAVE_DADOS = 'app-saude:v1';
const MODELO = 'claude-opus-5-5';

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

function carregar() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_DADOS));
    if (salvo) return { pesos: [], comidas: [], atividades: [], perfil: {}, chave: '', ...salvo };
  } catch (e) { /* dados corrompidos: começa do zero */ }
  return {
    perfil: { altura: null, idade: null, sexo: '', nivel: 1.2, objetivo: 0, protKg: 1.6 },
    pesos: [],
    comidas: [],
    atividades: [],
    chave: '',
  };
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

function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

function pesoAtual() {
  if (!dados.pesos.length) return null;
  return [...dados.pesos].sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id)).at(-1).kg;
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
  if (!kg || !p.altura || !p.idade) return null;
  const tmb = 10 * kg + 6.25 * p.altura - 5 * p.idade + (p.sexo === 'm' ? 5 : -161);
  return { tmb, meta: Math.round(tmb * Number(p.nivel) + Number(p.objetivo)) };
}

function metaProteina() {
  const kg = pesoAtual();
  return kg ? Math.round(kg * Number(dados.perfil.protKg || 1.6)) : null;
}

// Calorias líquidas do exercício (desconta o gasto de repouso, que já está na meta)
function estimarKcal(tipo, minutos) {
  const kg = pesoAtual() || 70;
  const met = (ATIVIDADES.find((a) => a[0] === tipo) || ATIVIDADES.at(-1))[2];
  return Math.round(Math.max(met - 1, 0) * kg * (minutos / 60));
}

// ---------- Telas ----------

const TITULOS = { inicio: 'Hoje', peso: 'Peso', comida: 'Comida', atividade: 'Atividade', ajustes: 'Ajustes' };

function irPara(tela) {
  document.querySelectorAll('.tela').forEach((s) => s.classList.toggle('ativa', s.id === 'tela-' + tela));
  document.querySelectorAll('.abas button').forEach((b) => b.classList.toggle('ativa', b.dataset.ir === tela));
  $('titulo').textContent = TITULOS[tela];
  for (const id of ['peso-data', 'comida-data', 'ativ-data']) if (!$(id).value) $(id).value = hoje();
  if (tela === 'peso') renderPeso();
  if (tela === 'inicio') renderInicio();
  if (tela === 'ajustes') preencherPerfil();
  window.scrollTo(0, 0);
}

document.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => irPara(b.dataset.ir)));

function renderInicio() {
  const dia = hoje();
  $('data-hoje').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  const kg = pesoAtual();
  const p = dados.perfil;
  const vImc = imc(kg, p.altura);
  $('h-peso').textContent = kg ? fmt(kg, 1) : '–';
  $('h-altura').textContent = p.altura ? fmt(p.altura) : '–';
  $('h-imc').textContent = vImc ? fmt(vImc, 1) : '–';
  $('h-imc-cat').textContent = categoriaImc(vImc);
  $('aviso-perfil').hidden = Boolean(p.altura && p.idade && kg);
  if (!kg && p.altura && p.idade) $('aviso-perfil').innerHTML = 'Lance seu peso na aba <b>Peso</b> para calcular IMC e metas.';

  const comidas = dados.comidas.filter((c) => c.data === dia);
  const ativs = dados.atividades.filter((a) => a.data === dia);
  const comi = comidas.reduce((s, c) => s + Number(c.kcal), 0);
  const prot = comidas.reduce((s, c) => s + Number(c.prot), 0);
  const queimei = ativs.reduce((s, a) => s + Number(a.kcal), 0);

  const m = metaCalorias();
  const total = m ? m.meta + queimei : null;
  $('h-cal-comi').textContent = fmt(comi);
  $('h-cal-queimei').textContent = fmt(queimei);
  $('h-cal-meta').textContent = m ? `meta ${fmt(m.meta)} + ${fmt(queimei)} exercício` : 'complete o perfil';
  const resta = total != null ? total - comi : null;
  $('h-cal-resta').textContent = resta != null ? fmt(resta) : '–';
  $('h-cal-resta').classList.toggle('negativo', resta != null && resta < 0);
  const barraCal = $('h-cal-barra');
  barraCal.style.width = total ? Math.min(100, (comi / total) * 100) + '%' : '0';
  barraCal.classList.toggle('excedeu', resta != null && resta < 0);

  const mp = metaProteina();
  $('h-prot-comi').textContent = fmt(prot) + ' g';
  $('h-prot-alvo').textContent = mp ? fmt(mp) + ' g' : '–';
  $('h-prot-meta').textContent = mp ? `${fmt(p.protKg, 1)} g/kg` : '';
  $('h-prot-resta').textContent = mp ? fmt(Math.max(0, mp - prot)) + ' g' : '–';
  $('h-prot-barra').style.width = mp ? Math.min(100, (prot / mp) * 100) + '%' : '0';

  const itens = [
    ...comidas.map((c) => ({ ...c, tipoItem: 'comida' })),
    ...ativs.map((a) => ({ ...a, tipoItem: 'atividade' })),
  ].sort((a, b) => b.id.localeCompare(a.id));

  $('lista-hoje-vazia').hidden = itens.length > 0;
  $('lista-hoje').innerHTML = itens.map((i) => i.tipoItem === 'comida'
    ? `<li><span class="icone">🍽️</span><span class="info"><b>${esc(i.nome)}</b><small>${fmt(i.prot)} g proteína</small></span>
        <span class="num">${fmt(i.kcal)} kcal</span><button class="apagar" data-apagar="comidas:${i.id}" aria-label="Apagar">✕</button></li>`
    : `<li><span class="icone">🏃</span><span class="info"><b>${esc(i.nome)}</b><small>${fmt(i.min)} min · ${i.fonte === 'relogio' ? 'relógio' : 'estimado'}</small></span>
        <span class="num destaque">−${fmt(i.kcal)} kcal</span><button class="apagar" data-apagar="atividades:${i.id}" aria-label="Apagar">✕</button></li>`
  ).join('');
}

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
  const lista = [...dados.pesos].sort((a, b) => a.data.localeCompare(b.data));
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

async function analisarRefeicao(descricao, imagem) {
  const conteudo = [];
  if (imagem) conteudo.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imagem } });
  conteudo.push({ type: 'text', text: descricao ? `Descrição: ${descricao}` : 'Estime a refeição da foto.' });

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': dados.chave,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 16000,
      fallbacks: 'default',
      system: SISTEMA_REFEICAO,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA_REFEICAO } },
      messages: [{ role: 'user', content: conteudo }],
    }),
  });

  const corpo = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    if (resp.status === 401) throw new Error('Chave da API inválida. Confira em Ajustes.');
    if (resp.status === 429) throw new Error('Muitas requisições. Tente de novo em instantes.');
    throw new Error(corpo?.error?.message || `Erro ${resp.status} ao calcular.`);
  }
  if (corpo.stop_reason === 'refusal') throw new Error('Não foi possível analisar esta refeição. Lance os valores manualmente.');
  if (corpo.stop_reason === 'max_tokens') throw new Error('A resposta veio incompleta. Tente de novo.');

  const texto = (corpo.content || []).find((b) => b.type === 'text')?.text;
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
  $('ia-chave').value = dados.chave || '';
  const m = metaCalorias();
  $('perf-calculo').textContent = m
    ? `Metabolismo basal ≈ ${fmt(m.tmb)} kcal. Meta diária (sem exercícios) = ${fmt(m.meta)} kcal.`
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
  };
  salvar();
  preencherPerfil();
  toast('Perfil salvo');
});

$('form-ia').addEventListener('submit', (e) => {
  e.preventDefault();
  dados.chave = $('ia-chave').value.trim();
  salvar();
  toast(dados.chave ? 'Chave salva' : 'Chave removida');
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
    dados = { ...carregar(), ...lido, chave: dados.chave };
    salvar();
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
if (!dados.perfil.altura) renderInicio();

// Atualiza quando volta para o app (ex.: virou o dia)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') renderInicio();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
