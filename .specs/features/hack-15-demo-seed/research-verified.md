# Pesquisa verificada — HACK-15

Consulta em 2026-11-08 via Firecrawl search/scrape e Maps. Dez unidades reais no município de São Paulo (IBGE 355030); fontes por campo em clinics-researched.json. Nome de exibição combina marca/unidade. Endereço cadastral e CNES foram lidos diretamente no domínio oficial cnes2.datasus.gov.br.

## Seleção final

| Unidade           | CNES    | RT explicitamente publicado                |
| ----------------- | ------- | ------------------------------------------ |
| SCOPP Pompéia     | 7330847 | Luiz Carlos Donoso Scoppetta, CRM-SP 37686 |
| SCOPP Santo Amaro | 9472940 | Luiz Carlos Donoso Scoppetta, CRM-SP 37686 |
| CURA Jardins      | 3451682 | Luci Mara Barbiero, CRM 120.433/SP         |
| CURA Moema        | 5665558 | Luci Mara Barbiero, CRM 120.433/SP         |
| ZDI Padre Adelino | 9547231 | Iman Hassan Zoghbi, CRM-SP 74483           |
| CDB Ana Rosa      | 9060774 | Luci Mara Barbiero, CRM 120.433/SP         |
| CDB Brasil 350    | 3094146 | Luci Mara Barbiero, CRM 120.433/SP         |
| CDB Borba Gato    | 7841272 | Luci Mara Barbiero, CRM 120.433/SP         |
| CDB Marselhesa    | 3094162 | Luci Mara Barbiero, CRM 120.433/SP         |
| CDB Mooca         | 9182772 | Luci Mara Barbiero, CRM 120.433/SP         |

SCOPP Pompéia e CURA Jardins são os únicos demoCalendarTarget:true.

## Fontes e responsabilidade técnica

[SCOPP](https://scoppdiagnosticos.com.br/) publica o RT, CRM e ambas as unidades. [Contrato municipal histórico de 2018](https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/saude/CONTRATO_10_2018_CLINICA_SCOPPETTA.pdf) também associa explicitamente o RT à Pompéia e CNES 7330847; a página atual é a fonte usada no manifesto.

[CURA Jardins](https://www.cura.com.br/unidades/jardins) e [CURA Moema](https://www.cura.com.br/unidades/moema), consultadas com onlyMainContent:false, publicam no rodapé Luci Mara Barbiero como RT. Doctoralia apresenta outro nome e outro CNPJ para Jardins; dado divergente descartado em favor da publicação oficial atual.

[ZDI](https://zdidiagnosticos.com.br/trabalhe-conosco/) publica RT e CRM junto ao endereço Padre Adelino 735 e CNPJ 03.453.378/0006-43, correspondente ao CNES 9547231.

Páginas oficiais CDB [Ana Rosa](https://www.cdb.com.br/unidades/ana-rosa), [Brasil 350](https://www.cdb.com.br/unidades/brasil-350), [Borba Gato](https://www.cdb.com.br/unidades/borba-gato), [Marselhesa](https://www.cdb.com.br/unidades/marselhesa) e [Mooca](https://www.cdb.com.br/unidades/mooca) publicam explicitamente o mesmo RT no rodapé, consultado com onlyMainContent:false.

**Limite de escopo:** os rodapés CURA/CDB e a página SCOPP são publicações da marca, sem discriminar inscrição regulatória de cada filial. Não constituem prova independente de responsabilidade regulatória individual por unidade. O manifesto registra esse limite. Nenhum gerente/administrador CNES, médico da equipe ou responsável por exame foi convertido em RT. Não se alega consulta ativa ao conselho profissional.

## Coordenadas e endereços

Cinco coordenadas CDB foram observadas em [Firecrawl Maps](https://maps.firecrawl.dev/search?q=CDB+Centro+Diagn%C3%B3sticos+Brasil+S%C3%A3o+Paulo), observed_at_ms 1794117651764, por correspondência exata de logradouro/número. Cada objeto contém seu link específico de mapa. Ana Rosa tinha dois registros próximos: escolhido “CDB - Unidade Ana Rosa”, que informa website cdb.com.br. Não foram utilizadas coordenadas de metrô ou centroide municipal.

SCOPP, CURA e ZDI preservam as coordenadas e links da consulta Firecrawl Maps documentada em research.md no mesmo dia. São pontos de estabelecimentos, não aferições topográficas; essa procedência está explícita no manifesto.

CNES prevalece para endereço:

- CURA Jardins: site oficial e CNES concordam em 4469; descartar “4417/4469”.
- CURA Moema: CEP 04516-010 (CNES), em vez de 04516-012 do mapa inicial.
- SCOPP Santo Amaro: número principal 1178, complemento cadastral 1166 e CEP 04734-002.
- ZDI: bairro Belém no CNES e Quarta Parada no site, mesmo número e CNPJ.
- CDB Brasil é número 350, CNES 3094146; os registros de mapa 441 e 1193 foram descartados.
- CDB Marselhesa: bairro Vila Clementino no CNES, Vila Mariana no mapa, mesmo número 500.
- CDB Ana Rosa: CEP 04014-000 no CNES e 04014-011 no mapa, mesmo número 300.
- Endereços de CDB no manifesto foram normalizados pelo CNES; coordenadas são do mapa com mesmo logradouro e número. Entrada operacional específica não foi inspecionada presencialmente.

## Descartes e lacunas

Pró Exame: CNES por unidade não identificado seguramente. Hcor Cidade Jardim: endereço comercial 318 versus cadastro CNES 7320612 no número 350; excluído para não unir dados sem prova. Ato Vila Mariana: CNES 9186417 e endereço confirmados, mas não houve RT inequívoco; médicos responsáveis por exames específicos não usados. Diffusion Tucuruvi/Barra Funda: CNES 6753345/9641947 confirmados, mas RT aparecia apenas em artigo antigo com conteúdo datado de 2020, sem confirmação atual por unidade. Substituições mantêm São Paulo e foram autorizadas pelo coordenador.

## Prova do manifesto

Verificação local: JSON parseável, dez objetos, dez CNES distintos de sete dígitos, coordenadas dentro de São Paulo, endereço e RT preenchidos, fontes separadas para CNES e RT, proveniência por campo, duas unidades-alvo. Esta pesquisa só alterou research-verified.md e clinics-researched.json. Checks/build/Verifier pertencem à implementação do card.

## Retomada local (2026-11-08)

Consulta dos sites oficiais SCOPP, CURA e CDB confirmou novamente as unidades e endereços publicados. CURA/CDB redirecionam agora as URLs antigas de unidade para `/unidades`, que lista os endereços do manifesto. Coordenadas e CNES preservam a pesquisa documentada no handoff; não houve nova geocodificação. Preços e disponibilidade dos exames são simulados, sem alegar catálogo comercial ou parceria.
