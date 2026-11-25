import { readdir, readFile, writeFile, mkdir, copyFile, rm, stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { paginaInicial } from './pagina-inicial.mjs'

// URL público do Pages, ex.: https://<owner>.github.io/AMEDAS
const BASE = process.env.BASE_URL ?? ''
const url = (p) => (!p ? undefined : /^https?:/.test(p) ? `url("${p}")` : `url("${BASE}${p}")`)

// Nomes do painel (coleções e templates), lidos do schema compilado, para a página inicial.
// Se faltar algum, usa-se o nome técnico.
const schema = JSON.parse(await readFile('tina/tina-lock.json', 'utf8').catch(() => '{}')).schema
const rotulos = Object.fromEntries(
  (schema?.collections ?? []).map((c) => [
    c.name,
    { label: c.label, templates: Object.fromEntries((c.templates ?? []).map((t) => [t.name, t.label])) },
  ]),
)
const rotulo = (colecao) => rotulos[colecao]?.label ?? colecao
const rotuloTemplate = (colecao, template) => rotulos[colecao]?.templates[template] ?? template

// Secções da página inicial: uma por coleção, com os links do que foi publicado.
const seccoes = []

// Avisos: problemas que não param o deploy (ex.: etiqueta com o ficheiro apagado do Media Manager).
// Vão para public/avisos.json, que o painel lê ao abrir (tina/avisos.ts), e para a página inicial.
const avisos = []
const avisar = (collection, message) => {
  avisos.push({ collection, message })
  // No GitHub Actions, "::warning" aparece também como anotação no resumo do run.
  console.warn(process.env.GITHUB_ACTIONS ? `::warning title=${collection}::${message.replace(/%/g, '%25')}` : `Aviso (${collection}): ${message}`)
}

// Igual ao slug() de tina/campos.ts: "Azul Marca" → "azul-marca"
const slug = (nome) =>
  nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

// Campos comuns a todos os botões (prefixo + tema → variáveis)
const tamanhos = (p, t) => ({
  [`${p}-font-size`]: `${t.fontSize}px`,
  [`${p}-padding-y`]: `${t.paddingY}px`,
  [`${p}-padding-x`]: `${t.paddingX}px`,
})

// Cores com versão clara e escura, pela ordem do formulário (igual a PARES em tina/templates/colors.ts)
const PARES = ['background', 'text', 'h1', 'h2', 'h3', 'h4', 'h5', 'primary', 'secondary', 'tertiary', 'separator']

// Tamanhos de texto, pela ordem do formulário: chave do JSON → sufixo da variável --font-size-*
const TEXTOS = {
  h1Size: 'h1',
  h2Size: 'h2',
  h3Size: 'h3',
  h4Size: 'h4',
  paragraphSize: 'paragraph',
  mainContentSize: 'main-content',
}

// Coleção (pasta em conteudo/) → template (campo "_template" do JSON) → variáveis CSS.
// Cada função devolve as variáveis do :root, ou { root, dark, regras } quando há valores para o tema escuro
// ou regras com outros seletores (regras: [{ seletor, vars }], escritas no fim do CSS).
const colecoes = {
  tokens: {
    // Cada configuração gera --color--<configuração>--<cor>, com as versões -light e -dark.
    // A primeira configuração é a base: tem todas as cores. Nas outras, uma cor vazia herda a da base.
    // Cada configuração gera também uma regra [data-config="<configuração>"] com os nomes neutros
    // (--color--<cor>), que são os que os componentes usam; a base aplica-se também ao :root.
    colors: (t) => {
      const root = {}
      const dark = {}
      const regras = []
      const configuracoes = t.configurations ?? []
      if (!configuracoes.length) throw new Error('Cores: não há nenhuma configuração')
      const base = `--color--${slug(configuracoes[0].name ?? '')}--`
      for (const [i, c] of configuracoes.entries()) {
        const p = `--color--${slug(c.name ?? '')}--`
        if (p === '--color----') throw new Error(`Configuração de cores sem nome: "${c.name ?? ''}"`)
        if (regras.some((r) => r.prefixo === p)) throw new Error(`Configuração de cores repetida: "${c.name}" (${p}…)`)
        const neutras = {}
        for (const k of PARES) {
          const { light, dark: escura } = c[k] ?? {}
          if (!light !== !escura) throw new Error(`Configuração "${c.name}": a cor "${k}" tem de ter as duas versões (clara e escura) ou nenhuma`)
          if (!light && i === 0) throw new Error(`Configuração base "${c.name}": falta a cor "${k}" (clara e escura)`)
          root[`${p}${k}-light`] = light || `var(${base}${k}-light)`
          root[`${p}${k}-dark`] = escura || `var(${base}${k}-dark)`
          root[`${p}${k}`] = `var(${p}${k}-light)`
          dark[`${p}${k}`] = `var(${p}${k}-dark)`
          neutras[`--color--${k}`] = `var(${p}${k})`
        }
        for (const { name, color } of c.custom ?? []) {
          const v = `${p}custom-${slug(name)}`
          if (v in root) throw new Error(`Configuração "${c.name}": cor personalizada repetida "${name}" (${v})`)
          root[v] = color
          neutras[`--color--custom-${slug(name)}`] = `var(${v})`
        }
        const seletor = `[data-config="${slug(c.name)}"]`
        regras.push({ prefixo: p, seletor: i === 0 ? `:root,\n${seletor}` : seletor, vars: neutras })
      }
      return { root, dark, regras }
    },
    text: (t) => {
      const root = {}
      for (const [k, v] of Object.entries(TEXTOS)) root[`--font-size-${v}`] = `${t[k]}px`
      for (const { name, size } of t.customSizes ?? []) {
        const v = `--font-size-custom-${slug(name)}`
        if (v in root) throw new Error(`Tamanho de texto personalizado repetido: "${name}" (${v})`)
        root[v] = `${size}px`
      }
      return root
    },
  },
  button: {
    mainButton: (t) => ({
      ...tamanhos('--main-btn', t),
      '--main-btn-radius': `${t.radius}px`,
      '--main-btn-border-width': `${t.borderWidth}px`,
    }),
    secondaryButton: (t) => ({
      ...tamanhos('--secondary-btn', t),
      '--secondary-btn-radius': `${t.radius}px`,
      '--secondary-btn-border-width': `${t.borderWidth}px`,
    }),
    navButton: (t) => ({
      ...tamanhos('--nav-btn', t),
      '--nav-btn-indicator-height': `${t.indicatorHeight}px`,
      '--nav-btn-icon': url(t.icon),
    }),
  },
}

const bloco = (linhas, recuo) => linhas.map((l) => recuo + l).join('\n')
const declaracoes = (file, vars) => [
  `/* ${file} */`,
  ...Object.entries(vars)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}: ${v};`),
]

// Cada coleção gera um único CSS (public/<coleção>/<coleção>.css) com as
// variáveis de todos os seus ficheiros, e copia os JSON para o mesmo sítio.
// O tema escuro aplica-se com a preferência do sistema ou com data-theme="dark" no <html>.
// As regras com outros seletores (ex.: [data-config="…"]) vêm no fim.
for (const [colecao, templates] of Object.entries(colecoes)) {
  const dir = join('conteudo', colecao)
  const out = join('public', colecao)
  await mkdir(out, { recursive: true })

  const claras = []
  const escuras = []
  const regras = []
  const links = [{ nome: `${rotulo(colecao)} · CSS (todas as variáveis)`, href: `${colecao}/${colecao}.css` }]
  for (const file of (await readdir(dir)).sort()) {
    if (!file.endsWith('.json')) continue
    const tema = JSON.parse(await readFile(join(dir, file), 'utf8'))
    const toVars = templates[tema._template]
    if (!toVars) throw new Error(`${dir}/${file}: template desconhecido "${tema._template}"`)

    const vars = toVars(tema)
    const { root, dark, regras: outras = [] } = vars.root ? vars : { root: vars }
    claras.push(...declaracoes(file, root))
    if (dark && Object.keys(dark).length) escuras.push(...declaracoes(file, dark))
    for (const { seletor, vars } of outras) regras.push(`${seletor} {\n${bloco(declaracoes(file, vars), '  ')}\n}\n`)
    await copyFile(join(dir, file), join(out, file))
    links.push({ nome: `${rotulo(colecao)} · ${rotuloTemplate(colecao, tema._template)}`, href: `${colecao}/${file}` })
  }
  seccoes.push({ titulo: rotulo(colecao), links })

  let css = `:root {\n${bloco(claras, '  ')}\n}\n`
  if (escuras.length) {
    css +=
      `\n@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n${bloco(escuras, '    ')}\n  }\n}\n` +
      `\n:root[data-theme="dark"] {\n${bloco(escuras, '  ')}\n}\n`
  }
  for (const r of regras) css += `\n${r}`
  await writeFile(join(out, `${colecao}.css`), css)
  console.log(`${dir}/ → ${out}/${colecao}.css`)
}

// Coleções sem CSS: os JSON são publicados em public/<coleção>/, para as libs os lerem,
// com um index.json que lista os ficheiros (o Pages não deixa listar pastas).
// São copiados tal e qual, exceto nas coleções que estão em "publicar".
const soJson = ['element', 'data']

// Tipos de bloco dos Elementos. Têm de ficar iguais a TIPOS, REPETIVEIS e GRUPO em tina/colecoes/element.ts.
const TIPOS_BLOCO = ['title', 'text', 'eyebrow', 'subtitle', 'item', 'quote']
const REPETIVEIS = ['text', 'item']
const GRUPO = 'group'

// Blocos de um idioma (comGrupos) ou de um grupo: pelo menos um, tipos conhecidos, sem repetir os não repetíveis;
// os grupos ({ type: GRUPO, contents[] }) só no primeiro nível e verificados da mesma forma.
const verificarBlocos = (blocos, aqui, comGrupos) => {
  if (!blocos.length) throw new Error(`${aqui} não tem blocos`)
  const vistos = new Set()
  for (const b of blocos) {
    if (b.type === GRUPO && comGrupos) {
      verificarBlocos(b.contents ?? [], `${aqui} (grupo)`, false)
      continue
    }
    if (!TIPOS_BLOCO.includes(b.type)) throw new Error(`${aqui} tem um bloco com tipo inválido: "${b.type ?? ''}"`)
    if (REPETIVEIS.includes(b.type)) continue
    if (vistos.has(b.type)) throw new Error(`${aqui} tem o tipo "${b.type}" repetido`)
    vistos.add(b.type)
  }
}

// Chaves dos Dados. Têm de ficar iguais a chaveLimpa e chaveComparavel em tina/colecoes/data.ts:
// gravada/publicada em Unicode composto (NFC) e sem espaços nas pontas; comparada também sem distinguir maiúsculas.
const chaveLimpa = (chave) => chave.normalize('NFC').trim()
const chaveComparavel = (chave) => chaveLimpa(chave).toLowerCase()

// Verificações das coleções sem CSS (o painel já as faz; isto apanha JSON editado fora dele).
const verificar = {
  element: (dados, file) => {
    const nomes = new Set()
    for (const item of dados.items ?? []) {
      const nome = (item.name ?? '').trim()
      const onde = `${file}: o elemento "${nome}"`
      if (!nome) throw new Error(`${file}: há um elemento sem nome`)
      if (nomes.has(nome)) throw new Error(`${onde} está repetido`)
      nomes.add(nome)

      const seccoes = item.contentBlock ?? []
      if (!seccoes.length) throw new Error(`${onde} não tem idiomas`)
      const idiomas = new Set()
      for (const c of seccoes) {
        if (!c.language) throw new Error(`${onde} tem um conteúdo sem idioma`)
        if (idiomas.has(c.language)) throw new Error(`${onde} tem o idioma "${c.language}" repetido`)
        idiomas.add(c.language)
        verificarBlocos(c.contents ?? [], `${onde} [${c.language}]`, true)
      }
    }
  },
  // Dados: pelo menos um par, cada um com chave, sem chaves repetidas, e um valor que se possa escrever como texto.
  data: (dados, file) => {
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw new Error(`${file}: tem de ser um objeto { "items": [...] }`)
    if (dados.items != null && !Array.isArray(dados.items)) throw new Error(`${file}: "items" tem de ser uma lista de pares`)
    const pares = dados.items ?? []
    if (!pares.length) throw new Error(`${file}: não tem pares (chave e valor)`)
    const chaves = new Set()
    for (const par of pares) {
      if (typeof par?.key !== 'string' || !chaveLimpa(par.key)) throw new Error(`${file}: há um par sem chave`)
      const chave = chaveComparavel(par.key)
      if (chaves.has(chave)) throw new Error(`${file}: a chave "${chaveLimpa(par.key)}" está repetida`)
      chaves.add(chave)
      // Números e verdadeiro/falso passam a texto (o painel mostra-os assim); listas e objetos não têm texto certo.
      if (typeof par.value === 'object' && par.value !== null) throw new Error(`${file}: o valor da chave "${chaveLimpa(par.key)}" tem de ser texto`)
    }
  },
}

// O que se publica de cada ficheiro, nas coleções que não são copiadas tal e qual (corre depois de "verificar").
// Dados: só { items: [{ key, value }] }, a forma DataItem do Seara: a chave limpa (chaveLimpa) e o valor
// sempre texto ("" quando falta).
const publicar = {
  data: (dados) => ({ items: dados.items.map(({ key, value }) => ({ key: chaveLimpa(key), value: value == null ? '' : String(value) })) }),
}

// Nome reservado em todas as coleções sem CSS: o index.json publicado é a lista dos ficheiros.
const RESERVADO = 'index.json'

for (const colecao of soJson) {
  const dir = join('conteudo', colecao)
  const out = join('public', colecao)
  // Começa do zero, para os ficheiros apagados no Tina desaparecerem também daqui.
  await rm(out, { recursive: true, force: true })
  await mkdir(out, { recursive: true })

  const ficheiros = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith('.json') && f !== RESERVADO).sort()
  // Um ficheiro com o nome reservado não é publicado (senão o index.json da lista apagava-o): não para o deploy, avisa.
  if ((await stat(join(dir, RESERVADO)).catch(() => null))?.isFile())
    avisar(colecao, `O ficheiro "${RESERVADO}" de ${rotulo(colecao)} não foi publicado: o nome "index" está reservado para a lista dos ficheiros. Muda-lhe o nome no painel (Rename) e atualiza as apps que o pedem.`)
  for (const file of ficheiros) {
    const dados = JSON.parse(await readFile(join(dir, file), 'utf8'))
    verificar[colecao]?.(dados, `${dir}/${file}`)
    if (publicar[colecao]) await writeFile(join(out, file), `${JSON.stringify(publicar[colecao](dados), null, 2)}\n`)
    else await copyFile(join(dir, file), join(out, file))
  }
  await writeFile(join(out, 'index.json'), `${JSON.stringify(ficheiros, null, 2)}\n`)
  seccoes.push({
    titulo: rotulo(colecao),
    links: [
      { nome: `${rotulo(colecao)} · lista de ficheiros`, href: `${colecao}/index.json` },
      ...ficheiros.map((f) => ({ nome: `${rotulo(colecao)} · ${f.replace(/\.json$/, '')}`, href: `${colecao}/${f}` })),
    ],
  })
  console.log(`${dir}/ → ${out}/ (${ficheiros.length} ficheiros + index.json)`)
}

// Etiquetas (conteudo/tag/tags.json): cada uma copia o ficheiro escolhido no Media Manager para um link fixo,
// tag/<slug(nome)>.<extensão>, e o index.json lista-as. Trocar o ficheiro de uma etiqueta não muda o link
// (só se a extensão mudar). Começa do zero, para as etiquetas apagadas desaparecerem.
{
  const out = join('public', 'tag')
  const uploads = resolve('public', 'uploads')
  await rm(out, { recursive: true, force: true })
  await mkdir(out, { recursive: true })

  // Versão de uma etiqueta que já está no Pages (pelo tag/index.json da publicação anterior). Só com BASE_URL (CI).
  let publicadas
  const versaoPublicada = async (s) => {
    if (!BASE) return null
    publicadas ??= fetch(`${BASE}/tag/index.json`, { signal: AbortSignal.timeout(15000) })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
    const lista = await publicadas
    const anterior = Array.isArray(lista) ? lista.find((e) => slug(String(e?.name ?? '')) === s) : undefined
    // O nome publicado é sempre <slug>.<extensão>; recusa outra coisa, para não escrever fora de public/tag/.
    if (!anterior || !new RegExp(`^${s}\\.[a-z0-9]+$`).test(anterior.file ?? '')) return null
    try {
      const r = await fetch(`${BASE}/tag/${anterior.file}`, { signal: AbortSignal.timeout(15000) })
      return r.ok ? { file: anterior.file, source: anterior.source, dados: Buffer.from(await r.arrayBuffer()) } : null
    } catch {
      return null
    }
  }

  const dados = JSON.parse(await readFile(join('conteudo', 'tag', 'tags.json'), 'utf8').catch(() => '{}'))
  const etiquetas = []
  const nomes = new Set()
  for (const { name, file } of dados.items ?? []) {
    const s = slug(name ?? '')
    if (!s) throw new Error(`Etiquetas: há uma etiqueta sem nome: "${name ?? ''}"`)
    if (nomes.has(s)) throw new Error(`Etiquetas: nome repetido "${name}" (${s})`)
    nomes.add(s)
    if (!file) throw new Error(`Etiqueta "${name}": falta o ficheiro`)
    // O Tina grava "/uploads/<ficheiro>". O URL do TinaCloud (https://assets.tina.io/<projeto>/<ficheiro>)
    // só aparece no painel, mas aceita-se também.
    const relativo = file.replace(/^https:\/\/assets\.tina\.io\/[^/]+\//, '/uploads/')
    const origem = resolve('public', `.${relativo}`)
    if (!origem.startsWith(uploads + sep)) throw new Error(`Etiqueta "${name}": o ficheiro "${file}" não está no Media Manager (uploads/)`)
    const ext = extname(origem).slice(1).toLowerCase()
    if (!ext) throw new Error(`Etiqueta "${name}": o ficheiro "${file}" não tem extensão`)
    if (!(await stat(origem).catch(() => null))?.isFile()) {
      // Ficheiro apagado do Media Manager (ou com outro nome): não para o deploy, para o resto chegar ao site.
      // Volta a publicar a versão que já está no Pages (o link não parte) e avisa. A cópia só existe no Pages:
      // quando a etiqueta apontar para um ficheiro que existe, é substituída (ou desaparece, se a extensão mudar).
      const anterior = await versaoPublicada(s)
      if (anterior) {
        await writeFile(join(out, anterior.file), anterior.dados)
        etiquetas.push({ name, file: anterior.file, source: anterior.source, outdated: true })
        avisar('tag', `Etiqueta "${name}": o ficheiro "${file}" não existe no Media Manager (foi apagado ou mudou de nome?). Continua publicada a versão anterior (${anterior.source}), que fica desatualizada até escolheres outro ficheiro na etiqueta.`)
      } else {
        avisar('tag', `Etiqueta "${name}": o ficheiro "${file}" não existe no Media Manager (foi apagado ou mudou de nome?) e não há versão anterior publicada${BASE ? '' : ' (em local, sem BASE_URL, não se procura)'}. A etiqueta não foi publicada: o link dá 404 até escolheres outro ficheiro na etiqueta.`)
      }
      continue
    }
    await copyFile(origem, join(out, `${s}.${ext}`))
    etiquetas.push({ name, file: `${s}.${ext}`, source: relativo })
  }
  await writeFile(join(out, 'index.json'), `${JSON.stringify(etiquetas, null, 2)}\n`)
  seccoes.push({
    titulo: rotulo('tag'),
    links: [
      { nome: `${rotulo('tag')} · lista de etiquetas`, href: 'tag/index.json' },
      ...etiquetas.map((e) => ({ nome: `${rotulo('tag')} · ${e.name}${e.outdated ? ' (desatualizada)' : ''}`, href: `tag/${e.file}` })),
    ],
  })
  console.log(`conteudo/tag/tags.json → ${out}/ (${etiquetas.length} etiquetas + index.json)`)
}

// Escrito sempre (lista vazia quando não há avisos), para o painel distinguir "sem avisos" de "não publicado".
await writeFile(join('public', 'avisos.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), warnings: avisos }, null, 2)}\n`)
console.log(`public/avisos.json (${avisos.length} avisos)`)

await writeFile(join('public', 'index.html'), paginaInicial(seccoes, BASE, avisos))
console.log('public/index.html (página inicial)')
