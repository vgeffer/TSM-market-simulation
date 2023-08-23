import "dotenv/config";

import express, { Router } from "express";
import { createServer } from "http";

//Express middlewares
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";

//Functional parts
import WSServer from "./api/websockets";
import Users from "./api/market/users";
import Market from "./api/market/market";

//Admin
import AdminConsole from "./api/admin/simulation";

//Endpoints
import TradeEndpoints from "./api/endpoint/trade";
import MerchantEndpoints from "./api/endpoint/merchant";
import TradeBot, { botSettings } from "./api/admin/trade-bot";


(async function() {

    console.log();

    //Setup server
    const app = express();
    const router = Router();
    
    app.use(bodyParser.json());
    app.use(cookieParser());
    app.use("/", express.static("./web"));
    app.use(router); 

    //Connect the database
    const server = createServer(app);
    
    const listen_port = (typeof process.env.APP_PORT === "undefined" ? 8080 : Number(process.env.APP_PORT));
    const listen_address = (typeof process.env.APP_ADDR === "undefined" ? "127.0.0.1" : process.env.APP_ADDR);

    server.listen(listen_port, listen_address, () => {
        console.log(`Listnening at http://${listen_address}:${listen_port}`);
    });



    //Setup app logic
    if (typeof process.env.APP_SECRET === "undefined")
        return console.error("No secret present in .env!");

    const users = new Users(process.env.APP_SECRET);

    //Setup Websocks
    const websock = new WSServer(server, users, process.env.APP_SECRET, () => {
        console.log(`WebSocket server listening`);
    });
    

    const market = new Market(websock, users);

    //Create instance of endpoint superclasses
    const trade = new TradeEndpoints(market, users, websock);
    const merchant = new MerchantEndpoints(users, websock, process.env.APP_SECRET);

    //Setup endpoints
    router.post("/secure/auth",
        async (req, res) => { users.auth(req, res); }
    );
    router.get("/secure/logout",
        async (req, res) => { users.logout(req, res); }
    );
    router.put("/secure/trade/:stock/buy/:amount/:price", //Puts in an offer to buy at certain price
        async (req, res) => { trade.buy(req, res); }
    );
    router.put("/secure/trade/:stock/sell/:amount/:price", //Puts in an offer to sell at certain price
        async (req, res) => { trade.sell(req, res); }
    );  
    router.put("/secure/trade/:stock/cancel/:orderid", //Cancels a standing offer and releases tied up funds
        async (req, res) => { trade.cancel(req, res); }
    );
    router.get("/secure/portfolio",
        async (req, res) => { users.getPortfolio(req, res); }
    );
    router.get("/secure/market",
        async (req, res) => { market.getMarketStatus(req, res); }
    );

    //Setup merchant endpoints

    router.post("/merchant/secure/auth",
        async (req, res) => { merchant.tradeTokens(req, res); }
    );
    router.get("/merchant/secure/logout",
        async (req, res) => { merchant.logout(req, res); }
    );
    router.put("/merchant/secure/purchase/:uid/:item",
        async (req, res) => { merchant.buy(req, res); }
    );
    router.put("/merchant/secure/income/:uid/:amount", 
        async (req, res) => { merchant.writeIncome(req, res); }
    );
    router.get("/merchant/secure/users", 
        async (req, res) => { merchant.getAllUsers(req, res); }
    );
    router.get("/merchant/secure/tradeables", 
        async (req, res) => { merchant.getTradables(req, res); }
    );

    //Setup admin endpoints
    const socketPath = typeof process.env.SOCKET_PATH === "undefined" ? "control.sock" : process.env.SOCKET_PATH;

    const adminConsole = new AdminConsole(market, users, socketPath);

    //Setup event handlers
    process.on('exit', () => {
        console.log("Exiting... ");
        users.save();
        market.save();
    });
})();