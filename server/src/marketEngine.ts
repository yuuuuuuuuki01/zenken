// Custom random ID generator to avoid uuid dependency
const generateId = () => Math.random().toString(36).substring(2, 10);

export interface Task {
    taskId: string;
    type: string;
    payload: any;
    rewardPts: number;
    requiredTrust: number;
    isEdgePriority: boolean;
    region?: string;
}

export interface AlgoConfig {
    geoPremium: number;       // 地産地消プレミアム (default: 1.5)
    sensitivePremium: number; // 機密計算プレミアム (default: 2.2)
    fineTuningPremium: number; // LLM需要インフレ (default: 1.3)
    demandSensitivity: number; // 需要連動感度 (default: 0.5)
    defaultTrust: number;     // 基本信頼スコア要件 (default: 50)
    sensitiveTrust: number;   // 機密タスク信頼スコア要件 (default: 0.9)
}

export class MarketEngine {
    private activeJobs: Task[] = [];
    private config: AlgoConfig = {
        geoPremium: 1.5,
        sensitivePremium: 2.2,
        fineTuningPremium: 1.3,
        demandSensitivity: 0.5,
        defaultTrust: 50,
        sensitiveTrust: 90
    };

    public setConfig(newConfig: Partial<AlgoConfig>) {
        this.config = { ...this.config, ...newConfig };
    }

    public getConfig(): AlgoConfig {
        return { ...this.config };
    }

    /**
     * 外部ソース（Mock）から「価値の高い仕事」を回収する
     */
    public async fetchExternalJobs(): Promise<Task[]> {
        // [Mock] 外部のAkashやRender Network、提携企業等からのタスク流入をシミュレート
        const rawJobs = [
            { type: 'inference', basePts: 100, isSensitive: false },
            { type: 'fine-tuning', basePts: 1000, isSensitive: true },
            { type: 'edge-analysis', basePts: 300, isSensitive: false, region: 'Tokyo' }
        ];

        return rawJobs.map(raw => this.applyGigaPremium(raw));
    }

    /**
     * 日本国内のエッジ・主権・セキュリティに基づいたプレミアム価格を適用する
     */
    private applyGigaPremium(raw: any): Task {
        let multiplier = 1.0;
        let requiredTrust = this.config.defaultTrust;
        let isEdgePriority = false;

        // 1. 地産地消プレミアム (物理的距離の近さ)
        if (raw.region === 'Tokyo') {
            multiplier *= this.config.geoPremium;
            isEdgePriority = true;
        }

        // 2. 国産主権 / 機密計算プレミアム
        if (raw.isSensitive) {
            multiplier *= this.config.sensitivePremium;
            requiredTrust = this.config.sensitiveTrust;
        }

        // 3. LLM需要インフレ
        if (raw.type === 'fine-tuning') {
            multiplier *= this.config.fineTuningPremium;
        }

        return {
            taskId: `giga_${generateId()}`,
            type: raw.type,
            payload: { data: "Wasm computational workload..." },
            rewardPts: Math.floor(raw.basePts * multiplier),
            requiredTrust,
            isEdgePriority,
            region: raw.region
        };
    }

    public getStrategyManifest() {
        return {
            name: "ZenKen Core Orchestrator",
            version: "v1.2.0-alpha",
            description: "エッジ、主権、LLM需要に基づいた動的な価格決定・マッチング戦略",
            logicFlow: [
                { step: 1, label: "Base Price", desc: "タスクの基本難易度から算定" },
                { step: 2, label: "Geo Premium", desc: `地域(Tokyo等)が一致する場合に ${this.config.geoPremium}x 加算`, active: this.config.geoPremium > 1.0 },
                { step: 3, label: "Sensitive Premium", desc: `機密計算が必要な場合に ${this.config.sensitivePremium}x 加算・信頼スコア ${this.config.sensitiveTrust} 以上を要求`, active: this.config.sensitivePremium > 1.0 },
                { step: 4, label: "LLM Inflation", desc: `学習・微調整タスクに ${this.config.fineTuningPremium}x 加算`, active: this.config.fineTuningPremium > 1.0 }
            ],
            requirements: {
                defaultTrust: this.config.defaultTrust,
                sensitiveTrust: this.config.sensitiveTrust
            }
        };
    }

    /**
     * クライアントジョブの推定コスト（PTS）を計算する。
     * プラットフォームマージン（30%）込みの価格を返す。
     * @param type タスクタイプ ('inference' | 'fine-tuning' | 'edge-analysis' | 'custom_task' など)
     * @param isSensitive 機密計算フラグ
     * @param region リージョン（'Tokyo' 等）
     * @param baseChunkCost チャンク1単位あたりの基本コスト
     * @param pendingTasks 現在の未処理タスク数
     * @param activeNodes 現在の有効ノード数
     */
    public estimateClientCost(
        type: string,
        isSensitive: boolean = false,
        region: string | undefined,
        baseChunkCost: number = 5,
        pendingTasks: number = 0,
        activeNodes: number = 1
    ): { cost: number; workerReward: number; platformMargin: number; multiplier: number; demandMultiplier: number } {
        const PLATFORM_MARGIN_RATE = 0.30;
        const WORKER_SHARE_RATE = 1 - PLATFORM_MARGIN_RATE;

        // 需要指数の計算: (タスク数 / ノード数) * 感度
        const utilization = pendingTasks / Math.max(1, activeNodes);
        const demandMultiplier = 1.0 + (utilization * this.config.demandSensitivity);

        let multiplier = 1.0 * demandMultiplier;

        // 1. 地産地消プレミアム
        if (region === 'Tokyo') {
            multiplier *= this.config.geoPremium;
        }

        // 2. 機密計算プレミアム
        if (isSensitive) {
            multiplier *= this.config.sensitivePremium;
        }

        // 3. LLM需要インフレ
        if (type === 'fine-tuning') {
            multiplier *= this.config.fineTuningPremium;
        }

        const cost = Math.ceil(baseChunkCost * multiplier);
        const workerReward = parseFloat((cost * WORKER_SHARE_RATE).toFixed(2));
        const platformMargin = parseFloat((cost * PLATFORM_MARGIN_RATE).toFixed(2));

        return { cost, workerReward, platformMargin, multiplier, demandMultiplier };
    }

    public getStatus() {
        return {
            activeJobs: this.activeJobs.length,
            marketTemperature: 'High (Demand Driven)',
            avgPremium: this.config.geoPremium.toString() + 'x ~'
        };
    }
}
