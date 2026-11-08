# Handoff para o construtor de slides — remark

## O produto em uma frase

**remark** é um marketplace de vagas de encaixe em exames de imagem: o horário que ia ficar vazio na clínica vira exame mais barato para o paciente que estava esperando.

- **Paciente** busca o exame (tipo › região › lado), vê encaixes com desconto e o motivo da vaga, paga um sinal de 20% e recebe a confirmação pelo WhatsApp.
- **Clínica** publica o cancelamento em um clique; a vaga avisa a fila e o preço desce em degraus até o piso que ela definiu.

Mensagens-chave para os slides:

1. «O horário cancelado vira receita.» (frase da tela de entrada da clínica)
2. «Exame mais barato no horário que sobrou.» (frase da tela de entrada do paciente)
3. Escada de preço: **preço cheio acima de 48 h · −10% até 24 h · −20% até 6 h · −30% depois**, nunca abaixo do piso.
4. Exemplo real da demo: Ressonância de joelho, **R$ 480 → R$ 384** (−20%), hoje às 21:00, Imagem Vila Nova.
5. Confirmação pelo WhatsApp: o paciente responde 1 (confirma) ou 2 (cancela). Sem resposta até o prazo da clínica, o horário volta para a fila.

## Logo

Pasta: `/Users/User/Documents/Programacao/pessoal/HackathonUSP/public/assets/`

| Arquivo | Uso |
|---|---|
| `remark-logo.svg` / `.png` | Logo horizontal (símbolo + «remark») em **fundo claro** |
| `remark-logo-reverso.svg` / `.png` | Logo horizontal em **fundo escuro** (`#17363a`) |
| `remark-simbolo.svg` / `.png` | Só o símbolo (grade 3×3), para canto de slide e marca-d'água |
| `remark-icone-app.svg` / `.png` | Ícone do app (quadrado escuro arredondado com a grade), para mockups de celular e capa |

Caminhos completos:

```
/Users/User/Documents/Programacao/pessoal/HackathonUSP/public/assets/remark-logo.svg
/Users/User/Documents/Programacao/pessoal/HackathonUSP/public/assets/remark-logo.png
/Users/User/Documents/Programacao/pessoal/HackathonUSP/public/assets/remark-logo-reverso.svg
/Users/User/Documents/Programacao/pessoal/HackathonUSP/public/assets/remark-logo-reverso.png
/Users/User/Documents/Programacao/pessoal/HackathonUSP/public/assets/remark-simbolo.svg
/Users/User/Documents/Programacao/pessoal/HackathonUSP/public/assets/remark-simbolo.png
/Users/User/Documents/Programacao/pessoal/HackathonUSP/public/assets/remark-icone-app.svg
/Users/User/Documents/Programacao/pessoal/HackathonUSP/public/assets/remark-icone-app.png
```

Regras da marca:

- O nome é sempre **«remark», em minúsculas**, inclusive no início de frase. Nunca «Remark», «REMARK» nem «Vaga Certa» (nome antigo, abandonado).
- O símbolo é uma grade 3×3 de quadrados arredondados: um quadrado aceso em `#5cc8b0` (a vaga que abriu) entre quadrados escuros e claros. Não recolorir nem girar.
- Prefira o SVG; o PNG é para ferramentas que não aceitam vetor.
- Área de respiro: no mínimo a altura de um quadrado da grade em volta da logo.

## Cores

| Token | Hex | Papel |
|---|---|---|
| `ink` | `#17363a` | Texto principal e fundo escuro (capa, barras, slide de impacto) |
| `ink-2` | `#35565a` | Texto secundário |
| `mute` | `#4a6568` | Legendas e notas |
| `line` | `#cfe4df` | Bordas e divisórias |
| `ground` | `#f7fbfa` | Fundo padrão dos slides claros |
| `card` | `#ffffff` | Cartões sobre o fundo |
| `teal` | `#2a7f75` | Cor de ação: botões, destaques, «Reservada» |
| `teal-d` | `#1f6a61` | Texto de destaque sobre fundo claro |
| `mint` | `#ddf3ee` | Fundos suaves de destaque, ícones em caixa |
| `mint-2` | `#c9ebe1` | Bordas de destaque |
| `amber` | `#5cc8b0` | O «acento» da marca: preço com desconto, selo «Vaga para você», o quadrado aceso do símbolo |
| `red` | `#B03024` | Só para alerta e cancelamento |
| `red-s` | `#FBE3E0` | Fundo de alerta |

