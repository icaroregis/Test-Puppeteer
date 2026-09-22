# Aprendizado de RPA — dúvidas e conceitos

Registro cronológico de dúvidas levantadas durante o desenvolvimento deste bot, com a explicação ancorada no código real do projeto. Formato de cada entrada:

- **Contexto:** onde no código a dúvida surgiu
- **Dúvida:** a pergunta original
- **Resposta:** a explicação
- **Takeaway:** a regra prática pra lembrar depois

---

## 2026-09-22 — `retry` vs `waitForSelector`: eles são redundantes?

**Contexto:** [`src/actions/login.js`](../src/actions/login.js), onde o fluxo inteiro de login é envolvido por `retry` (lib `async-retry`) e, dentro dele, `page.waitForSelector('a[href="/pedidos"]', { visible: true, timeout: 30000 })` espera a confirmação de que o login funcionou.

**Dúvida:** já que o `waitForSelector` tem um timeout de espera, dava pra tirar o `retry` e evitar redundância?

**Resposta:** não — eles resolvem problemas em eixos diferentes e são complementares:

| | `waitForSelector` | `retry` |
|---|---|---|
| O que faz | Espera uma condição aparecer, dentro de **uma única tentativa** | Reexecuta o bloco inteiro **do zero** se algo falhar |
| Contra o que protege | Renderização assíncrona (elemento ainda não existe no DOM) | Falhas transitórias em qualquer ponto do fluxo (rede, clique que não pegou, servidor lento, etc.) |
| Se falhar | Lança erro e acabou | Tenta de novo (até `retries` vezes) |

`waitForSelector` responde "quanto tempo eu tenho paciência para *este* elemento aparecer". `retry` responde "se o fluxo inteiro deu errado, vale a pena *recomeçar do zero*". Login é um ótimo caso para `retry` porque recarregar `/signin` reseta o estado por completo — não há efeito colateral de repetir (é idempotente).

Cenário onde só o `waitForSelector` não salvaria: a rede engasga durante `page.goto`, o form demora mais que o esperado para ficar interativo, ou o clique no submit dispara um instante antes da página terminar de hidratar e o POST se perde. Sem `retry`, o script morre ali. Com ele, ganha-se uma segunda tentativa limpa.

**Takeaway:**
- Duas perguntas, duas ferramentas: "quanto tempo esperar por isso" → wait explícito (`waitForSelector`, `locator`). "Se der errado, vale recomeçar" → `retry`.
- `retry` é rede de segurança para **instabilidade** (flakiness), não para **bug**. Se ele é acionado sempre, é sinal de erro real no código, não de falha transitória.
- Cuidado com retries aninhados (ex.: `retry` externo em [`login.js`](../src/actions/login.js) + `retry` interno em [`realizarPedido.js`](../src/actions/realizarPedido.js)): o pior caso de tempo total cresce multiplicando as tentativas.
- Prefira `page.locator()` (já usado em `#email`, `#password` e no botão de submit) quando possível — tem auto-wait embutido mais robusto que `waitForSelector` cru.

---

## 2026-09-22 — O que `normalize-space(text())` faz num XPath

