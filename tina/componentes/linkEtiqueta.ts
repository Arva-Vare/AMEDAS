import { createElement as h, useEffect, useState } from 'react'
import { useCMS, wrapFieldsWithMeta } from 'tinacms'
import { PAGES, slug } from '../campos'

// Link fixo de uma etiqueta, calculado como no scripts/gerar.mjs: tag/<slug(nome)>.<extensão do ficheiro>.
// Só mostra: não grava nada no JSON. Avisa também quando o ficheiro já não está no Media Manager.

/** Extensão em minúsculas de um caminho ou URL ("/uploads/Logo.SVG" → "svg"), ou "" se não tiver. */
export const extensao = (caminho?: string) => {
  const nome = (caminho ?? '').split(/[?#]/)[0].split('/').pop() ?? ''
  const i = nome.lastIndexOf('.')
  return i > 0 ? nome.slice(i + 1).toLowerCase() : ''
}

/** Nome do ficheiro de um caminho ou URL ("/uploads/favicons/a.png" → "a.png"). */
export const nomeDoFicheiro = (caminho?: string) => (caminho ?? '').split(/[?#]/)[0].split('/').pop() ?? ''

/** Caminho dentro do Media Manager ("/uploads/favicons/a.png" ou o URL do TinaCloud → "favicons/a.png"). */
export const caminhoNoMedia = (valor?: string) => {
  const c = (valor ?? '')
    .split(/[?#]/)[0]
    .replace(/^https:\/\/assets\.tina\.io\/[^/]+\//, '') // TinaCloud: assets.tina.io/<projeto>/<caminho>
    .replace(/^https?:\/\/[^/]+/, '') // em local, o Media Manager pode dar origem + /uploads/…
    .replace(/^\/?uploads\//, '')
  try {
    return decodeURIComponent(c)
  } catch {
    return c
  }
}

type NoMedia = { existe: boolean; parecido?: string }

// Procura o ficheiro na pasta dele, pela API do Media Manager (cms.media: TinaCloud em produção, disco em local).
// Se não existir, devolve um com o mesmo nome a menos de maiúsculas (ex.: "Logo.svg" carregado depois de apagar
// "logo.svg"; o GitHub e o Pages distinguem maiúsculas).
const procurarNoMedia = async (cms: any, caminho: string): Promise<NoMedia> => {
  const i = caminho.lastIndexOf('/')
  const directory = i < 0 ? '' : caminho.slice(0, i)
  const nome = caminho.slice(i + 1)
  let parecido: string | undefined
  let offset: string | number | undefined
  for (let pagina = 0; pagina < 50; pagina++) {
    const { items, nextOffset } = await cms.media.list({ directory, limit: 100, offset, thumbnailSizes: [] })
    for (const m of items ?? []) {
      if (m.type !== 'file') continue
      if (m.filename === nome) return { existe: true }
      if (m.filename.toLowerCase() === nome.toLowerCase()) parecido = m.filename
    }
    if (!nextOffset) break
    offset = nextOffset
  }
  return { existe: false, parecido }
}

const caixa = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 10px',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  background: '#f9fafb',
  fontSize: 13,
}

const caixaAviso = {
  marginTop: 8,
  padding: '8px 10px',
  border: '1px solid #fecaca',
  borderLeft: '4px solid #dc2626',
  borderRadius: 6,
  background: '#fef2f2',
  color: '#7f1d1d',
  fontSize: 13,
  lineHeight: 1.5,
  // O contentor do campo no Tina não quebra linhas; sem isto, o texto sai da caixa.
  whiteSpace: 'normal' as const,
  overflowWrap: 'anywhere' as const,
}

// Campo "link" de um item de items[] (ex.: "items.2.link"): lê o name e o file do mesmo item.
// Subscreve o formulário, para atualizar enquanto se escreve o nome ou se escolhe outro ficheiro.
export const LinkEtiqueta = wrapFieldsWithMeta(({ input, form }: any) => {
  const cms = useCMS()
  const item = String(input.name).split('.').slice(0, -1)
  const ler = () => item.reduce((o: any, k) => o?.[k], form?.getState().values) ?? {}
  const [valores, setValores] = useState(ler)
  const [copiado, setCopiado] = useState(false)
  const [noMedia, setNoMedia] = useState<NoMedia | null>(null)
  useEffect(() => form?.subscribe(() => setValores(ler()), { values: true }), [form, input.name])

  // Volta a verificar sempre que o ficheiro muda. Se a verificação falhar (rede, sessão), não avisa.
  const caminho = caminhoNoMedia(valores.file)
  useEffect(() => {
    setNoMedia(null)
    if (!caminho) return
    let ativo = true
    procurarNoMedia(cms, caminho).then(
      (r) => ativo && setNoMedia(r),
      () => {},
    )
    return () => {
      ativo = false
    }
  }, [cms, caminho])

  const aviso =
    noMedia && !noMedia.existe
      ? h(
          'div',
          { style: caixaAviso },
          h('strong', null, `O ficheiro "${nomeDoFicheiro(valores.file)}" já não existe no Media Manager.`),
          ' Enquanto não escolheres outro em "Ficheiro", o site continua a publicar a versão anterior deste link, que fica desatualizada (ou nada, se a etiqueta for nova).',
          noMedia.parecido ? ` Há um ficheiro com um nome parecido: "${noMedia.parecido}".` : null,
        )
      : null

  const s = slug(valores.name ?? '')
  const ext = extensao(valores.file)
  const url = `${PAGES}/tag/${s}.${ext}`
  const linkPublicado =
    !s || !ext
      ? h('div', { style: { ...caixa, color: '#6b7280' } }, 'Escreve o nome e escolhe o ficheiro para ver o link.')
      : h(
          'div',
          { style: caixa },
          h('code', { style: { flex: 1, overflowWrap: 'anywhere', color: '#111827' } }, url),
          h(
            'button',
            {
              type: 'button',
              onClick: () => navigator.clipboard?.writeText(url).then(() => (setCopiado(true), setTimeout(() => setCopiado(false), 1500))),
              style: { padding: '3px 9px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', fontSize: 12, cursor: 'pointer' },
            },
            copiado ? 'Copiado' : 'Copiar',
          ),
        )
  return h('div', null, linkPublicado, aviso)
})
