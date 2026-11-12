// GIRO — LÓGICA DO SORTEADOR
// Organização do arquivo:
//   1. Referências ao DOM e configuração
//   2. Geração de números aleatórios
//   3. Leitura e validação dos campos
//   4. Preparação e cálculo do sorteio
//   5. Histórico (LocalStorage)
//   6. Efeito de confetes (Canvas)
//   7. Animação e controle do sorteio
//   8. Abas, cópia do resultado e menu
//   9. Lista de nomes (contador, limpeza e atalho)
//   10. Inicialização

"use strict";

// ---------------------------------------------------------------
// 1. REFERÊNCIAS AO DOM E CONFIGURAÇÃO
// ---------------------------------------------------------------

const obterElemento = (id) => document.getElementById(id);

const elementos = {
  botaoSortear: obterElemento("btn-sortear"),
  botaoCopiar: obterElemento("btn-copiar"),
  botaoLimpar: obterElemento("btn-limpar"),
  botaoMenu: obterElemento("btn-menu"),
  menu: obterElemento("menu"),
  saida: obterElemento("saida"),
  erro: obterElemento("erro"),
  historico: obterElemento("historico"),
  abas: [...document.querySelectorAll(".aba")],
  lista: obterElemento("lista"),
  contadorNomes: obterElemento("contador-nomes"),
  botaoLimparNomes: obterElemento("btn-limpar-nomes"),
  quantidadeNomes: obterElemento("qtd-nomes"),
  semRepetir: obterElemento("semRepetir"),
  canvas: obterElemento("festa")
};

const CONFIG = {
  chaveHistorico: "giro:historico",
  limiteHistorico: 8,
  limiteQuantidade: 500,
  limiteIntervalo: 2 ** 32,
  limiteNomes: 10000,
  textoCopiar: "Copiar resultado",
  duracaoAnimacao: 1500
};

let modoAtual = "numeros";
let ultimoResultado = "";
let girando = false;
let timerCopiar = null;
let timerGiro = null;
let animacaoConfete = null;

const prefereMovimentoReduzido = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------
// 2. GERAÇÃO DE NÚMEROS ALEATÓRIOS
// ---------------------------------------------------------------

function sortearIndice(n) {
  if (!Number.isSafeInteger(n) || n < 1 || n > CONFIG.limiteIntervalo) {
    throw new Error("Não foi possível preparar esse intervalo de sorteio.");
  }

  if (n === 1) return 0;

  if (!window.crypto || typeof window.crypto.getRandomValues !== "function") {
    throw new Error(
      "Seu navegador não oferece suporte ao sorteio seguro. Atualize o navegador e tente novamente."
    );
  }

  const buffer = new Uint32Array(1);
  // Maior múltiplo de n dentro do intervalo de 32 bits; acima dele o sorteio seria enviesado.
  const limiteAceito = Math.floor(CONFIG.limiteIntervalo / n) * n;

  do {
    window.crypto.getRandomValues(buffer);
  } while (buffer[0] >= limiteAceito);

  return buffer[0] % n;
}

function sortearIndicesUnicos(total, quantidade) {
  const trocas = new Map();
  const resultados = [];

  for (let indice = 0; indice < quantidade; indice += 1) {
    const escolhido = indice + sortearIndice(total - indice);
    const valorEscolhido = trocas.has(escolhido)
      ? trocas.get(escolhido)
      : escolhido;
    const valorAtual = trocas.has(indice) ? trocas.get(indice) : indice;

    trocas.set(escolhido, valorAtual);
    resultados.push(valorEscolhido);
  }

  return resultados;
}

function sortearIndicesComRepeticao(total, quantidade) {
  return Array.from({ length: quantidade }, () => sortearIndice(total));
}

// ---------------------------------------------------------------
// 3. LEITURA E VALIDAÇÃO DOS CAMPOS
// ---------------------------------------------------------------

