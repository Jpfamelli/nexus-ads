# Nexus Ads · Órbita

Plataforma multiempresa da Nexus. O Nexus Ads consolida Meta Ads, Google Ads, CRM e
conversas do WhatsApp; Órbita é a experiência white-label para clínicas, negócios locais
e agências.

- **Painel clássico:** https://jpfamelli.github.io/nexus-ads/ (modo de apresentação interno: `?demo`; sem link público na página)
- **App Órbita:** `web/app/` (módulos ficam bloqueados em `prontos.js` até passarem no aceite E2E)
- **Como usar e configurar (para o João):** [LEIA-ME.md](LEIA-ME.md)
- **Como o sistema é construído (banco, RPCs, formatos, regras):** [CONTRATO.md](CONTRATO.md)

## Pastas

| Pasta | O que tem |
|---|---|
| `web/` | painéis estáticos; `nucleo.js` é o cálculo único do Ads |
| `web/app/` | app Órbita: acesso white-label, CRM, conversas, Ads, relatórios e automações |
| `supabase/functions/` | Edge Functions (Deno): ciclo, relatórios, webhook, envio, mídia e IA |
| `supabase/migrations/` | `20260927_melhorias.sql`: confirmação de entrega do WhatsApp, lead sem duplicar, trava de execução (aplicar ANTES do deploy das funções) |
| `supabase/seed-demo.sql` | fixture fictícia para desenvolvimento; não aplicar no banco de produção |
| `scripts/` | `google-refresh-token.mjs` (OAuth do Google Ads), `popular-demo.mjs` (gera o seed) e `montar-funcoes.mjs` (monta `supabase/dist/` para o deploy) |
| `testes/` | testes em Node, sem dependências |

## Comandos (Node 18+; testado no 24)

```
node scripts/google-refresh-token.mjs     # gera o refresh token do Google Ads
node scripts/popular-demo.mjs             # regenera supabase/seed-demo.sql e confere os números
node scripts/montar-funcoes.mjs           # monta supabase/dist/<função> (arquivos planos para o deploy)
node testes/rodar-tudo.mjs                # suíte Node completa, serial e com ORBITA_COMPLETO=1
node testes/nucleo.teste.mjs              # núcleo de cálculo
node --test testes/scripts.teste.mjs      # scripts de apoio
node --test testes/funcoes.teste.mjs      # Edge Functions (PostgREST, Meta, Google e WhatsApp falsos)
node testes/painel.teste.mjs              # painel
```

O estado de cada frente, os aceites que faltam e o que está publicado ficam em
`docs/orbita/estado/` e no arquivo de acompanhamento F8 fora do repositório. Não declare
um módulo do app como disponível enquanto ele não estiver em `web/app/prontos.js` e não
passar pelo aceite real correspondente.
