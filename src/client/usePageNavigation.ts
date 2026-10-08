import { useEffect, useLayoutEffect, useRef, useState } from "react";
function supportedPath(path: string) {
  return ["/", "/nearby", "/plan", "/plan/result", "/phrases"].includes(path) ||
    /^\/toilets\/[^/]+$/.test(path)
    ? path
    : "/";
}
export function usePageNavigation() {
  const [path, setPath] = useState(() =>
    supportedPath(window.location.pathname),
  );
  const current = useRef(path);
  const scroll = useRef(new Map<string, number>());
  current.current = path;
  useEffect(() => {
    const previous = history.scrollRestoration;
    history.scrollRestoration = "manual";
    const back = () => {
      scroll.current.set(current.current, window.scrollY);
      setPath(supportedPath(window.location.pathname));
    };
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("popstate", back);
      history.scrollRestoration = previous;
    };
  }, []);
  useLayoutEffect(() => {
    window.scrollTo({ top: scroll.current.get(path) ?? 0, behavior: "auto" });
  }, [path]);
  const navigate = (next: string) => {
    next = supportedPath(next);
    if (next === current.current) return;
    scroll.current.set(current.current, window.scrollY);
    history.pushState(null, "", next);
    setPath(next);
  };
  return { path, navigate };
}
