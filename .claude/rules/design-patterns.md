# Reuso, extração e padrões de projeto

## Quando extrair lógica duplicada

Antes de implementar uma regra, validação, cálculo ou chamada externa, buscar implementações existentes no módulo e nos serviços responsáveis. Reutilizar a implementação existente quando ela representa o mesmo comportamento de negócio.

**Regra de decisão:** extrair na segunda ocorrência concreta quando os dois consumidores implementam a mesma regra, têm as mesmas invariantes e devem mudar juntos. Não esperar uma terceira cópia de regra de negócio. Semelhança de sintaxe ou de nome não é evidência suficiente: regras com significados diferentes permanecem separadas.

- Regra sensível (permissão, preço, elegibilidade, transição de estado, idempotência) já deve ter um responsável único desde a primeira implementação. Se surgir outro consumidor, delegar ao mesmo responsável; não replicar o cálculo ou a decisão.
- Regra de negócio ou operação com efeitos colaterais fica em um serviço do módulo responsável. No Nest, exportar o provider pelo módulo e injetá-lo nos consumidores, mantendo decorators e DI nativos. Não criar um segundo serviço equivalente em outro módulo.
- Transformação pura compartilhada pode ser uma função; não precisa de classe/service. Estado ou comportamento React reutilizado pode virar hook; UI reutilizada pode virar componente. Escolher a menor unidade adequada ao comportamento.
- No frontend, primeiro compartilhar dentro do módulo. Mover para `core/shared` quando houver pelo menos dois módulos consumidores reais e o comportamento for independente de uma funcionalidade específica. Uma regra de negócio reutilizada por dois módulos backend continua no módulo que a possui, não em `common`.
- Entre Next e Nest, regra de negócio fica no Nest e é consumida pela API. Compartilhar formatos/schemas de transporte em contracts, sem copiar regras para o browser. Validação de formulário voltada à UX não substitui autorização/validação do servidor.
- Se a unificação exigir flags como `isCheckout`/`isAdmin`, branches por consumidor ou muitos parâmetros opcionais, verificar se são responsabilidades distintas. Não forçar abstração genérica para eliminar linhas parecidas. Parametrização de variações legítimas e pequenas é permitida quando mantém contrato claro.

## Como extrair

1. Identificar as ocorrências reais, a responsabilidade comum e diferenças de comportamento. Preservar diferenças intencionais.
2. Definir o dono e uma API pequena. Usar função, serviço, hook ou componente existente quando adequado. Evitar dependências circulares; reorganizar responsabilidades em vez de usar `forwardRef` como solução automática.
3. Mover a implementação e atualizar **todos os consumidores identificados no escopo da mudança**. Não manter o fluxo antigo e o novo executando a mesma operação.
4. Preservar autorização, transações, ordenação de efeitos, arredondamento, timeout e tratamento de erros. Reuso de função não permite repetir uma escrita/chamada que antes ocorria uma vez; serviço compartilhado não substitui idempotência nem implica cache.
5. Verificar os cenários dos consumidores e a regra central, incluindo diferenças relevantes e falhas. Buscar novamente as cópias antigas antes de concluir. Relatar as que ficaram fora do escopo e por quê.

Exemplos: cálculo idêntico de elegibilidade em dois services → método no serviço dono da regra; conversão pura de data em dois componentes → função compartilhada; dois cards visualmente parecidos com regras distintas → manter composição separada até existir um contrato de UI comum.

## Quando usar padrões

Padrões são ferramentas para reduzir complexidade existente. Aproveitar primeiro Nest, Next, ORM e bibliotecas adotadas. Não impor arquitetura hexagonal, independência de framework ou uma interface para cada classe.

| Padrão/mecanismo                      | Usar quando                                                                                                                                                                                                                                            | Evitar                                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Adapter**                           | Um fornecedor ou biblioteca tem formato/erros diferentes do contrato usado pela aplicação. Concentrar tradução, validação de resposta e tratamento de falhas num provider/service. Pode ser útil com um único fornecedor se a adaptação for relevante. | Wrapper que só renomeia métodos ou delega sem adaptar nada. Não criar interface e árvore de adapters só para um fornecedor futuro. |
| **Strategy**                          | Existem duas ou mais políticas/algoritmos reais para a mesma operação e a seleção já é necessária. Usar providers/funções concretas com contrato comum.                                                                                                | Classe por condição simples ou estratégia para comportamento que ainda não existe.                                                 |
| **Factory / useFactory**              | Construção depende de configuração, inicialização assíncrona ou escolha real de implementação. Usar o mecanismo de providers do Nest.                                                                                                                  | Factory que substitui um construtor trivial ou contêiner de DI próprio.                                                            |
| **Facade / serviço de coordenação**   | Vários consumidores repetem uma sequência de operações que constitui um fluxo coeso. Centralizar a coordenação e explicitar seus limites transacionais.                                                                                                | Serviço genérico que concentra todas as funcionalidades ou camada de delegação sem responsabilidade.                               |
| **Repository**                        | Consultas/persistência repetidas ou complexas precisam de responsabilidade própria e uma API útil. Extrair por necessidade concreta.                                                                                                                   | Repository genérico ou interface obrigatória para esconder o ORM. Services podem acessar o ORM diretamente.                        |
| **Guard, Pipe, Interceptor e Filter** | Há autorização, validação/transformação, comportamento transversal ou tradução de erros correspondentes aos mecanismos nativos do Nest.                                                                                                                | Reimplementar esses recursos em middleware próprio ou decorador customizado sem necessidade.                                       |

Ao introduzir um padrão, explicar no plano ou na entrega qual problema concreto ele resolve, onde é aplicado e como foi verificado. Não precisa de documento formal para cada classe. Nomear arquivos conforme a responsabilidade real (`<provider>.service.ts`, `*.adapter.ts` quando houver adaptação); não chamar todo serviço de adapter.

## Limites das abstrações

- Manter decorators, DI e recursos nativos do Nest. Extrair lógica compartilhada não exige removê-los.
- Não duplicar retry, timeout, cache ou transações já gerenciados pela biblioteca sem compreender a interação.
- Não compartilhar estado mutável de usuário em singleton. Providers compartilhados podem ter escopo singleton sem que dados de requisições sejam armazenados neles.
- Interfaces de Strategy/Adapter só entram quando expressam um contrato útil; não são exigência universal.
- A migração futura para Next full stack é uma decisão separada; não criar adapters para frameworks hipotéticos.
