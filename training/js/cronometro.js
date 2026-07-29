// Cronómetro do facilitador, JavaScript sem dependências.
//
// Conta em decrescente a partir da duração do bloco seleccionado. Não
// guarda estado, não faz pedidos de rede e não usa armazenamento local:
// se a página for recarregada, o cronómetro recomeça.
//
// Acessibilidade: o mostrador tem aria-live="off" de propósito. Um live
// region que muda a cada segundo seria insuportável com leitor de ecrã.
// Os anúncios passam pelo parágrafo de estado, que só muda em transições
// relevantes: iniciar, pausar, repor, tempo esgotado. O fim do tempo é
// assinalado por texto, e não apenas por cor.
(function () {
  'use strict';

  var raiz = document.getElementById('cronometro');
  if (!raiz) return;

  var mostrador = raiz.querySelector('.cronometro-display');
  var estado = raiz.querySelector('.cronometro-estado');
  var btIniciar = raiz.querySelector('[data-accao="iniciar"]');
  var btRepor = raiz.querySelector('[data-accao="repor"]');
  var blocos = Array.prototype.slice.call(raiz.querySelectorAll('.cronometro-bloco'));

  var duracao = parseInt(raiz.dataset.duracao, 10) || 300;
  var restante = duracao;
  var temporizador = null;

  function formatar(segundos) {
    var negativo = segundos < 0;
    var abs = Math.abs(segundos);
    var m = Math.floor(abs / 60);
    var s = abs % 60;
    return (negativo ? '-' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function desenhar() {
    mostrador.textContent = formatar(restante);
    raiz.classList.toggle('is-terminado', restante <= 0);
  }

  function dizer(texto) {
    estado.textContent = texto;
  }

  function parar() {
    if (temporizador) {
      clearInterval(temporizador);
      temporizador = null;
    }
    btIniciar.textContent = 'Iniciar';
    btIniciar.setAttribute('aria-pressed', 'false');
  }

  function tique() {
    restante -= 1;
    desenhar();
    if (restante === 0) {
      dizer('Tempo esgotado.');
    }
  }

  btIniciar.addEventListener('click', function () {
    if (temporizador) {
      parar();
      dizer('Em pausa, ' + formatar(restante) + ' por decorrer.');
      return;
    }
    temporizador = setInterval(tique, 1000);
    btIniciar.textContent = 'Pausar';
    btIniciar.setAttribute('aria-pressed', 'true');
    dizer('A contar.');
  });

  btRepor.addEventListener('click', function () {
    parar();
    restante = duracao;
    desenhar();
    dizer('Reposto em ' + formatar(duracao) + '.');
  });

  blocos.forEach(function (botao) {
    botao.addEventListener('click', function () {
      parar();
      duracao = parseInt(botao.dataset.minutos, 10) * 60;
      restante = duracao;
      raiz.dataset.duracao = String(duracao);
      blocos.forEach(function (outro) {
        outro.setAttribute('aria-pressed', outro === botao ? 'true' : 'false');
      });
      desenhar();
      dizer('Bloco seleccionado: ' + botao.textContent.trim() + '.');
    });
  });

  desenhar();
})();