function lerInteiro(campo, nomeCampo) {
  const texto = campo.value.trim();

  if (texto === "") {
    throw new Error(`Preencha o campo ${nomeCampo}.`);
  }

  const valor = Number(texto);

  if (!Number.isSafeInteger(valor)) {
    throw new Error(`${nomeCampo} precisa ser um número inteiro válido.`);
  }

  return valor;
}

function lerQuantidade(campo) {
  const quantidade = lerInteiro(campo, "Quantidade");

  if (quantidade < 1 || quantidade > CONFIG.limiteQuantidade) {
    throw new Error(
      `A quantidade deve estar entre 1 e ${CONFIG.limiteQuantidade}.`
    );
  }

  return quantidade;
}

function normalizarNomes(texto) {
  const nomes = texto
    .split(/\r?\n/)
    .map((nome) => nome.trim().replace(/\s+/g, " "))
    .filter(Boolean);

  const nomesUnicos = new Map();

  nomes.forEach((nome) => {
    const chave = nome.toLocaleLowerCase("pt-BR");

    if (!nomesUnicos.has(chave)) {
      nomesUnicos.set(chave, nome);
    }
  });

  return [...nomesUnicos.values()];
}

// ---------------------------------------------------------------
// 4. PREPARAÇÃO E CÁLCULO DO SORTEIO
// ---------------------------------------------------------------

function prepararSorteio() {
  const semRepetir = obterElemento("semRepetir").checked;

  if (modoAtual === "numeros") {
    const minimo = lerInteiro(obterElemento("min"), '"De"');
    const maximo = lerInteiro(obterElemento("max"), '"Até"');
    const quantidade = lerQuantidade(obterElemento("qtd"));

    if (minimo > maximo) {
      throw new Error('O valor do campo "De" deve ser menor ou igual ao campo "Até".');
    }

    // BigInt evita perda de precisão em intervalos muito grandes.
    const totalGrande = BigInt(maximo) - BigInt(minimo) + 1n;

    if (totalGrande < 1n || totalGrande > BigInt(CONFIG.limiteIntervalo)) {
      throw new Error("O intervalo precisa conter no máximo 4.294.967.296 números.");
    }

    const total = Number(totalGrande);

    if (semRepetir && quantidade > total) {
      throw new Error(`Esse intervalo possui apenas ${total} número(s) diferente(s).`);
    }

    return {
      total,
      quantidade,
      semRepetir,
      transformar: (indice) => String(BigInt(minimo) + BigInt(indice))
    };
  }

  const nomes = normalizarNomes(obterElemento("lista").value);
  const quantidade = lerQuantidade(obterElemento("qtd-nomes"));

  if (nomes.length === 0) {
    throw new Error("Digite pelo menos um nome para realizar o sorteio.");
  }

  if (nomes.length > CONFIG.limiteNomes) {
    throw new Error(`A lista pode ter no máximo ${CONFIG.limiteNomes} nomes diferentes.`);
  }

  if (semRepetir && quantidade > nomes.length) {
    throw new Error(
      `Sua lista possui ${nomes.length} nome(s) diferente(s), mas você pediu ${quantidade} resultado(s).`
    );
  }

  return {
    total: nomes.length,
    quantidade,
    semRepetir,
    transformar: (indice) => nomes[indice]
  };
}

function calcularResultado(configuracao) {
  const indices = configuracao.semRepetir
    ? sortearIndicesUnicos(configuracao.total, configuracao.quantidade)
    : sortearIndicesComRepeticao(configuracao.total, configuracao.quantidade);

  return indices.map(configuracao.transformar).join(" • ");
}

function mostrarSaida(texto) {
  elementos.saida.textContent = texto;
  elementos.saida.classList.toggle("longo", texto.length > 28);
}

// ---------------------------------------------------------------
// 5. HISTÓRICO (LOCALSTORAGE)
// ---------------------------------------------------------------

function formatarDataHora(data) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(data).replace(",", " às");
}

