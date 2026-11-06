# Dungeon Map Generator

Gerador de mapas procedurais de dungeons, cavernas e florestas para jogos de RPG.

## Funcionalidades

- **Geração procedural**: Cria mapas aleatórios com seed determinista para replayabilidade
- **Três tipos de mapa**: Masmorra (salas e corredores), Caverna (orgânica, por autômato celular) e Floresta (clareiras orgânicas como a caverna, com estrada de terra atravessando de oeste a leste e árvores)
- **Saídas da estrada (floresta)**: de 2 a 6 saídas — a principal a leste mais ramais para as outras bordas, cada uma marcada como Saída
- **Encontros manuais**: clique com o botão direito num quadrado aberto do mapa para abrir o menu de ações e colocar um encontro lá (nº de monstros conforme Jogadores/Dificuldade); no mesmo quadrado, o menu passa a oferecer “Remover Encontro”. Sobrevivem a uma nova geração enquanto o quadrado continuar aberto
- **Marcadores manuais**: no mesmo menu do botão direito — Acampamento (tenda, visível também para jogadores), Tesouro (baú) e Armadilha (CD conforme Nível/Dificuldade) — clique para colocar, clique de novo para remover
- **Controles**: Defina quantidade de salas, salas secretas e encontros
- **Conectividade linear**: Cada sala tem exatamente uma entrada e saída (exceto secretas)
- **Portas**: Representação visual nas paredes das conexões (trancadas/destrancadas)
- **Estética visual**: Design com hachura 45°, tons de pedra, água e salas secretas em vermelho

## Tecnologia

- Angular Signals (reatividade)
- SVG para renderização vetorial
- TypeScript com padrões reativos

## Uso

```bash
npm start
```

Abra no navegador ou execute o dev server:

```bash
ng serve --port 4200
```

## Estrutura de componentes

- `app/` - Componente root e controles
- `components/dungeon-generator.ts` - Lógica de geração procedural
- `components/map-view.component.ts` - Renderização SVG com grades de tiles

## Licença

MIT
