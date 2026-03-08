"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GigaWallet = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class GigaWallet {
    transactions = [];
    walletPath;
    constructor(nodeId) {
        this.walletPath = path_1.default.resolve(__dirname, `../wallet-${nodeId}.json`);
        this.load();
    }
    load() {
        if (fs_1.default.existsSync(this.walletPath)) {
            try {
                this.transactions = JSON.parse(fs_1.default.readFileSync(this.walletPath, 'utf8'));
            }
            catch (e) {
                this.transactions = [];
            }
        }
    }
    save() {
        fs_1.default.writeFileSync(this.walletPath, JSON.stringify(this.transactions, null, 2));
    }
    addIncome(taskId, amount) {
        this.transactions.push({
            taskId,
            timestamp: Date.now(),
            type: 'income',
            amount,
            description: 'Task completion reward'
        });
        this.save();
    }
    addExpense(taskId, amount, provider) {
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
exports.GigaWallet = GigaWallet;
