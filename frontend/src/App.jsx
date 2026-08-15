import { useState } from 'react'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import DatabaseManager from './pages/DatabaseManager'
import ItemEditor from './pages/ItemEditor'
import Playlist from './pages/Playlist'
import MixEditor from './pages/MixEditor'
import Settings from './pages/Settings'
import Logs from './pages/Logs'

function App() {
  const [view, setView] = useState('login')
  const [previousView, setPreviousView] = useState('dashboard')
  const [selectedItemId, setSelectedItemId] = useState(null)
  // Set only when the editor is opened from a playlist row: which slot the
  // "volatile" (per-instance) edits should be saved against. Null when
  // opened from the Elemente list, where only the global item exists.
  const [playlistContext, setPlaylistContext] = useState(null)
  // Set when navigating into the Mix Editor from the playlist: the selected
  // items (in playlist order) plus which playlist/hour they came from.
  const [mixEditorContext, setMixEditorContext] = useState(null)

  const openEditor = (internalId, context = null) => {
    setPreviousView(view)
    setSelectedItemId(internalId)
    setPlaylistContext(context)
    setView('editor')
  }

  const backToList = () => {
    setView(previousView)
  }

  const navigate = (nextView, payload = null) => {
    if (nextView === 'mixeditor') setMixEditorContext(payload)
    setView(nextView)
  }

  return (
    <>
      {view === 'login' && <Login onLogin={() => setView('dashboard')} />}
      {view === 'dashboard' && <Dashboard onEditItem={openEditor} onNavigate={navigate} />}
      {view === 'list' && <DatabaseManager onEditItem={openEditor} onNavigate={navigate} />}
      {view === 'playlist' && <Playlist onEditItem={openEditor} onNavigate={navigate} />}
      {view === 'settings' && <Settings onNavigate={navigate} />}
      {view === 'logs' && <Logs onNavigate={navigate} />}
      {view === 'mixeditor' && (
        <MixEditor
          context={mixEditorContext}
          onBack={() => setView('playlist')}
          onNavigate={navigate}
        />
      )}
      {view === 'editor' && (
        <ItemEditor
          internalId={selectedItemId}
          playlistContext={playlistContext}
          onBack={backToList}
          onNavigate={navigate}
        />
      )}
    </>
  )
}

export default App
