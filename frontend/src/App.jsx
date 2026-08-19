import { useState } from 'react'
import { AppDataProvider } from './lib/AppDataContext'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import DatabaseManager from './pages/DatabaseManager'
import ItemEditor from './pages/ItemEditor'
import Playlist from './pages/Playlist'
import MixEditor from './pages/MixEditor'
import Settings from './pages/Settings'
import Logs from './pages/Logs'
import Users from './pages/admin/Users'
import Groups from './pages/admin/Groups'

function AppShell() {
  const { user, loading } = useAuth()
  const [view, setView] = useState('dashboard')
  const isLoggedIn = !!user
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

  if (loading) {
    return <div className="flex h-screen w-full items-center justify-center bg-zinc-950 text-zinc-400">Laden…</div>
  }

  return (
    <AppDataProvider>
      {!isLoggedIn && <Login onLogin={() => setView('dashboard')} />}
      {isLoggedIn && (
        <>
          <div style={{ display: view === 'dashboard' ? 'contents' : 'none' }}>
            <Dashboard onEditItem={openEditor} onNavigate={navigate} />
          </div>
          <div style={{ display: view === 'list' ? 'contents' : 'none' }}>
            <DatabaseManager onEditItem={openEditor} onNavigate={navigate} />
          </div>
          <div style={{ display: view === 'playlist' ? 'contents' : 'none' }}>
            <Playlist onEditItem={openEditor} onNavigate={navigate} />
          </div>
          <div style={{ display: view === 'settings' ? 'contents' : 'none' }}>
            <Settings onNavigate={navigate} />
          </div>
          <div style={{ display: view === 'logs' ? 'contents' : 'none' }}>
            <Logs onNavigate={navigate} />
          </div>
          <div style={{ display: view === 'users' ? 'contents' : 'none' }}>
            <Users onNavigate={navigate} />
          </div>
          <div style={{ display: view === 'groups' ? 'contents' : 'none' }}>
            <Groups onNavigate={navigate} />
          </div>
          <div style={{ display: view === 'mixeditor' ? 'contents' : 'none' }}>
            <MixEditor
              context={mixEditorContext}
              onBack={() => setView('playlist')}
              onNavigate={navigate}
            />
          </div>
          <div style={{ display: view === 'editor' ? 'contents' : 'none' }}>
            <ItemEditor
              internalId={selectedItemId}
              playlistContext={playlistContext}
              onBack={backToList}
              onNavigate={navigate}
            />
          </div>
        </>
      )}
    </AppDataProvider>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}

export default App
