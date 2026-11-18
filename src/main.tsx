import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import '@/assets/styles/App.css'
import '@/assets/styles/ui/index.css'
import App from './App.tsx'
import Home from './pages/Home.tsx'
import Counter from './pages/Counter.tsx'
import Editor from './pages/Editor.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route element={<App />}>
          <Route index element={<Home />} />
          <Route path="counter" element={<Counter />} />
          <Route path="editor" element={<Editor />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
