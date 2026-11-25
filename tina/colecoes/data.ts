import type { Collection } from 'tinacms'
import { descricao, nomeFicheiro } from '../campos'
import { pares } from '../componentes/pares'

// Chave como se grava: Unicode composto (NFC, para "ç" escrito de duas formas ser igual) e sem espaços nas pontas.
// Chave como se compara: a gravada, sem distinguir maiúsculas ("Preço " = "preço").
// O scripts/gerar.mjs tem as mesmas funções em chaveLimpa e chaveComparavel: têm de ficar iguais.
export const chaveLimpa = (chave: string) => chave.normalize('NFC').trim()
export const chaveComparavel = (chave: string) => chaveLimpa(chave).toLowerCase()

// Pares de um ficheiro (campo items): pelo menos um, todos com chave, sem chaves repetidas.
const paresValidos = (value?: any[]) => {
  const lista = value ?? []
  if (!lista.length) return 'Acrescenta pelo menos um par (chave e valor)'
  if (lista.some((p) => !chaveLimpa(p?.key ?? ''))) return 'Escreve a chave de cada par'
  const chaves = lista.map((p) => chaveComparavel(p.key))
  const repetida = lista.find((_, i) => chaves.indexOf(chaves[i]) !== i)
  return repetida ? `A chave "${chaveLimpa(repetida.key)}" está repetida: cada chave só pode aparecer uma vez neste ficheiro` : undefined
}

// Ficheiros livres: o utilizador cria e apaga ficheiros, e cada ficheiro é um elemento de Dados com os seus pares
// items[] { key, value }: dados que não são texto traduzido (ex.: o preço e a referência de um produto).
// Publicado em data/<ficheiro>.json, que o Seara lê com seara.data({ dataName }) (tipos DataItem e DataContent).
export const data: Collection = {
  name: 'data',
  label: 'Dados',
  path: 'conteudo/data',
  format: 'json',
  // Um ficheiro novo começa com um par vazio.
  defaultItem: () => ({ items: [{ key: '', value: '' }] }),
  ui: {
    // Pode criar e apagar ficheiros; pastas não, para manter tudo ao mesmo nível.
    allowedActions: { create: true, delete: true, createFolder: false, createNestedFolder: false },
    // Nome do ficheiro sem pastas nem acentos (igual aos Elementos). A descrição é HTML (ver AGENTS.md, ponto 10).
    // "index" está reservado: o gerador publica a lista dos ficheiros em data/index.json.
    filename: {
      showFirst: true,
      parse: nomeFicheiro,
      description:
        'Nome do ficheiro, único. É o nome com que as apps pedem estes dados. Pode ter letras maiúsculas e minúsculas, ' +
        'números, - e _ (o nome index está reservado).<br>Os espaços e a / passam a - e os acentos são retirados. ' +
        'Ex.: camisola-azul, contactos_loja',
    },
    // Grava as chaves limpas mesmo quando se grava sem sair da caixa (Ctrl+S); o componente já as limpa ao sair.
    beforeSubmit: async ({ values }) => {
      if (!Array.isArray(values.items)) return values
      // Limpa também nos próprios objetos: depois de gravar, o Tina volta a inicializar o formulário com os valores
      // originais (form.initialize(values)), e assim a caixa e o estado "sem alterações" ficam com a chave limpa.
      // Se os objetos não se puderem mudar, a cópia devolvida chega para gravar certo.
      try {
        for (const p of values.items as any[]) if (typeof p?.key === 'string') p.key = chaveLimpa(p.key)
      } catch {}
      return { ...values, items: (values.items as any[]).map((p) => ({ ...p, key: chaveLimpa(p?.key ?? '') })) }
    },
  },
  fields: [
    descricao(
      'Pares de chave e valor (ex.: preco → 20, referencia → CAM-001). Cada chave só pode aparecer uma vez neste ' +
        'ficheiro: maiúsculas e minúsculas contam como iguais, e os espaços no início e no fim não contam. Os valores ' +
        'são sempre texto. A ordem é a da lista. Para outro conjunto de dados (ex.: outro produto), cria outro ficheiro.',
    ),
    {
      name: 'items',
      label: 'Pares chave-valor',
      type: 'object',
      list: true,
      // O componente mostra uma tabela (chave, valor, ↑ ↓ ✕); os campos abaixo definem a forma do JSON.
      ui: { component: pares(chaveLimpa, chaveComparavel), validate: paresValidos },
      fields: [
        { name: 'key', label: 'Chave', type: 'string' },
        { name: 'value', label: 'Valor', type: 'string' },
      ],
    },
  ],
}
