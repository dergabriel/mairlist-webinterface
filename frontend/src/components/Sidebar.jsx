import {
  LayoutDashboard,
  Settings,
  Database,
  Copy,
  ListMusic,
  Users,
  ScrollText,
  LogOut,
} from "lucide-react";
import { useAuth } from "../lib/AuthContext";

function NavItem({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
        active ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
      }`}
    >
      <Icon size={16} className={active ? "text-orange-500" : ""} />
      <span>{label}</span>
    </button>
  );
}

export default function Sidebar({ activePage, onNavigate, user, showLogout = true, onListClick }) {
  const { logout } = useAuth();
  const isAdmin = user?.scopes?.some(
    (s) => s.UserLevel === "Admin" || s.role === "admin" || s?.permissions?.UserLevel === "Admin" || s?.permissions?.role === "admin"
  );

  const handleLogout = async () => {
    await logout();
    onNavigate?.("login");
  };

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 px-3 py-4">
      <div className="mb-6 px-2 text-sm font-semibold tracking-wide">
        <span className="text-zinc-100">mAirList</span>{" "}
        <span className="rounded bg-orange-500 px-1.5 py-0.5 text-xs font-bold text-zinc-950">DB</span>
      </div>

      <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Playout</div>
      <nav className="mb-5 space-y-0.5">
        <NavItem
          icon={LayoutDashboard}
          label="Übersicht"
          active={activePage === "dashboard"}
          onClick={() => onNavigate?.("dashboard")}
        />
      </nav>

      <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Datenbank</div>
      <nav className="mb-5 space-y-0.5">
        <NavItem
          icon={Database}
          label="Elemente"
          active={activePage === "list"}
          onClick={onListClick ?? (() => onNavigate?.("list"))}
        />
        <NavItem icon={Copy} label="Vorlagen" />
        <NavItem
          icon={ListMusic}
          label="Playlist"
          active={activePage === "playlist"}
          onClick={() => onNavigate?.("playlist")}
        />
      </nav>

      {isAdmin && (
        <>
          <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
            Administration
          </div>
          <nav className="space-y-0.5">
            <NavItem
              icon={Users}
              label="Benutzer"
              active={activePage === "users"}
              onClick={() => onNavigate?.("users")}
            />
            <NavItem
              icon={ScrollText}
              label="Logs"
              active={activePage === "logs"}
              onClick={() => onNavigate?.("logs")}
            />
            <NavItem
              icon={Settings}
              label="Einstellungen"
              active={activePage === "settings"}
              onClick={() => onNavigate?.("settings")}
            />
          </nav>
        </>
      )}

      {showLogout && (
        <div className="mt-auto pt-4">
          <NavItem icon={LogOut} label="Abmelden" onClick={handleLogout} />
        </div>
      )}
    </aside>
  );
}
