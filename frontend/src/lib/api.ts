import axios, { AxiosError } from "axios";

/** Configuration Axios centralisée : base URL, timeout et normalisation uniforme des erreurs. */
export const http = axios.create({
  baseURL: (import.meta.env.VITE_API_URL ?? "") + "/api",
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

http.interceptors.response.use(
  (r) => r,
  (err: AxiosError<{ error?: { code: string; message: string; details?: { path: string; message: string }[] } }>) => {
    if (err.response?.data?.error) {
      const e = err.response.data.error;
      return Promise.reject(new ApiError(e.message, err.response.status, e.code, e.details));
    }
    if (err.code === "ECONNABORTED") return Promise.reject(new ApiError("Délai dépassé : le serveur ne répond pas.", 0, "TIMEOUT"));
    if (!err.response) {
      return Promise.reject(new ApiError("Impossible de joindre l'API. Vérifiez que le backend (port 4000) est démarré.", 0, "NETWORK"));
    }
    return Promise.reject(new ApiError(`Erreur serveur (${err.response.status}).`, err.response.status, "HTTP"));
  },
);

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : "Erreur inattendue.");
