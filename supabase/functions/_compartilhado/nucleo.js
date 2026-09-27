/* Ponte só para o layout de desenvolvimento (testes no Node).
   O scripts/montar-funcoes.mjs NÃO copia este arquivo: no deploy, ./nucleo.js
   é a cópia byte a byte de web/nucleo.js. */
export * from "../../../web/nucleo.js";
