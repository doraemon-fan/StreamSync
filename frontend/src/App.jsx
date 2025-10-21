import React, { useState } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import TestUploadPage from '../components/TestFeature/TestUploadPage';
import ViewVideoPage from '../components/TestFeature/ViewVideoPage';
import './App.css'

function App() {
  return (
    <>
      <BrowserRouter>
        <header style={{ padding: 12, borderBottom: '1px solid #e5e7eb' }}>
          <nav style={{ display: 'flex', gap: 12 }}>
            <Link to="/">Home</Link>
            <Link to="/test-upload">Test Upload</Link>
          </nav>
        </header>

        <main style={{ padding: 20 }}>
          <Routes>
            <Route path="/test-upload" element={<TestUploadPage />} />
            <Route path="/view-video" element={<ViewVideoPage />} />
          </Routes>
        </main>
      </BrowserRouter>
    </>
  )
}

export default App
