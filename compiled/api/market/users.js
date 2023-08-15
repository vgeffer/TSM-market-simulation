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
Object.defineProperty(exports, "__esModule", { value: true });
//
// (c) vgeffer, 2023
//
//  Class containing code handling users - connections, passwords, names, etc...
//
const argon2 = __importStar(require("argon2"));
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const jsonwebtoken_1 = require("jsonwebtoken");
;
class Users {
    constructor(appKey, defaultUsersPath = "./users.json") {
        this.userList = [];
        this.appKey = appKey;
        //Try to read users from file
        try {
            const userJSON = (0, fs_1.readFileSync)(defaultUsersPath, { encoding: 'utf-8' });
            this.userList = JSON.parse(userJSON);
        }
        catch (e) {
            //File prolly does not exist
            this.userList = []; //Just for safety, if some garbage has been written here by JSON.parse
        }
    }
    auth(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof req.body === "undefined")
                return res.status(400).send("400: request has no body");
            const msg = req.body;
            if (typeof msg.type === "undefined")
                return res.status(400).send("400: wrong message format");
            if (msg.type === "register") {
                if (typeof msg.name === "undefined" || typeof msg.passwd === "undefined" || msg.name === "")
                    return res.status(400).send("400: no user specified");
                if (msg.passwd.length < 8)
                    return res.status(400).send("400: password shorter than 8 characters");
                //Register new user
                for (const user of this.userList) {
                    if (user.name === msg.name)
                        return res.status(409).send("409: user already exists");
                }
                //Calculate password hash
                const passhash = yield argon2.hash(msg.passwd);
                const usid = (0, crypto_1.randomUUID)();
                const uniqueToken = (0, crypto_1.randomBytes)(8).toString("base64");
                const newUser = {
                    name: msg.name,
                    pass: passhash,
                    usid: usid,
                    uniqueToken: uniqueToken,
                    merchant: false,
                    portfolio: {
                        assets: {
                            BTC: 30
                        },
                        cash: 200
                    }
                };
                this.userList.push(newUser);
                //Create cookies
                const tradeCookie = (0, jsonwebtoken_1.sign)({
                    type: 'trade',
                    nonce: uniqueToken,
                    uid: usid
                }, this.appKey, { expiresIn: '24h' });
                res.cookie("tradeBiscuit", tradeCookie, {
                    maxAge: 12 * 60 * 60 * 1000,
                    httpOnly: true,
                    sameSite: true
                });
                return res.status(200).send("200: ok");
            }
            else if (msg.type === "login") {
                if (typeof msg.name === "undefined" || typeof msg.passwd === "undefined")
                    return res.status(400).send("400: no user specified");
                for (const user of this.userList) {
                    if (user.name === msg.name) {
                        if (yield argon2.verify(user.pass, msg.passwd)) { //Done this way so we potentialy don't calculate hash on every single user's passwd
                            //You can only become a merchant after you register, so there is no need to overcomplicate things
                            if (user.merchant === true) {
                                const merchantCookie = (0, jsonwebtoken_1.sign)({
                                    type: 'merchant',
                                    uid: user.usid
                                }, this.appKey, { expiresIn: '24h' });
                                res.cookie("travellingSalesman", merchantCookie, {
                                    maxAge: 12 * 60 * 60 * 1000,
                                    httpOnly: true,
                                    sameSite: true
                                });
                                return res.status(302).send("302: Merchant Login OK!");
                            }
                            user.uniqueToken = (0, crypto_1.randomBytes)(8).toString("base64");
                            //Create cookies
                            const tradeCookie = (0, jsonwebtoken_1.sign)({
                                type: 'trade',
                                nonce: user.uniqueToken,
                                uid: user.usid
                            }, this.appKey, { expiresIn: '24h' });
                            res.cookie("tradeBiscuit", tradeCookie, {
                                maxAge: 12 * 60 * 60 * 1000,
                                httpOnly: true,
                                sameSite: true
                            });
                            return res.status(200).send("200: ok");
                        }
                        else
                            return res.status(401).send("401: unauthorized");
                    }
                }
                return res.status(401).send("401: unauthorized");
            }
            else if (msg.type === "reauth") {
                const uid = yield this.verifyUser(req.cookies.tradeBiscuit);
                if (uid === null) //Null: user is already logged in elsewhere
                    return res.status(409).send("409: logged in elsewhere");
                if (typeof uid === "undefined") //Undefined: User not found
                    return res.status(401).send("401: auth failed");
                const user = this.getUserByID(uid);
                if (typeof user === "undefined")
                    return res.status(401).send("401: user not found");
                const infoNonce = (0, jsonwebtoken_1.sign)({
                    uid: uid,
                    nonce: (0, crypto_1.randomBytes)(32).toString('base64')
                }, this.appKey, { expiresIn: '1h' });
                return res.status(200).send(infoNonce);
            }
            else
                return res.status(400).send("400: bad request");
        });
    }
    logout(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            res.cookie("tradeBiscuit", "logout", {
                maxAge: 0,
                httpOnly: true,
                sameSite: true
            });
            res.redirect("/index.html");
        });
    }
    getPortfolio(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            const uid = yield this.verifyUser(req.cookies.tradeBiscuit);
            if (uid === null) //Null: user is already logged in elsewhere
                return res.status(409).send("409: logged in elsewhere");
            if (typeof uid === "undefined") //Undefined: User not found
                return res.status(401).send("401: auth failed");
            const user = this.getUserByID(uid);
            if (typeof user === "undefined")
                return res.status(401).send("401: user not found");
            if (typeof user.portfolio === "undefined")
                return res.status(400).send("400: user does not have a portfolio");
            return res.status(200).send(JSON.stringify(user.portfolio));
        });
    }
    verifyUser(cookie) {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof cookie === "undefined")
                return undefined; //Undefined = invalid cookie
            let cookieData = {};
            try {
                cookieData = yield (0, jsonwebtoken_1.verify)(cookie, this.appKey);
                if (typeof cookieData.type === "undefined" || cookieData.type !== "trade")
                    return undefined;
                if (typeof cookieData.uid === "undefined" || typeof cookieData.nonce === "undefined")
                    return undefined;
                const user = this.getUserByID(cookieData.uid);
                if (typeof user === "undefined")
                    return undefined; //User not found
                if (cookieData.nonce === user.uniqueToken)
                    return cookieData.uid;
                else
                    return null; //Null = user already logged in
            }
            catch (e) {
                return undefined;
            }
        });
    }
    save(defaultUsersPath = "./users.json") {
        try {
            const userJSON = JSON.stringify(this.userList, ["name", "pass", "usid", "merchant", "portfolio"]); //Skip saving the whole WebSocket Object
            (0, fs_1.writeFileSync)(defaultUsersPath, userJSON, { encoding: 'utf-8' });
            return true;
        }
        catch (e) {
            return false;
        }
    }
    getUserList() {
        return this.userList;
    }
    getUserByID(uid) {
        for (const user of this.userList) {
            if (user.usid === uid)
                return user;
        }
        return undefined;
    }
}
exports.default = Users;
;
