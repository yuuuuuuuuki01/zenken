import fs from 'fs';
import path from 'path';

/**
 * GigaCompute Wallet & Cost Optimizer (家計簿機能)
 * ワーカーの API 利用コストと報酬を管理し、利益を最大化するためのモジュール。
 */
export interface Transaction {
    taskId: string;
    timestamp: number;
    type: 'income' | 'expense';
    amount: number; // USD or Reward Points
    description: string;
}

export class GigaWallet {
    private transactions: Transaction[] = [];
    private walletPath: string;

    constructor(nodeId: string, baseDir?: string) {
        const dir = baseDir || path.resolve(__dirname, '..');
        this.walletPath = path.resolve(dir, `wallet-${nodeId}.json`);
        this.load();
    }

    private load() {
        if (fs.existsSync(this.walletPath)) {
            try {
                this.transactions = JSON.parse(fs.readFileSync(this.walletPath, 'utf8'));
            } catch (e) {
                this.transactions = [];
            }
        }
    }

    private save() {
        fs.writeFileSync(this.walletPath, JSON.stringify(this.transactions, null, 2));
    }

    addIncome(taskId: string, amount: number) {
        this.transactions.push({
            taskId,
            timestamp: Date.now(),
            type: 'income',
            amount,
            description: 'Task completion reward'
        });
        this.save();
    }

    addExpense(taskId: string, amount: number, provider: string) {
        this.transactions.push({
            taskId,
            timestamp: Date.now(),
            type: 'expense',
            amount,
            description: `API Usage Cost (${provider})`
        });
        this.save();
    }

    getStats() {
        const income = this.transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        const expense = this.transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
        return {
            totalIncome: income,
            totalExpense: expense,
            netProfit: income - expense,
            transactionCount: this.transactions.length
        };
    }

    getTransactions() {
        return [...this.transactions].reverse().slice(0, 50);
    }
}
