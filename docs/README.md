# Test-Puppeteer

Bot de RPA (Robotic Process Automation) construído com **Puppeteer** que automatiza o preenchimento e o envio de pedidos no sistema de demonstração **PedDemo** (da [Hobots](https://hobots.app)), lendo os dados de uma planilha LibreOffice e acompanhando cada execução pelo painel da plataforma Hobots.

É um projeto de aprendizado de automação de navegador do Icaro — cada decisão de implementação é discutida e ancorada no código real em [docs/aprendizado-rpa.md](./aprendizado-rpa.md).

**Aviso de segurança:** por ser um app de demonstração, as credenciais de login estão hard-coded em [src/actions/login.js](../src/actions/login.js). Em um projeto real, credenciais ficam em variáveis de ambiente.

---

## O que o projeto faz

O fluxo do bot, implementado em [src/index.js](../src/index.js), é:

1. **Abre o navegador** (Chromium controlado pelo Puppeteer, em modo visível).
2. **Faz login** no PedDemo ([src/actions/login.js](../src/actions/login.js)), com retry em caso de falha transitória.
3. **Navega pelo sidebar** até a tela de pedidos e abre o formulário "Novo pedido" ([src/actions/selectItemSidebar.js](../src/actions/selectItemSidebar.js)).
4. **Lê a planilha** `pedidos.ods` via `xlsx` ([src/actions/getDataExcel.js](../src/actions/getDataExcel.js)).
5. **Processa cada pedido** ([src/actions/realizarPedido.js](../src/actions/realizarPedido.js)): seleciona cliente, tipo, forma de pagamento, preenche a taxa de entrega quando aplicável, adiciona a quantidade da pizza e envia o pedido.
6. **Fecha o navegador** ao terminar.

Cada pedido processado é rastreado como uma **transação/etapa** no painel do Hobots, e os resultados (sucesso, falha ou ocorrência — ex.: pizza indisponível) ficam registrados com screenshot do erro quando algo dá errado.

## Tecnologias usadas

| Camada | Tecnologia |
|---|---|
| Automação de navegador | [Puppeteer](https://pptr.dev/) + `puppeteer-core` |
| Orquestração / execução | [Hobots](https://hobots.app) (SDK `hobots`) |
| Leitura de planilha | [`xlsx`](https://sheetjs.com/) (`.ods`) |
| Resiliência | [`async-retry`](https://github.com/vercel/async-retry) |
| Runtime | Node.js + ES Modules (`"type": "module"`) |
| Gerenciador de pacotes | `pnpm` |

## Como instalar e rodar localmente

Pré-requisitos: Node.js e pnpm instalados.

```bash
# 1. Instalar as dependências
pnpm install

# 2. Configurar as variáveis de ambiente
cp .env.example .env
#  - Preencha HOBOTS_CLIENT_SECRET com o secret da sua conta Hobots

# 3. Rodar o bot
pnpm start
# equivale a: node --env-file=.env src/index.js
```

### Variáveis de ambiente

Veja [.env.example](../.env.example):

| Variável | Descrição |
|---|---|
| `HOBOTS_CLIENT_SECRET` | Secret da sua instância Hobots (obrigatória) |
| `HOBOTS_ENVIRONMENT` | Ambiente de execução (ex.: `production`) |
| `HOBOTS_RELEASE` | Identificador da versão (ex.: `warrior-agent@1.0.0`) |
| `HOBOTS_INSTANCE_ID` | Opcional; quando vazio, usa o hostname da máquina |

> A planilha `pedidos.ods` é lida de um caminho fixo (`/home/icaro-almeida/Documentos/pedidos.ods`, em [src/actions/getDataExcel.js](../src/actions/getDataExcel.js#L11)). Ajuste esse caminho para a sua máquina.

## Demonstração do projeto funcionando

![Bot Puppeteer preenchendo e enviando pedidos no PedDemo](screenshot-completo.png)

O `screenshot-completo.png` é capturado durante a execução do bot em background, mostrando o navegador controlado preenchendo os pedidos da planilha.

## Link para o deploy

Este projeto não possui um deploy web — é um **agente RPA** que roda localmente e se conecta ao painel da plataforma [Hobots](https://hobots.app) para ser disparado e monitorado remotamente.

## Desafios enfrentados e como foram resolvidos

Todos os desafios abaixo estão registrados com explicação detalhada, código-fonte e *takeaway* em [docs/aprendizado-rpa.md](./aprendizado-rpa.md). Resumo dos principais:

- **`retry` vs `waitForSelector` — são redundantes?** Não. Cada um resolve um eixo diferente: um espera um elemento aparecer dentro de *uma* tentativa; o outro reexecuta o fluxo inteiro se algo falhar. [`async-retry`](../src/actions/login.js) é rede de segurança para instabilidade, não para bug.
- **`TypeError: ctx.info is not a function`** — o logger do SDK da Hobots vive em `ctx.log.<nível>(...)`, **não** direto em `ctx.<nível>(...)`. E `ctx.log.<nível>` aceita uma única string — objetos precisam de `JSON.stringify(...)`.
- **Ver o conteúdo de um array/objeto no log** — `pedidos.entries()` é um iterador preguiçoso, não os dados. Para logar de fato, use a string `JSON.stringify(pedidos)` ou `step.setData(chave, valor)`.
- **`normalize-space(text())` em XPath** — textos no DOM vêm com quebras de linha/espaços; sem normalizar, uma string visualmente igual nunca "bate" na comparação. Pegadinha: `text()` só olha o primeiro nó de texto filho — para texto quebrado por tags use `normalize-space(.)`.
- **Closure com estado vs função pura (extrair para `utils/`)** — funções puras como [`textoNormalizado`](../src/utils/textoNormalizado.js) migram facilmente; closures que mutam o escopo (como `iniciarEtapa` em [realizarPedido.js](../src/actions/realizarPedido.js#L27-L33)) ficam melhores perto de onde são usadas, a não ser que virem funções fábrica.
- **`page.evaluate` e seus argumentos** — o código Node e o navegador são mundos separados. A função passada não enxerga o escopo externo (imports não valem lá dentro) — só recebe o que for passado como argumento, e tudo só pode ser JSON-serializável ou um `ElementHandle`.

## Testes

O projeto inclui testes unitários de Node (`node:test`) para o fluxo de pedido, cobrindo sucesso, recuperação de falhas temporárias, esgotamento de retry e o caso de pizza indisponível.

```bash
node --test tests/
```

## Estrutura do projeto

```
src/
  index.js                 # Orquestra o fluxo completo
  hobots.js                # Inicializa o SDK da Hobots
  actions/
    login.js               # Login, com retry
    selectItemSidebar.js   # Navegação pelo sidebar
    getDataExcel.js        # Leitura da planilha .ods
    realizarPedido.js      # Preenche e envia cada pedido
  utils/
    textoNormalizado.js    # Função pura de normalização de texto
    time.js                # Utilitário de tempo
tests/
  realizarPedido.test.js   # Testes do fluxo de pedido
docs/
  aprendizado-rpa.md       # Registro de aprendizado de RPA
```