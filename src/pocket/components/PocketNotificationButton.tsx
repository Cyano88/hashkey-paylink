import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "./PocketIcons";
import { POCKET_BASE_PATH, POCKET_ROUTES } from "../lib/pocketRoutes";
import usePocketIdentity from "../hooks/usePocketIdentity";
import { POCKET_REQUESTS_UPDATED_EVENT, readPocketRequestInbox } from "../api/pocketRequestsClient";
import usePocketPageVisible from "../hooks/usePocketPageVisible";
import { registerPocketRefreshHandler } from "../lib/pocketRefresh";

export default function PocketNotificationButton() {
  const navigate = useNavigate();
  const { authenticated, email, getAccessToken } = usePocketIdentity();
  const [unread, setUnread] = useState(0);
  const visible = usePocketPageVisible();
  const tokenRef = useRef(getAccessToken);
  tokenRef.current = getAccessToken;
  useEffect(() => {
    if (!authenticated) {
      setUnread(0);
      return;
    }
    if (!visible) return;
    setUnread(0);
    let cancelled = false;
    let inFlight = false;
    const refresh = async () => {
      if (cancelled || inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      try {
        const token = await tokenRef.current();
        if (!token || cancelled || document.visibilityState !== 'visible') return;
        const inbox = await readPocketRequestInbox(token);
        if (!cancelled) setUnread(inbox.unreadCount);
      } catch { /* Keep the last count when the session or inbox is unavailable. */ }
      finally { inFlight = false; }
    };
    void refresh();
    const interval = window.setInterval(refresh, 30_000);
    const unregister = registerPocketRefreshHandler(refresh);
    window.addEventListener(POCKET_REQUESTS_UPDATED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      unregister();
      window.removeEventListener(POCKET_REQUESTS_UPDATED_EVENT, refresh);
    };
  }, [authenticated, email, visible]);
  return (
    <button
      type="button"
      onClick={() =>
        navigate(`${POCKET_BASE_PATH}${POCKET_ROUTES.notifications}`)
      }
      className="pointer-events-auto relative flex h-10 w-10 items-center justify-center rounded-full text-gray-700 transition hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/[0.06]"
      aria-label="Open notifications"
    >
      <Bell className="h-5 w-5" />
      {unread > 0 && <span className="absolute right-0.5 top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-black leading-none text-white">{unread > 9 ? '9+' : unread}</span>}
    </button>
  );
}
