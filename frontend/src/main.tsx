import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import App from './App'
import { AlarmsPage } from './ui/AlarmsPage'
import { BrainPage } from './ui/BrainPage'
import { HandoverPage } from './ui/HandoverPage'
import { LabelSheet } from './ui/LabelSheet'
import { MaintenancePage } from './ui/MaintenancePage'
import { MorningReport } from './ui/MorningReport'
import { OperatorPanel } from './ui/OperatorPanel'
import { OrderBoard } from './ui/OrderBoard'
import { OwnerDashboard } from './ui/OwnerDashboard'
import { QualityPage } from './ui/QualityPage'
import { TagMapperPage } from './ui/TagMapperPage'
import { WhatIfPage } from './ui/WhatIfPage'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/labels" element={<LabelSheet />} />
        <Route path="/report" element={<MorningReport />} />
        <Route path="/ops" element={<OrderBoard />} />
        <Route path="/operator" element={<OperatorPanel />} />
        <Route path="/dashboard" element={<OwnerDashboard />} />
        <Route path="/quality" element={<QualityPage />} />
        <Route path="/maintenance" element={<MaintenancePage />} />
        <Route path="/handover" element={<HandoverPage />} />
        <Route path="/alarms" element={<AlarmsPage />} />
        <Route path="/tags" element={<TagMapperPage />} />
        <Route path="/brain" element={<BrainPage />} />
        <Route path="/whatif" element={<WhatIfPage />} />
        <Route path="/asset/:assetId" element={<App />} />
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