Proporção sugerida: ~70% `ground`/`card`, ~20% `ink`, ~10% `teal`/`amber`. O vermelho só aparece quando o slide fala de cancelamento ou prazo.

Apesar do nome do token, `amber` é verde-água, não laranja. Não introduza laranja, amarelo ou azul.

## Tipografia (Google Fonts)

| Uso | Fonte | Pesos |
|---|---|---|
| Títulos e números grandes | **Bricolage Grotesque** | 600, 700, 800 |
| Texto corrido, rótulos, botões | **Instrument Sans** | 400, 500, 600, 700 |

- Títulos em Bricolage 700, entrelinha 1.08, espaçamento −2%.
- Preços e números em Bricolage 700 com algarismos tabulares e espaçamento −3% (ex.: «R$ 384» grande em `amber` sobre `ink`).
- Texto em Instrument Sans 400–500, entrelinha 1.45.
- Rótulos pequenos em caixa alta com um pouco de espaçamento entre letras.

## Forma e componentes

- **Cantos arredondados:** 8 px (pequeno), 14 px (campos e botões), 22 px (cartões). Nada de cantos retos.
- **Sombra:** suave e fria, `0 8px 24px -12px rgba(23,54,58,.18)`.
- **Botões:** primário `teal` com texto branco; secundário com contorno `ink` de 1,5 px.
- **Chips de estado** (pílulas com bolinha à esquerda):
  - Publicada: fundo `mint`, texto `teal-d`
  - Alertando: fundo `amber`, texto `ink`, bolinha pulsando
  - Reservada: fundo `teal`, texto branco
  - Realizada / Confirmada: fundo `ink`, texto branco
  - Cancelada: fundo `red-s`, texto `red`
- **Escada de preço:** quatro barras lado a lado, em degraus decrescentes, rotuladas «0%», «−10%», «−20%», «−30%». As três primeiras em `ink` translúcido e a última acesa em `amber` (está na tela de entrada do paciente).
- **Ícones:** traço fino de 2 px, cantos arredondados, sem preenchimento (estilo linha). Um ícone por ideia, dentro de um quadrado `mint` com cantos de 12–14 px.

## Tom de voz

- Português do Brasil, direto, frases curtas. Fala com o paciente por «você».
- Verbos no lugar de jargão: «publicar cancelamento», «avisar a fila», «confirmar a ida».
- Sem «solução inovadora», «revolucionar», «disruptivo». Diga o que acontece com números reais.
- Dinheiro sempre como «R$ 384» (espaço depois de R$, sem centavos quando redondo).

## Referências visuais

- Pranchas de design (HTML, abrir no navegador): `/Users/User/Documents/Programacao/pessoal/HackathonUSP/docs/design/*.dc.html`
  - Paciente: `Paciente-Inicio`, `Paciente-Exames`, `Paciente-Reserva`, `Paciente-Pagamento`
  - Clínica: `Clinica-Painel`, `Clinica-Agenda`, `Clinica-Exames`
- Canvas do Claude Design: https://claude.ai/artifact/MNgXvUJSTUaLHcaxbHXuao
- App rodando (para capturas): `http://localhost:3200/paciente` (celular, 390 × 844) e `http://localhost:3200/clinica` (desktop, 1440 × 900). O login é simulado: qualquer e-mail e senha entram.

Para capturas de celular, use a moldura 390 × 844. O painel da clínica fica melhor em 1440 de largura.
