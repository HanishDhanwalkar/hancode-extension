import { API_BASE_URL, CHAT_ENDPOINT, AUTO_COMPLETE_ENDPOINT } from "./api.config";

type StreamCompleteOptions = {
    signal?: AbortSignal;
    timeoutMs?: number;
    suppressAbortError?: boolean;
};

export async function streamChat(
    prompt: string,
    onChunk: (chunk: string) => void,
    onComplete: (full: string) => void,
    onError: (err: string) => void
) {
    try {
        const response = await fetch(`${API_BASE_URL}${CHAT_ENDPOINT}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: prompt,
                conversation_id: "SIDEBAR_CHAT"
            })
        });

        if (!response.ok) {
            onError(`Server Error: ${response.statusText}`);
            return;
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let full_res = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.type === 'partial') {
                            onChunk(data.content);
                            full_res += data.content;
                        } else if (data.type === 'complete') {
                            onComplete(full_res);
                        } else if (data.type === 'error') {
                            onError(data.content);
                        }
                    } catch (e) {
                        console.error("JSON parse error:", e);
                    }
                }
            }
        }

    } catch (err) {
        console.error("Streaming error:", err);
        onError(String(err) || `Unknown error: ${err}`);
    }
}

export async function streamCompleteRaw(
    pre_cursor: string,
    post_cursor: string,
    onChunk: (chunk: string) => void,
    onComplete: (full: string) => void,
    onError: (err: string) => void,
    options?: StreamCompleteOptions
) {
    const controller = new AbortController();
    const upstreamAbort = () => controller.abort();
    options?.signal?.addEventListener('abort', upstreamAbort, { once: true });

    try {
        const timeoutMs = options?.timeoutMs ?? 5000;
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        console.log(`[Autocomplete] Connecting to $(API_BASE_URL)${AUTO_COMPLETE_ENDPOINT}`);

        const response = await fetch(`${API_BASE_URL}${AUTO_COMPLETE_ENDPOINT}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                pre_cursor: pre_cursor,
                post_cursor: post_cursor
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            onError(`Server Error: ${response.statusText}`);
            return;
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let full_res = "";
        let finished = false;

        const finish = () => {
            if (finished) {
                return;
            }
            finished = true;
            onComplete(full_res);
        };

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                finish();
                break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.type === 'token') {
                            onChunk(data.content);
                            full_res += data.content;
                        } else if (data.type === 'complete' || data.type === 'done') {
                            finish();
                        } else if (data.type === 'error') {
                            finished = true;
                            onError(data.content);
                        }
                    } catch (e) {
                        console.error("JSON parse error:", e);
                    }
                }
            }
        }
    } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
            if (!options?.suppressAbortError) {
                console.error("Completion Stream timed out.");
                onError("Completion Stream timed out.");
            }
        } else {
            console.error("Streaming error:", err);
            const errorMsg = err instanceof Error ? err.message : String(err);
            onError(`Connection failed: ${errorMsg}`);
        }
    } finally {
        options?.signal?.removeEventListener('abort', upstreamAbort);
    }
}
