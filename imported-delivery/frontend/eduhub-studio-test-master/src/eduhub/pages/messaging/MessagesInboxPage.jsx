/**
 * MessagesInboxPage.jsx — in-app messaging conversation list ("/messages").
 *
 * Reads from MessagingContext (already fetching + WS-subscribed at the
 * app root) rather than re-fetching independently — this page is a
 * pure view over that shared state, matching the "one fetch, one
 * socket" discipline NotificationContext/ActivityDrawer already
 * establishes for the Activity Center.
 *
 * Honest empty state (no fabricated "start chatting!" prompt implying
 * a directory of people to browse — rule 2, this feature never adds
 * reach to people outside an existing real interaction).
 */
import { MessageCircle, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useMessaging } from "../../context/MessagingContext";

const GOLD = "#D4A843";

function timeAgo(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function ConversationRow({ conv, onOpen }) {
  const isGroup = conv.kind !== "dm";
  const title = isGroup ? (conv.title || "Group chat") : (conv.otherDisplayName || "Student");
  const hasUnread = conv.unreadCount > 0;
  return (
    <button
      onClick={() => onOpen(conv.id)}
      data-testid={`conversation-row-${conv.id}`}
      className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-zinc-900/[0.06] dark:border-white/[0.06] hover:bg-zinc-900/[0.02] dark:hover:bg-white/[0.03] transition-colors"
    >
      <div
        className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "rgba(212,168,67,0.14)", border: "1px solid rgba(212,168,67,0.32)" }}
      >
        {isGroup ? <Users size={18} style={{ color: GOLD }} /> : <MessageCircle size={18} style={{ color: GOLD }} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className={`truncate text-[0.9rem] ${hasUnread ? "font-bold text-ink dark:text-white" : "font-semibold text-zinc-700 dark:text-white/80"}`}>
            {title}
          </div>
          <div className="shrink-0 text-[0.7rem] text-zinc-400 dark:text-white/40">{timeAgo(conv.lastMessageAt)}</div>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <div className={`truncate text-[0.8rem] ${hasUnread ? "text-zinc-700 dark:text-white/70 font-medium" : "text-zinc-500 dark:text-white/45"}`}>
            {conv.lastMessagePreview || "No messages yet"}
          </div>
          {hasUnread && (
            <span
              data-testid={`conversation-unread-badge-${conv.id}`}
              className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full text-[0.65rem] font-bold text-white flex items-center justify-center"
              style={{ background: "#E23D6B" }}
            >
              {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export default function MessagesInboxPage() {
  const ctx = useMessaging();
  const navigate = useNavigate();

  if (!ctx || ctx.enabled === null) {
    return <div className="p-8 text-center text-[13px] opacity-50">Loading messages…</div>;
  }
  if (ctx.enabled === false) {
    return (
      <div className="p-8 text-center text-[13px] opacity-60" data-testid="messages-disabled">
        Messaging isn't available right now.
      </div>
    );
  }

  const { conversations } = ctx;

  return (
    <div className="max-w-lg mx-auto pb-6">
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-[1.1rem] font-bold text-ink dark:text-white">Messages</h1>
      </div>
      {conversations.length === 0 ? (
        <div className="px-6 py-16 text-center" data-testid="messages-empty-state">
          <div
            className="w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-3"
            style={{ background: "rgba(212,168,67,0.12)" }}
          >
            <MessageCircle size={24} style={{ color: GOLD }} />
          </div>
          <p className="text-[0.9rem] font-semibold text-zinc-700 dark:text-white/80">No conversations yet</p>
          <p className="text-[0.8rem] text-zinc-500 dark:text-white/45 mt-1">
            Conversations started with classmates or your Speaking Lab group will show up here.
          </p>
        </div>
      ) : (
        <div>
          {conversations.map((conv) => (
            <ConversationRow key={conv.id} conv={conv} onOpen={(id) => navigate(`/messages/${id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