function validarRegistroHistorico(item) {
  if (!item || typeof item.texto !== "string") return null;

  if (typeof item.timestamp === "number" && Number.isFinite(item.timestamp)) {
    return { texto: item.texto, timestamp: item.timestamp };
  }

  // Formato legado: apenas texto e horário.
  if (typeof item.hora === "string") {
    return { texto: item.texto, hora: item.hora, timestamp: null };
  }

  return null;
}

function lerHistorico() {
  try {
    const dados = JSON.parse(localStorage.getItem(CONFIG.chaveHistorico) || "[]");

    if (!Array.isArray(dados)) return [];

    return dados
      .map(validarRegistroHistorico)
      .filter(Boolean)
      .slice(0, CONFIG.limiteHistorico);
  } catch (erroLeitura) {
    console.warn("Não foi possível ler o histórico salvo.", erroLeitura);
    return [];
  }
}

function gravarHistorico(historico) {
  try {
    localStorage.setItem(CONFIG.chaveHistorico, JSON.stringify(historico));
    return true;
  } catch (erroGravacao) {
    console.warn("Não foi possível salvar o histórico.", erroGravacao);
    return false;
  }
}

function criarItemHistorico(item) {
  const li = document.createElement("li");
  const texto = document.createElement("strong");
  const dataHora = document.createElement("time");

  texto.className = "historico-resultado";
  texto.textContent = item.texto;
  dataHora.className = "historico-data";

  if (typeof item.timestamp === "number") {
    const data = new Date(item.timestamp);
    dataHora.dateTime = data.toISOString();
    dataHora.textContent = formatarDataHora(data);
  } else {
    dataHora.textContent = `Data não registrada · ${item.hora}`;
    dataHora.setAttribute("aria-label", `Data não registrada. Horário: ${item.hora}`);
  }

  li.append(texto, dataHora);
  return li;
}

function mostrarHistorico() {
  const historico = lerHistorico();
  // DocumentFragment: monta todos os itens fora da página e insere de uma só vez.
  const fragmento = document.createDocumentFragment();

  if (historico.length === 0) {
    const vazio = document.createElement("li");
    vazio.className = "vazio";
    vazio.textContent = "Nenhum giro por aqui ainda. Bora fazer o primeiro?";
    fragmento.appendChild(vazio);
  } else {
    historico.forEach((item) => fragmento.appendChild(criarItemHistorico(item)));
  }

  elementos.historico.replaceChildren(fragmento);
  elementos.botaoLimpar.disabled = historico.length === 0;
}

function salvarHistorico(texto) {
  const registro = { texto, timestamp: Date.now() };
  const atualizado = [registro, ...lerHistorico()].slice(0, CONFIG.limiteHistorico);

  if (!gravarHistorico(atualizado)) {
    elementos.erro.textContent =
      "Resultado pronto, mas o navegador não permitiu salvar o histórico.";
  }

  mostrarHistorico();
}

function limparHistorico() {
  if (lerHistorico().length === 0) return;
  if (!window.confirm("Tem certeza de que deseja apagar todo o histórico?")) return;

  try {
    localStorage.removeItem(CONFIG.chaveHistorico);
    mostrarHistorico();
    elementos.erro.textContent = "";
  } catch (erroRemocao) {
    console.warn("Não foi possível limpar o histórico.", erroRemocao);
    elementos.erro.textContent = "Não foi possível limpar o histórico neste navegador.";
  }
}

// ---------------------------------------------------------------
// 6. EFEITO DE CONFETES (CANVAS)
// ---------------------------------------------------------------

function limparConfetes() {
  if (animacaoConfete !== null) {
    cancelAnimationFrame(animacaoConfete);
    animacaoConfete = null;
  }

  const contexto = elementos.canvas?.getContext("2d");
  contexto?.clearRect(0, 0, elementos.canvas.width, elementos.canvas.height);
}

