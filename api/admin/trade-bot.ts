import Market, { orderType, portfolio } from "../market/market";
import { randomBytes } from "crypto";
import Users, { User } from "../market/users";


export interface botSettings {

    aggressivity: number;
    
    startingPortfolio: portfolio;
    setPrice: any; //Stock: price

    tickLength: number; //In Seconds
};

export function fromConfig(botConfigs: any, market: Market, users: Users): TradeBot[] {

    let bots: TradeBot[] = [];

    for (const bot in botConfigs) {
        
        const botObj = new TradeBot(botConfigs[bot], market, users);
        botObj.createBot(bot);
        bots.push(botObj);
    }

    return bots;
} 

export default class TradeBot {

    constructor(settings: botSettings, market: Market, users: Users) {


        this.timer = null;
        this.settings = settings;
        this.market = market;
        this.users = users;
        this.user = null;
        this.savedOrders = {};
    }

    async createBot(botName: string) {
       


        //Check if given bot exists
        for (const user of this.users.getUserList()) {
            
            if (user.name === botName) {
                user.bot = true; //yee... now it's a bot

                //Init protfolio from settings
                user.portfolio = this.settings.startingPortfolio;

                //Save user
                this.user = user;
                return;
            }
        }

        //Create Bot User
        const user = await this.users.createUser(botName, randomBytes(8).toString("base64"));
        user.bot = true;

        //Init protfolio from settings
        user.portfolio = this.settings.startingPortfolio;

        //Save user
        this.user = user;

        //ETC...
    }

    enableBot() {

        if (this.timer !== null)
            return; //Market has already been started, so don't start it again

        this.timer = setInterval(() => {
            this.tick();
        }, this.settings.tickLength * 1000);
    }

    disableBot() {
        if (this.timer === null)
            return; //Market is not running, no need to stop it

        clearInterval(this.timer);
        this.timer = null;
    }

