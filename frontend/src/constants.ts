import type { MachineCategory, MachineStatus } from './types'

export const STATUS_COLORS: Record<MachineStatus, string> = {
  running: '#22c55e',
  idle: '#facc15',
  warning: '#f97316',
  down: '#ef4444',
}

export const STATUS_LABELS: Record<MachineStatus, string> = {
  running: 'Running',
  idle: 'Idle',
  warning: 'Warning',
  down: 'Down',
}

/** Output per second while running (robots count spot welds, lines count car moves) */
export const PRODUCTION_RATES: Record<MachineCategory, number> = {
  robot: 0.55,
  bodyline: 0.03,
  trimline: 0.02,
  press: 0.35,
  cnc: 0.12,
  conveyor: 0.45,
  rack: 0,
  tank: 0,
  panel: 0,
  stamping: 0.4,
  diptank: 0.05,
  paintrobot: 0.5,
  oven: 0.05,
  cncmill: 0.14,
  asrs: 0.2,
  agv: 0.1,
  forklift: 0.08,
  paintline: 0.5,
  inboundrail: 0.4,
  blanking: 0.42,
  transferrobot: 0.42,
  diecrane: 0,
  panelrack: 0,
  scrapconv: 0.6,
  coilcrane: 0.05,
  galine: 0.03,
  marriage: 0.05,
  qcgate: 0.08,
  framing: 0.06,
  framecell: 0.06,
  doorline: 0.03,
  wheelstn: 0.12,
  glassstn: 0.06,
  seatstn: 0.06,
  fluidfill: 0.03,
  rollertest: 0.02,
  lampaim: 0.02,
  inspectpit: 0.02,
  lighttunnel: 0.02,
  showertest: 0.02,
}
