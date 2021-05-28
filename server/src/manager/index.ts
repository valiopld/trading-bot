export interface IBotConfig {
    pair: string,
    initAmount: number;
    percentForEachTrade: number;
    leverage: number;

    sl?: number;
    tsl?: number;
};

var id = 0;
const getId = () => {
  id += 1;
  return id;
};

export class Bot implements IBotConfig {
  id: number;
  pair: string;
  initAmount: number;
  percentForEachTrade: number;
  leverage: number;

  sl: number;
  tsl: number;

  pnl: number = 0;
  txs: number = 0;
  constructor(botConfig: IBotConfig) {
    const {
        pair,
        initAmount,
        percentForEachTrade,
        leverage,
        sl,
        tsl,
    } = botConfig;
    this.id = getId();

    this.pair = pair;
    this.initAmount = initAmount;
    this.percentForEachTrade = percentForEachTrade;
    this.leverage = leverage;
    sl ? this.sl = sl : null;
    tsl ? this.tsl = tsl : null;
  }
}

class botsManager {
    private _allBots: Bot[] = [];

    get allBots() {
        return this._allBots
    }

    addBot(config: IBotConfig, cb: () => void) {
        const newBot = new Bot(config)
        this._allBots.push(newBot)
        cb();
    }

    removeBot(id: number, cb: () => void) {
        const bot = this.allBots.find(bot => bot.id === id);
        if (!bot) return;
        this._allBots = this.allBots.filter(_bot => _bot !== bot);
        cb();
    }
}


export const myBotManager = new botsManager();