    private tick() {

        console.log();

        if (this.user === null || typeof this.user.portfolio === "undefined") return;
        
        //Aggressivity - amount of actions per turn
        for (let x = 0; x < this.settings.aggressivity; x++) {

            const stocks = this.market.getStocks();
            const affectedStock = Array.from(stocks)[Math.floor(Math.random() * stocks.size)];


            if (typeof this.user.portfolio.assets[affectedStock[0]] === "undefined")
                continue; //Select different stock

            if (typeof this.savedOrders[affectedStock[0]] === "undefined")
                this.savedOrders[affectedStock[0]] = [];


            //Do an action
            const currentPrice = affectedStock[1].priceHistory[Object.keys(affectedStock[1].priceHistory)[Object.keys(affectedStock[1].priceHistory).length - 1]];
            const amount = Math.floor(Math.random() * 20) + 1;
            console.log(`[${new Date().toLocaleTimeString("sk-SK")}]: Bot ${this.user.name} - chosen trading amount: ${amount}`);

            //Cancel stale order(s)
            for (let x = 0; x < this.savedOrders[affectedStock[0]].length; x++) {

                const staleOrder = this.savedOrders[affectedStock[0]][x];
                
                if ((new Date().getTime() - staleOrder.creationDate.getTime()) / 1000 > 2 * 60 || (staleOrder.unitPrice < .66 * currentPrice || staleOrder.unitPrice > 1.33 * currentPrice)) {
                    
                    //Get order details
                    const order = this.market.getOrderByID(affectedStock[0], staleOrder.oid);
                    if (typeof order === "undefined") continue;

                    if (order.type === orderType.BUY) 
                        this.user.portfolio.cash += order.totalPrice;
                    else
                        this.user.portfolio.assets[affectedStock[0]] += order.units;

                    //Refund order
                    this.market.removeOrder(affectedStock[0], staleOrder.oid);

                    //Remove from saved
                    this.savedOrders[affectedStock[0]].splice(x, 1);

                    console.log(`[${new Date().toLocaleTimeString("sk-SK")}]: Bot ${this.user.name} - removing stale order ${staleOrder.oid}`);
                }
            }


            let order = {
                type: orderType.BUY,
                amount: amount,
                unitPrice: 0
            }

            if (currentPrice < this.settings.setPrice[affectedStock[0]]) {

                if (affectedStock[1].activeBuyOrders.length <= 2) 
                    order = {
                        type: orderType.BUY, 
                        amount: amount,
                        unitPrice: Math.floor(1.15 * currentPrice)
                    };

                else
                    order = {
                        type: orderType.SELL, 
                        amount: amount,
                        unitPrice: Math.floor(1.15 * currentPrice)
                    };
            }

            else if (currentPrice > this.settings.setPrice[affectedStock[0]]) {


                if (affectedStock[1].activeSellOrders.length <= 2) 
                    order = {
                        type: orderType.SELL, 
                        amount: amount,
                        unitPrice: Math.floor(0.85 * currentPrice)
                    };
                

                else
                    order = {
                        type: orderType.BUY, 
                        amount: amount,
                        unitPrice: Math.floor(0.85 * currentPrice)
                    };
            }

            else 
                order = { //Just some houskeeping
                    type: (affectedStock[1].activeBuyOrders.length > affectedStock[1].activeSellOrders.length ? orderType.SELL : orderType.BUY), 
                    amount: amount,
                    unitPrice: Math.floor(currentPrice)
                };

            //Check if we can

            if (order.type === orderType.SELL)
                order.amount = Math.min(0.33 * this.user.portfolio.assets[affectedStock[0]], Math.max(0, order.amount));
            else 
                order.amount = (Math.min(0.33 * this.user.portfolio.cash, Math.max(0, order.amount * order.unitPrice))) / order.unitPrice;
            

            console.log(`[${new Date().toLocaleTimeString("sk-SK")}]: Bot ${this.user.name} - adjusted trading amount: ${order.amount}`);
            //TODO: debug
            const oid = this.market.addOrder(this.user.usid, order.type, affectedStock[0], Math.floor(order.amount), Math.floor(Math.floor(order.amount) * order.unitPrice)); //Safety floors in here

            if (oid === null)
                continue;

            console.log(`[${new Date().toLocaleTimeString("sk-SK")}]: Bot ${this.user.name} - ${order.type === orderType.BUY ? "buy" : "sell"} offer (oid: ${oid}) on ${affectedStock[0]}: (amount: ${Math.floor(order.amount)}, unit price: ${order.unitPrice}, total price: ${Math.floor(order.amount * order.unitPrice)})`);


            //Lock up resources
            if (order.type === orderType.SELL) 
               this.user.portfolio.assets[affectedStock[0]] -= Math.floor(order.amount);
            else
                this.user.portfolio.cash -= Math.floor(order.amount * order.unitPrice);

            this.savedOrders[affectedStock[0]].push({
                creationDate: new Date(),
                unitPrice: order.unitPrice,
                oid: oid
            });

            //TODO: Lock up resources
            if (this.user.portfolio.assets[affectedStock[0]] < 0.1 * this.settings.startingPortfolio.assets[affectedStock[0]]) {
                
                let amount = Math.floor(Math.random() * 20) + 1;
                amount = Math.floor((Math.min(0.33 * this.user.portfolio.cash, Math.max(0, amount * currentPrice))) / currentPrice);
                
                const oid = this.market.addOrder(this.user.usid, orderType.BUY, affectedStock[0], amount, Math.floor(currentPrice * amount));
                if (oid === null)
                    continue;
                
                this.user.portfolio.cash -= Math.floor(amount * currentPrice);

                this.savedOrders[affectedStock[0]].push({
                    creationDate: new Date(),
                    unitPrice: order.unitPrice,
                    oid: oid
                });

                console.log(`[${new Date().toLocaleTimeString("sk-SK")}]: Bot ${this.user.name} - refill  "buy" offer (oid: ${oid}) on ${affectedStock[0]}: (amount: ${amount}, unit price: ${currentPrice}, total price: ${Math.floor(amount * currentPrice)})`);
            }
            else if (this.user.portfolio.cash < 0.1 * this.settings.startingPortfolio.cash) {
            
                let amount = Math.floor(Math.random() * 20) + 1;
                amount = Math.min(0.33 * this.user.portfolio.assets[affectedStock[0]], Math.max(0, amount));

                const oid = this.market.addOrder(this.user.usid, orderType.SELL, affectedStock[0], amount, Math.floor(currentPrice * amount));
                if (oid === null)
                    continue;

                this.user.portfolio.assets[affectedStock[0]] -= Math.floor(amount);


                this.savedOrders[affectedStock[0]].push({
                    creationDate: new Date(),
                    unitPrice: order.unitPrice,
                    oid: oid
                });


                console.log(`[${new Date().toLocaleTimeString("sk-SK")}]: Bot ${this.user.name} - refill "sell" offer (oid: ${oid}) on ${affectedStock[0]}: (amount: ${amount}, unit price: ${currentPrice}, total price: ${Math.floor(amount * currentPrice)})`);

            }

            //Cleaning orders
            if (affectedStock[1].activeBuyOrders.length > 7) {
                
                let amount = 20;
                const price = Math.floor(0.85 * currentPrice);
                amount = Math.floor(Math.min(0.33 * this.user.portfolio.assets[affectedStock[0]], Math.max(0, amount)));


                const oid = this.market.addOrder(this.user.usid, orderType.SELL, affectedStock[0], amount, Math.floor(price * amount));
                if (oid === null)
                    continue;


                this.user.portfolio.assets[affectedStock[0]] -= Math.floor(amount);
  

                this.savedOrders[affectedStock[0]].push({
                    creationDate: new Date(),
                    unitPrice: order.unitPrice,
                    oid: oid
                });

                console.log(`[${new Date().toLocaleTimeString("sk-SK")}]: Bot ${this.user.name} - cleanup "sell" offer (oid: ${oid}) on ${affectedStock[0]}: (amount: ${amount}, unit price: ${price}, total price: ${Math.floor(amount * price)})`);
            }

            else if (affectedStock[1].activeSellOrders.length > 7) {

                let amount = 20;
                const price = Math.floor(1.15 * currentPrice);
                amount = Math.floor((Math.min(0.33 * this.user.portfolio.cash, Math.max(0, amount * price))) / price);
                
                const oid = this.market.addOrder(this.user.usid, orderType.BUY, affectedStock[0], amount, Math.floor(price * amount));
                if (oid === null)
                    continue;

                this.user.portfolio.cash -= Math.floor(amount * currentPrice);
                

                this.savedOrders[affectedStock[0]].push({
                    creationDate: new Date(),
                    unitPrice: order.unitPrice,
                    oid: oid
                });


                console.log(`[${new Date().toLocaleTimeString("sk-SK")}]: Bot ${this.user.name} - refill  "buy" offer (oid: ${oid}) on ${affectedStock[0]}: (amount: ${amount}, unit price: ${price}, total price: ${Math.floor(amount * price)})`);

            }
        }
    }



    timer: NodeJS.Timeout | null;
    settings: botSettings;
    market: Market;
    users: Users;

    user: User | null; 
    savedOrders: any; //stock:[{creationDate, oid, unitPrice}, ...]
};