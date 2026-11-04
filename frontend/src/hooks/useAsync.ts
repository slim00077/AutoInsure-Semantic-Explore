import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../lib/api";

/** Hook de chargement : data / loading / error / reload. Ignore les réponses obsolètes. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const r = await fnRef.current();
      if (id === seq.current) {
        setData(r);
        setError(null);
      }
    } catch (e) {
      if (id === seq.current) setError(errorMessage(e));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void run(), deps);
  return { data, loading, error, reload: run, setData };
}

export function useDebounce<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useLocalStorage<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* stockage indisponible */
    }
  }, [key, v]);
  return [v, setV] as const;
}
