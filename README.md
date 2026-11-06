# Dungeon Map Generator

Gerador de mapas procedurais de dungeons em estilo masmorra de pedra para jogos de RPG.

## Funcionalidades

- **Geração procedural**: Cria mapas aleatórios com seed determinista para replayabilidade
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
