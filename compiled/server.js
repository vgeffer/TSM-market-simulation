"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importStar(require("express"));
const http_1 = require("http");
//Express middlewares
const body_parser_1 = __importDefault(require("body-parser"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
//Functional parts
const websockets_1 = __importDefault(require("./api/websockets"));
const users_1 = __importDefault(require("./api/market/users"));
const market_1 = __importDefault(require("./api/market/market"));
//Endpoints
const trade_1 = __importDefault(require("./api/endpoint/trade"));
const merchant_1 = __importDefault(require("./api/endpoint/merchant"));
(function () {
    return __awaiter(this, void 0, void 0, function* () {
        //Setup server
        const app = (0, express_1.default)();
        const router = (0, express_1.Router)();
        app.use(body_parser_1.default.json());
        app.use((0, cookie_parser_1.default)());
        app.use("/", express_1.default.static("./web"));
        app.use(router);
        //Connect the database
        const server = (0, http_1.createServer)(app);
        const listen_port = (typeof process.env.APP_PORT === "undefined" ? 8080 : Number(process.env.APP_PORT));
        const listen_address = (typeof process.env.APP_ADDR === "undefined" ? "127.0.0.1" : process.env.APP_ADDR);
        server.listen(listen_port, listen_address, () => {
            console.log(`Listnening at http://${listen_address}:${listen_port}`);
        });
        //Setup app logic
        if (typeof process.env.APP_SECRET === "undefined")
            return console.error("No secret present in .env!");
        const users = new users_1.default(process.env.APP_SECRET);
        //Setup Websocks
        const websock = new websockets_1.default(server, users, process.env.APP_SECRET, () => {
            console.log(`WebSocket server listening`);
        });
        const market = new market_1.default(websock, users);
        //Create instance of endpoint superclasses
        const trade = new trade_1.default(market, users, websock);
        const merchant = new merchant_1.default(users, process.env.APP_SECRET);
        //Setup endpoints
        router.post("/secure/auth", (req, res) => __awaiter(this, void 0, void 0, function* () { users.auth(req, res); }));
        router.get("/secure/logout", (req, res) => __awaiter(this, void 0, void 0, function* () { users.logout(req, res); }));
        router.put("/secure/trade/:stock/buy/:amount/:price", //Puts in an offer to buy at certain price
        (req, res) => __awaiter(this, void 0, void 0, function* () { trade.buy(req, res); }));
        router.put("/secure/trade/:stock/sell/:amount/:price", //Puts in an offer to sell at certain price
        (req, res) => __awaiter(this, void 0, void 0, function* () { trade.sell(req, res); }));
        router.put("/secure/trade/:stock/cancel/:orderid", //Cancels a standing offer and releases tied up funds
        (req, res) => __awaiter(this, void 0, void 0, function* () { trade.cancel(req, res); }));
        router.get("/secure/portfolio", (req, res) => __awaiter(this, void 0, void 0, function* () { users.getPortfolio(req, res); }));
        router.get("/secure/market", (req, res) => __awaiter(this, void 0, void 0, function* () { market.getMarketStatus(req, res); }));
        //Setup merchant endpoints
        router.get("/merchant/secure/users/:uid", () => { console.log("not all"); });
        router.get("/merchant/secure/users/all", () => { console.log("all"); });
        //Setup admin endpoints
        //TODO: delete debug
        setInterval(() => { market.tick(); }, 1000);
        //Setup event handlers
        process.on('exit', () => {
            console.log("Exiting... ");
            users.save();
            market.save();
        });
    });
})();
