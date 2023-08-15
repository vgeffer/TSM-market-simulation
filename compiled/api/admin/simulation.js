"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
class MarketSim {
    constructor(market, users, defaultSettingsPath = "./simsettings.json") {
        try {
            const settingsFile = (0, fs_1.readFileSync)(defaultSettingsPath, { encoding: "utf-8" });
            this.marketSettings = JSON.parse(settingsFile);
        }
        catch (e) {
            this.marketSettings = {
                marketTickLength: 2000,
                marketAutoStop: null,
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
        clearInterval(this.tickTimerID);
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
            };
        }
    }
}
exports.default = MarketSim;
;
