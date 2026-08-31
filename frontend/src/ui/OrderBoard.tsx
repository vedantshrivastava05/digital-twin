import { useEffect, useRef, useState } from 'react'
import {
  apiCreateOrder,
  apiImportOrdersCsv,
  apiUpdateOrder,
  fetchOrders,
  fetchProducts,
  fetchTwin,
} from '../api'
import type { OrderDto, OrderStatus, ProductDto, TwinDto } from '../types'
import { OpsNav } from './OpsNav'

const COLUMNS: { key: OrderStatus; label: string }[] = [
  { key: 'queued', label: 'Queued' },
  { key: 'running', label: 'Running' },
  { key: 'qc', label: 'QC' },
  { key: 'done', label: 'Done' },
]

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  queued: 'running',
  running: 'qc',
  qc: 'done',
}

export function OrderBoard() {
  const [orders, setOrders] = useState<OrderDto[]>([])
  const [products, setProducts] = useState<ProductDto[]>([])
  const [twin, setTwin] = useState<TwinDto | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('')
  const [machineId, setMachineId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [importMsg, setImportMsg] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const refresh = () => fetchOrders().then(setOrders)

  useEffect(() => {
    refresh()
    fetchProducts().then(setProducts)
    fetchTwin().then(setTwin)
  }, [])

  const createOrder = async () => {
    if (!productId || !qty) return
    await apiCreateOrder({
      product_id: productId,
      qty: parseInt(qty, 10),
      machine_id: machineId || null,
      due_date: dueDate || null,
    })
    setShowForm(false)
    setQty('')
    refresh()
  }

  const advance = async (order: OrderDto) => {
    const next = NEXT[order.status]
    if (next) {
      await apiUpdateOrder(order.id, { status: next })
      refresh()
    }
  }

  const onImport = async (files: FileList | null) => {
    if (!files?.length) return
    const result = await apiImportOrdersCsv(files[0])
    setImportMsg(
      `Imported ${result.created} orders${
        result.errors.length ? ` · ${result.errors.length} rows skipped` : ''
      }`,
    )
    if (fileInput.current) fileInput.current.value = ''
    refresh()
  }

  return (
    <div className="ops-page">
      <OpsNav active="orders" />
      <header className="ops-header">
        <h1>Production orders</h1>
        <div className="ops-actions">
          <input
            ref={fileInput}
            type="file"
            accept=".csv"
            hidden
            onChange={(e) => onImport(e.target.files)}
          />
          <button className="secondary" onClick={() => fileInput.current?.click()}>
            Import CSV
          </button>
          <button onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Close' : '+ New order'}
          </button>
        </div>
      </header>
      {importMsg && <p className="ops-note">{importMsg}</p>}

      {showForm && (
        <div className="order-form">
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            placeholder="Qty"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
          <select value={machineId} onChange={(e) => setMachineId(e.target.value)}>
            <option value="">Machine (optional)…</option>
            {twin?.instances.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <button onClick={createOrder} disabled={!productId || !qty}>
            Create
          </button>
        </div>
      )}

      <div className="board">
        {COLUMNS.map((col) => (
          <div key={col.key} className="board-col">
            <h3>
              {col.label}
              <span>{orders.filter((o) => o.status === col.key).length}</span>
            </h3>
            {orders
              .filter((o) => o.status === col.key)
              .map((order) => (
                <div key={order.id} className={`order-card${order.late ? ' late' : ''}`}>
                  <div className="order-card-head">
                    <strong>{order.id}</strong>
                    {order.late && <span className="late-chip">LATE</span>}
                  </div>
                  <p>
                    {order.product_sku} — {order.product_name}
                  </p>
                  {order.color && (
                    <p className="order-colour">
                      <span
                        className="order-swatch"
                        style={{ background: order.color }}
                      />
                      {order.color_name ?? order.color}
                    </p>
                  )}
                  <div className="order-progress">
                    <div
                      className="order-progress-bar"
                      style={{
                        width: `${Math.min(100, (order.produced / order.qty) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="order-meta">
                    {order.produced}/{order.qty} pcs
                    {order.machine_name ? ` · ${order.machine_name}` : ''}
                    {order.due_date ? ` · due ${order.due_date}` : ''}
                  </p>
                  {NEXT[order.status] && (
                    <button className="advance" onClick={() => advance(order)}>
                      → {NEXT[order.status]}
                    </button>
                  )}
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}
