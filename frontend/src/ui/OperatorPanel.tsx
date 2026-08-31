import { useEffect, useState } from 'react'
import {
  apiLogProduction,
  apiSetStatus,
  fetchOpsState,
  fetchOrders,
  fetchReasonCodes,
  fetchTwin,
} from '../api'
import { STATUS_COLORS } from '../constants'
import type {
  MachineStateDto,
  OrderDto,
  ReasonCodeDto,
  TwinDto,
} from '../types'
import { OpsNav } from './OpsNav'

/** Large-button tablet UI for shop-floor operators (PRD 8.8) */
export function OperatorPanel() {
  const [twin, setTwin] = useState<TwinDto | null>(null)
  const [states, setStates] = useState<Record<string, MachineStateDto>>({})
  const [orders, setOrders] = useState<OrderDto[]>([])
  const [reasonCodes, setReasonCodes] = useState<ReasonCodeDto[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [pickingReason, setPickingReason] = useState(false)
  const [good, setGood] = useState('')
  const [reject, setReject] = useState('')
  const [flash, setFlash] = useState('')

  const refresh = async () => {
    const list = await fetchOpsState()
    setStates(Object.fromEntries(list.map((s) => [s.instance_id, s])))
    setOrders(await fetchOrders())
  }

  useEffect(() => {
    fetchTwin().then(setTwin)
    fetchReasonCodes().then(setReasonCodes)
    refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [])

  if (!twin) return <div className="operator-page">Loading…</div>

  const machine = twin.instances.find((i) => i.id === selected)
  const state = selected ? states[selected] : null
  const order = orders.find(
    (o) => o.machine_id === selected && o.status === 'running',
  )

  const setStatus = async (status: 'running' | 'idle' | 'down', reason?: string) => {
    if (!selected) return
    await apiSetStatus(selected, status, reason)
    setPickingReason(false)
    refresh()
  }

  const log = async () => {
    if (!selected) return
    const g = parseInt(good || '0', 10)
    const r = parseInt(reject || '0', 10)
    if (g <= 0 && r <= 0) return
    await apiLogProduction(selected, g, r, order?.id)
    setGood('')
    setReject('')
    setFlash('Logged!')
    setTimeout(() => setFlash(''), 1500)
    refresh()
  }

  return (
    <div className="operator-page">
      <OpsNav active="operator" />
      {!machine ? (
        <>
          <h1 className="operator-title">Select your machine</h1>
          <div className="machine-grid">
            {twin.instances.map((inst) => {
              const st = states[inst.id]
              return (
                <button
                  key={inst.id}
                  className="machine-tile"
                  style={{
                    borderColor: st ? STATUS_COLORS[st.status] : '#475569',
                  }}
                  onClick={() => setSelected(inst.id)}
                >
                  <span
                    className="tile-dot"
                    style={{ background: st ? STATUS_COLORS[st.status] : '#475569' }}
                  />
                  {inst.name}
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <div className="operator-detail">
          <button className="back-btn" onClick={() => setSelected(null)}>
            ← All machines
          </button>
          <h1 className="operator-title">
            {machine.name}
            {state && (
              <span
                className="operator-status"
                style={{ background: STATUS_COLORS[state.status] }}
              >
                {state.status.toUpperCase()}
                {state.reason_code ? ` · ${state.reason_code}` : ''}
              </span>
            )}
          </h1>
          {order && (
            <p className="operator-order">
              Working on <strong>{order.id}</strong> — {order.product_name} (
              {order.produced}/{order.qty})
            </p>
          )}

          {!pickingReason ? (
            <div className="big-buttons">
              <button className="big-btn down" onClick={() => setPickingReason(true)}>
                MACHINE DOWN
              </button>
              <button className="big-btn run" onClick={() => setStatus('running')}>
                RUNNING
              </button>
              <button className="big-btn idle" onClick={() => setStatus('idle')}>
                IDLE
              </button>
            </div>
          ) : (
            <div className="big-buttons reasons">
              {reasonCodes.map((rc) => (
                <button
                  key={rc.code}
                  className="big-btn reason"
                  onClick={() => setStatus('down', rc.code)}
                >
                  {rc.label}
                </button>
              ))}
              <button className="big-btn" onClick={() => setPickingReason(false)}>
                Cancel
              </button>
            </div>
          )}

          <div className="operator-log">
            <h2>Log production {order ? `against ${order.id}` : ''}</h2>
            <div className="operator-log-row">
              <label>
                Good
                <input
                  type="number"
                  min="0"
                  value={good}
                  onChange={(e) => setGood(e.target.value)}
                />
              </label>
              <label>
                Reject
                <input
                  type="number"
                  min="0"
                  value={reject}
                  onChange={(e) => setReject(e.target.value)}
                />
              </label>
              <button className="big-btn log" onClick={log}>
                {flash || 'LOG COUNTS'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
