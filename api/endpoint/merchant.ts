import { Request, Response } from "express";
import { randomBytes } from "crypto";
import { sign, verify } from "jsonwebtoken";
import Users, {User} from "../market/users";



export default class MerchantEndpoints {
    
    constructor(users: Users, appKey: string) {

        this.appKey = appKey;
        this.users = users;
    }


    buy(req: Request, res: Response) {

    }

    writeIncome(req: Request, res: Response) {

    }

    getUser(req: Request, res: Response) {
        
        const merchant = this.verifyMerchant(req.cookies.travellingSalesman);
        if (typeof merchant === "undefined")
            return res.status(401).send("401: unauthorized");

        const users = this.users.getUserList();
        return res.status(200).send(JSON.stringify(users));
    }

    getAllUsers(req: Request, res: Response) {
        
        const merchant = this.verifyMerchant(req.cookies.travellingSalesman);
        if (typeof merchant === "undefined")
            return res.status(401).send("401: unauthorized");

        const users = this.users.getUserList();
        return res.status(200).send(JSON.stringify(users));
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

        const uid = await this.verifyMerchant(req.cookies.tradeBiscuit);

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


    private appKey: string;
    private users: Users;
};