import { readFileSync, stat, unlinkSync } from "fs";
import { createServer, Socket } from "net";
import Market, { portfolio } from "../market/market";
import Users from "../market/users";
import TradeBot, { fromConfig } from "./trade-bot";

export default class AdminConsole {

    constructor(market: Market, users: Users, sock: string,  defaultBotCfgPath: string = "./botcfg.json") {
       

        this.tickTimerID = null;
        this.market = market;
        this.users = users;
        this.socket = null;
        this.bots = [];


        try {

            const botConfigData = readFileSync(defaultBotCfgPath, { encoding: "utf-8" });
            const botConfig = JSON.parse(botConfigData);
            this.bots = fromConfig(botConfig, market, users);

            console.log(`Loaded ${this.bots.length} bots`);
        } catch (e) {
            //Just don't create bots
            this.bots = [];
        }

        //Setup comm socket - check if socket already exists
        stat(sock, (err) =>{

            if (!err) unlinkSync(sock);

            const socket = createServer((connection) => {
                this.socket = connection;

                connection.on("data", (data) => {

                    const commandWords = data.toString("utf-8").trim().split(' ');
                    
                    switch (commandWords[0]) {
                        case "set":
                            this.set(commandWords);
                            break;
                        
                        case "save":
                            this.save(commandWords);
                            break;


                        case "list":
                            this.list(commandWords);
                            break;

                        default: 
                            connection.write("bad command. allowed commands: set, save, list\n");
                            break;
                    }

                    //Write ready prompt for next line
                    connection.write("> ");
                });
            });

            socket.listen(sock);
        });
    }

    
    startMarket() {
        
        if (this.tickTimerID !== null)
            return; //Market has already been started, so don't start it again

        this.tickTimerID = setInterval(() => {
            this.market.tick();
        }, 1000);

        for (const bot of this.bots)
            bot.enableBot();
    }

    stopMarket() {
        if (this.tickTimerID === null)
            return; //Market is not running, no need to stop it

        clearInterval(this.tickTimerID);
        this.tickTimerID = null;

        for (const bot of this.bots)
            bot.disableBot();
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


    //Sock commands
    private set(args: string[]) {

        const target = args[1];


        if (target === "market") {
            const state = args[2] === "on";

            if (state) this.startMarket();
            else this.stopMarket();

            if (this.socket !== null) this.socket.write("set ok.\n");

            return;
        }

        for (const user of this.users.getUserList()) {

            if (user.name === target) {

                const state = args[2];

                if (state === "merchant") user.merchant = true;
                else if (state === "user") user.merchant = false; 
                else if (this.socket !== null) this.socket.write(`invalid set state ${args[2]}\n`);

                if(this.socket !== null) this.socket.write(`${user.name} is now ${args[2]}\n`);
                return;
            }
        }

        if (this.socket !== null) this.socket.write(`user ${target} not found.`);
    }

    private save(args: string[]) {

        const item = args[1];

        if (item === "market") this.market.save();
        if (item === "users") this.users.save();

        if(this.socket !== null) this.socket.write("save ok.\n");
        return;
    }

    private list(args: string[]) {

        const item = args[1];


        if (item === "users") {

            for (const user of this.users.getUserList()) 
                if (this.socket !== null) this.socket.write(`Name: ${user.name}, bot? ${user.bot}, merchant? ${user.merchant}\n`);
            
        }

        if (this.socket !== null) this.socket.write("list ok.\n");
    }

    private bots: TradeBot[];
    private market: Market;
    private users: Users;

    private tickTimerID: NodeJS.Timeout | null;
    private socket: Socket | null;
};