import { useEffect, useState } from "react";
import { fetchCountry, isEeaOrUk } from "@/lib/geoBlock";

interface GeoBlockState {
  loading: boolean;
  blocked: boolean;
  country: string | null;
}

const SESSION_KEY = "geo-country";

export function useGeoBlock(): GeoBlockState {
  const [country, setCountry] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(SESSION_KEY);
  });
  const [loading, setLoading] = useState<boolean>(() => country === null);

  useEffect(() => {
    if (country !== null) return;
    const ctrl = new AbortController();
    fetchCountry(ctrl.signal).then((c) => {
      if (c) {
        try {
          window.sessionStorage.setItem(SESSION_KEY, c);
        } catch {
          // ignore storage failures (private browsing, etc.)
        }
      }
      setCountry(c);
      setLoading(false);
    });
    return () => ctrl.abort();
  }, [country]);

  return {
    loading,
    blocked: isEeaOrUk(country),
    country,
  };
}
