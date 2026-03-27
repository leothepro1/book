import { log } from "@/app/_lib/logger"

export interface FetchOptions extends RequestInit {
  timeout?: number
  retries?: number
  retryDelay?: number
  service?: string
}

export async function resilientFetch(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const {
    timeout = 10_000,
    retries = 0,
    retryDelay = 1_000,
    service = "external",
    ...fetchOptions
  } = options

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    const start = Date.now()

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      })
      clearTimeout(timer)

      const duration = Date.now() - start
      if (duration > 3_000) {
        log("warn", "http.slow_response", { service, duration, status: response.status })
      }

      return response
    } catch (err) {
      clearTimeout(timer)
      const duration = Date.now() - start
      lastError = err instanceof Error ? err : new Error(String(err))
      const isTimeout = lastError.name === "AbortError"

      log("error", isTimeout ? "http.timeout" : "http.error", {
        service,
        duration,
        attempt: attempt + 1,
        error: lastError.message,
      })

      if (isTimeout || attempt === retries) break
      await new Promise(resolve => setTimeout(resolve, retryDelay))
    }
  }

  throw lastError ?? new Error(`${service} request failed`)
}
