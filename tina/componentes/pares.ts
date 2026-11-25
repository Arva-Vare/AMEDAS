import { createElement as h, useState } from 'react'
import { wrapFieldsWithMeta } from 'tinacms'

// Pares chave → valor de um ficheiro de Dados (campo items): uma tabela com uma linha por par { key, value },
// em vez dos formulários à parte que o Tina abre para cada item de uma lista.
// Mínimo 1 par; as chaves não se repetem no ficheiro (comparadas com a função "comparavel").
// "limpa" dá a chave como se grava (ex.: sem espaços nas pontas); aplica-se ao sair da caixa.

type Par = { key?: string; value?: string }

const caixa = {
  padding: '8px 10px',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  fontSize: 14,
  background: '#fff',
  width: '100%',
  boxSizing: 'border-box' as const,
  fontFamily: 'inherit',
}

const botao = (ativo: boolean) => ({
  padding: '6px 10px',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  background: '#fff',
  fontSize: 13,
  color: '#374151',
  cursor: ativo ? 'pointer' : 'not-allowed',
  opacity: ativo ? 1 : 0.4,
})

const titulo = (texto: string, largura?: number) =>
  h(
    'span',
    { style: { fontSize: 12, fontWeight: 600, color: '#6b7280', ...(largura ? { width: largura, flexShrink: 0 } : { flex: 1 }) } },
    texto,
  )

const LARGURA_CHAVE = 200

export const pares = (limpa: (chave: string) => string, comparavel: (chave: string) => string) =>
  wrapFieldsWithMeta(({ input }: any) => {
    const lista: Par[] = Array.isArray(input.value) ? input.value : []
    // Linha acabada de criar com "+ Acrescentar par": a caixa da chave recebe o foco.
    const [novo, setNovo] = useState<number | null>(null)
    const mudar = (novos: Par[]) => input.onChange(novos)
    const mudarPar = (k: number, parte: Par) => mudar(lista.map((p, j) => (j === k ? { ...p, ...parte } : p)))
    const trocar = (k: number, j: number) => mudar(lista.map((p, n) => (n === k ? lista[j] : n === j ? lista[k] : p)))

    // Quantas vezes aparece cada chave, para marcar as repetidas.
    const contagem = new Map<string, number>()
    for (const p of lista) {
      const c = comparavel(p?.key ?? '')
      if (c) contagem.set(c, (contagem.get(c) ?? 0) + 1)
    }

    const linha = (p: Par, k: number) => {
      const chave = p?.key ?? ''
      const vazia = !limpa(chave)
      const repetida = !vazia && (contagem.get(comparavel(chave)) ?? 0) > 1
      const erro = vazia ? 'Escreve a chave' : repetida ? 'Chave repetida' : ''
      const podeApagar = lista.length > 1
      return h(
        'div',
        { key: k, 'data-par': k, style: { display: 'flex', alignItems: 'flex-start', gap: 8 } },
        h(
          'div',
          { style: { width: LARGURA_CHAVE, flexShrink: 0 } },
          h('input', {
            type: 'text',
            placeholder: 'Chave (ex.: preco)',
            'aria-label': `Chave ${k + 1}`,
            'aria-invalid': !!erro,
            autoFocus: k === novo,
            value: chave,
            onChange: (e: any) => mudarPar(k, { key: e.target.value }),
            // Os espaços nas pontas não contam para a chave: tiram-se ao sair da caixa (e ao gravar, no beforeSubmit).
            onBlur: () => chave !== limpa(chave) && mudarPar(k, { key: limpa(chave) }),
            style: { ...caixa, ...(erro && { border: '1px solid #dc2626', background: '#fef2f2' }) },
          }),
          erro && h('span', { style: { display: 'block', marginTop: 2, fontSize: 12, color: '#dc2626' } }, erro),
        ),
        h('textarea', {
          placeholder: 'Valor',
          'aria-label': `Valor ${k + 1}`,
          rows: 1,
          value: p?.value ?? '',
          onChange: (e: any) => mudarPar(k, { value: e.target.value }),
          // Cresce com o texto (Chromium, Firefox recente); nos outros browsers, arrasta-se o canto.
          style: { ...caixa, flex: 1, minWidth: 0, resize: 'vertical', fieldSizing: 'content', minHeight: 37 } as any,
        }),
        h(
          'button',
          { type: 'button', title: 'Subir', disabled: k === 0, onClick: () => trocar(k, k - 1), style: botao(k > 0) },
          '↑',
        ),
        h(
          'button',
          {
            type: 'button',
            title: 'Descer',
            disabled: k === lista.length - 1,
            onClick: () => trocar(k, k + 1),
            style: botao(k < lista.length - 1),
          },
          '↓',
        ),
        h(
          'button',
          {
            type: 'button',
            title: podeApagar ? 'Apagar este par' : 'Tem de haver pelo menos um par',
            disabled: !podeApagar,
            onClick: () => (setNovo(null), mudar(lista.filter((_, j) => j !== k))),
            style: botao(podeApagar),
          },
          '✕',
        ),
      )
    }

    return h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: 12,
          border: '1px solid #e5e7eb',
          borderRadius: 10,
          background: '#f9fafb',
        },
      },
      lista.length
        ? h(
            'div',
            { style: { display: 'flex', gap: 8, paddingRight: 118 } },
            titulo('Chave', LARGURA_CHAVE),
            titulo('Valor'),
          )
        : h('span', { style: { fontSize: 14, color: '#6b7280' } }, 'Ainda não há pares.'),
      ...lista.map(linha),
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 } },
        h(
          'button',
          {
            type: 'button',
            onClick: () => (setNovo(lista.length), mudar([...lista, { key: '', value: '' }])),
            style: { ...botao(true), borderStyle: 'dashed', padding: '8px 14px' },
          },
          '+ Acrescentar par',
        ),
        h('span', { style: { fontSize: 12, color: '#6b7280' } }, lista.length === 1 ? '1 par' : `${lista.length} pares`),
      ),
    )
  })
