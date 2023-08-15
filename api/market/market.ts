import { randomUUID } from "crypto";
import { Request, Response } from "express";
import { readFileSync, writeFileSync } from "fs";
import WSServer from "../websockets";
import Users from "./users";

//Stock from the perspective of the exchange
export interface stock {

    name: string;
    currentPrice: {
        askPrice: number;
        bidPrice: number;
    };
    priceHistory: any; //Will be stored in format: { timestamp: price }

    allowFractional: boolean;

    activeSellOrders: order[];
    activeBuyOrders: order[];
};

export interface portfolio {
    
    assets: any; //Will be stored in format: { stock: amount }
    cash: number;
};

//Transactions (stock-neutral)
export enum orderType {
    BUY, SELL
};

export interface order {

    type: orderType;
    units: number;
    totalPrice: number; 

    ouid: string; //order uid
    cuid: string; //creator uid
};

export interface transaction {

    timestamp: number;
    totalSold: number; //Total units sold
    totalPaid: number; //Total money paid

    sellOID: string;
    buyOID: string; //Order ids of buying and selling offers for FE

    outputOrder: order | null; //if the whole amount of the order is transfered, then null
                               //if only the part is sold/bought, then output the order for remaining
};



export default class Market {

    constructor(wsock: WSServer, users: Users, defaultMarketPath: string = "./market.json") {

        this.stockList = new Map<string, stock>();
        this.users = users;
        this.websock = wsock;

        try {

            const marketJSON = readFileSync(defaultMarketPath, {encoding: 'utf-8'});
            const parsedMarket = JSON.parse(marketJSON);
            this.stockList = new Map<string, stock>(Object.entries(parsedMarket));

        } catch (e) {
        
            this.populateStocks();
        }
        
    }
    
    populateStocks(defaultStocksPath: string = "./stocks.json") {
        
        try {

            const stocksJSON = readFileSync(defaultStocksPath, {encoding: 'utf-8'});
            const partialParse = JSON.parse(stocksJSON);

            //Create stock structure
            for (const key in partialParse) {
                
                //No need for data checking, any error should fall to catch
                const stock = partialParse[key];

                let priceHistory: any = {};
                priceHistory[Date.now()] = stock.initialPrice;
                
                //Format: 
                //  key: {name: "", initialPrice: "", fractional: ""} 
                this.stockList.set(key, {
                    name: stock.name,
                    currentPrice: {
                        askPrice: stock.initialPrice,
                        bidPrice: stock.initialPrice
                    },
                    priceHistory: priceHistory,        
                    allowFractional: stock.fractional,
                    activeSellOrders: [],
                    activeBuyOrders: []
                });
    
            }

        } catch(e: any) {
            console.error(`${defaultStocksPath} not found or corrupted: ${e.message}`);

            let priceHistory: any = {};
            priceHistory[Date.now()] = 110;

            //If no stocks.json is found (or stocks.json is corrupted), fall back to debug data
            this.stockList.set("BTC", {
                name: "Bikoin",
                currentPrice: {
                    askPrice: 110,
                    bidPrice: 110
                },
                priceHistory: priceHistory,        
                allowFractional: true,
                activeSellOrders: [],
                activeBuyOrders: []
            });
        }
    }

    addOrder(userid: string, type: orderType, stockName: string, amount: number, price: number): string | null {

        if (amount <= 0 || price <= 0)
            return null;

        if (this.stockList.has(stockName)) {

            const orderUUID = randomUUID();


            //Save the order
            let order: order = {
                type: type,
                units: amount,
                totalPrice: price,
                ouid: orderUUID,
                cuid: userid
            };

            const stock = this.stockList.get(stockName);
            
            //This is just if (true), but TS keeps complaining if it's not here
            if (typeof stock !== "undefined") {
                
                if (type === orderType.BUY) {
                    stock.currentPrice.bidPrice = price / amount;
                    stock.activeBuyOrders.push(order);
                }
                else { 
                    stock.currentPrice.askPrice = price / amount;
                    stock.activeSellOrders.push(order);
                }
            }

            //Anounce transaction
            this.websock.broadcastAll({
                stock: stockName,
                order: order
            });

            return orderUUID;
        }

        return null; //Stock was not found
    }

    removeOrder(stock: string, order: order): boolean {

        const stockData = this.stockList.get(stock);
        if (typeof stockData === "undefined")
            return false;

        const searchedList = (order.type === orderType.BUY ? stockData.activeBuyOrders : stockData.activeSellOrders);
        for (let x = 0; x < searchedList.length; x++) {
            if (searchedList[x].ouid === order.ouid) {

                searchedList.splice(x, 1);
                return true;
            }
        }

        return false;
    }

    getOrderByID(stock: string, oid: string): order | undefined {

        const stockData = this.stockList.get(stock);
        if (typeof stockData === "undefined")
            return undefined;

        const orderList = stockData.activeBuyOrders.concat(stockData.activeSellOrders);

        for (const order of orderList) {
            if (order.ouid === oid)
                return order;
        }

        return undefined;
    }

    async getMarketStatus(req: Request, res: Response) {

        
        const uid = await this.users.verifyUser(req.cookies.tradeBiscuit);

        if (uid === null) //Null: user is already logged in elsewhere
            return res.status(409).send("409: logged in elsewhere");

        if (typeof uid === "undefined") //Undefined: User not found
            return res.status(401).send("401: auth failed");


        try {
            let parsedStocks: any = Object.fromEntries(this.stockList); //A bit hacky, but we need to replace one map with parsed version
            return res.status(200).send(JSON.stringify(parsedStocks));

        } catch (e: any) {
           
            res.status(500).send(`500: ${e.message}`);
        }
    }