function soltarConfetes() {
  if (prefereMovimentoReduzido() || !elementos.canvas) return;

  const contexto = elementos.canvas.getContext("2d");
  if (!contexto) return;

  limparConfetes();

  const largura = window.innerWidth;
  const altura = window.innerHeight;
  // Ajusta a resolução do canvas para telas de alta densidade (limitada a 2x por desempenho).
  const escala = Math.min(window.devicePixelRatio || 1, 2);

  elementos.canvas.width = Math.round(largura * escala);
  elementos.canvas.height = Math.round(altura * escala);
  elementos.canvas.style.width = `${largura}px`;
  elementos.canvas.style.height = `${altura}px`;
  contexto.setTransform(escala, 0, 0, escala, 0, 0);

  const cores = ["#a78bfa", "#7c3aed", "#fbbf24", "#c4b5fd", "#ffffff"];
  const pecas = Array.from({ length: 85 }, () => ({
    x: largura / 2,
    y: altura * 0.55,
    velocidadeX: (Math.random() - 0.5) * 13,
    velocidadeY: -Math.random() * 12 - 3,
    tamanho: Math.random() * 5 + 3,
    cor: cores[Math.floor(Math.random() * cores.length)],
    vida: 1
  }));

  // Loop de animação: atualiza posição e transparência de cada peça a cada quadro.
  function animar() {
    contexto.clearRect(0, 0, largura, altura);
    let existemPecas = false;

    pecas.forEach((peca) => {
      peca.x += peca.velocidadeX;
      peca.y += peca.velocidadeY;
      peca.velocidadeY += 0.36;
      peca.vida -= 0.016;

      if (peca.vida > 0) {
        existemPecas = true;
        contexto.globalAlpha = peca.vida;
        contexto.fillStyle = peca.cor;
        contexto.fillRect(peca.x, peca.y, peca.tamanho, peca.tamanho * 1.5);
      }
    });

    contexto.globalAlpha = 1;

    if (existemPecas) {
      animacaoConfete = requestAnimationFrame(animar);
    } else {
      limparConfetes();
    }
  }

  animar();
}

// ---------------------------------------------------------------
// 7. ANIMAÇÃO E CONTROLE DO SORTEIO
// ---------------------------------------------------------------

function finalizarSorteio(resultado) {
  ultimoResultado = resultado;
  mostrarSaida(resultado);

  elementos.saida.classList.remove("girando", "resultado-final");
  void elementos.saida.offsetWidth;
  elementos.saida.classList.add("resultado-final");

  girando = false;
  elementos.botaoSortear.disabled = false;
  elementos.botaoSortear.textContent = "Girar de novo";
  elementos.botaoCopiar.disabled = false;

  salvarHistorico(resultado);
  soltarConfetes();
}

function encerrarAnimacao() {
  if (timerGiro !== null) {
    window.clearTimeout(timerGiro);
    timerGiro = null;
  }

  girando = false;
  elementos.botaoSortear.disabled = false;
  elementos.botaoSortear.textContent = "Girar agora";
  elementos.saida.classList.remove("girando");
}

function girar() {
  if (girando) return;

  elementos.erro.textContent = "";

  let configuracao;
  let resultadoFinal;

  try {
    configuracao = prepararSorteio();
    resultadoFinal = calcularResultado(configuracao);
  } catch (erroSorteio) {
    ultimoResultado = "";
    elementos.botaoCopiar.disabled = true;
    mostrarSaida("?");
    elementos.saida.classList.remove("girando", "resultado-final");
    elementos.erro.textContent = erroSorteio.message;
    return;
  }

  if (prefereMovimentoReduzido()) {
    finalizarSorteio(resultadoFinal);
    return;
  }

  girando = true;
  elementos.botaoSortear.disabled = true;
  elementos.botaoSortear.textContent = "Girando...";
  elementos.botaoCopiar.disabled = true;
  elementos.saida.classList.remove("resultado-final");
  elementos.saida.classList.add("girando");

  let intervalo = 55;
  const inicio = performance.now();

  function passo() {
    const decorrido = performance.now() - inicio;

    if (decorrido >= CONFIG.duracaoAnimacao) {
      timerGiro = null;
      finalizarSorteio(resultadoFinal);
      return;
    }

    try {
      mostrarSaida(calcularResultado(configuracao));
    } catch (erroAnimacao) {
      encerrarAnimacao();
      elementos.erro.textContent = erroAnimacao.message;
      return;
    }

    intervalo = Math.min(intervalo * 1.16, 300);
    timerGiro = window.setTimeout(passo, intervalo);
  }

  mostrarSaida(calcularResultado(configuracao));
  timerGiro = window.setTimeout(passo, intervalo);
}

