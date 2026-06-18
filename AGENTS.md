# AGENTS — CRM Refine

Este repositório é o CRM da LuzPerformance construído sobre Refine.

## Regra de escopo

Antes de executar uma issue, leia a própria issue e limite a alteração aos arquivos explicitamente citados ou ao menor conjunto de arquivos necessário para cumprir o aceite.

Para a issue #1, o escopo restrito é:

- `AGENTS.md`
- `CONTEXT.md`
- `docs/product/crm-medico-hormonal-blueprint.md`
- `docs/research/regras-negocio-crm-medico-2026.md`
- `docs/adr/0001-crm-medico-operacional-nao-prontuario.md`

Não instale dependências, não rode bootstrap pesado e não altere código do app enquanto a issue não pedir explicitamente.

## Regra de validação do harness

Não é necessário validar localmente neste ambiente/harness após implementar issues do CRM. O Vinícius valida na máquina local dele.

Se precisar de evidência antes de responder, use inspeção de diff/status e sinalize claramente que a validação local ficou para o Vinícius. Não instalar dependências, não baixar `node_modules` e não rodar suíte/build local salvo pedido explícito.

## Fonte visual obrigatória

Qualquer decisão visual do CRM deve usar apenas o `DESIGN.md` do repo `luzperformance/appsite` como fonte de verdade.

Não inferir design por screenshot, HTML renderizado, memória, preferência pessoal ou padrão visual genérico do Refine/Ant Design.

## Guardrails médicos

- O CRM é operacional/comercial, não prontuário.
- Não automatizar diagnóstico, prescrição, dose, combinação hormonal ou conduta clínica individualizada.
- Coletar o mínimo necessário de dados sensíveis, com finalidade e consentimento.
- Conteúdo clínico ou externo precisa de curadoria médica antes de uso público.

## Documentos canônicos

- `CONTEXT.md` — vocabulário e fronteiras do domínio.
- `docs/product/crm-medico-hormonal-blueprint.md` — blueprint do produto.
- `docs/research/regras-negocio-crm-medico-2026.md` — regras de negócio.
- `docs/adr/0001-crm-medico-operacional-nao-prontuario.md` — decisão arquitetural sobre o limite CRM vs prontuário.
