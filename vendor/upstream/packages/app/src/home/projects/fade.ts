export type HomeProjectsFadeMetrics = {
  scrollTop: number
  clientHeight: number
  scrollHeight: number
}

export type HomeProjectsFadeState = {
  top: boolean
  bottom: boolean
}

/**
 * The project list fades only while content is clipped on that edge.
 * Keep the one-pixel tolerance in one place so touch scrolling and resize updates agree.
 */
export function homeProjectsFadeState(metrics: HomeProjectsFadeMetrics): HomeProjectsFadeState {
  return {
    top: metrics.scrollTop > 0,
    bottom: metrics.scrollTop + metrics.clientHeight < metrics.scrollHeight - 1,
  }
}

export function applyHomeProjectsFade(element: HTMLDivElement) {
  const state = homeProjectsFadeState(element)
  element.toggleAttribute("data-fade-top", state.top)
  element.toggleAttribute("data-fade-bottom", state.bottom)
}