// ---------------------------------------------------------------
// 8. ABAS, CÓPIA DO RESULTADO E MENU
// ---------------------------------------------------------------

function selecionarAba(abaSelecionada) {
  if (girando) return;

  modoAtual = abaSelecionada.dataset.modo;

  elementos.abas.forEach((aba) => {
    const ativa = aba === abaSelecionada;
    aba.classList.toggle("ativa", ativa);
    aba.setAttribute("aria-selected", String(ativa));
    aba.tabIndex = ativa ? 0 : -1;
  });

  obterElemento("modo-numeros").hidden = modoAtual !== "numeros";
  obterElemento("modo-nomes").hidden = modoAtual !== "nomes";

  elementos.erro.textContent = "";
  ultimoResultado = "";
  elementos.botaoCopiar.disabled = true;
  mostrarSaida("?");
  elementos.saida.classList.remove("girando", "resultado-final");
}

function configurarAbas() {
  elementos.abas.forEach((aba, indice) => {
    aba.addEventListener("click", () => selecionarAba(aba));

    aba.addEventListener("keydown", (evento) => {
      const teclas = ["ArrowLeft", "ArrowRight", "Home", "End"];
      if (!teclas.includes(evento.key)) return;

      evento.preventDefault();
      let proximoIndice = indice;

      if (evento.key === "ArrowRight") {
        proximoIndice = (indice + 1) % elementos.abas.length;
      } else if (evento.key === "ArrowLeft") {
        proximoIndice = (indice - 1 + elementos.abas.length) % elementos.abas.length;
      } else if (evento.key === "Home") {
        proximoIndice = 0;
      } else if (evento.key === "End") {
        proximoIndice = elementos.abas.length - 1;
      }

      const proximaAba = elementos.abas[proximoIndice];
      selecionarAba(proximaAba);
      proximaAba.focus();
    });
  });
}

function copiarComFallback(texto) {
  const campoTemporario = document.createElement("textarea");
  campoTemporario.value = texto;
  campoTemporario.setAttribute("readonly", "");
  campoTemporario.setAttribute("aria-hidden", "true");
  campoTemporario.style.position = "fixed";
  campoTemporario.style.opacity = "0";
  campoTemporario.style.pointerEvents = "none";

  document.body.appendChild(campoTemporario);
  campoTemporario.select();

  let sucesso = false;

  try {
    sucesso = document.execCommand("copy");
  } catch {
    sucesso = false;
  }

  campoTemporario.remove();
  return sucesso;
}

async function copiarResultado() {
  if (!ultimoResultado || girando) {
    elementos.erro.textContent = "Faça um sorteio antes de copiar.";
    return;
  }

  elementos.erro.textContent = "";
  let sucesso = false;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      // Caminho moderno: exige contexto seguro (HTTPS ou localhost).
      await navigator.clipboard.writeText(ultimoResultado);
      sucesso = true;
    } else {
      sucesso = copiarComFallback(ultimoResultado);
    }
  } catch {
    sucesso = copiarComFallback(ultimoResultado);
  }

  elementos.botaoCopiar.textContent = sucesso ? "Copiado ✓" : "Não foi possível copiar";
  window.clearTimeout(timerCopiar);
  timerCopiar = window.setTimeout(() => {
    elementos.botaoCopiar.textContent = CONFIG.textoCopiar;
    timerCopiar = null;
  }, 2000);
}

function fecharMenu() {
  elementos.menu.classList.remove("aberto");
  elementos.botaoMenu.setAttribute("aria-expanded", "false");
  elementos.botaoMenu.setAttribute("aria-label", "Abrir menu");
}

