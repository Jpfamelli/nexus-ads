# Nexus Ads

Central de tráfego pago multi-cliente da Nexus: Meta Ads + Google Ads + conversas do
WhatsApp da clínica num painel só, com radar de alertas e relatórios no WhatsApp.

- **Painel:** https://jpfamelli.github.io/nexus-ads/ (demonstração: `?demo`)
- **Como usar e configurar (para o João):** [LEIA-ME.md](LEIA-ME.md)
- **Como o sistema é construído (banco, RPCs, formatos, regras):** [CONTRATO.md](CONTRATO.md)

## Pastas

| Pasta | O que tem |
|---|---|
| `web/` | painel estático (GitHub Pages); `nucleo.js` é o cálculo único usado também pelas funções |
| `supabase/functions/` | Edge Functions (Deno): `nx-ciclo`, `nx-relatorio`, `nx-whatsapp` |
| `supabase/migrations/` | `20260927_melhorias.sql`: confirmação de entrega do WhatsApp, lead sem duplicar, trava de execução (aplicar ANTES do deploy das funções) |
| `supabase/seed-demo.sql` | cliente fictício "demo-clinica" com 4 meses de dados (gerado, não editar) |
| `scripts/` | `google-refresh-token.mjs` (OAuth do Google Ads), `popular-demo.mjs` (gera o seed) e `montar-funcoes.mjs` (monta `supabase/dist/` para o deploy) |
| `testes/` | testes em Node, sem dependências |

## Comandos (Node 18+; testado no 24)

```
node scripts/google-refresh-token.mjs     # gera o refresh token do Google Ads
node scripts/popular-demo.mjs             # regenera supabase/seed-demo.sql e confere os números
node scripts/montar-funcoes.mjs           # monta supabase/dist/<função> (arquivos planos para o deploy)
node testes/nucleo.teste.mjs              # núcleo de cálculo
node --test testes/scripts.teste.mjs      # scripts de apoio
node --test testes/funcoes.teste.mjs      # Edge Functions (PostgREST, Meta, Google e WhatsApp falsos)
node testes/painel.teste.mjs              # painel
```
