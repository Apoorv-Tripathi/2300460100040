import { useState, useEffect, useCallback } from "react";

const BASE = process.env.REACT_APP_API_URL;

export function useNotifications(params = {}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v))
      ).toString();
      const url = query ? `${BASE}?${query}` : BASE;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
      const json = await res.json();
      setData(json.notifications || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(params)]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}