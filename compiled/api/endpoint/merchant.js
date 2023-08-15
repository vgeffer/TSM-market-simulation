"use strict";
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
const jsonwebtoken_1 = require("jsonwebtoken");
class MerchantEndpoints {
    constructor(users, appKey) {
        this.appKey = appKey;
        this.users = users;
    }
    buy(req, res) {
    }
    writeIncome(req, res) {
    }
    getUser(req, res) {
        const merchant = this.verifyMerchant(req.cookies.travellingSalesman);
        if (typeof merchant === "undefined")
            return res.status(401).send("401: unauthorized");
        const users = this.users.getUserList();
        return res.status(200).send(JSON.stringify(users));
    }
    getAllUsers(req, res) {
        const merchant = this.verifyMerchant(req.cookies.travellingSalesman);
        if (typeof merchant === "undefined")
            return res.status(401).send("401: unauthorized");
        const users = this.users.getUserList();
        return res.status(200).send(JSON.stringify(users));
    }
    verifyMerchant(cookie) {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof cookie === "undefined")
                return undefined; //Undefined = invalid cookie
            let cookieData = {};
            try {
                cookieData = yield (0, jsonwebtoken_1.verify)(cookie, this.appKey);
                if (typeof cookieData.type === "undefined" || cookieData.type !== "merchant")
                    return undefined;
                const user = this.users.getUserByID(cookieData.uid);
                if (typeof user === "undefined")
                    return undefined; //User not found
                //Unique logins don't concern merchants
                return user;
            }
            catch (e) {
                return undefined;
            }
        });
    }
}
exports.default = MerchantEndpoints;
;
