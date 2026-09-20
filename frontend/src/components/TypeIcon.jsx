// Small type-indicator icon, shared by Playlist.jsx's tables and the
// container editors (ContainerEditors.jsx) — both list items by type.
import { Music, ListMusic, Box, Megaphone } from "lucide-react";

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const TYPE_ICONS = {
  music: { Icon: Music, className: "text-green-500" },
  jingle: { Icon: ListMusic, className: "text-orange-500" },
  container: { Icon: Box, className: "text-blue-500" },
  advertising: { Icon: Megaphone, className: "text-zinc-400" },
};

export default function TypeIcon({ type }) {
  const entry = TYPE_ICONS[type] || { Icon: Music, className: "text-zinc-500" };
  const { Icon, className } = entry;
  return <Icon size={14} className={className} title={capitalize(type)} />;
}
