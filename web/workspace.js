/* Entradas dos produtos Órbita. Não cria sessão nem altera permissões. */
const produto = document.body.dataset.produto;
const configuracao = {
  crm: { rota: "crm" },
  ads: { rota: "anuncios" },
  atendimento: { rota: "conversas" },
};
const atual = configuracao[produto];
const destino = document.querySelector("[data-destino]");
if (atual) {
  const origem = new URL(location.href);
  const q = new URLSearchParams();
  for (const chave of ["org", "dev", "dev-falso"]) {
    const valor = origem.searchParams.get(chave);
    if (valor) q.set(chave, valor);
  }
  q.set("produto", produto);
  const rota = origem.hash.startsWith("#/") ? origem.hash : `#/${atual.rota}`;
  const url = `/app/?${q.toString()}${rota}`;
  if (destino) destino.href = url;
  location.replace(url);
}
