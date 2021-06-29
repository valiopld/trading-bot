import { Position, PositionType } from './position';
import { LogData, LogType, convertCSVtoJSON } from '../utils';
import { socket as mainSocket } from '../index';
import { binanceApi } from "../apis/binance-api.service";
import { myBotManager } from './manager';
import { adaSubs } from "./events";
import { ProdInstance } from './prodInstance';

export type TTrend = 'up' | 'down';


const myBinance = new ProdInstance();

export interface IBotConfig {
    pair: string,
    initAmount: number;
    percentForEachTrade: number;
    leverage: number;
    strategy: string;
    yxbd: {
      yx: string | null,
      bd: string | null,
    };

    sltp?: {
      sl: number,
      tp: number,
    },
    sl?: number;
    tslAct?: number;
    tslCBRate?: number;
    histData?: string;
};

export class Bot implements IBotConfig {
    id: number;
    pair: string;
    initAmount: number;
    percentForEachTrade: number;
    leverage: number;
  
    strategy: string;
  
    tslAct: number;
    tslCBRate: number;
  
    pnl: number = 0;
    txs: number = 0;
    alerts: { [key: string]: string };
  
    equity: number;
  
    openedPosition: Position = null;
  
    log: any[] = [];
  
    trend: TTrend;
  
    yxbd: {
      yx: string | null,
      bd: string | null,
    };
  
    sltp: {
      sl: number | null,
      tp: number | null,
    };
  
    prod: boolean = false;
  
    listener: any;
    histRawData: string;

    constructor(botConfig: IBotConfig, id: number) {
      const {
          pair,
          initAmount,
          percentForEachTrade,
          leverage,
          strategy,
          yxbd,
          sltp,
          histData,
      } = botConfig;

      this.id = id;
      this.pair = pair;
      this.initAmount = initAmount;
      this.equity = initAmount;
  
      this.percentForEachTrade = percentForEachTrade;
      this.leverage = leverage;
      this.strategy = strategy,
      sltp ? this.sltp = sltp : null;
    
      this.yxbd = yxbd;
      this.sltp = sltp;
      this.histRawData = histData;
  
      const logData = {
        id: this.id,
        pair: this.pair,
        initAmount: this.initAmount,
        percentForEachTrade: this.percentForEachTrade,
        leverage: this.leverage,
        strategy: this.strategy,
        yx: yxbd.yx,
        bd: yxbd.bd,
        sl: sltp?.sl,
        tp: sltp?.tp,
        isHist: histData ? true : false,
      }

      this.logData(LogType.SUCCESS, `Bot Started!`, logData);
      if (this.histRawData) this.processHistData();
    }
  
    get yx() {
      return this.yxbd.yx;
    }
  
    get bd() {
      return this.yxbd.bd;
    }
  
    async handleAlert(alert: string) {
      this.logData(LogType.SUCCESS, `New Alert: ${alert}`);
      if (alert === 'red1_peak_60') {
        if (!this.openedPosition) this.openPosition('SHORT');
      }

      if (alert === 'green1_bottom_60') {
        if (!this.openedPosition) this.openPosition('LONG');
      }
    }
  
    private async openPosition(type: PositionType, _price: number = null, time: string = null) {
      if (this.openedPosition) return;
      const price = _price ? _price : await this.getCurrentPrice();
      if (!price) return;

      const amount = this.equity >= this.initAmount
          ? this.percentForEachTrade * this.equity
          : this.percentForEachTrade * this.initAmount;
  
      this.openedPosition = new Position(type, amount, price, this.equity, this.leverage, time);
      if ((this.sltp.sl || this.sltp.tp) && !this.histRawData) this.openSLTPSubscriber(type, price);
      this.logData(LogType.SUCCESS, `New ${type} Position opened!`);
    }
  
    private async closePosition(_price: number = null, time: string = null) {
      if (!this.openedPosition) return;
      const price = _price ? _price : await this.getCurrentPrice();
      if (!price) return;
      this.openedPosition.close(price, time);
      if (this.listener) adaSubs.eventEmmiter.removeListener('priceSubs', this.listener)

      this.equity += this.openedPosition.pnlAmount;
      this.pnl = this.equity - this.initAmount;
      this.logData(LogType.SUCCESS, `Closed ${this.openedPosition.positionType} position!`, this.openedPosition);
      this.openedPosition = null;
      this.txs++;
      mainSocket.emit('botsList', myBotManager.allBots);
    }
  
    private async getCurrentPrice(): Promise<number> {
      const result = await binanceApi.getPrice(this.pair);
      const { error, data } = result;
      if (!error && data?.price) return parseFloat(data.price);
      this.logData(LogType.ERROR, `Error with getting Price`, result);
      return 0;
    }
  
    private openSLTPSubscriber(type: PositionType, price: number) {
      console.log('isOpen!')
      const isLong: boolean = type === 'LONG';
      this.listener = this.onPriceSubs(isLong, price).bind(this);
      adaSubs.eventEmmiter.addListener('priceSubs', this.listener);
    }
  
    onPriceSubs(isLong: boolean, openPrice: number) {
      return (data: any) => {
        const slPrice = isLong
          ? openPrice - (openPrice * this.sltp.sl)
          : openPrice + (openPrice * this.sltp.sl);
    
        const tpPrice = isLong
          ? openPrice + (openPrice * this.sltp.tp)
          : openPrice - (openPrice * this.sltp.tp);
    
        const { lastPrice } = data;
        if (isLong) {
          if (lastPrice < slPrice || lastPrice > tpPrice) this.closePosition();
        } else {
          if (lastPrice > slPrice || lastPrice < tpPrice) this.closePosition();
        }
      }
    }
  
    private logData(type: string, log: string, data: any = {}) {
      const _log = new LogData(type, log, data);
      const logData = _log.save(`${this.pair}-${this.id}`);
      this.log.unshift(logData);
    }
  
    private async processHistData() {
      const bwcuBottomLevel = -60;
      const bwcdTopLevel = 60;

      const histDataArray: any[] = await convertCSVtoJSON(this.histRawData) as any[];
      for (let i = 0; i < histDataArray.length - 1; i++) {
        await new Promise((res) => setTimeout(() => res(true), 5));
        const cc = histDataArray[i];
        const bwcu = cc['Blue Wave Crossing UP'];
        const bwcd = cc['Blue Wave Crossing Down'];
        const cp = parseFloat(cc['close']);
        const ct = cc['time'];
        const mf = cc['Mny Flow'];
        if (!this.openedPosition) {
          if (bwcu && bwcu !== 'NaN' && parseFloat(bwcu) < bwcuBottomLevel) await this.openPosition('LONG', cp, ct);
          if (bwcd && bwcd !== 'NaN' && parseFloat(bwcd) > bwcdTopLevel) await this.openPosition('SHORT', cp, ct);
        } else {
          const isLong = this.openedPosition.positionType === 'LONG';
          const openPrice = this.openedPosition.openPrice;

          const slPrice = isLong
            ? openPrice - (openPrice * this.sltp.sl)
            : openPrice + (openPrice * this.sltp.sl);
    
          const tpPrice = isLong
            ? openPrice + (openPrice * this.sltp.tp)
            : openPrice - (openPrice * this.sltp.tp);
          if (isLong) {
            if (cp < slPrice || cp > tpPrice) await this.closePosition(cp, ct);
          } else {
            if (cp > slPrice || cp < tpPrice) await this.closePosition(cp, ct);
          }
        }
      }
    }
  }