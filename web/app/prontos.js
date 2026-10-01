/* ÓRBITA — liberação progressiva (§8.0 da ESPEC).
   Aceite F8 (01/10/2026): o dono liberou TODOS os módulos e TODAS as telas de configuração
   (CRM + Anúncios + Atendimento + pacotes). Só o que existe de verdade entra aqui:
   - MODULOS_PRONTOS = as chaves de `pronto` das rotas de rotas.js (inicio, conversas, crm, empresas,
     tarefas, ads, automacoes, relatorios) + `admin_revendas` (abas Revendas/Planos/Domínios do Admin);
   - CONFIG_PRONTAS = os ids das seções do hub #/config (config.js e os *-config.js).
   O teste de app.teste.mjs confere as duas listas contra o código: módulo ou seção nova que não entrar
   aqui (ou id que não exista mais) falha a suíte. Se este arquivo não carregar, o app.js volta ao padrão
   FECHADO (nenhum módulo, só `perfil`). Não use ?dev=1 em produção. */
export const MODULOS_PRONTOS = [
  "inicio", "conversas", "crm", "empresas", "tarefas", "ads", "automacoes", "relatorios", "admin_revendas",
];
export const CONFIG_PRONTAS = [
  "perfil", "usuarios", "marca", "dominio", "plano",
  "funis", "campos", "etiquetas", "motivos",
  "numeros", "respostas", "atendimento", "ia", "departamentos",
  "anuncios", "formulario", "agenda", "rastreio",
];
