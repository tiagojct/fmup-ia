# Adaptar o ensino à GenAI

Plataforma web de apoio a uma sessão de formação de 120 minutos para docentes da Faculdade de Medicina da Universidade do Porto, sobre estratégias pedagógicas com inteligência artificial generativa.

Articula-se com o [Quadro de referência institucional FMUP · IA](https://tiagojct.eu/fmup-ia/) e com a ferramenta [Themis](https://tiagojct.eu/fmup-ia/themis/), que vivem no mesmo repositório e são publicados no mesmo sítio.

Endereço publicado: <https://tiagojct.eu/fmup-ia/training/>

## Estatuto

Contributo individual de Tiago Jacinto, submetido a apreciação institucional. Não é material formativo aprovado pelos órgãos da FMUP e não vincula a Faculdade. Ver a página Sobre do site.

## Conteúdo

```
training/
├── _quarto.yml              # configuração do website
├── _variables.yml           # variáveis da sessão, incluindo o URL da ficha partilhada
├── theme.scss               # overlay sobre o tema quarto-fmup
├── _extensions/tiagojct/fmup/   # tema institucional (cópia do projecto principal)
├── index.qmd                # início, enquadramento e logística
├── programa.qmd             # oito blocos, com cronómetro para o facilitador
├── README.md                # este ficheiro
├── pratica.qmd              # folha de trabalho do bloco 6, preparada para impressão
├── regras.qmd               # sete princípios e regras práticas
├── recursos.qmd             # referências verificadas e leitura adicional
├── sobre.qmd                # autoria, estatuto editorial, licença, registo de alterações
├── fichas/                  # seis fichas de actividade, estrutura idêntica
├── js/cronometro.js         # cronómetro, JavaScript sem dependências
└── assets/                  # logótipos e favicon
```

## Construir localmente

Requer [Quarto](https://quarto.org) 1.5 ou superior. Não há passo de compilação adicional, nem dependências de Node ou Python.

```bash
cd training
quarto preview          # servidor de desenvolvimento na porta 4322
quarto render           # construção completa para _site/
```

O projecto principal, na raiz do repositório, é um projecto Quarto distinto e exclui `training/` da sua própria construção (`!training/**` na lista de `render`). Os dois constroem-se de forma independente.

A razão de serem projectos separados é simples: o Quarto admite uma navbar por projecto, e esta sessão precisa da sua própria navegação, distinta da do Quadro.

## Publicar

Publicação no GitHub Pages, pelo mesmo workflow do projecto principal, em `.github/workflows/publish.yml`. Não há configuração própria a manter.

A cada `push` para `main`, o workflow:

1. instala o Quarto na versão fixada (1.9.38);
2. constrói o projecto principal, para `_site/`;
3. constrói este projecto, para `training/_site/`;
4. copia `training/_site` para `_site/training`;
5. publica `_site/` no ramo `gh-pages`.

O resultado fica em `https://tiagojct.eu/fmup-ia/training/`.

As ligações desta plataforma para o Quadro e para a Themis são absolutas, e não relativas, de propósito: assim resolvem correctamente tanto no sítio publicado como durante `quarto preview` deste projecto isolado, onde `../quadro/` não existiria.

## Antes de cada sessão

1. Definir `ficha-partilhada.url` em `_variables.yml`, com o endereço do documento colaborativo onde os pares depositam as fichas do bloco 6. Enquanto o valor for `FICHA_PARTILHADA_URL`, a página de Prática mostra um aviso em vez da ligação.
2. Confirmar que os prompts das fichas continuam a produzir o resultado descrito. Os modelos mudam, e as fichas assumem comportamentos que podem deixar de se verificar.
3. Preparar o material do plano B: cada ficha indica o que imprimir para funcionar sem ligação à internet.
4. Verificar o acesso à [IAedu](https://iaedu.pt) com credenciais `@up.pt`.

## Convenções de escrita

Documentadas na página Sobre e aplicadas a todo o conteúdo:

- Português europeu, ortografia pré-AO90, por coerência com o Quadro.
- Sem travessões como sinal de pontuação, sem emojis.
- Aspas rectas nos blocos de código e nos prompts, para permitir cópia directa.
- As seis fichas partilham a mesma estrutura de secções, sem excepção.

## Verificação de referências

Nenhuma referência entra sem verificação na fonte primária: DOI através do Crossref, artigos biomédicos através da PubMed, recursos institucionais através da página do editor. Correcções de referências têm prioridade sobre qualquer outra alteração.

## Licença

[CC BY 4.0](LICENSE) para conteúdo e código. As marcas institucionais, incluindo os logótipos da FMUP e da Universidade do Porto, não estão cobertas por esta licença.