function configurarMenu() {
  elementos.botaoMenu.addEventListener("click", () => {
    const abriu = elementos.menu.classList.toggle("aberto");
    elementos.botaoMenu.setAttribute("aria-expanded", String(abriu));
    elementos.botaoMenu.setAttribute("aria-label", abriu ? "Fechar menu" : "Abrir menu");

    if (!abriu) elementos.botaoMenu.focus();
  });

  elementos.menu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", fecharMenu);
  });

  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && elementos.menu.classList.contains("aberto")) {
      fecharMenu();
      elementos.botaoMenu.focus();
    }
  });

  document.addEventListener("click", (evento) => {
    const clicouFora =
      !elementos.menu.contains(evento.target) &&
      !elementos.botaoMenu.contains(evento.target);

    if (clicouFora) fecharMenu();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) fecharMenu();
  });
}

function configurarAnimacoesDeEntrada() {
  const blocos = document.querySelectorAll(".bloco");

  if (!("IntersectionObserver" in window) || prefereMovimentoReduzido()) return;

  const observador = new IntersectionObserver((entradas, observer) => {
    entradas.forEach((entrada) => {
      if (entrada.isIntersecting) {
        entrada.target.classList.add("visivel");
        observer.unobserve(entrada.target);
      }
    });
  }, { threshold: 0.08 });

  blocos.forEach((bloco) => {
    bloco.classList.add("revela");
    observador.observe(bloco);
  });
}

// ---------------------------------------------------------------
// 9. LISTA DE NOMES (CONTADOR, LIMPEZA E ATALHO)
// ---------------------------------------------------------------

function contarNomes(texto) {
  const linhasPreenchidas = texto
    .split(/\r?\n/)
    .filter((linha) => linha.trim() !== "").length;
  const unicos = normalizarNomes(texto).length;

  return { unicos, ignorados: linhasPreenchidas - unicos };
}

function atualizarInfoNomes() {
  const { unicos, ignorados } = contarNomes(elementos.lista.value);

  let texto = `${unicos} ${unicos === 1 ? "nome" : "nomes"}`;

  if (ignorados > 0) {
    texto += ` · ${ignorados} ${ignorados === 1 ? "repetido ignorado" : "repetidos ignorados"}`;
  }

  elementos.contadorNomes.textContent = texto;
  elementos.contadorNomes.classList.toggle("aviso", unicos > CONFIG.limiteNomes);
  elementos.botaoLimparNomes.disabled = elementos.lista.value === "";

  const limitarPelaLista = elementos.semRepetir.checked && unicos > 0;
  elementos.quantidadeNomes.max = limitarPelaLista
    ? Math.min(unicos, CONFIG.limiteQuantidade)
    : CONFIG.limiteQuantidade;
}

function limparListaNomes() {
  if (girando) return;

  elementos.lista.value = "";
  elementos.erro.textContent = "";
  atualizarInfoNomes();
  elementos.lista.focus();
}

function configurarNomes() {
  elementos.lista.addEventListener("input", atualizarInfoNomes);
  elementos.semRepetir.addEventListener("change", atualizarInfoNomes);
  elementos.botaoLimparNomes.addEventListener("click", limparListaNomes);

  elementos.lista.addEventListener("keydown", (evento) => {
    const atalho = (evento.ctrlKey || evento.metaKey) && evento.key === "Enter";
    if (!atalho) return;

    evento.preventDefault();
    girar();
  });

  atualizarInfoNomes();
}

// ---------------------------------------------------------------
// 10. INICIALIZAÇÃO
// ---------------------------------------------------------------

function inicializar() {
  elementos.botaoSortear.addEventListener("click", girar);
  elementos.botaoCopiar.addEventListener("click", copiarResultado);
  elementos.botaoLimpar.addEventListener("click", limparHistorico);

  configurarAbas();
  configurarMenu();
  configurarNomes();
  configurarAnimacoesDeEntrada();

  obterElemento("ano").textContent = new Date().getFullYear();
  mostrarHistorico();
}

inicializar();
