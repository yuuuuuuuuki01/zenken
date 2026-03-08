export interface BiddingConfig {
    baseCost: number; // API 原価 (PTS)
    expectedMargin: number; // 期待利益率 (0.5 = 50%)
    strategy: 'aggressive' | 'balanced' | 'premium';
}

export class BiddingEngine {
    private config: BiddingConfig;

    constructor(config?: Partial<BiddingConfig>) {
        this.config = {
            baseCost: 0.5, // 既定の API コスト (Worker LLM Bridge)
            expectedMargin: 0.5,
            strategy: 'balanced',
            ...config
        };
    }

    /**
     * 市場環境に基づき、最適な入札価格を算出する。
     * @param trustScore 自身の信頼スコア (0-100)
     * @param performanceScore 自身の性能スコア (0-100)
     * @param marketState グローバルな市場の状態 (稼働台数, 総タスク数)
     * @returns 提案価格 (PTS)
     */
    calculateBidPrice(
        trustScore: number,
        performanceScore: number,
        marketState: { activeNodes: number, totalTasks: number } = { activeNodes: 100, totalTasks: 50000 }
    ): number {
        let margin = this.config.expectedMargin;

        // 戦略に応じた調整
        switch (this.config.strategy) {
            case 'aggressive':
                margin *= 0.8; // 利益を削ってでも落札圏内に入る
                break;
            case 'premium':
                margin *= 1.5; // 高品質を売りにして高単価を狙う
                break;
        }

        // 信頼スコアが高い場合、プレミアム価格を上乗せしても落札可能（サーバー側スコアリングへの適応）
        // Trust が 90 を超えるノードは、信頼プレミアムとして利益率をさらに 20% 加算
        if (trustScore > 90) {
            margin += 0.2;
        }

        // [Dynamic Pricing] 需給バランスによる価格調整
        // 効率 = (タスク数 / 稼働台数) の比率を見る。1ノードあたり 500タスクを基準とする。
        const supplyDemandRatio = marketState.totalTasks / (Math.max(1, marketState.activeNodes) * 500);

        // 0.5倍 〜 2.0倍 の範囲で価格をスケーリング (減衰係数 0.5)
        const multiplier = Math.min(2.0, Math.max(0.5, 1 + (supplyDemandRatio - 1) * 0.5));

        // 基本価格 = 原価 * (1 + 利益率) * 需給マルチプライヤー
        const price = this.config.baseCost * (1 + margin) * multiplier;

        console.log(`[BiddingEngine] Multiplier: ${multiplier.toFixed(2)} (Ratio: ${supplyDemandRatio.toFixed(2)})`);
        console.log(`[BiddingEngine] Final Price: ${price.toFixed(2)} PTS`);
        return price;
    }

    setStrategy(strategy: BiddingConfig['strategy']) {
        this.config.strategy = strategy;
    }
}