**Contexto:** [`src/actions/realizarPedido.js:7`](../src/actions/realizarPedido.js#L7) — `'::-p-xpath(//div[normalize-space(text())="Pedido criado com sucesso."])'` — e reaparece na linha 134 para achar o container da "Pizza".

**Dúvida:** o que exatamente `normalize-space(text())` faz dentro do predicado XPath?

**Resposta:**
- `text()` é um *node test* (não função): seleciona os nós de texto que são filhos **diretos** do elemento de contexto (não desce em tags aninhadas).
- `normalize-space(string?)` é uma função XPath 1.0 que remove espaços/quebras de linha do início e fim da string, e colapsa espaços internos repetidos em um único espaço.
- Juntos: pegam o texto bruto do nó filho e "limpam" antes de comparar com `=`.

O motivo de precisar disso: o navegador preserva no DOM exatamente a formatação do HTML fonte. Um `<div>` que mostra visualmente "Pedido criado com sucesso." muitas vezes existe como:
```html
<div>
  Pedido criado com sucesso.
</div>
```
O texto real do nó é `"\n  Pedido criado com sucesso.\n"`, com quebras/espaços nas bordas. Uma comparação `text()="Pedido criado com sucesso."` sem normalizar **nunca bateria**. `normalize-space` resolve isso antes do `=`.

**Pegadinha avançada:** `text()` retorna **todos** os nós de texto filhos diretos como conjunto, mas quando esse conjunto vira argumento de `normalize-space()`, o XPath só usa o **primeiro** nó do conjunto (não concatena). Se o texto for quebrado por uma tag no meio (ex.: `<div>Pedido <b>criado</b> com sucesso.</div>`), `text()` produz dois nós e `normalize-space(text())` só olha o primeiro ("Pedido"), nunca batendo com a frase completa. Nesse caso o certo é `normalize-space(.)` — o ponto pega o *string-value* do elemento inteiro, concatenando todo o texto interno independente de tags.

**Takeaway:**
- Trate `normalize-space(text())` como padrão para qualquer igualdade de texto em XPath; abra mão só quando tiver certeza de que o texto nunca vem com espaço sobrando (ex.: [`realizarPedido.js:61`](../src/actions/realizarPedido.js#L61) usa `text()="${label}"` sem normalizar — funciona hoje, mas é frágil a qualquer mudança de indentação no HTML).
- Se um seletor que usa `normalize-space(text())` quebrar do nada após mudança visual no site, suspeite de o texto ter sido movido para dentro de uma tag filha — troque para `normalize-space(.)`.
- `::-p-text(...)` (pseudo-seletor do próprio Puppeteer, usado em `button ::-p-text(Cancelar)`) já normaliza espaços por baixo dos panos e é mais curto, mas só serve para "elemento contém este texto" (substring). Use XPath cru quando precisar de navegação por eixos (`parent::div`, `following-sibling::select`) ou igualdade exata, como nas linhas 61, 122 e 134.

---

## 2026-09-22 — `TypeError` misterioso após mudar o caminho da planilha (não era cache)

**Contexto:** [`src/actions/realizarPedido.js`](../src/actions/realizarPedido.js), logo após mover `pedidos.ods` para `/home/icaro-almeida/Documentos/pedidos.ods` e atualizar o caminho em [`getDataExcel.js`](../src/actions/getDataExcel.js). A execução no painel do Hobots falhava em ~1887ms, sem detalhe do erro visível nos "logs do agente".

**Dúvida:** por que passou a falhar depois da mudança de caminho — seria cache da aplicação ou do navegador?

**Resposta:** não era nem uma coisa nem outra. O sintoma tinha duas causas possíveis pra investigar, e a real foi a segunda:

1. **Caminho/arquivo** — descartado por inspeção direta: o arquivo existe no novo caminho, com permissão de leitura, sem lock do LibreOffice. E `path.resolve(__dirname, '/caminho/absoluto')` funciona como o esperado: quando o segundo argumento já é absoluto, o `path.resolve` **ignora o primeiro argumento** (resolve da direita pra esquerda e para no primeiro caminho absoluto que encontra). Então o `__dirname` ali não fazia nada, mas isso não é bug, só é redundante.

2. **A causa real:** duas linhas de debug foram adicionadas junto com a mudança de caminho:
   ```js
   ctx.info('pedidos', pedidos);
   ctx.info('entries ', pedidos.entries());
   ```
   `ctx.info` **não existe**. Conferindo o `.d.ts` da lib `hobots` instalada: o objeto `ctx` (tipo `RunContext`) só expõe `ctx.log`, `ctx.items`, `ctx.progress` e `ctx.tx` — o logger fica em `ctx.log.info(message: string)`, não em `ctx.info`. Como `ctx.info` é `undefined`, chamar `ctx.info(...)` lança `TypeError: ctx.info is not a function` de forma síncrona, assim que a execução chega nessa linha — ou seja, antes mesmo do loop de pedidos começar. Isso bate com a duração curta da falha (~1887ms): o script nunca chegou a processar nenhum pedido.

   Correção: usar `console.info(...)`, já que `const console = ctx.log;` é definido no topo da função (linha 6) como atalho.

**Takeaway:**
- Antes de suspeitar de cache, isole a variável que mudou de fato. Aqui duas coisas mudaram juntas (caminho da planilha + linhas de debug novas) — testar cada uma separadamente (ex.: `ls -la` no arquivo, checar permissões) evita gastar tempo investigando a pista errada.
- No SDK do Hobots, o logger vive em `ctx.log.<nível>(message)`, nunca direto em `ctx.<nível>(...)`. Isso é uma armadilha fácil porque o padrão comum em outras libs (ex.: alguns loggers estruturados) expõe os métodos direto no objeto raiz.
- `ctx.log.<nível>` aceita **um único argumento string** — diferente do `console.log` do Node, que aceita vários e mostra todos. Passar um segundo argumento (ex.: `console.info('texto', objeto)`) não quebra (JS não valida aridade), mas o segundo valor é descartado silenciosamente sem aviso nenhum. Pra logar um objeto, interpole com `JSON.stringify(objeto)` dentro da própria string.
- Um `TypeError: x is not a function` que acontece antes de qualquer log de progresso do fluxo é um bom sinal de que a falha é **síncrona e bem no início** da função — vale checar as primeiras linhas antes de suspeitar de rede, DOM ou cache.

---

## 2026-09-22 — Como ver o conteúdo de um objeto/array no log (ele "some" mesmo sem erro)

**Contexto:** [`realizarPedido.js:9`](../src/actions/realizarPedido.js#L9) — depois de trocar `ctx.info` por `console.info`, o código passou a rodar sem `TypeError`, mas `console.info('pedidos', pedidos)` continuava sem mostrar o conteúdo de `pedidos` em lugar nenhum.

**Dúvida:** como faço pra realmente ver os dados retornados (ex.: o array `pedidos` vindo da planilha)?

**Resposta:** `console.info` aqui é `ctx.log.info`, cuja assinatura (do `.d.ts` da lib `hobots`) é `info(message: string): void` — **um único parâmetro string**. Passar um segundo argumento (`console.info('pedidos', pedidos)`) é sintaticamente válido em JavaScript (a linguagem nunca reclama de argumento a mais), mas a função só lê o primeiro — o segundo é descartado silenciosamente, sem erro e sem aviso. Isso é diferente do `console.log`/`console.info` nativo do Node, que imprime todos os argumentos que receber.

Outro detalhe: `pedidos.entries()` não é "os dados", é um **iterador** — um objeto de controle pra percorrer o array (usado dentro de `for (const [index, row] of pedidos.entries())`). Tentar logar um iterador direto não mostra as linhas da planilha.

Pra ver os dados de fato, existem três caminhos, cada um pra uma situação:

1. **Log de texto simples (o mais direto):** colocar os dados dentro da própria string, via `JSON.stringify`:
   ```js
   console.info(`Planilha carregada com ${pedidos.length} pedido(s): ${JSON.stringify(pedidos)}`);
   ```
   Aparece na aba "logs do agente" do painel. Bom para conferência rápida; se a planilha tiver muitas linhas, considere `JSON.stringify(pedidos.slice(0, 3))` pra não poluir o log com um texto gigante.

2. **`setData` numa step (dados estruturados, não é texto):** `Transaction`/`Step` do Hobots têm `setData(chave, valor: unknown)`, que aceita qualquer tipo (não precisa de `JSON.stringify` manual) e anexa aquele valor à etapa específica, visível na aba de performance/detalhes do painel — ex.: `etapa.setData('pedido', payload)`, já usado em outro ponto do arquivo para anexar o erro (`etapa?.setData('erro', ...)`). É a forma "certa" de anexar dados estruturados a uma etapa, em vez de só texto solto no log.

3. **Terminal local, com o `console` de verdade:** dentro da função, `const console = ctx.log;` ([linha 6](../src/actions/realizarPedido.js#L6)) sobrescreve a variável `console` local — então qualquer `console.log` dali pra baixo já não é mais o `console` nativo do Node, é o logger do Hobots (texto simples, sem objetos coloridos/expansíveis). Se estiver rodando localmente via `pnpm start` e quiser inspecionar um objeto grande com toda a formatação rica do terminal (cores, expansão de array/objeto), use `globalThis.console.log(pedidos)` pra acessar o `console` original do Node, ignorando o alias.

**Takeaway:**
- `ctx.log.<nível>` só aceita **uma string**. Se quiser mostrar um objeto/array, sempre encapsule com `JSON.stringify(...)` dentro do template string — nunca passe como segundo argumento.
- Para dados estruturados por etapa (contagens, ids, payloads), prefira `step.setData(chave, valor)` a espremer tudo em uma linha de log.
- Lembre que dentro dessa função `console` **não é** o `console` do Node — é o alias de `ctx.log`. Para depuração local "crua", use `globalThis.console`.

---

## 2026-09-22 — `pedidos` vs `pedidos.entries()`: qual a diferença

**Contexto:** mesma linha, [`realizarPedido.js:9`](../src/actions/realizarPedido.js#L9) vs o uso correto em [`realizarPedido.js:12`](../src/actions/realizarPedido.js#L12) (`for (const [index, row] of pedidos.entries())`).

**Dúvida:** qual a diferença entre logar `pedidos` e logar `pedidos.entries()`?

**Resposta:**
- `pedidos` é o array de verdade: `[{CLIENTE: 'A', ...}, {CLIENTE: 'B', ...}, ...]`.
- `pedidos.entries()` **não** são os dados — é um **iterador** de pares `[índice, valor]`, e ele é **preguiçoso** (lazy): não guarda os pares prontos, só sabe entregar "o próximo par" quando algo chama `.next()` nele. Um `for...of` faz isso por baixo dos panos automaticamente; um `console.log`/`JSON.stringify` direto no iterador não itera nada, então mostra um objeto vazio pra quem está olhando.

Exemplo:
```js
const pedidos = [{ cliente: 'A' }, { cliente: 'B' }];

console.log(pedidos);          // [ { cliente: 'A' }, { cliente: 'B' } ]
console.log(pedidos.entries()); // Object [Array Iterator] {}  <- nada útil

for (const [index, row] of pedidos.entries()) {
  console.log(index, row);
}
// 0 { cliente: 'A' }
// 1 { cliente: 'B' }
```

Se precisar ver os pares como array real fora de um loop, force a materialização com spread: `[...pedidos.entries()]` → `[[0, {...}], [1, {...}]]`.

**Takeaway:**
- `.entries()` (assim como `.keys()` e `.values()`) só "rende" alguma coisa quando é **consumido** — num `for...of`, num spread (`[...x]`) ou num `Array.from(x)`. Fora disso, é só um objeto de controle, não os dados.
- Pra debug rápido de "o que tem no array", logue o array (`pedidos`) direto, não o `.entries()` dele — o `.entries()` só faz sentido quando você especificamente precisa do índice junto com o valor dentro de um loop.

**Exemplo de uso (por que usar `.entries()` em vez de um `for` comum):**
```js
const frutas = ['maçã', 'banana', 'uva'];

for (const [index, fruta] of frutas.entries()) {
  console.log(`${index}: ${fruta}`);
}
// 0: maçã
// 1: banana
// 2: uva
```
Sem `.entries()`, pra ter o índice seria preciso um `for` tradicional com contador manual (`for (let i = 0; i < frutas.length; i += 1) { frutas[i] }`). Com `.entries()` + `for...of`, índice e valor já vêm prontos, desestruturados. É exatamente o padrão usado em [`realizarPedido.js:12`](../src/actions/realizarPedido.js#L12): `.entries()` entra em cena porque o loop precisa do `row` (o pedido) **e** do `index` (pra virar `numeroPedido = index + 1`, usado nas mensagens de log) ao mesmo tempo. Se só precisasse do `row`, um `for (const row of pedidos)` simples já bastaria.
