import { readFileSync } from "fs";
import Market, { portfolio } from "../market/market";
import Users from "../market/users";

export interface simSettings {
    marketTickLength: number; //Length of market tick in MS
    marketAutoStop: Date | null; //Date and time when market should stop

    startingPortfolio: portfolio; //TODO: ?
}


export default class MarketSim {

    constructor(market: Market, users: Users, defaultSettingsPath: string = "./simsettings.json") {
       
        try {
        
            const settingsFile = readFileSync(defaultSettingsPath, { encoding: "utf-8" }); 
            this.marketSettings = JSON.parse(settingsFile);
        } catch (e) {

            this.marketSettings = {
                marketTickLength: 2000, //2 s
                marketAutoStop: null, //No autostop
                startingPortfolio: {
                    cash: 0,
                    assets: {}
                } //Empty portfolio
            };
        }


        this.tickTimerID = null;
        this.market = market;
        this.users = users;
    }

    
    startMarket() {
        
        if (this.tickTimerID !== null)
            return; //Market has already been started, so don't start it again

        this.tickTimerID = setInterval(() => {
            this.market.tick();
        }, this.marketSettings.marketTickLength);
    }

    stopMarket() {
        if (this.tickTimerID === null)
            return; //Market is not running, no need to stop it

        //clearInterval(this.tickTimerID);
        this.tickTimerID = null;
    }

    resetMarket() {
        //Repopulate stocks
        this.market.populateStocks();
        this.market.save();

        //Clear portfolios of all users
        for (const user of this.users.getUserList()) {
            
            if (typeof user.portfolio === "undefined")
                continue;

            user.portfolio = {
                cash: 0, 
                assets: {}
            }
        }
    }

    private marketSettings: simSettings;


    private market: Market;
    private users: Users;

    private tickTimerID: NodeJS.Timer | null;
};