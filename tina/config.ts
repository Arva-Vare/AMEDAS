import { defineConfig } from 'tinacms'
import { button } from './colecoes/button'
import { data } from './colecoes/data'
import { element } from './colecoes/element'
import { tag } from './colecoes/tag'
import { tokens } from './colecoes/tokens'
import { avisarAoAbrir } from './avisos'
import { guia } from './guia'

export default defineConfig({
  branch: process.env.GITHUB_BRANCH || 'main',
  // Só necessários com TinaCloud (produção). Em local ficam vazios.
  clientId: process.env.TINA_CLIENT_ID || null,
  token: process.env.TINA_TOKEN || null,
  // basePath = nome do repositório no GitHub (o Pages serve em /<repo>/).
  build: { outputFolder: 'admin', publicFolder: 'public', basePath: 'AMEDAS' },
  media: { tina: { mediaRoot: 'uploads', publicFolder: 'public' } },
  // Páginas do guia no menu do painel (secção "Site") e alertas ao abrir (publicação falhada, avisos do gerador).
  cmsCallback: (cms) => {
    for (const pagina of guia) cms.plugins.add(pagina)
    avisarAoAbrir(cms)
    return cms
  },
  schema: {
    collections: [tokens, button, element, data, tag],
  },
})
