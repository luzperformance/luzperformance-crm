# MAPA — CRM LuzPerformance

Este diretório é o ponto canônico local para o sub-repositório oficial do CRM da LuzPerformance.

## Arquivos-base do repo

- `AGENTS.md` — blocos de skills do repositório.
- `CONTEXT.md` — vocabulário e contexto do domínio.
- `docs/agents/` — docs auxiliares usados pelas skills.

## Local do repo

- Caminho no workspace: `work/projects/CRM/`
- Canal operacional: grupo Telegram `CRM` (`telegram:-5353082763`)
- Função: desenvolvimento do CRM/funil da LuzPerformance.

## Regra de versionamento

Este `MAPA.md` é versionado no workspace como ponteiro de navegação.

Quando o repo do CRM for clonado/baixado aqui, ele deve ter seu próprio controle de versão. Não remover arquivos do CRM por regra genérica do workspace; qualquer limpeza deve ser feita dentro do sub-repositório, com `git status` local e commit próprio.

## Como usar

1. Ao trabalhar no CRM, entre neste diretório.
2. Se o repositório ainda não existir, clone/baixe o repo base aqui.
3. Antes de editar, rode `git status` dentro do sub-repositório do CRM, não apenas no workspace raiz.
4. O `MAPA.md` do workspace raiz aponta para este arquivo como referência local do CRM.
5. Pendências operacionais do CRM ficam em `deadlines.md` na raiz deste repositório.

## Escopo esperado

Manter apenas o que sustenta legitimamente a infra do CRM:

- front-end do CRM;
- back-end/API;
- banco/migrations/seeds;
- autenticação/autorização;
- integrações operacionais necessárias;
- dependências de produção e desenvolvimento realmente usadas;
- configuração mínima de build, lint, typecheck e deploy.

Remover ou evitar scaffolds e funcionalidades genéricas do Refine que não suportem diretamente o CRM.

## Pendências e decisões

- `deadlines.md` — pendências com prazo, responsável, contexto, próximo passo e critério de conclusão.
