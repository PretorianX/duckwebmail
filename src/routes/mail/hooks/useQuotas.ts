import { useCallback, useEffect, useState } from "react";
import { getQuotas, type JmapQuota } from "../../../jmap/quota";

type Auth = {
  session: { apiUrl: string };
  authHeader: string;
  accountId: string;
} | null;

export function useQuotas(auth: Auth) {
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [quotas, setQuotas] = useState<JmapQuota[]>([]);

  const loadQuotas = useCallback(async (opts?: { force?: boolean }) => {
    if (!auth) return;
    setQuotaError(null);
    setQuotaLoading(true);
    try {
      const res = await getQuotas({
        apiUrl: auth.session.apiUrl,
        authHeader: auth.authHeader,
        accountId: auth.accountId,
        force: opts?.force
      });
      setQuotas(res.quotas);
    } catch (err) {
      console.log("[Quota] Failed to load quotas:", err instanceof Error ? err.message : err);
      setQuotaError(err instanceof Error ? err.message : "Failed to load quotas");
      setQuotas([]);
    } finally {
      setQuotaLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    void loadQuotas();
  }, [loadQuotas]);

  return {
    quotas,
    quotaLoading,
    quotaError,
    loadQuotas
  };
}

