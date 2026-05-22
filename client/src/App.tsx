import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { BoothProvider } from './context/BoothContext'
import SelectPage from './pages/SelectPage'
import BoothPage from './pages/BoothPage'
import ResultPage from './pages/ResultPage'
import RemotePage from './pages/RemotePage'

export default function App() {
  return (
    <BoothProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<SelectPage />} />
          <Route path="/booth" element={<BoothPage />} />
          <Route path="/result" element={<ResultPage />} />
          <Route path="/remote" element={<RemotePage />} />
        </Routes>
      </BrowserRouter>
    </BoothProvider>
  )
}
