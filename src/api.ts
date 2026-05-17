export async function streamChat(
    prompt: string,
    onChunk: (chunk: string) => void,
    onComplete: (full: string) => void,
    onError: (err: string) => void
) {
    try {
        const response = await fetch('http://localhost:8000/chat/stream', {
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
                        if (data.type === 'chunk') {
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

export async function streamComplete(
    prompt: string,
    onChunk: (chunk: string) => void,
    onComplete: (full: string) => void,
    onError: (err: string) => void
) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch('http://localhost:8000/autocomplete/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: prompt,
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
        // let chunkCount = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.type === 'chunk') {
                            onChunk(data.content);
                            full_res += data.content;
                            // chunkCount++;
                        } else if (data.type === 'complete') {
                            onComplete(full_res);
                        } else if (data.type === 'error') {
                            onError(data.content);
                        }
                    } catch (e) {
                        console.error("JSON parse error:", e, "line", line);
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
            onError(String(err) || `Unknown error: ${err}`);
        }
    }
}