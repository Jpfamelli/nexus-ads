/* Ponte só para o layout de desenvolvimento (testes no Node).
   O scripts/montar-funcoes.mjs NÃO copia este arquivo: no deploy, ./auto-catalogo.js
   é a cópia byte a byte de web/app/auto-catalogo.js (o catálogo das automações,
   compartilhado com o painel: gatilhos, ações, campos e limites). */
export * from "../../../web/app/auto-catalogo.js";
