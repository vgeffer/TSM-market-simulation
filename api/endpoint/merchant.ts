import { Request, Response } from "express";
import { readFileSync } from "fs";
import { randomBytes } from "crypto";
import { sign, verify } from "jsonwebtoken";
import Users from "../market/users";
import WSServer from "../websockets";

export interface tradable {
    name: string;
    price: number;
};


export default class MerchantEndpoints {
    
    constructor(users: Users, websock: WSServer, appKey: string, defaultTradeablePath: string = "./tradeable.json") {

        this.appKey = appKey;
        this.users = users;
        this.websock = websock;

        try {
        
            const tradeablesData = readFileSync(defaultTradeablePath, { encoding: "utf-8" }); 
            this.tradables = JSON.parse(tradeablesData);
        } catch (e) {

            this.tradables = [
                {
                    name: "Handicap Test",
                    price: 20
                },
                {
                    name: "Bonus Test",
                    price: 20
                }
            ];
        }
    }

    buy(req: Request, res: Response) {

        const uid = this.verifyMerchant(req.cookies.travellingSalesman);
        
        if (uid === null) //Null: user is already logged in elsewhere
            return res.status(409).send("409: logged in elsewhere");

        if (typeof uid === "undefined") //Undefined: User not found
            return res.status(401).send("401: auth failed");

        if (typeof req.params.uid === "undefined" || typeof req.params.item === "undefined")
            return res.status(400).send("400: userid, item or target not provided");

        const user = this.users.getUserByID(req.params.uid);
        if (typeof user === "undefined")
            return res.status(400).send("400: user not found");

        if (typeof user.portfolio === "undefined")
            return res.status(400).send("400: user does not have a portfolio");
        

        const item = this.tradables[Number(req.params.item)];
        //Check, if trade is possible
        if (typeof item === "undefined")
            return res.status(400).send("400: item does not exist");

        if (user.portfolio.cash < item.price)
            return res.status(400).send(`400: not enough money to buy ${item.name}`);
        
        //Purchase
        user.portfolio.cash -= item.price;
        this.websock.payment(req.params.uid, {
            stock: "cash",
            amount: -item.price
        });

        user.portfolio.cash -= item.price;

        return res.status(200).send("200: ok");
    }

    writeIncome(req: Request, res: Response) {

        const uid = this.verifyMerchant(req.cookies.travellingSalesman);

        if (uid === null) //Null: user is already logged in elsewhere
            return res.status(409).send("409: logged in elsewhere");

        if (typeof uid === "undefined") //Undefined: User not found
            return res.status(401).send("401: auth failed");

        if (typeof req.params.uid === "undefined" || typeof req.params.amount === "undefined")
            return res.status(400).send("400: userid or amount not provided");


        const user = this.users.getUserByID(req.params.uid);
        if (typeof user === "undefined")
            return res.status(400).send("400: user not found");

        if (typeof user.portfolio === "undefined")
            return res.status(400).send("400: user does not have a portfolio");

        user.portfolio.cash += Number(req.params.amount);

        //DO a payment
        this.websock.payment(req.params.uid, {
            stock: "cash",
            amount: Number(req.params.amount)
        });
        return res.status(200).send("200: ok");
    }

    getAllUsers(req: Request, res: Response) {
        
        const merchant = this.verifyMerchant(req.cookies.travellingSalesman);
        if (typeof merchant === "undefined")
            return res.status(401).send("401: unauthorized");

        const users = this.users.getUserList();
        return res.status(200).send(JSON.stringify(users));
    }

    getTradables(req: Request, res: Response) {
        const merchant = this.verifyMerchant(req.cookies.travellingSalesman);
        if (typeof merchant === "undefined")
            return res.status(401).send("401: unauthorized");

        return res.status(200).send(JSON.stringify(this.tradables));
    }

    async logout(req: Request, res: Response) {
        
        res.cookie("travellingSalesman", "logout", {
            maxAge: 0,
            httpOnly: true,
            sameSite: true
        });
        res.redirect("/index.html");
    }

    async tradeTokens(req: Request, res: Response) {

        const uid = await this.verifyMerchant(req.cookies.travellingSalesman);

        if (uid === null) //Null: user is already logged in elsewhere
            return res.status(409).send("409: logged in elsewhere");

        if (typeof uid === "undefined") //Undefined: User not found
            return res.status(401).send("401: auth failed");

        const user = this.users.getUserByID(uid);
        if (typeof user === "undefined")
            return res.status(401).send("401: user not found");
                
        const infoNonce = sign({
            uid: uid,
            nonce: randomBytes(32).toString('base64')
        }, this.appKey, { expiresIn: '1h' });
    
        return res.status(200).send(infoNonce);
    }

    async verifyMerchant(cookie: string | undefined) {
        
        if (typeof cookie === "undefined")
            return undefined; //Undefined = invalid cookie

        let cookieData: any = {};
        try {

            cookieData = await verify(cookie, this.appKey);
            if (typeof cookieData.type === "undefined" || cookieData.type !== "merchant")
                return undefined;

            const user = this.users.getUserByID(cookieData.uid);

            if (typeof user === "undefined")
                return undefined; //User not found

            if (cookieData.nonce === user.uniqueToken)
                return cookieData.uid;
            else return null; //Null = user already logged in

        } catch(e) {

            return undefined;    
        }
    }

    private tradables: tradable[];
    private appKey: string;
    private users: Users;
    private websock: WSServer;
};