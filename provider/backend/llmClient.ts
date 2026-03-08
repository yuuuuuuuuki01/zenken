import https from 'https';

export interface LLMRequest {
    prompt: string;
    model?: string;
    max_tokens?: number;
}

export interface LLMResponse {
    text: string;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    error?: string;
}

export class LLMClient {
    private apiKey: string | undefined;
    private provider: 'openai' | 'mock' = 'mock';

    constructor(config: { apiKey?: string; provider?: string }) {
        this.updateConfig(config);
    }

    updateConfig(config: { apiKey?: string; provider?: string }) {
        this.apiKey = config.apiKey;
        if (this.apiKey && config.provider === 'openai') {
            this.provider = 'openai';
        } else {
            this.provider = 'mock';
        }
    }

    async ask(request: LLMRequest): Promise<LLMResponse> {
        if (this.provider === 'mock') {
            return this.mockInference(request);
        }

        return this.callOpenAI(request);
    }

    private mockInference(request: LLMRequest): Promise<LLMResponse> {
        return new Promise((resolve) => {
            console.log(`[LLMClient] Mocking inference for prompt: "${request.prompt.substring(0, 50)}..."`);
            setTimeout(() => {
                resolve({
                    text: `[MOCK RESPONSE] Verified result for: ${request.prompt}`,
                    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
                });
            }, 1000);
        });
    }

    private callOpenAI(request: LLMRequest): Promise<LLMResponse> {
        return new Promise((resolve) => {
            const data = JSON.stringify({
                model: request.model || "gpt-3.5-turbo",
                messages: [{ role: "user", content: request.prompt }],
                max_tokens: request.max_tokens || 100
            });

            const options = {
                hostname: 'api.openai.com',
                port: 443,
                path: '/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Length': Buffer.byteLength(data)
                }
            };

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(body);
                        if (json.error) {
                            resolve({ text: '', error: json.error.message });
                        } else {
                            resolve({
                                text: json.choices[0].message.content,
                                usage: json.usage
                            });
                        }
                    } catch (e) {
                        resolve({ text: '', error: 'Failed to parse OpenAI response' });
                    }
                });
            });

            req.on('error', (e) => {
                resolve({ text: '', error: e.message });
            });

            req.write(data);
            req.end();
        });
    }
}