    tick() {

        for (const key of this.stockList.keys()) {
            this.processTick(key);
        }
    }

    save(defaultMarketPath: string = "./market.json"): boolean {

        try {

            const marketJSON = JSON.stringify(Object.fromEntries(this.stockList));
            writeFileSync(defaultMarketPath, marketJSON, {encoding:'utf-8'});
            return true;

        } catch(e) {

            return false;
        }
    }

    private processTick(stockName: string) {
        
        const stock = this.stockList.get(stockName);
        if (typeof stock === "undefined")
            return;

        //Process a market tick for a type of stock
        stock.activeBuyOrders.sort((a, b): number => { //Wants to buy for the most (lowest to highest)
            return (a.totalPrice / a.units) - (b.totalPrice / b.units);
        });
                
        stock.activeSellOrders.sort((a, b): number => { //Wants to sell for the least (highest to lowest)
            return (b.totalPrice / b.units) - (a.totalPrice / a.units);
        });

        let buy: order | undefined = undefined;
        let sell: order | undefined = undefined;
        while (stock.activeBuyOrders.length > 0 && stock.activeSellOrders.length > 0) {

            if (buy === undefined)
                buy = stock.activeBuyOrders.pop();
            if (sell === undefined)
                sell = stock.activeSellOrders.pop(); 

            //Safety check, so TS does not go crazy
            if (buy === undefined || sell === undefined)
                break;

            //TODO: self-order check (so that sell and buy order from the same user wouldn't be matched)

            //Check, if the order could be made
            if ((buy.totalPrice / buy.units) >= (sell.totalPrice / sell.units)) {
                const transaction = this.makeTransaction(sell, buy, stockName);


                //Save to price history
                let currentTime = Date.now();
                while (typeof stock.priceHistory[currentTime] !== "undefined")
                    currentTime++;

                stock.priceHistory[currentTime] = transaction.totalPaid / transaction.totalSold;

                //Update transactions
                sell = undefined;
                buy = undefined;

                if (transaction.outputOrder === null) 
                    continue;

                if (transaction.outputOrder.type === orderType.SELL)
                    sell = transaction.outputOrder;
                else
                    buy = transaction.outputOrder;
            }
            else {
                break; //Transaction could not be made -> since lists are sorted, no further transactions could be made
            }
        }

        //Push back remaining transactions
        if (buy !== undefined)
            stock.activeBuyOrders.push(buy);
                
        if (sell !== undefined)
            stock.activeSellOrders.push(sell);

    
    }

    private makeTransaction(sell: order, buy: order, stockName: string): transaction {
        
        //Create transaction object
        const assetSold = Math.min(sell.units, buy.units);
        const cashPaid = (buy.totalPrice / buy.units) * assetSold; 


        let outputOrder: order | null;

        if (sell.units - assetSold > 0) {
            outputOrder = sell;

            const sellUnitPrice = sell.totalPrice / sell.units;
            outputOrder.units -= assetSold;
            outputOrder.totalPrice -= sellUnitPrice * assetSold;
        }
        else if (buy.units - assetSold > 0){
            outputOrder = buy;

            const buyUnitPrice = buy.totalPrice / buy.units;
            outputOrder.units -= assetSold;
            outputOrder.totalPrice -= buyUnitPrice * assetSold; //To keep unit price steady
        }
            
        else 
            outputOrder = null;


        const timestamp = Date.now(); 
        const transaction: transaction = {
            timestamp: timestamp,
            totalSold: assetSold,
            totalPaid: cashPaid,
            sellOID: sell.ouid,
            buyOID: buy.ouid,
            outputOrder: outputOrder 
        };


        //Settle assets
        const sellingUser = this.users.getUserByID(sell.cuid);
        const buyingUser = this.users.getUserByID(buy.cuid);

        //Return modified order, disregarding the faulty one
        if (typeof sellingUser === "undefined" || typeof buyingUser === "undefined") {
            transaction.outputOrder = typeof sellingUser === "undefined" ? buy : sell;
            
            this.websock.broadcastAll({
                stock: stockName,
                transaction: transaction
            });
            return transaction;
        }

        if (typeof sellingUser.portfolio === "undefined" || typeof buyingUser.portfolio === "undefined") {
            transaction.outputOrder = typeof sellingUser.portfolio === "undefined" ? buy : sell;
            
            this.websock.broadcastAll({
                stock: stockName,
                transaction: transaction
            });
            return transaction;
        }
         
        //Security - so TS doesn't complain
        if (typeof buyingUser.portfolio.assets[stockName] === "undefined")
            buyingUser.portfolio.assets[stockName] = 0;

        buyingUser.portfolio.assets[stockName] += assetSold;
        sellingUser.portfolio.cash += cashPaid;

        //Anounce transaction
        this.websock.broadcastAll({
            stock: stockName,
            transaction: transaction
        });

        //Payment announcements to parties
        this.websock.payment(sellingUser.usid, {
            stock: "cash",
            amount: cashPaid
        });

        this.websock.payment(buyingUser.usid, {
            stock: stockName,
            amount: assetSold
        });

        return transaction;
    }

    
    private users: Users;
    private stockList: Map<string, stock>;
    private websock: WSServer;
};

