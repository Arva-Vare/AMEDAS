import { PAGES } from './campos'
import { lerPublicado } from './guia'

// Alertas ao abrir o painel (cms.alerts do Tina), para quem edita saber que algo não chegou ao site:
// - os avisos da última publicação (public/avisos.json, escritos pelo scripts/gerar.mjs): avisos amarelos;
// - a última publicação do Pages falhou (API pública do GitHub, sem token: 60 pedidos por hora por IP): erro.
// Os avisos amarelos só aceitam texto; o erro abre uma janela, e o Tina torna os URLs do texto em links.

// Dono e nome do repositório, tirados do PAGES ("https://arva-vare.github.io/AMEDAS" → "arva-vare/AMEDAS").
const repositorio = () => {
  const u = new URL(PAGES)
  return `${u.hostname.replace(/\.github\.io$/, '')}${u.pathname.replace(/\/$/, '')}`
}

const quando = (iso: string) =>
  new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Lisbon' }).format(new Date(iso))

const avisosDaPublicacao = async (cms: any) => {
  const lido = await lerPublicado('avisos.json')
  let avisos: { message?: string }[] = []
  try {
    avisos = JSON.parse(lido?.texto ?? '{}').warnings ?? []
  } catch {}
  // timeout 0: fica até quem edita o fechar.
  for (const { message } of avisos) if (message) cms.alerts.warn(`Aviso da última publicação: ${message}`, 0)
}

const publicacaoFalhada = async (cms: any) => {
  const r = await fetch(`https://api.github.com/repos/${repositorio()}/actions/workflows/pages.yml/runs?branch=main&per_page=10`)
  if (!r.ok) return
  const runs: any[] = (await r.json()).workflow_runs ?? []
  // Um run cancelado foi substituído pelo seguinte (concurrency do pages.yml): não conta.
  const ultimo = runs.find((x) => x.status === 'completed' && x.conclusion !== 'cancelled')
  if (!ultimo || ultimo.conclusion === 'success') return
  const aCorrer = runs.some((x) => x.status !== 'completed' && x.created_at > ultimo.created_at)
  cms.alerts.error(
    `A última publicação do site falhou (${quando(ultimo.created_at)}, "${ultimo.display_title}"). ` +
      'O site continua com a versão anterior, e o que foi gravado no painel desde então ainda não está publicado.' +
      (aCorrer ? ' Já está a correr uma publicação nova: volta a abrir o painel daqui a uns minutos.' : '') +
      `\n\nO erro está no GitHub (passo "Run npm run build", no fim): ${ultimo.html_url}`,
  )
}

let feito = false
/** Chamada no cmsCallback do tina/config.ts. Não bloqueia o arranque; se a rede falhar, não avisa. */
export const avisarAoAbrir = (cms: any) => {
  if (feito || typeof window === 'undefined') return
  feito = true
  avisosDaPublicacao(cms).catch(() => {})
  publicacaoFalhada(cms).catch(() => {})
}
