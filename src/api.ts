import { API_BASE_URL, CHAT_ENDPOINT, AUTO_COMPLETE_ENDPOINT } from "./api.config";

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

export async function StreamCompleteRaw(
    pre_cursor: string,
    post_cursor: string,
    onChunk: (chunk: string) => void,
    onComplete: (full: string) => void,
    onError: (err: string) => void
) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

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

        clearInterval(timeoutId);

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
                        if (data.type === 'token') {
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
        if (err instanceof Error && err.name === "AbortError") {
            console.error("Completion Stream timed out.");
            onError("Completion Stream timed out.");
        } else {
            console.error("Streaming error:", err);
            const errorMsg = err instanceof Error ? err.message : String(err);
            onError(`Connection failed: ${errorMsg}`);
        }
    }
}